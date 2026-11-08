import { Router } from 'express';
import { many, one, query } from '../db.js';
import { openapi } from '../openapi.js';
import { catalog, availabilityFor } from '../availability.js';
import {
  createBooking,
  changeStatus,
  bookingByReference,
  bookingWithItems,
  BookingError,
} from '../bookings.js';
import { sha256, isEmail, todayIso, validateBookingWindow } from '../util.js';
import { queueBookingEmail } from '../mailer.js';

export const apiRoutes = Router();

const buckets = new Map();

function rateLimited(keyId) {
  const now = Date.now();
  const bucket = buckets.get(keyId);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(keyId, { count: 1, resetAt: now + 60000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > 120;
}

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

async function apiAuth(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');
    const header = String(req.get('authorization') || '');
    if (!header.startsWith('Bearer ')) {
      return fail(res, 401, 'Puuttuva API-avain. Käytä Authorization: Bearer <avain>.');
    }
    const raw = header.slice(7).trim();
    if (!raw) return fail(res, 401, 'Puuttuva API-avain.');
    const key = await one(
      `SELECT k.*, o.name AS org_name, o.slug AS org_slug, o.booking_mode,
              o.max_booking_days, o.min_notice_days, o.contact_email, o.parked_at
       FROM api_keys k
       JOIN orgs o ON o.id = k.org_id
       WHERE k.key_hash = $1`,
      [sha256(raw)],
    );
    if (!key || key.revoked_at || key.parked_at) {
      return fail(res, 401, 'API-avain ei ole voimassa.');
    }
    if (rateLimited(key.id)) {
      return fail(res, 429, 'Liian monta pyyntöä. Yritä minuutin päästä uudelleen.');
    }
    req.apiKey = key;
    req.apiOrg = {
      id: key.org_id,
      name: key.org_name,
      slug: key.org_slug,
      booking_mode: key.booking_mode,
      max_booking_days: key.max_booking_days,
      min_notice_days: key.min_notice_days,
      contact_email: key.contact_email,
    };
    query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [key.id]).catch(() => {});
    next();
  } catch (err) {
    next(err);
  }
}

function needScope(scope) {
  return (req, res, next) => {
    const scopes = req.apiKey.scopes || [];
    if (scopes.includes('admin') || scopes.includes(scope)) return next();
    return fail(res, 403, `Avaimelta puuttuu oikeus: ${scope}.`);
  };
}

apiRoutes.get('/openapi.json', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(openapi);
});

apiRoutes.get('/health', async (req, res) => {
  try {
    await one('SELECT 1 AS ok');
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'virhe' });
  }
});

apiRoutes.use(apiAuth);

apiRoutes.get('/me', (req, res) => {
  res.json({
    organization: {
      id: req.apiOrg.id,
      name: req.apiOrg.name,
      slug: req.apiOrg.slug,
      booking_mode: req.apiOrg.booking_mode,
    },
    scopes: req.apiKey.scopes,
  });
});

apiRoutes.get('/warehouses', async (req, res, next) => {
  try {
    const warehouses = await many(
      `SELECT id, name, slug, address, postal_code, city, opening_info,
              contact_name, contact_email, contact_phone, map_url
       FROM warehouses
       WHERE org_id = $1 AND archived_at IS NULL
       ORDER BY sort_order, name`,
      [req.apiOrg.id],
    );
    res.json({ warehouses });
  } catch (err) {
    next(err);
  }
});

apiRoutes.get('/items', async (req, res, next) => {
  try {
    const items = await catalog(req.apiOrg.id);
    res.json({
      items: items.map(({ warehouses, ...item }) => ({
        ...item,
        stock: item.stockByWarehouse,
      })),
    });
  } catch (err) {
    next(err);
  }
});

apiRoutes.get('/availability', async (req, res, next) => {
  try {
    const warehouseId = String(req.query.warehouse_id || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!warehouseId || !from || !to) {
      return fail(res, 400, 'Anna warehouse_id, from ja to.');
    }
    const warehouse = await one(
      'SELECT id FROM warehouses WHERE id = $1 AND org_id = $2 AND archived_at IS NULL',
      [warehouseId, req.apiOrg.id],
    );
    if (!warehouse) return fail(res, 404, 'Varastoa ei löytynyt.');
    if (!validateBookingWindow({
      startsOn: from,
      endsOn: to,
      today: todayIso(),
      minNoticeDays: 0,
      maxDays: 365,
    }).ok) {
      return fail(res, 400, 'Tarkista päivämäärät.');
    }
    const availability = await availabilityFor(req.apiOrg.id, warehouseId, from, to);
    res.json({
      availability: [...availability.values()].map(({ itemId, ...row }) => ({
        item_id: itemId,
        ...row,
      })),
    });
  } catch (err) {
    next(err);
  }
});

function attachItems(bookings, items) {
  const grouped = new Map();
  for (const item of items) {
    if (!grouped.has(item.booking_id)) grouped.set(item.booking_id, []);
    grouped.get(item.booking_id).push({
      item_id: item.item_id,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
    });
  }
  for (const booking of bookings) booking.items = grouped.get(booking.id) || [];
  return bookings;
}

