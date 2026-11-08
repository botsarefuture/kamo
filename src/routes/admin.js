import { Router } from 'express';
import crypto from 'node:crypto';
import { many, one, query, tx } from '../db.js';
import { requireOrgAdmin, verifyCsrf } from '../auth.js';
import { changeStatus, BookingError, listBookings, bookingWithItems } from '../bookings.js';
import { queueBookingEmail, sendTestEmail } from '../mailer.js';
import { encryptSecret, canEncryptSecrets } from '../secrets.js';
import { stockRows } from '../availability.js';
import { isTheme, THEMES } from '../themes.js';
import { isEmail, randomToken, sha256, slugify } from '../util.js';
import * as view from '../views/admin.js';

export const adminRoutes = Router();

adminRoutes.use(verifyCsrf);
adminRoutes.use(requireOrgAdmin);

async function itemsWithStock(orgId) {
  return many(
    `SELECT i.*, c.name AS category_name,
            COALESCE((SELECT sum(s.quantity) FROM stock s WHERE s.item_id = i.id), 0)::int AS total_stock
     FROM items i
     LEFT JOIN categories c ON c.id = i.category_id
     WHERE i.org_id = $1 AND i.archived_at IS NULL
     ORDER BY COALESCE(c.sort_order, 999), c.name, i.sort_order, i.name`,
    [orgId],
  );
}

adminRoutes.get('/', async (req, res, next) => {
  try {
    const orgId = req.org.id;
    const [counts, pending, recent] = await Promise.all([
      one(
        `SELECT
          (SELECT count(*) FROM bookings WHERE org_id = $1 AND status = 'pending')::int AS pending,
          (SELECT count(*) FROM bookings WHERE org_id = $1 AND status = 'approved' AND ends_on >= CURRENT_DATE)::int AS "approvedUpcoming",
          (SELECT count(*) FROM items WHERE org_id = $1 AND archived_at IS NULL)::int AS items,
          (SELECT count(*) FROM warehouses WHERE org_id = $1 AND archived_at IS NULL)::int AS warehouses`,
        [orgId],
      ),
      listBookings(orgId, { status: 'pending', limit: 6 }),
      listBookings(orgId, { limit: 6 }),
    ]);
    res.send(view.dashboardPage(req, res, { counts, pending, recent }));
  } catch (err) {
    next(err);
  }
});

adminRoutes.get('/varaukset', async (req, res, next) => {
  try {
    const status = ['pending', 'approved', 'rejected', 'cancelled', 'returned'].includes(req.query.status)
      ? req.query.status
      : '';
    const warehouseId = String(req.query.warehouse || '');
    const [bookings, warehouses] = await Promise.all([
      listBookings(req.org.id, { status: status || undefined, warehouseId: warehouseId || undefined, limit: 300 }),
      many('SELECT id, name FROM warehouses WHERE org_id = $1 AND archived_at IS NULL ORDER BY name', [req.org.id]),
    ]);
    res.send(view.bookingsPage(req, res, {
      bookings,
      warehouses,
      filters: { status, warehouseId },
    }));
  } catch (err) {
    next(err);
  }
});

