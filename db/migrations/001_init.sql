CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE booking_mode AS ENUM ('login', 'approval', 'hybrid');
CREATE TYPE booking_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'returned');
CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE instance_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  name text NOT NULL,
  theme text NOT NULL DEFAULT 'kamo',
  footer_note text,
  allow_org_signup boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO instance_settings (id, name, theme, footer_note)
VALUES (
  true,
  'Kamo',
  'kamo',
  'Jokaisella järjestöllä oma alidomain, varastot, kalusto ja varauskäytäntö.'
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38})$'),
  name text NOT NULL,
  about text,
  theme text NOT NULL DEFAULT 'general',
  booking_mode booking_mode NOT NULL DEFAULT 'approval',
  contact_email text,
  contact_phone text,
  custom_domain text,
  listed_on_instance boolean NOT NULL DEFAULT false,
  white_label boolean NOT NULL DEFAULT false,
  smtp_host text,
  smtp_port int NOT NULL DEFAULT 587,
  smtp_secure boolean NOT NULL DEFAULT true,
  smtp_user text,
  smtp_password_enc text,
  smtp_from text,
  max_booking_days int NOT NULL DEFAULT 30 CHECK (max_booking_days BETWEEN 1 AND 180),
  min_notice_days int NOT NULL DEFAULT 0 CHECK (min_notice_days BETWEEN 0 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  parked_at timestamptz
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  is_superadmin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ip text,
  user_agent text
);

CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  address text,
  postal_code text,
  city text,
  map_url text,
  opening_info text,
  contact_name text,
  contact_phone text,
  contact_email text,
  pickup_instructions text,
  return_instructions text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (org_id, slug)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (org_id, name)
);

CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'kpl',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE stock (
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, item_id)
);

CREATE SEQUENCE booking_ref_seq;

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status booking_status NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  contact_name text NOT NULL,
  contact_email citext NOT NULL,
  contact_phone text,
  purpose text,
  admin_note text,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE booking_items (
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id),
  quantity int NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (booking_id, item_id)
);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['read']::text[],
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  key text NOT NULL,
  endpoint text NOT NULL,
  request_hash text NOT NULL,
  status_code int NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key, endpoint)
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  org_id uuid REFERENCES orgs(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_log (
  id bigserial PRIMARY KEY,
  org_id uuid REFERENCES orgs(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bookings_org_status_start_idx ON bookings (org_id, status, starts_on);
CREATE INDEX bookings_org_wh_range_idx ON bookings (org_id, warehouse_id, starts_on, ends_on);
CREATE INDEX bookings_user_idx ON bookings (user_id);
CREATE INDEX booking_items_item_idx ON booking_items (item_id);
CREATE INDEX memberships_user_idx ON memberships (user_id);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);
CREATE INDEX api_keys_org_idx ON api_keys (org_id) WHERE revoked_at IS NULL;
CREATE INDEX audit_log_org_time_idx ON audit_log (org_id, created_at DESC);
CREATE INDEX items_name_trgm_idx ON items USING gin (name gin_trgm_ops);
CREATE INDEX warehouses_org_idx ON warehouses (org_id) WHERE archived_at IS NULL;
CREATE INDEX items_org_idx ON items (org_id) WHERE archived_at IS NULL;
CREATE INDEX stock_item_idx ON stock (item_id);
CREATE INDEX stock_warehouse_idx ON stock (warehouse_id);
CREATE INDEX email_log_org_time_idx ON email_log (org_id, created_at DESC);
CREATE UNIQUE INDEX orgs_custom_domain_idx ON orgs (lower(custom_domain)) WHERE custom_domain IS NOT NULL;
