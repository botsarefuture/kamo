ALTER TYPE booking_mode ADD VALUE IF NOT EXISTS 'hybrid';

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS listed_on_instance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS white_label boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS smtp_host text,
  ADD COLUMN IF NOT EXISTS smtp_port int NOT NULL DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_secure boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS smtp_user text,
  ADD COLUMN IF NOT EXISTS smtp_password_enc text,
  ADD COLUMN IF NOT EXISTS smtp_from text;

CREATE UNIQUE INDEX IF NOT EXISTS orgs_custom_domain_idx
  ON orgs (lower(custom_domain))
  WHERE custom_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_log (
  id bigserial PRIMARY KEY,
  org_id uuid REFERENCES orgs(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_log_org_time_idx ON email_log (org_id, created_at DESC);

ALTER TABLE orgs ALTER COLUMN smtp_secure SET DEFAULT false;