adminRoutes.get('/varaukset/:id', async (req, res, next) => {
  try {
    const booking = await bookingWithItems(req.org.id, req.params.id);
    if (!booking) return res.status(404).send(view.notFoundPage(req, res));
    res.send(view.bookingDetailPage(req, res, { booking }));
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/varaukset/:id/tila', async (req, res, next) => {
  try {
    const status = String(req.body.status || '');
    if (!['approved', 'rejected', 'returned', 'cancelled'].includes(status)) {
      return res.redirect(`/hallinta/varaukset/${req.params.id}?virhe=tila`);
    }
    await changeStatus({
      orgId: req.org.id,
      bookingId: req.params.id,
      status,
      actorId: req.user.id,
      note: String(req.body.note || '').trim(),
    });
    const booking = await bookingWithItems(req.org.id, req.params.id);
    if (booking) queueBookingEmail({ org: req.org, booking, kind: status });
    res.redirect(`/hallinta/varaukset/${req.params.id}?ok=tila-paivitetty`);
  } catch (err) {
    if (err instanceof BookingError) {
      return res.redirect(`/hallinta/varaukset/${req.params.id}?virhe=tila`);
    }
    next(err);
  }
});

adminRoutes.get('/kalusto', async (req, res, next) => {
  try {
    const [items, categories] = await Promise.all([
      itemsWithStock(req.org.id),
      many('SELECT * FROM categories WHERE org_id = $1 ORDER BY sort_order, name', [req.org.id]),
    ]);
    res.send(view.itemsPage(req, res, { items, categories }));
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/kalusto', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.redirect('/hallinta/kalusto?virhe=puuttuva');
    let categoryId = null;
    if (req.body.category_id) {
      const category = await one('SELECT id FROM categories WHERE id = $1 AND org_id = $2', [
        req.body.category_id,
        req.org.id,
      ]);
      categoryId = category?.id ?? null;
    }
    await query(
      `INSERT INTO items (org_id, category_id, name, description, unit, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.org.id,
        categoryId,
        name,
        String(req.body.description || '').trim() || null,
        String(req.body.unit || 'kpl').trim() || 'kpl',
        Number.parseInt(req.body.sort_order || '100', 10) || 100,
      ],
    );
    res.redirect('/hallinta/kalusto?ok=kalusto-lisatty');
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/kategoriat', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.redirect('/hallinta/kalusto?virhe=puuttuva');
    await query(
      `INSERT INTO categories (org_id, name, sort_order) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, name) DO NOTHING`,
      [req.org.id, name, Number.parseInt(req.body.sort_order || '100', 10) || 100],
    );
    res.redirect('/hallinta/kalusto?ok=kalusto-lisatty');
  } catch (err) {
    next(err);
  }
});

adminRoutes.get('/kalusto/:id', async (req, res, next) => {
  try {
    const item = await one(
      `SELECT i.*, c.name AS category_name
       FROM items i LEFT JOIN categories c ON c.id = i.category_id
       WHERE i.id = $1 AND i.org_id = $2 AND i.archived_at IS NULL`,
      [req.params.id, req.org.id],
    );
    if (!item) return res.status(404).send(view.notFoundPage(req, res));
    const [categories, warehouses, stock] = await Promise.all([
      many('SELECT * FROM categories WHERE org_id = $1 ORDER BY sort_order, name', [req.org.id]),
      many('SELECT id, name FROM warehouses WHERE org_id = $1 AND archived_at IS NULL ORDER BY name', [req.org.id]),
      many('SELECT warehouse_id, quantity FROM stock WHERE org_id = $1 AND item_id = $2', [req.org.id, item.id]),
    ]);
    const stockByWarehouse = Object.fromEntries(stock.map((row) => [row.warehouse_id, row.quantity]));
    res.send(view.itemDetailPage(req, res, {
      item,
      categories,
      warehouses,
      stockByWarehouse,
    }));
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/kalusto/:id', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.redirect(`/hallinta/kalusto/${req.params.id}?virhe=puuttuva`);
    let categoryId = null;
    if (req.body.category_id) {
      const category = await one('SELECT id FROM categories WHERE id = $1 AND org_id = $2', [
        req.body.category_id,
        req.org.id,
      ]);
      categoryId = category?.id ?? null;
    }
    await query(
      `UPDATE items SET name = $3, category_id = $4, unit = $5, description = $6, updated_at = now()
       WHERE id = $1 AND org_id = $2`,
      [
        req.params.id,
        req.org.id,
        name,
        categoryId,
        String(req.body.unit || 'kpl').trim() || 'kpl',
        String(req.body.description || '').trim() || null,
      ],
    );
    res.redirect(`/hallinta/kalusto/${req.params.id}?ok=kalusto-paivitetty`);
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/kalusto/:id/arkistoi', async (req, res, next) => {
  try {
    await query(
      'UPDATE items SET archived_at = now() WHERE id = $1 AND org_id = $2',
      [req.params.id, req.org.id],
    );
    res.redirect('/hallinta/kalusto?ok=kalusto-arkistoitu');
  } catch (err) {
    next(err);
  }
});

async function saveStock(orgId, warehouseId, body) {
  const entries = Object.entries(body)
    .filter(([key]) => key.startsWith('stock_'))
    .map(([key, value]) => ({ itemId: key.slice(6), quantity: Number.parseInt(value, 10) }))
    .filter((row) => Number.isFinite(row.quantity) && row.quantity >= 0);
  if (!entries.length) return;
  const valid = await many(
    'SELECT id FROM items WHERE org_id = $1 AND id = ANY($2::uuid[])',
    [orgId, entries.map((row) => row.itemId)],
  );
  const allowed = new Set(valid.map((row) => row.id));
  for (const row of entries) {
    if (!allowed.has(row.itemId)) continue;
    await query(
      `INSERT INTO stock (org_id, warehouse_id, item_id, quantity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (warehouse_id, item_id)
       DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
      [orgId, warehouseId, row.itemId, row.quantity],
    );
  }
}

adminRoutes.post('/kalusto/:id/saldo', async (req, res, next) => {
  try {
    const warehouses = await many(
      'SELECT id FROM warehouses WHERE org_id = $1 AND archived_at IS NULL',
      [req.org.id],
    );
    for (const warehouse of warehouses) {
      const value = req.body[`stock_${warehouse.id}`];
      if (value === undefined) continue;
      const quantity = Number.parseInt(value, 10);
      if (!Number.isFinite(quantity) || quantity < 0) continue;
      await query(
        `INSERT INTO stock (org_id, warehouse_id, item_id, quantity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (warehouse_id, item_id)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
        [req.org.id, warehouse.id, req.params.id, quantity],
      );
    }
    res.redirect(`/hallinta/kalusto/${req.params.id}?ok=saldo-paivitetty`);
  } catch (err) {
    next(err);
  }
});

async function uniqueWarehouseSlug(orgId, name) {
  const base = slugify(name) || 'varasto';
  let slug = base;
  let counter = 2;
  while ((await one('SELECT 1 FROM warehouses WHERE org_id = $1 AND slug = $2', [orgId, slug]))) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return slug;
}

function warehouseFields(body) {
  return [
    String(body.address || '').trim() || null,
    String(body.postal_code || '').trim() || null,
    String(body.city || '').trim() || null,
    String(body.contact_name || '').trim() || null,
    String(body.contact_email || '').trim() || null,
    String(body.contact_phone || '').trim() || null,
    String(body.opening_info || '').trim() || null,
    String(body.map_url || '').trim() || null,
    String(body.pickup_instructions || '').trim() || null,
    String(body.return_instructions || '').trim() || null,
  ];
}

adminRoutes.get('/varastot', async (req, res, next) => {
  try {
    const warehouses = await many(
      `SELECT w.*,
        (SELECT count(*)::int FROM stock s JOIN items i ON i.id = s.item_id AND i.archived_at IS NULL
         WHERE s.warehouse_id = w.id AND s.quantity > 0) AS item_count
       FROM warehouses w
       WHERE w.org_id = $1 AND w.archived_at IS NULL
       ORDER BY w.sort_order, w.name`,
      [req.org.id],
    );
    res.send(view.warehousesPage(req, res, { warehouses }));
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/varastot', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.redirect('/hallinta/varastot?virhe=puuttuva');
    const slug = await uniqueWarehouseSlug(req.org.id, name);
    const fields = warehouseFields(req.body);
    await query(
      `INSERT INTO warehouses
        (org_id, slug, name, address, postal_code, city, contact_name, contact_email,
         contact_phone, opening_info, map_url, pickup_instructions, return_instructions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [req.org.id, slug, name, ...fields],
    );
    res.redirect('/hallinta/varastot?ok=varasto-lisatty');
  } catch (err) {
    next(err);
  }
});

adminRoutes.get('/varastot/:id', async (req, res, next) => {
  try {
    const warehouse = await one(
      'SELECT * FROM warehouses WHERE id = $1 AND org_id = $2 AND archived_at IS NULL',
      [req.params.id, req.org.id],
    );
    if (!warehouse) return res.status(404).send(view.notFoundPage(req, res));
    const stock = await stockRows(req.org.id, warehouse.id);
    res.send(view.warehouseDetailPage(req, res, { warehouse, stockRows: stock }));
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/varastot/:id', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.redirect(`/hallinta/varastot/${req.params.id}?virhe=puuttuva`);
    const fields = warehouseFields(req.body);
    await query(
      `UPDATE warehouses SET name = $3, address = $4, postal_code = $5, city = $6,
         contact_name = $7, contact_email = $8, contact_phone = $9, opening_info = $10,
         map_url = $11, pickup_instructions = $12, return_instructions = $13, updated_at = now()
       WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.org.id, name, ...fields],
    );
    res.redirect(`/hallinta/varastot/${req.params.id}?ok=varasto-paivitetty`);
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/varastot/:id/saldo', async (req, res, next) => {
  try {
    const warehouse = await one(
      'SELECT id FROM warehouses WHERE id = $1 AND org_id = $2 AND archived_at IS NULL',
      [req.params.id, req.org.id],
    );
    if (!warehouse) return res.status(404).send(view.notFoundPage(req, res));
    await saveStock(req.org.id, req.params.id, req.body);
    res.redirect(`/hallinta/varastot/${req.params.id}?ok=saldo-paivitetty`);
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/varastot/:id/arkistoi', async (req, res, next) => {
  try {
    await query(
      'UPDATE warehouses SET archived_at = now(), updated_at = now() WHERE id = $1 AND org_id = $2',
      [req.params.id, req.org.id],
    );
    res.redirect('/hallinta/varastot?ok=varasto-arkistoitu');
  } catch (err) {
    next(err);
  }
});

adminRoutes.get('/asetukset', (req, res) => {
  res.send(view.settingsPage(req, res));
});

adminRoutes.post('/asetukset', async (req, res, next) => {
  try {
    const theme = isTheme(req.body.theme) ? req.body.theme : req.org.theme;
    const mode = ['login', 'approval', 'hybrid'].includes(req.body.booking_mode)
      ? req.body.booking_mode
      : 'approval';
    const maxDays = Math.min(180, Math.max(1, Number.parseInt(req.body.max_booking_days || '30', 10) || 30));
    const minDays = Math.min(60, Math.max(0, Number.parseInt(req.body.min_notice_days || '0', 10) || 0));
    const contactEmail = String(req.body.contact_email || '').trim();
    if (contactEmail && !isEmail(contactEmail)) {
      return res.redirect('/hallinta/asetukset?virhe=puuttuva');
    }
    let domain = String(req.body.custom_domain || '').trim().toLowerCase().replace(/\.$/, '');
    if (domain) {
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || domain.includes('..')) {
        return res.redirect('/hallinta/asetukset?virhe=puuttuva');
      }
      const taken = await one(
        'SELECT id FROM orgs WHERE lower(custom_domain) = $1 AND id <> $2',
        [domain, req.org.id],
      );
      if (taken) return res.redirect('/hallinta/asetukset?virhe=domain-varattu');
    }
    const smtpHost = String(req.body.smtp_host || '').trim();
    const smtpPassword = String(req.body.smtp_password || '');
    if (smtpPassword && !canEncryptSecrets()) {
      return res.redirect('/hallinta/asetukset?virhe=smtp-secret');
    }
    const smtpPasswordEnc = smtpPassword
      ? encryptSecret(smtpPassword)
      : req.org.smtp_password_enc;
    await query(
      `UPDATE orgs SET theme = $2, booking_mode = $3::booking_mode, max_booking_days = $4,
         min_notice_days = $5, contact_email = $6, contact_phone = $7, about = $8,
         custom_domain = $9, white_label = $10, smtp_host = $11, smtp_port = $12,
         smtp_secure = $13, smtp_user = $14, smtp_password_enc = $15, smtp_from = $16,
         updated_at = now()
       WHERE id = $1`,
      [
        req.org.id,
        theme,
        mode,
        maxDays,
        minDays,
        contactEmail || null,
        String(req.body.contact_phone || '').trim() || null,
        String(req.body.about || '').trim() || null,
        domain || null,
        req.body.white_label === '1',
        smtpHost || null,
        Math.min(65535, Math.max(1, Number.parseInt(req.body.smtp_port || '587', 10) || 587)),
        req.body.smtp_secure === '1',
        String(req.body.smtp_user || '').trim() || null,
        smtpPasswordEnc || null,
        String(req.body.smtp_from || '').trim() || null,
      ],
    );
    res.redirect('/hallinta/asetukset?ok=asetukset-tallennettu');
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/asetukset/testi', async (req, res, next) => {
  try {
    const result = await sendTestEmail(req.org, String(req.body.test_email || req.org.contact_email || '').trim());
    res.redirect(`/hallinta/asetukset?ok=${result.status === 'failed' ? 'email-virhe' : result.status === 'sent' ? 'email-lahetetty' : 'email-loki'}`);
  } catch (err) {
    next(err);
  }
});

adminRoutes.get('/jasenet', async (req, res, next) => {
  try {
    const members = await many(
      `SELECT m.*, u.name, u.email
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.org_id = $1
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name`,
      [req.org.id],
    );
    res.send(view.membersPage(req, res, { members }));
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/jasenet', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await one('SELECT id FROM users WHERE email = $1', [email]);
    if (!user) return res.redirect('/hallinta/jasenet?virhe=jasen-puuttuu');
    const role = req.body.role === 'admin' ? 'admin' : 'member';
    await query(
      `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3::member_role)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [req.org.id, user.id, role],
    );
    res.redirect('/hallinta/jasenet?ok=jasen-lisatty');
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/jasenet/:id/rooli', async (req, res, next) => {
  try {
    const role = req.body.role === 'admin' ? 'admin' : 'member';
    await query(
      `UPDATE memberships SET role = $3::member_role
       WHERE org_id = $1 AND user_id = $2 AND role <> 'owner'`,
      [req.org.id, req.params.id, role],
    );
    res.redirect('/hallinta/jasenet?ok=jasen-paivitetty');
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/jasenet/:id/poista', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.redirect('/hallinta/jasenet?virhe=oikeus');
    }
    await query(
      `DELETE FROM memberships WHERE org_id = $1 AND user_id = $2 AND role <> 'owner'`,
      [req.org.id, req.params.id],
    );
    res.redirect('/hallinta/jasenet?ok=jasen-poistettu');
  } catch (err) {
    next(err);
  }
});

async function apiKeys(orgId) {
  return many(
    `SELECT * FROM api_keys WHERE org_id = $1 ORDER BY created_at DESC`,
    [orgId],
  );
}

adminRoutes.get('/api', async (req, res, next) => {
  try {
    res.send(view.apiPage(req, res, { keys: await apiKeys(req.org.id), newKey: null }));
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/api/avaimet', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.redirect('/hallinta/api?virhe=puuttuva');
    const selected = String(req.body.scopes || 'read')
      .split(',')
      .map((scope) => scope.trim())
      .filter((scope) => ['read', 'write', 'admin'].includes(scope));
    const scopes = selected.length ? selected : ['read'];
    const raw = `kamo_${randomToken(24)}`;
    await query(
      `INSERT INTO api_keys (org_id, name, prefix, key_hash, scopes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.org.id, name, raw.slice(0, 12), sha256(raw), scopes, req.user.id],
    );
    res.send(view.apiPage(req, res, { keys: await apiKeys(req.org.id), newKey: raw }));
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/api/avaimet/:id/peruuta', async (req, res, next) => {
  try {
    await query(
      'UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL',
      [req.params.id, req.org.id],
    );
    res.redirect('/hallinta/api?ok=avain-peruutettu');
  } catch (err) {
    next(err);
  }
});