apiRoutes.get('/bookings', async (req, res, next) => {
  try {
    const params = [req.apiOrg.id];
    const where = ['b.org_id = $1'];
    if (req.query.status) {
      params.push(String(req.query.status));
      where.push(`b.status = $${params.length}`);
    }
    if (req.query.from) {
      params.push(String(req.query.from));
      where.push(`b.ends_on >= $${params.length}::date`);
    }
    if (req.query.to) {
      params.push(String(req.query.to));
      where.push(`b.starts_on <= $${params.length}::date`);
    }
    const bookings = await many(
      `SELECT b.*, w.name AS warehouse_name
       FROM bookings b
       JOIN warehouses w ON w.id = b.warehouse_id
       WHERE ${where.join(' AND ')}
       ORDER BY b.starts_on, b.created_at
       LIMIT 200`,
      params,
    );
    if (bookings.length) {
      const items = await many(
        `SELECT bi.booking_id, bi.item_id, bi.quantity, i.name, i.unit
         FROM booking_items bi JOIN items i ON i.id = bi.item_id
         WHERE bi.booking_id = ANY($1::uuid[])`,
        [bookings.map((booking) => booking.id)],
      );
      attachItems(bookings, items);
    }
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
});

apiRoutes.post('/bookings', needScope('write'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const { contact_name, contact_email, contact_phone, purpose, items } = body;
    if (!body.warehouse_id || !body.starts_on || !body.ends_on) {
      return fail(res, 400, 'Anna warehouse_id, starts_on ja ends_on.');
    }
    if (!contact_name || !isEmail(contact_email)) {
      return fail(res, 400, 'Anna contact_name ja kelvollinen contact_email.');
    }
    if (!Array.isArray(items) || !items.length) {
      return fail(res, 400, 'Anna vähintään yksi items-rivi.');
    }
    const check = validateBookingWindow({
      startsOn: body.starts_on,
      endsOn: body.ends_on,
      today: todayIso(),
      minNoticeDays: req.apiOrg.min_notice_days,
      maxDays: req.apiOrg.max_booking_days,
    });
    if (!check.ok) return fail(res, 400, check.error);
    const warehouse = await one(
      'SELECT * FROM warehouses WHERE id = $1 AND org_id = $2 AND archived_at IS NULL',
      [body.warehouse_id, req.apiOrg.id],
    );
    if (!warehouse) return fail(res, 404, 'Varastoa ei löytynyt.');

    const idemKey = String(req.get('idempotency-key') || '').slice(0, 200);
    const requestHash = sha256(JSON.stringify(body));
    if (idemKey) {
      const existing = await one(
        `SELECT * FROM idempotency_keys WHERE org_id = $1 AND key = $2 AND endpoint = $3`,
        [req.apiOrg.id, idemKey, 'POST /bookings'],
      );
      if (existing) {
        if (existing.request_hash !== requestHash) {
          return fail(res, 409, 'Idempotency-Key on jo käytetty eri sisällöllä.');
        }
        return res.status(existing.status_code).json(existing.response);
      }
    }

    const booking = await createBooking({
      org: req.apiOrg,
      user: null,
      warehouse,
      startsOn: body.starts_on,
      endsOn: body.ends_on,
      contactName: String(contact_name).trim(),
      contactEmail: String(contact_email).trim(),
      contactPhone: String(contact_phone || '').trim(),
      purpose: String(purpose || '').trim(),
      items: items.map((item) => ({ itemId: item.item_id, quantity: item.quantity })),
      mode: req.apiOrg.booking_mode,
      member: true,
      trusted: true,
    });
    const payload = { booking: await bookingWithItems(req.apiOrg.id, booking.id) };
    const mailOrg = await one('SELECT * FROM orgs WHERE id = $1', [req.apiOrg.id]);
    if (mailOrg) queueBookingEmail({ org: mailOrg, booking: payload.booking, kind: 'created' });

    if (idemKey) {
      try {
        await query(
          `INSERT INTO idempotency_keys (org_id, key, endpoint, request_hash, status_code, response)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [req.apiOrg.id, idemKey, 'POST /bookings', requestHash, 201, JSON.stringify(payload)],
        );
      } catch (err) {
        if (err.code === '23505') {
          const existing = await one(
            `SELECT * FROM idempotency_keys WHERE org_id = $1 AND key = $2 AND endpoint = $3`,
            [req.apiOrg.id, idemKey, 'POST /bookings'],
          );
          if (existing) return res.status(existing.status_code).json(existing.response);
        }
        throw err;
      }
    }
    res.status(201).json(payload);
  } catch (err) {
    if (err instanceof BookingError) return fail(res, err.status, err.message);
    next(err);
  }
});

apiRoutes.get('/bookings/:reference', async (req, res, next) => {
  try {
    const booking = await bookingByReference(req.apiOrg.id, req.params.reference);
    if (!booking) return fail(res, 404, 'Varausta ei löytynyt.');
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

apiRoutes.patch('/bookings/:reference/status', needScope('admin'), async (req, res, next) => {
  try {
    const status = String(req.body?.status || '');
    if (!['approved', 'rejected', 'cancelled', 'returned'].includes(status)) {
      return fail(res, 400, 'Tuntematon tila.');
    }
    const found = await bookingByReference(req.apiOrg.id, req.params.reference);
    if (!found) return fail(res, 404, 'Varausta ei löytynyt.');
    await changeStatus({
      orgId: req.apiOrg.id,
      bookingId: found.id,
      status,
      actorId: req.apiKey.created_by,
      note: String(req.body?.note || '').trim(),
    });
    const booking = await bookingWithItems(req.apiOrg.id, found.id);
    const mailOrg = await one('SELECT * FROM orgs WHERE id = $1', [req.apiOrg.id]);
    if (mailOrg) queueBookingEmail({ org: mailOrg, booking, kind: status });
    res.json({ booking });
  } catch (err) {
    if (err instanceof BookingError) return fail(res, err.status, err.message);
    next(err);
  }
});

apiRoutes.use((err, req, res, next) => {
  console.error('API error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Palvelinvirhe.' });
});
