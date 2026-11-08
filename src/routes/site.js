import { Router } from 'express';
import { many, one } from '../db.js';
import { availabilityFor, activeItems, catalog, stockRows } from '../availability.js';
import {
  createBooking,
  cancelOwnBooking,
  bookingByReference,
  bookingWithItems,
  BookingError,
} from '../bookings.js';
import { queueBookingEmail } from '../mailer.js';
import { requireUser, verifyCsrf } from '../auth.js';
import {
  addDaysIso,
  todayIso,
  validateBookingWindow,
  isIsoDate,
  isEmail,
} from '../util.js';
import * as view from '../views/site.js';

export const siteRoutes = Router();

async function warehousesFor(orgId) {
  return many(
    `SELECT w.*,
            (SELECT count(*)::int
             FROM stock s
             JOIN items i ON i.id = s.item_id AND i.archived_at IS NULL
             WHERE s.warehouse_id = w.id AND s.quantity > 0) AS item_count
     FROM warehouses w
     WHERE w.org_id = $1 AND w.archived_at IS NULL
     ORDER BY w.sort_order, w.name`,
    [orgId],
  );
}

function bookingAccess(req, res, next) {
  // "login" orgs require a session. Approval and hybrid orgs also accept
  // requests from people who are not members yet.
  if (!req.user && req.org.booking_mode === 'login') {
    return res.redirect('/kirjaudu?next=/varaa');
  }
  next();
}

siteRoutes.get('/', async (req, res, next) => {
  try {
    const { org } = req;
    const [warehouses, summary, categories, items] = await Promise.all([
      warehousesFor(org.id),
      one(
        `SELECT
          (SELECT count(*) FROM warehouses WHERE org_id = $1 AND archived_at IS NULL)::int AS "warehouseCount",
          (SELECT count(*) FROM items WHERE org_id = $1 AND archived_at IS NULL)::int AS "itemCount"`,
        [org.id],
      ),
      many(
        `SELECT c.id, c.name, count(i.id)::int AS count
         FROM categories c
         LEFT JOIN items i ON i.category_id = c.id AND i.archived_at IS NULL
         WHERE c.org_id = $1
         GROUP BY c.id, c.name, c.sort_order
         ORDER BY c.sort_order, c.name`,
        [org.id],
      ),
      many(
        `SELECT i.id, i.name, i.description, i.unit, c.name AS category_name,
                COALESCE((SELECT sum(s.quantity) FROM stock s WHERE s.item_id = i.id), 0)::int AS "totalStock"
         FROM items i
         LEFT JOIN categories c ON c.id = i.category_id
         WHERE i.org_id = $1 AND i.archived_at IS NULL
         ORDER BY COALESCE(c.sort_order, 999), i.sort_order, i.name
         LIMIT 6`,
        [org.id],
      ),
    ]);
    res.send(view.homePage(req, res, {
      warehouses,
      summary: summary || { warehouseCount: 0, itemCount: 0 },
      categories,
      items,
    }));
  } catch (err) {
    next(err);
  }
});

siteRoutes.get('/kalusto', async (req, res, next) => {
  try {
    const { org } = req;
    const [allItems, categories, warehouses] = await Promise.all([
      catalog(org.id),
      many(
        `SELECT c.id, c.name, count(i.id)::int AS count
         FROM categories c
         LEFT JOIN items i ON i.category_id = c.id AND i.archived_at IS NULL
         WHERE c.org_id = $1
         GROUP BY c.id, c.name, c.sort_order
         ORDER BY c.sort_order, c.name`,
        [org.id],
      ),
      warehousesFor(org.id),
    ]);
    const q = String(req.query.q || '').trim().toLowerCase();
    const categoryId = String(req.query.category || '');
    const warehouseId = String(req.query.warehouse || '');
    const items = allItems.filter((item) => {
      if (q && !`${item.name} ${item.description || ''}`.toLowerCase().includes(q)) return false;
      if (categoryId && item.category_id !== categoryId) return false;
      if (warehouseId && Number(item.stockByWarehouse[warehouseId] || 0) <= 0) return false;
      return true;
    });
    res.send(view.catalogPage(req, res, {
      items,
      categories,
      warehouses,
      filters: { q: req.query.q || '', categoryId, warehouseId },
    }));
  } catch (err) {
    next(err);
  }
});

siteRoutes.get('/varastot', async (req, res, next) => {
  try {
    const warehouses = await warehousesFor(req.org.id);
    res.send(view.warehousesPage(req, res, { warehouses }));
  } catch (err) {
    next(err);
  }
});

siteRoutes.get('/varastot/:id', async (req, res, next) => {
  try {
    const warehouse = await one(
      'SELECT * FROM warehouses WHERE id = $1 AND org_id = $2 AND archived_at IS NULL',
      [req.params.id, req.org.id],
    );
    if (!warehouse) {
      return res.status(404).send(view.notFoundPage(req, res));
    }
    const items = (await stockRows(req.org.id, warehouse.id)).filter((row) => row.quantity > 0);
    res.send(view.warehousePage(req, res, { warehouse, items }));
  } catch (err) {
    next(err);
  }
});

