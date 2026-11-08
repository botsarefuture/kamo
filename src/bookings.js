import { many, one, query, tx } from './db.js';
import { availabilityFor } from './availability.js';

export class BookingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function audit(orgId, actorId, entityType, entityId, action, payload = null, client = null) {
  const runner = client || { query };
  await runner.query(
    `INSERT INTO audit_log (org_id, actor_id, entity_type, entity_id, action, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [orgId, actorId, entityType, entityId, action, payload ? JSON.stringify(payload) : null],
  );
}

function normalizeItems(items) {
  const map = new Map();
  for (const item of items || []) {
    const id = String(item.itemId || item.item_id || '').trim();
    const quantity = Number.parseInt(item.quantity, 10);
    if (!id || !Number.isFinite(quantity) || quantity <= 0) continue;
    map.set(id, (map.get(id) || 0) + quantity);
  }
  return [...map.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export async function createBooking({
  org,
  user,
  warehouse,
  startsOn,
  endsOn,
  contactName,
  contactEmail,
  contactPhone,
  purpose,
  items,
  mode,
  member = true,
  trusted = false,
}) {
  const lines = normalizeItems(items);
  if (!lines.length) throw new BookingError('Valitse vähintään yksi kalustorivi.');

  return tx(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `booking:${org.id}:${warehouse.id}`,
    ]);

    const availability = await availabilityFor(org.id, warehouse.id, startsOn, endsOn, client);
    for (const line of lines) {
      const item = availability.get(line.itemId);
      if (!item) throw new BookingError('Yhtä valituista nimikkeistä ei ole tässä varastossa.');
      if (line.quantity > item.available) {
        throw new BookingError(
          `Nimikettä ${item.name} on vapaana vain ${item.available} ${item.unit}.`,
        );
      }
    }

    const status = mode === 'approval'
      ? 'pending'
      : (member && (user || trusted) ? 'approved' : 'pending');
    const booking = await one(
      `INSERT INTO bookings
        (org_id, warehouse_id, user_id, reference, starts_on, ends_on, status,
         contact_name, contact_email, contact_phone, purpose)
       VALUES ($1, $2, $3,
         'K-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('booking_ref_seq')::text, 4, '0'),
         $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        org.id,
        warehouse.id,
        user?.id ?? null,
        startsOn,
        endsOn,
        status,
        contactName,
        contactEmail,
        contactPhone || null,
        purpose || null,
      ],
    );

    for (const line of lines) {
      await client.query(
        'INSERT INTO booking_items (booking_id, item_id, quantity) VALUES ($1, $2, $3)',
        [booking.id, line.itemId, line.quantity],
      );
    }

    await audit(
      org.id,
      user?.id ?? null,
      'booking',
      booking.id,
      'created',
      { status, warehouse_id: warehouse.id, starts_on: startsOn, ends_on: endsOn },
      client,
    );
    return booking;
  });
}

export async function bookingWithItems(orgId, bookingId) {
  const booking = await one(
    `SELECT b.*, w.name AS warehouse_name, w.slug AS warehouse_slug,
            w.address AS warehouse_address, w.city AS warehouse_city,
            u.name AS user_name, u.email AS user_email
     FROM bookings b
     JOIN warehouses w ON w.id = b.warehouse_id
     LEFT JOIN users u ON u.id = b.user_id
     WHERE b.org_id = $1 AND b.id = $2`,
    [orgId, bookingId],
  );
  if (!booking) return null;
  booking.items = await many(
    `SELECT bi.item_id, bi.quantity, i.name, i.unit
     FROM booking_items bi
     JOIN items i ON i.id = bi.item_id
     WHERE bi.booking_id = $1
     ORDER BY i.name`,
    [booking.id],
  );
  return booking;
}

export async function bookingByReference(orgId, reference) {
  const row = await one('SELECT id FROM bookings WHERE org_id = $1 AND reference = $2', [
    orgId,
    reference,
  ]);
  return row ? bookingWithItems(orgId, row.id) : null;
}

export async function listBookings(orgId, { status, warehouseId, limit = 100 } = {}) {
  const params = [orgId];
  const where = ['b.org_id = $1'];
  if (status) {
    params.push(status);
    where.push(`b.status = $${params.length}`);
  }
  if (warehouseId) {
    params.push(warehouseId);
    where.push(`b.warehouse_id = $${params.length}`);
  }
  params.push(Math.min(Number(limit) || 100, 500));
  return many(
    `SELECT b.*, w.name AS warehouse_name, u.name AS user_name,
            (SELECT COALESCE(SUM(quantity), 0)::int FROM booking_items bi WHERE bi.booking_id = b.id) AS units
     FROM bookings b
     JOIN warehouses w ON w.id = b.warehouse_id
     LEFT JOIN users u ON u.id = b.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY b.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
}

export async function myBookings(orgId, userId) {
  return many(
    `SELECT b.*, w.name AS warehouse_name,
            (SELECT COALESCE(SUM(quantity), 0)::int FROM booking_items bi WHERE bi.booking_id = b.id) AS units
     FROM bookings b
     JOIN warehouses w ON w.id = b.warehouse_id
     WHERE b.org_id = $1 AND b.user_id = $2
     ORDER BY b.starts_on DESC, b.created_at DESC`,
    [orgId, userId],
  );
}

const transitions = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['returned', 'cancelled'],
  rejected: [],
  cancelled: [],
  returned: [],
};

export async function changeStatus({ orgId, bookingId, status, actorId, note }) {
  const booking = await bookingWithItems(orgId, bookingId);
  if (!booking) throw new BookingError('Varausta ei löytynyt.', 404);
  if (!(transitions[booking.status] || []).includes(status)) {
    throw new BookingError('Tila ei voi vaihtua tästä tilasta tuohon tilaan.');
  }
  const updated = await one(
    `UPDATE bookings
     SET status = $3::booking_status,
         admin_note = COALESCE($4::text, admin_note),
         approved_by = CASE WHEN $3::booking_status = 'approved' THEN $5::uuid ELSE approved_by END,
         approved_at = CASE WHEN $3::booking_status = 'approved' THEN now() ELSE approved_at END,
         returned_at = CASE WHEN $3::booking_status = 'returned' THEN now() ELSE returned_at END,
         updated_at = now()
     WHERE org_id = $1 AND id = $2
     RETURNING *`,
    [orgId, bookingId, status, note || null, actorId],
  );
  await audit(orgId, actorId, 'booking', bookingId, `status:${status}`, { note: note || null });
  return updated;
}

export async function cancelOwnBooking({ orgId, bookingId, userId }) {
  const booking = await bookingWithItems(orgId, bookingId);
  if (!booking) throw new BookingError('Varausta ei löytynyt.', 404);
  if (booking.user_id !== userId) throw new BookingError('Varaus ei kuulu sinulle.', 403);
  if (!['pending', 'approved'].includes(booking.status)) {
    throw new BookingError('Tätä varausta ei voi enää peruuttaa.');
  }
  const updated = await one(
    `UPDATE bookings SET status = 'cancelled', updated_at = now()
     WHERE org_id = $1 AND id = $2 RETURNING *`,
    [orgId, bookingId],
  );
  await audit(orgId, userId, 'booking', bookingId, 'cancelled-by-user');
  return updated;
}
