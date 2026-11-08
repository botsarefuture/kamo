import crypto from 'node:crypto';
import { config } from './config.js';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export const e = escapeHtml;

export function fiDate(iso) {
  if (!iso) return '';
  const value = iso instanceof Date ? iso.toISOString() : String(iso);
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

export function fiDateLong(iso) {
  if (!iso) return '';
  const value = iso instanceof Date ? iso.toISOString() : String(iso);
  return new Intl.DateTimeFormat('fi-FI', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

export function fiDateRange(start, end) {
  if (!start && !end) return '';
  if (!end || start === end) return fiDate(start);
  return `${fiDate(start)} – ${fiDate(end)}`;
}

export function fiDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('fi-FI', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: config.timezone,
  }).format(new Date(value));
}

export function todayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: config.timezone,
  }).format(new Date());
}

export function addDaysIso(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function diffDays(from, to) {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function validateBookingWindow({ startsOn, endsOn, today, minNoticeDays, maxDays }) {
  if (!isIsoDate(startsOn) || !isIsoDate(endsOn)) {
    return { ok: false, error: 'Tarkista päivämäärät.' };
  }
  if (endsOn < startsOn) {
    return { ok: false, error: 'Palautuspäivä ei voi olla ennen noutopäivää.' };
  }
  if (diffDays(today, startsOn) < Number(minNoticeDays || 0)) {
    return { ok: false, error: `Varaus pitää tehdä vähintään ${minNoticeDays} päivää ennen noutoa.` };
  }
  const length = diffDays(startsOn, endsOn) + 1;
  if (length > Number(maxDays || 30)) {
    return { ok: false, error: `Varaus voi kestää enintään ${maxDays} päivää.` };
  }
  return { ok: true, days: length };
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function slugify(value) {
  const map = { ä: 'a', ö: 'o', å: 'a', ü: 'u', é: 'e', è: 'e', ê: 'e', á: 'a', à: 'a' };
  return String(value || '')
    .toLowerCase()
    .replace(/[äöåüéèêáà]/g, (c) => map[c] || c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] || '')
    .join('')
    .toUpperCase();
}

export function parsePositiveInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function statusLabel(status) {
  return {
    pending: 'Odottaa hyväksyntää',
    approved: 'Hyväksytty',
    rejected: 'Hylätty',
    cancelled: 'Peruttu',
    returned: 'Palautettu',
  }[status] || status;
}

export function statusTone(status) {
  return {
    pending: 'warn',
    approved: 'ok',
    rejected: 'danger',
    cancelled: 'muted',
    returned: 'info',
  }[status] || 'muted';
}

export function bookingModeLabel(mode) {
  return {
    login: 'Jäsenet saavat heti',
    approval: 'Hyväksyntä',
    hybrid: 'Jäsenet heti, muut hakemuksella',
  }[mode] || 'Hyväksyntä';
}

export function availableCount(stock, reserved) {
  return Math.max(0, Number(stock || 0) - Number(reserved || 0));
}

export function truncate(value, max = 120) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
