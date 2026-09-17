import assert from 'node:assert/strict';
import test from 'node:test';
import { currentDay, dayCount, formatRange, monthDays, validRange } from './dates.ts';

const today = Date.UTC(2026, 8, 12);

test('today uses the local calendar date rather than the UTC date of the instant', () => {
  assert.equal(currentDay(new Date(2026, 8, 12, 23, 59)), today);
  assert.equal(currentDay(new Date(2026, 8, 12, 0, 1)), today);
  assert.throws(() => currentDay(new Date(Number.NaN)), RangeError);
});

test('month grids follow real month lengths, weekdays, and leap years', () => {
  assert.equal(monthDays(2026, 8).filter(day => day !== null).length, 30);
  assert.deepEqual(monthDays(2026, 8).slice(0, 2), [null, null]);
  assert.equal(monthDays(2028, 1).filter(day => day !== null).length, 29);
  assert.equal(monthDays(2027, 1).filter(day => day !== null).length, 28);
});

test('date formatting handles single days, month boundaries, and different years', () => {
  const range = { start: Date.UTC(2026, 8, 18), end: Date.UTC(2026, 8, 21) };
  assert.equal(formatRange(range), 'Sep 18 - Sep 21, 2026');
  assert.equal(formatRange(range, true), 'Sep 18 - 21');
  assert.equal(formatRange({ start: today, end: today }), 'Sep 12, 2026');
  assert.equal(formatRange({ start: Date.UTC(2026, 11, 30), end: Date.UTC(2027, 0, 2) }), 'Dec 30, 2026 - Jan 2, 2027');
});

test('trip length counts calendar days, including DST transitions and day trips', () => {
  assert.equal(dayCount({ start: today, end: today }), 1);
  assert.equal(dayCount({ start: Date.UTC(2027, 2, 13), end: Date.UTC(2027, 2, 15) }), 3);
  assert.equal(dayCount({ start: Date.UTC(2028, 1, 28), end: Date.UTC(2028, 2, 1) }), 3);
  assert.equal(validRange({ start: today + 1, end: today + 2 }), false);
  assert.throws(() => formatRange({ start: Number.NaN, end: today }), RangeError);
  assert.throws(() => dayCount({ start: today + 86_400_000, end: today }), RangeError);
});
