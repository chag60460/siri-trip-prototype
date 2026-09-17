import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoCalendar, availableDemoRanges, isDemoCalendarData, isDemoRangeAvailable } from './demo-calendar.ts';
import { DAY, dateSelection, parseDay, parseDateSelection } from './dates.ts';

const today = Date.UTC(2026, 8, 12);

test('Home and Siri receive the same explicitly synthetic calendar events', () => {
  const calendar = createDemoCalendar(today);
  assert.deepEqual(calendar, createDemoCalendar(today));
  assert.equal(calendar.source, 'demo');
  assert.equal(calendar.today, today);
  assert.equal(isDemoCalendarData(calendar), true);
  assert.ok(calendar.events.some(event => event.calendar === 'Work'));
  assert.ok(calendar.events.some(event => event.calendar === 'Personal'));
  assert.ok(calendar.events.every(event => event.date >= calendar.start && event.date <= calendar.end));
  assert.deepEqual(createDemoCalendar(today + DAY).events, calendar.events);
});

test('suggested ranges are future, within coverage, and avoid every sample event', () => {
  const calendar = createDemoCalendar(today);
  const ranges = availableDemoRanges(calendar, 3);
  assert.ok(ranges.length > 0);
  for (const selection of ranges) {
    const range = parseDateSelection(selection);
    assert.ok(range);
    assert.equal(range.end - range.start, 2 * DAY);
    assert.equal(isDemoRangeAvailable(calendar, range), true);
  }
  const blocked = calendar.events.find(event => event.date >= today);
  assert.ok(blocked);
  assert.equal(isDemoRangeAvailable(calendar, { start: blocked.date, end: blocked.date }), false);
  assert.equal(isDemoRangeAvailable(calendar, { start: today - DAY, end: today - DAY }), false);
  assert.equal(isDemoRangeAvailable(calendar, { start: calendar.end + DAY, end: calendar.end + DAY }), false);
  assert.throws(() => availableDemoRanges(calendar, 0), RangeError);
});

test('structured calendar dates preserve actual dates and reject impossible or reversed ranges', () => {
  assert.equal(parseDay('2028-02-29'), Date.UTC(2028, 1, 29));
  assert.equal(parseDay('2026-02-29'), null);
  assert.equal(parseDateSelection({ start: '2026-12-31', end: '2026-12-30' }), null);
  assert.deepEqual(parseDateSelection({ start: '2026-12-31', end: '2027-01-02' }),
    { start: Date.UTC(2026, 11, 31), end: Date.UTC(2027, 0, 2) });
  assert.deepEqual(dateSelection({ start: today, end: today + DAY }), { start: '2026-09-12', end: '2026-09-13' });
  assert.equal(isDemoCalendarData({ ...createDemoCalendar(today), source: 'personal' }), false);
});
