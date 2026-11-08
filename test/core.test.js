import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysIso,
  availableCount,
  fiDate,
  isIsoDate,
  slugify,
  validateBookingWindow,
} from '../src/util.js';
import { isTheme, themeOrDefault } from '../src/themes.js';

const today = '2026-11-08';

test('booking window accepts a valid range', () => {
  assert.deepEqual(
    validateBookingWindow({
      startsOn: '2026-11-11',
      endsOn: '2026-11-13',
      today,
      minNoticeDays: 2,
      maxDays: 30,
    }),
    { ok: true, days: 3 },
  );
});

test('booking window rejects too soon, reversed and too long ranges', () => {
  assert.equal(validateBookingWindow({
    startsOn: '2026-11-09',
    endsOn: '2026-11-10',
    today,
    minNoticeDays: 2,
    maxDays: 30,
  }).ok, false);

  assert.equal(validateBookingWindow({
    startsOn: '2026-11-13',
    endsOn: '2026-11-11',
    today,
    minNoticeDays: 0,
    maxDays: 30,
  }).ok, false);

  assert.equal(validateBookingWindow({
    startsOn: '2026-11-10',
    endsOn: '2026-12-20',
    today,
    minNoticeDays: 0,
    maxDays: 30,
  }).ok, false);
});

test('ISO dates are validated, not just parsed', () => {
  assert.equal(isIsoDate('2026-11-08'), true);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('8.11.2026'), false);
});

test('date helpers keep calendar dates stable', () => {
  assert.equal(addDaysIso('2026-11-08', 3), '2026-11-11');
  assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01');
  assert.equal(fiDate('2026-11-08'), '08.11.2026');
  assert.equal(fiDate(new Date('2026-11-08T12:00:00Z')), '08.11.2026');
});

test('availability never goes below zero', () => {
  assert.equal(availableCount(5, 2), 3);
  assert.equal(availableCount(2, 5), 0);
  assert.equal(availableCount(null, 1), 0);
});

test('themes fall back to a safe theme', () => {
  assert.equal(isTheme('xr'), true);
  assert.equal(isTheme('nope'), false);
  assert.equal(themeOrDefault('nope', 'general'), 'general');
  assert.equal(themeOrDefault('xr', 'general'), 'xr');
});

test('slugs survive Finnish characters', () => {
  assert.equal(slugify('Äänentoisto Yhdistys'), 'aanentoisto-yhdistys');
  assert.equal(slugify('  Mielenosoitukset.fi  '), 'mielenosoitukset-fi');
});
