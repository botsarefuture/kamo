# Kamo

Kamo is a self-hosted, multi-tenant booking calendar for sound reinforcement gear. Each
organization gets its own subdomain, warehouses, stock, booking policy, instructions, theme
and API credentials. It is built for volunteer-run associations that need to know who has
which speaker, cable and microphone, and when.

The interface is server-rendered HTML with plain CSS tokens and self-hosted fonts. There is
no client build step.

## What works

- Organization subdomains and a shared instance landing page, with an admin area for each
  organization and an instance admin area for the operator.
- Warehouses with addresses, opening info, contact details and separate pickup and return
  instructions.
- Item catalog, categories, per-warehouse stock, and availability calculated from pending
  and approved bookings.
- Two booking modes: signed-in users get an immediate confirmation, or an admin approves
  every request. Authorization also supports an owner/admin/member hierarchy.
- Four themes: `kamo`, `mielenosoitukset`, `xr` and `general`, each with light and dark
  token sets. Themes change color, display face, radius, border weight and header treatment.
- Session authentication with scrypt password hashes, HttpOnly cookies, CSRF protection,
  login throttling, role checks and audit logging.
- Per-organization API keys with `read`, `write` and `admin` scopes, OpenAPI 3.1, idempotent
  booking creation and a rate limit.
- Docker Compose deployment with PostgreSQL 17.

## Stack

- Node.js 24, Express 5
- PostgreSQL 17 with hand-written SQL through `pg`
- Server-rendered HTML and CSS custom properties
- Self-hosted Inter, Hanken Grotesk, Crimson Text, Fucxed Caps and Fucxed Stencil

## Quick start

```bash
cp .env.example .env
npm install
docker compose up -d db
npm run migrate
npm run seed
npm run dev
```

Open `http://localhost:3000` for the instance landing page. In development, organization
sites can be selected with `?org=<slug>` or with `*.localhost` subdomains:

- `http://localhost:3000/?org=mielenosoitukset`
- `http://mielenosoitukset.localhost:3000`
- `http://localhost:3000/?org=elokapina`
- `http://localhost:3000/?org=kamo-yhdistys`

The seeded admin is `admin@kamo.local` / `kamo-demo-2026`. Change it immediately outside
local development. Seeding is idempotent and keeps existing organizations.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://kamo:kamo@localhost:5432/kamo` | PostgreSQL connection string |
| `PORT` | `3000` | HTTP port |
| `BASE_DOMAIN` | empty | Enables `<slug>.<BASE_DOMAIN>` tenancy, e.g. `example.com` |
| `COOKIE_SECURE` | `0` | Set to `1` behind HTTPS |
| `TRUST_PROXY` | `1` | Trust the reverse proxy's `X-Forwarded-*` headers |
| `PG_POOL_MAX` | `10` | PostgreSQL pool size |
| `SEED_ADMIN_EMAIL` | `admin@kamo.local` | Seed superadmin email |
| `SEED_ADMIN_PASSWORD` | `kamo-demo-2026` | Seed superadmin password |

`ALLOW_ORG_SIGNUP` is accepted by the Compose file but organization self-service is controlled
by the `allow_org_signup` value in `instance_settings`, which the instance admin can change.

## Multi-tenancy

Set `BASE_DOMAIN=example.com` and point a wildcard DNS record at the server:

```text
*.example.com  A  <server-ip>
```

The app resolves the organization from the `Host` header. `example.com` itself serves the
instance landing page. Unknown or parked subdomains return 404. Without `BASE_DOMAIN`, use
`?org=<slug>` or `<slug>.localhost` for development.

Organization slugs are immutable in the UI and must match `^[a-z0-9][a-z0-9-]{0,38}$`.
They are generated from the name when an organization is created.

## Themes

| Key | Character |
| --- | --- |
| `kamo` | Warm paper, pine green, copper accent, Hanken Grotesk |
| `mielenosoitukset` | Civic blue, orange accent, Inter, 16px cards, gradient header |
| `xr` | Near-black poster ground, neon green `#caff11`, neon pink `#ff1493`, Fucxed Caps and Crimson Text, zero radius |
| `general` | Neutral light utility surface, blue-green accent, Hanken Grotesk |

The `mielenosoitukset` tokens are derived from the live site and its documented product
tokens. The XR palette and type come from Elokapina's 2021 graphic guide and the official
font library at `extinctionrebellion.aktivisda.earth`. Sources and licensing are recorded in
`.hallmark/brand-spec.md`, `.hallmark/brand-spec-xr.md` and `public/fonts/xr/README.md`.

