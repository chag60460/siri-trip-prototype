import assert from 'node:assert/strict';
import test from 'node:test';
import { DemoCalendarAccess, DemoCalendarAccessError, createDemoCalendarTool } from './demo-calendar-tool.ts';
import { availableDemoRanges } from '../src/demo-calendar.ts';
import { dateSelection } from '../src/dates.ts';

const today = Date.UTC(2026, 8, 12);

test('the agent cannot read even the demo Calendar without explicit permission', () => {
  const calendar = new DemoCalendarAccess();
  assert.equal(calendar.consent, null);
  assert.throws(() => calendar.read(today), DemoCalendarAccessError);
  calendar.setConsent('denied');
  assert.throws(() => calendar.read(today), /denied/);
  calendar.setConsent('granted');
  assert.equal(calendar.read(today).source, 'demo');
  const otherSession = new DemoCalendarAccess();
  assert.throws(() => otherSession.read(today), DemoCalendarAccessError);
});

test('AI selections require a permitted read and cannot overlap events or exceed demo coverage', () => {
  const calendar = new DemoCalendarAccess();
  const selection = { start: '2026-09-19', end: '2026-09-21' };
  assert.throws(() => calendar.validateSelection(selection, today), /permission/);
  calendar.setConsent('granted');
  assert.throws(() => calendar.validateSelection(selection, today), /read_demo_calendar/);
  const data = calendar.read(today);
  const available = availableDemoRanges(data, 3)[0];
  assert.ok(available);
  assert.doesNotThrow(() => calendar.validateSelection(available, today));
  const event = data.events.find(event => event.date >= today);
  assert.ok(event);
  assert.throws(() => calendar.validateSelection(dateSelection({ start: event.date, end: event.date }), today), /sample events/);
  assert.throws(() => calendar.validateSelection({ start: '2027-05-01', end: '2027-05-03' }, today), /coverage/);
  calendar.setConsent('denied');
  assert.throws(() => calendar.validateSelection(available, today), /permission/);
  calendar.setConsent('granted');
  assert.throws(() => calendar.validateSelection(available, today), /read_demo_calendar/);
});

test('the Calendar tool exposes only synthetic events and computed available ranges', () => {
  const access = new DemoCalendarAccess();
  const tool = createDemoCalendarTool(() => access.read(today));
  const invoke = { sessionId: 'test', toolCallId: 'calendar', toolName: tool.name, arguments: { days: 3 } };
  const handler = tool.handler;
  assert.ok(handler);
  assert.throws(() => handler({ days: 3 }, invoke), DemoCalendarAccessError);
  access.setConsent('granted');
  const result = handler({ days: 3 }, invoke);
  assert.ok(typeof result === 'object' && result !== null && 'textResultForLlm' in result && typeof result.textResultForLlm === 'string');
  const payload = JSON.parse(result.textResultForLlm);
  assert.match(payload.source, /synthetic events only/);
  assert.ok(payload.availableRanges.length > 0);
  assert.ok(payload.events.length > 0);
  assert.throws(() => handler({ days: 0 }, invoke), TypeError);
});
