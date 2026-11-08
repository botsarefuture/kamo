import assert from 'node:assert/strict';

const base = process.env.SMOKE_BASE || 'http://localhost:3000';
const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@kamo.local';
const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'kamo-demo-2026';
const jar = {};

function saveCookies(res) {
  for (const cookie of res.headers.getSetCookie?.() || []) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    if (index > 0) jar[pair.slice(0, index)] = pair.slice(index + 1);
  }
}

const cookieHeader = () => Object.entries(jar).map(([key, value]) => `${key}=${value}`).join('; ');

async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { cookie: cookieHeader(), ...(options.headers || {}) },
    redirect: 'manual',
  });
  saveCookies(res);
  return { res, text: await res.text() };
}

const get = (path) => request(path);
const postForm = (path, body) => request(path, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(body),
});
const csrf = (html) => html.match(/name="_csrf" value="([^"]+)"/)?.[1];
const iso = (date) => date.toISOString().slice(0, 10);
const future = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
};

function check(condition, label) {
  assert.ok(condition, label);
  console.log(`ok - ${label}`);
}

async function main() {
  let r = await get('/api/v1/health');
  check(r.res.status === 200, 'health endpoint');
  r = await get('/api/v1/openapi.json');
  check(r.res.status === 200 && JSON.parse(r.text).openapi === '3.1.0', 'OpenAPI 3.1 document');

  r = await get('/');
  check(r.res.status === 200 && r.text.includes('Kamo'), 'instance landing page');
  r = await get('/?org=mielenosoitukset');
  check(r.res.status === 200 && r.text.includes('data-theme="mielenosoitukset"'), 'organization theme');

  r = await get('/kirjaudu');
  let token = csrf(r.text);
  r = await postForm('/kirjaudu', {
    _csrf: token,
    email: adminEmail,
    password: adminPassword,
    next: '/',
  });
  check(r.res.status === 302 && Boolean(jar.kamo_sid), 'admin sign-in');

  r = await get('/varaa');
  check(r.res.status === 200, 'booking form for signed-in user');
  token = csrf(r.text);
  const warehouseId = r.text.match(/name="warehouse_id"[\s\S]*?<option value="([0-9a-f-]{36})"/)?.[1];
  const quantityField = [...r.text.matchAll(/name="(qty_[0-9a-f-]{36})"[^>]*max="(\d+)"/g)]
    .find((match) => Number(match[2]) > 0)?.[1];
  check(Boolean(warehouseId && quantityField), 'booking form has a warehouse and item with free stock');

  const offset = 45 + (Date.now() % 100);
  const startsOn = future(offset);
  const endsOn = future(offset + 2);
  r = await postForm('/varaa', {
    _csrf: token,
    warehouse_id: warehouseId,
    starts_on: startsOn,
    ends_on: endsOn,
    [quantityField]: '1',
    contact_name: 'Smoke Test',
    contact_email: `smoke-${Date.now()}@example.com`,
    purpose: 'Smoke test',
  });
  const location = r.res.headers.get('location') || '';
  const reference = location.match(/#(.+)/)?.[1];
  check(r.res.status === 302 && reference?.startsWith('K-'), 'booking created through the form');

  r = await get('/omat-varaukset');
  check(r.text.includes(reference) && r.text.includes('Odottaa hyväksyntää'), 'booking appears as pending');

  r = await get('/hallinta/varaukset');
  token = csrf(r.text);
  const bookingPath = r.text.match(new RegExp(`href="(/hallinta/varaukset/[0-9a-f-]{36})"[^>]*>${reference}`))?.[1];
  check(Boolean(bookingPath), 'booking visible in admin');
  r = await postForm(`${bookingPath}/tila`, {
    _csrf: token,
    status: 'approved',
    note: 'Hyväksytty smoke-testissä.',
  });
  check(r.res.status === 302, 'admin approval');

  r = await get('/omat-varaukset');
  check(r.text.includes(reference) && r.text.includes('Hyväksytty'), 'approval visible to customer');

  r = await get('/hallinta/api');
  token = csrf(r.text);
  r = await postForm('/hallinta/api/avaimet', {
    _csrf: token,
    name: 'Smoke test key',
    scopes: 'read,write,admin',
  });
  const key = r.text.match(/<code class="key-reveal">(kamo_[^<]+)<\/code>/)?.[1];
  check(r.res.status === 200 && Boolean(key), 'API key created');

  const api = (path, options = {}) => request(path, {
    ...options,
    headers: {
      authorization: `Bearer ${key}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  r = await api('/api/v1/me');
  check(r.res.status === 200 && JSON.parse(r.text).organization.slug === 'mielenosoitukset', 'API key resolves organization');

  r = await api('/api/v1/items');
  const items = JSON.parse(r.text).items;
  check(r.res.status === 200 && items.length > 0, 'API items');

  r = await api(`/api/v1/availability?warehouse_id=${warehouseId}&from=${future(offset + 10)}&to=${future(offset + 12)}`);
  const availability = JSON.parse(r.text).availability;
  const free = availability.find((row) => row.available > 0);
  check(r.res.status === 200 && Boolean(free), 'API availability');

  const idem = `smoke-${Date.now()}`;
  const payload = {
    warehouse_id: warehouseId,
    starts_on: future(offset + 10),
    ends_on: future(offset + 12),
    contact_name: 'API Smoke',
    contact_email: `api-smoke-${Date.now()}@example.com`,
    items: [{ item_id: free.item_id, quantity: 1 }],
  };
  r = await api('/api/v1/bookings', {
    method: 'POST',
    headers: { 'idempotency-key': idem },
    body: JSON.stringify(payload),
  });
  if (r.res.status !== 201) console.error('API booking response:', r.res.status, r.text);
  const apiBooking = JSON.parse(r.text).booking;
  check(r.res.status === 201 && Boolean(apiBooking?.reference), 'API booking created');

  r = await api('/api/v1/bookings', {
    method: 'POST',
    headers: { 'idempotency-key': idem },
    body: JSON.stringify(payload),
  });
  check(r.res.status === 201 && JSON.parse(r.text).booking.reference === apiBooking.reference, 'idempotency replays the same booking');

  r = await api(`/api/v1/bookings/${apiBooking.reference}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'approved' }),
  });
  check(r.res.status === 200 && JSON.parse(r.text).booking.status === 'approved', 'API status update');

  r = await fetch(`${base}/api/v1/items`);
  check(r.status === 401, 'API rejects a missing key');

  r = await get('/?org=elokapina');
  check(r.res.status === 200 && r.text.includes('data-theme="xr"'), 'XR theme');
  r = await get('/?org=kamo-yhdistys');
  check(r.res.status === 200 && r.text.includes('data-theme="general"'), 'general theme');

  console.log('\nSmoke test passed.');
}

main().catch((err) => {
  console.error('\nSmoke test failed:', err.message);
  process.exit(1);
});
