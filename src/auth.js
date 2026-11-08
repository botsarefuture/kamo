import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { one, query } from './db.js';
import { config } from './config.js';
import { randomToken, sha256 } from './util.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'kamo_sid';
const CSRF_COOKIE = 'kamo_csrf';

const attempts = new Map();

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      out[key] = part.slice(index + 1).trim();
    }
  }
  return out;
}

export function cookies(req, res, next) {
  req.cookies = parseCookies(req.headers.cookie || '');
  next();
}

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    maxAge: maxAgeMs,
  };
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, salt, expected] = String(stored || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const derived = await scrypt(password, salt, 64);
  const known = Buffer.from(expected, 'hex');
  return known.length === derived.length && crypto.timingSafeEqual(known, derived);
}

export async function createSession(userId, req, res) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + config.sessionDays * 86400000);
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [sha256(token), userId, expires, String(req.get('user-agent') || '').slice(0, 300) || null],
  );
  res.cookie(SESSION_COOKIE, token, cookieOptions(config.sessionDays * 86400000));
}

export async function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]).catch(() => {});
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function loadUser(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  req.user = null;
  if (token) {
    req.user = await one(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)],
    );
  }
  res.locals.user = req.user;
  next();
}

export function csrf(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token || token.length < 20) {
    token = randomToken(24);
    res.cookie(CSRF_COOKIE, token, cookieOptions(config.sessionDays * 86400000));
    if (req.cookies) req.cookies[CSRF_COOKIE] = token;
  }
  req.csrfToken = token;
  res.locals.csrfToken = token;
  next();
}

export function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== req.get('host')) {
        return res.status(403).send('Pyyntö eri osoitteesta estettiin.');
      }
    } catch {
      return res.status(403).send('Pyyntö eri osoitteesta estettiin.');
    }
  }
  const cookie = req.cookies?.[CSRF_COOKIE];
  if (!cookie || req.body?._csrf !== cookie) {
    return res.status(403).send('Istunto vanheni. Palaa takaisin ja yritä uudelleen.');
  }
  next();
}

export function requireUser(nextPath = '/') {
  return (req, res, next) => {
    if (req.user) return next();
    const target = nextPath === 'current' ? req.originalUrl : nextPath;
    return res.redirect(`/kirjaudu?next=${encodeURIComponent(target)}`);
  };
}

export function isOrgAdmin(req) {
  return Boolean(
    req.user?.is_superadmin ||
    req.membership?.role === 'owner' ||
    req.membership?.role === 'admin',
  );
}

export function requireOrgAdmin(req, res, next) {
  if (!req.org) return res.status(404).send('Organisaatiota ei löytynyt.');
  if (!req.user) {
    return res.redirect(`/kirjaudu?next=${encodeURIComponent(req.originalUrl)}`);
  }
  if (!isOrgAdmin(req)) {
    return res.status(403).send('Sinulla ei ole oikeutta tähän näkymään.');
  }
  next();
}

export function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}

function throttleKey(req, email) {
  return `${req.ip}|${String(email || '').toLowerCase()}`;
}

export function loginAllowed(req, email) {
  const item = attempts.get(throttleKey(req, email));
  if (!item) return true;
  if (item.resetAt < Date.now()) {
    attempts.delete(throttleKey(req, email));
    return true;
  }
  return item.count < 10;
}

export function noteLoginFailure(req, email) {
  const key = throttleKey(req, email);
  const item = attempts.get(key);
  if (!item || item.resetAt < Date.now()) {
    attempts.set(key, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  } else {
    item.count += 1;
  }
}

export function clearLoginFailures(req, email) {
  attempts.delete(throttleKey(req, email));
}