Fucxed Caps and Fucxed Stencil are distributed under the terms in their font metadata
(noncommercial, no derivatives, no resale). Crimson Text is SIL OFL 1.1. Do not use the XR
logo or extinction symbol in the product; the organization name is set in type.

## Booking model

A booking holds stock for every day from `starts_on` through `ends_on`, inclusive. Pending
and approved bookings both reserve units, so an approval queue cannot oversell gear.

Creating a booking:

1. Locks the warehouse with a PostgreSQL transaction advisory lock.
2. Recomputes availability for the requested range.
3. Rejects any line whose quantity exceeds available stock.
4. Inserts the booking and lines in one transaction.

Status transitions are explicit: `pending → approved | rejected | cancelled`,
`approved → returned | cancelled`. A returned or cancelled booking releases its stock.

Availability is derived, not stored as a mutable counter, so it stays correct after
cancellations and status changes. The relevant index is
`bookings (org_id, warehouse_id, starts_on, ends_on)`.

## API

Create a key in **Hallinta → API**. The raw key is shown once. The organization is derived
from the key; never send an organization id.

```bash
curl -H "Authorization: Bearer kamo_..." \
  https://mielenosoitukset.example.com/api/v1/items
```

Create a booking idempotently:

```bash
curl -X POST https://mielenosoitukset.example.com/api/v1/bookings \
  -H "Authorization: Bearer kamo_..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: event-2026-11-08-1" \
  -d '{
    "warehouse_id": "00000000-0000-0000-0000-000000000000",
    "starts_on": "2026-11-20",
    "ends_on": "2026-11-22",
    "contact_name": "Test Person",
    "contact_email": "test@example.com",
    "items": [{"item_id": "00000000-0000-0000-0000-000000000000", "quantity": 1}]
  }'
```

Endpoints: `GET /me`, `GET /warehouses`, `GET /items`, `GET /availability`,
`GET|POST /bookings`, `GET /bookings/{reference}`,
`PATCH /bookings/{reference}/status`. The OpenAPI document is at `/api/v1/openapi.json`.
Scopes: `read` for reads, `write` for booking creation, `admin` for status changes and all
other scopes. The API is rate-limited to 120 requests per minute per key.

## Deploy

```bash
cp .env.example .env
# set POSTGRES_PASSWORD, BASE_DOMAIN and COOKIE_SECURE=1
docker compose up -d --build
docker compose run --rm app node scripts/seed.js
```

Put a reverse proxy in front of `127.0.0.1:3000`, preserve the original `Host`, and use a
wildcard certificate. The app trusts one proxy hop by default. Example Nginx server name:

```nginx
server_name ~^(?<org>[a-z0-9-]+)\.example\.com$;
```

Back up the PostgreSQL volume (`pg_dump`) and keep `.env` out of version control. The
Compose file binds PostgreSQL and the app to loopback only; the reverse proxy is the public
entry point.

## Tests

```bash
npm test          # unit tests for dates, windows, availability math and themes
npm run smoke     # end-to-end HTTP flow; needs a running seeded server
```

`smoke` signs in as the seeded admin, creates and approves a booking, creates an API key,
checks idempotency, exercises availability and verifies all four organization themes. It
writes test bookings and keys to the database; use a development database.

## Project layout

```text
server.js                 boot, migrations, graceful shutdown
src/app.js                middleware, route mounting, security headers
src/db.js                 pg pool, queries, transactions, migration runner
src/auth.js               scrypt, sessions, CSRF, roles, login throttling
src/tenant.js             subdomain resolution, instance and org context
src/themes.js             theme registry and metadata
src/availability.js       stock and reserved calculations
src/bookings.js           transactional booking creation and status changes
src/routes/               site, auth, admin, instance and API routers
src/views/                server-rendered pages and shared layout
src/openapi.js            OpenAPI 3.1 document
db/migrations/            PostgreSQL schema
test/                     node:test unit tests
scripts/                  migrate, seed and smoke scripts
public/                   CSS, fonts and favicon
```

## Known limitations

- No outbound email is wired yet. Booking status is shown in **Omat varaukset**; the UI does
  not promise an email. Add SMTP and a queued notification job before relying on email.
- No webhooks or background jobs yet. The API is synchronous.
- No file uploads or item images.
- Theme previews are applied by selecting the theme in settings, not by a live preview route.
- The app is a single Node process with a PostgreSQL pool; scale reads with replicas before
  adding multiple app instances that need shared rate limiting.
