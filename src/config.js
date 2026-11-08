const env = process.env;

function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int(env.PORT, 3000),
  databaseUrl: env.DATABASE_URL || 'postgres://kamo:kamo@localhost:5432/kamo',
  baseDomain: String(env.BASE_DOMAIN || '').trim().toLowerCase().replace(/^\.+|\.+$/g, ''),
  secureCookies: env.COOKIE_SECURE === '1',
  trustProxy: env.TRUST_PROXY !== '0',
  allowOrgSignup: env.ALLOW_ORG_SIGNUP !== '0',
  poolMax: int(env.PG_POOL_MAX, 10),
  appSecret: env.APP_SECRET || '',
  sessionDays: 30,
  appName: 'Kamo',
  timezone: 'Europe/Helsinki',
};