async function bookingData(req, res, { values = {}, error = null } = {}) {
  const { org, user } = req;
  const warehouses = await warehousesFor(org.id);
  if (!warehouses.length) {
    return {
      warehouses, warehouse: null, startsOn: todayIso(), endsOn: todayIso(),
      availability: new Map(), items: [], values, error, org,
    };
  }
  let warehouse = warehouses.find((w) => w.id === (req.query.warehouse || req.body?.warehouse_id));
  if (!warehouse) warehouse = warehouses[0];

  const today = todayIso();
  let startsOn = isIsoDate(req.body?.starts_on || req.query.starts_on)
    ? req.body?.starts_on || req.query.starts_on
    : addDaysIso(today, Math.max(1, Number(org.min_notice_days)));
  let endsOn = isIsoDate(req.body?.ends_on || req.query.ends_on)
    ? req.body?.ends_on || req.query.ends_on
    : addDaysIso(startsOn, 2);

  if (!validateBookingWindow({
    startsOn, endsOn, today, minNoticeDays: org.min_notice_days, maxDays: org.max_booking_days,
  }).ok) {
    startsOn = addDaysIso(today, Number(org.min_notice_days));
    endsOn = addDaysIso(startsOn, 2);
  }

  const [availability, items] = await Promise.all([
    availabilityFor(org.id, warehouse.id, startsOn, endsOn),
    activeItems(org.id),
  ]);

  return {
    org,
    warehouses,
    warehouse,
    startsOn,
    endsOn,
    availability,
    items,
    values: {
      ...values,
      contact_name: values.contact_name ?? user?.name ?? '',
      contact_email: values.contact_email ?? user?.email ?? '',
      contact_phone: values.contact_phone ?? '',
      purpose: values.purpose ?? '',
    },
    error,
  };
}

siteRoutes.get('/varaa', bookingAccess, async (req, res, next) => {
  try {
    const data = await bookingData(req, res);
    res.send(view.bookingPage(req, res, data));
  } catch (err) {
    next(err);
  }
});

siteRoutes.post('/varaa', verifyCsrf, bookingAccess, async (req, res, next) => {
  try {
    const { org, user } = req;
    const data = await bookingData(req, res, {
      values: req.body,
      error: null,
    });
    if (!data.warehouse) {
      return res.send(view.bookingPage(req, res, { ...data, error: 'Yhtään varastoa ei ole vielä käytössä.' }));
    }
    const startsOn = req.body.starts_on;
    const endsOn = req.body.ends_on;
    const check = validateBookingWindow({
      startsOn,
      endsOn,
      today: todayIso(),
      minNoticeDays: org.min_notice_days,
      maxDays: org.max_booking_days,
    });
    if (!check.ok) {
      return res.status(400).send(view.bookingPage(req, res, { ...data, error: check.error }));
    }
    const contactName = String(req.body.contact_name || '').trim();
    const contactEmail = String(req.body.contact_email || '').trim();
    if (!contactName || !isEmail(contactEmail)) {
      return res.status(400).send(view.bookingPage(req, res, {
        ...data,
        error: 'Täytä nimi ja kelvollinen sähköposti.',
      }));
    }
    const items = Object.entries(req.body)
      .filter(([key]) => key.startsWith('qty_'))
      .map(([key, quantity]) => ({ itemId: key.slice(4), quantity }));

    const member = Boolean(user?.is_superadmin || req.membership);
    const booking = await createBooking({
      org,
      user,
      warehouse: data.warehouse,
      startsOn,
      endsOn,
      contactName,
      contactEmail,
      contactPhone: String(req.body.contact_phone || '').trim(),
      purpose: String(req.body.purpose || '').trim(),
      items,
      mode: org.booking_mode,
      member,
    });

    const full = await bookingWithItems(org.id, booking.id);
    queueBookingEmail({ org, booking: full, kind: 'created' });

    if (user) {
      return res.redirect(`/omat-varaukset?ok=varaus-lahetetty#${booking.reference}`);
    }
    res.redirect(`/varauspyynto/${booking.reference}`);
  } catch (err) {
    if (err instanceof BookingError) {
      const data = await bookingData(req, res, { values: req.body, error: err.message });
      return res.status(err.status).send(view.bookingPage(req, res, data));
    }
    next(err);
  }
});

siteRoutes.get('/varauspyynto/:reference', async (req, res, next) => {
  try {
    const booking = await bookingByReference(req.org.id, req.params.reference);
    if (!booking) return res.status(404).send(view.notFoundPage(req, res));
    res.send(view.bookingRequestPage(req, res, { booking }));
  } catch (err) {
    next(err);
  }
});

siteRoutes.get('/omat-varaukset', requireUser('/omat-varaukset'), async (req, res, next) => {
  try {
    const { myBookings } = await import('../bookings.js');
    const bookings = await myBookings(req.org.id, req.user.id);
    res.send(view.myBookingsPage(req, res, { bookings }));
  } catch (err) {
    next(err);
  }
});

siteRoutes.post('/omat-varaukset/:id/peruuta', verifyCsrf, requireUser('current'), async (req, res, next) => {
  try {
    await cancelOwnBooking({
      orgId: req.org.id,
      bookingId: req.params.id,
      userId: req.user.id,
    });
    const full = await bookingWithItems(req.org.id, req.params.id);
    if (full) queueBookingEmail({ org: req.org, booking: full, kind: 'cancelled' });
    res.redirect('/omat-varaukset?ok=varaus-peruttu');
  } catch (err) {
    if (err instanceof BookingError) {
      return res.redirect(`/omat-varaukset?virhe=${err.status === 403 ? 'oikeus' : 'tila'}`);
    }
    next(err);
  }
});

siteRoutes.get('/ohjeet', async (req, res, next) => {
  try {
    const warehouses = await warehousesFor(req.org.id);
    res.send(view.instructionsPage(req, res, { warehouses, org: req.org }));
  } catch (err) {
    next(err);
  }
});

siteRoutes.get('/vaihda-instanssiin', (req, res) => {
  res.clearCookie('kamo_org', { path: '/' });
  res.redirect('/');
});
