import { many, query } from './db.js';
import { availableCount } from './util.js';

export { availableCount } from './util.js';

export async function availabilityFor(orgId, warehouseId, startsOn, endsOn, client = null) {
  const runner = client ? (text, params) => client.query(text, params) : query;
  const { rows } = await runner(
    `SELECT i.id AS item_id, i.name, i.unit,
            COALESCE(s.quantity, 0)::int AS stock,
            COALESCE((
              SELECT SUM(bi.quantity)::int
              FROM booking_items bi
              JOIN bookings b ON b.id = bi.booking_id
              WHERE b.org_id = $1
                AND b.warehouse_id = $2
                AND b.status IN ('pending', 'approved')
                AND b.starts_on <= $4::date
                AND b.ends_on >= $3::date
                AND bi.item_id = i.id
            ), 0)::int AS reserved
     FROM items i
     LEFT JOIN stock s ON s.item_id = i.id AND s.warehouse_id = $2
     WHERE i.org_id = $1 AND i.archived_at IS NULL`,
    [orgId, warehouseId, startsOn, endsOn],
  );
  const map = new Map();
  for (const row of rows) {
    map.set(row.item_id, {
      itemId: row.item_id,
      name: row.name,
      unit: row.unit,
      stock: Number(row.stock),
      reserved: Number(row.reserved),
      available: availableCount(row.stock, row.reserved),
    });
  }
  return map;
}

export async function catalog(orgId) {
  const warehouses = await many(
    `SELECT id, name, slug, address, city
     FROM warehouses
     WHERE org_id = $1 AND archived_at IS NULL
     ORDER BY sort_order, name`,
    [orgId],
  );
  const items = await many(
    `SELECT i.*, c.name AS category_name, c.sort_order AS category_sort
     FROM items i
     LEFT JOIN categories c ON c.id = i.category_id
     WHERE i.org_id = $1 AND i.archived_at IS NULL
     ORDER BY COALESCE(c.sort_order, 999), c.name, i.sort_order, i.name`,
    [orgId],
  );
  const stock = await many(
    'SELECT item_id, warehouse_id, quantity FROM stock WHERE org_id = $1',
    [orgId],
  );
  const byItem = new Map();
  for (const row of stock) {
    byItem.set(row.item_id, { ...(byItem.get(row.item_id) || {}), [row.warehouse_id]: Number(row.quantity) });
  }
  return items.map((item) => {
    const stockByWarehouse = byItem.get(item.id) || {};
    return {
      ...item,
      stockByWarehouse,
      totalStock: Object.values(stockByWarehouse).reduce((sum, n) => sum + n, 0),
    };
  }).map((item) => ({ ...item, warehouses }));
}

export async function stockRows(orgId, warehouseId) {
  return many(
    `SELECT i.id, i.name, i.unit, i.sort_order,
            COALESCE(s.quantity, 0)::int AS quantity
     FROM items i
     LEFT JOIN stock s ON s.item_id = i.id AND s.warehouse_id = $2
     WHERE i.org_id = $1 AND i.archived_at IS NULL
     ORDER BY i.sort_order, i.name`,
    [orgId, warehouseId],
  );
}

export async function activeItems(orgId) {
  return many(
    `SELECT i.*, c.name AS category_name
     FROM items i
     LEFT JOIN categories c ON c.id = i.category_id
     WHERE i.org_id = $1 AND i.archived_at IS NULL
     ORDER BY COALESCE(c.sort_order, 999), c.name, i.sort_order, i.name`,
    [orgId],
  );
}
