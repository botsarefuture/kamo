import { one } from './db.js';
import { config } from './config.js';
import { themeOrDefault } from './themes.js';

let cachedInstance = null;
let cachedAt = 0;

export async function getInstance() {
  if (cachedInstance && Date.now() - cachedAt < 15000) return cachedInstance;
  cachedInstance = await one('SELECT * FROM instance_settings WHERE id = true');
  cachedAt = Date.now();
  return cachedInstance;
}

export function invalidateInstance() {
  cachedInstance = null;
  cachedAt = 0;
}

export function orgUrl(req, orgOrSlug, path = '/') {
  const protocol = req.protocol || 'http';
  const org = orgOrSlug && typeof orgOrSlug === 'object' ? orgOrSlug : null;
  const slug = org ? org.slug : orgOrSlug;
  if (org?.custom_domain) {
    return `${protocol}://${org.custom_domain}${path}`;
  }
  if (config.baseDomain) {
    return `${protocol}://${slug}.${config.baseDomain}${path}`;
  }
  return `${protocol}://${slug}.localhost:${config.port}${path}`;
}

function hostSlug(host) {
  if (config.baseDomain && host.endsWith(`.${config.baseDomain}`)) {
    return host.slice(0, -(config.baseDomain.length + 1));
  }
  if (host.endsWith('.localhost')) {
    return host.slice(0, -'.localhost'.length);
  }
  return null;
}

export async function attachTenant(req, res, next) {
  try {
    const instance = await getInstance();
    if (!instance) throw new Error('instance_settings row is missing');

    req.instance = instance;
    res.locals.instance = instance;
    res.locals.theme = instance.theme;
    res.locals.path = req.path;

    const host = String(req.hostname || '').toLowerCase().replace(/\.$/, '');

    // A custom domain is an exact host match and takes precedence over subdomains.
    const byDomain = await one(
      'SELECT * FROM orgs WHERE lower(custom_domain) = $1',
      [host],
    );
    if (byDomain) {
      if (byDomain.parked_at) {
        req.org = null;
        res.locals.org = null;
        req.orgMissing = host;
        return next();
      }
      req.org = byDomain;
      res.locals.org = byDomain;
      res.locals.theme = themeOrDefault(byDomain.theme, instance.theme);
      res.locals.instanceTheme = instance.theme;
      await attachMembership(req, res, byDomain);
      return next();
    }

    let slug = hostSlug(host);

    if (!slug) {
      const requested = typeof req.query.org === 'string' ? req.query.org.trim().toLowerCase() : '';
      if (requested) {
        slug = requested;
        res.cookie('kamo_org', requested, {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.secureCookies,
          path: '/',
          maxAge: 30 * 86400000,
        });
      } else if (req.cookies?.kamo_org) {
        slug = String(req.cookies.kamo_org).toLowerCase();
      }
    }

    if (!slug) {
      req.org = null;
      res.locals.org = null;
      return next();
    }

    const org = await one('SELECT * FROM orgs WHERE slug = $1 AND parked_at IS NULL', [slug]);
    if (!org) {
      req.org = null;
      res.locals.org = null;
      req.orgMissing = slug;
      return next();
    }

    req.org = org;
    res.locals.org = org;
    res.locals.theme = themeOrDefault(org.theme, instance.theme);
    res.locals.instanceTheme = instance.theme;
    await attachMembership(req, res, org);
    next();
  } catch (err) {
    next(err);
  }
}

async function attachMembership(req, res, org) {
  if (req.user) {
    req.membership = await one(
      'SELECT * FROM memberships WHERE org_id = $1 AND user_id = $2',
      [org.id, req.user.id],
    );
  }
  res.locals.membership = req.membership || null;
  res.locals.isAdmin = Boolean(
    req.user?.is_superadmin ||
    req.membership?.role === 'owner' ||
    req.membership?.role === 'admin',
  );
  res.locals.isMember = Boolean(req.user?.is_superadmin || req.membership);
  res.locals.canSeeWarehouseDetails = res.locals.isMember;
}
