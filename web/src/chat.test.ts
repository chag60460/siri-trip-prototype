import assert from 'node:assert/strict';
import test from 'node:test';
import { chatReducer, createChat } from './chat.ts';
import { MAX_MESSAGE_LENGTH } from './chat-protocol.ts';
import type { PreferencePresentation, PreferenceValue } from './preferences.ts';
import { createDemoCalendar } from './demo-calendar.ts';
import { createDemoAppData } from './demo-apps.ts';
import type { TripPlanData } from './trip-plan.ts';

test('chat starts completely empty and waits for the user', () => {
  assert.deepEqual(createChat(), {
    messages: [], sessionId: null, pending: null, version: 0, notice: '', preferences: [],
    calendarConsent: null, calendar: null, appConsents: {}, appData: {},
  });
});

test('any planning topic is sent unchanged, without selecting a workflow', () => {
  for (const text of ['Plan a birthday gathering', 'Help me learn piano', 'Plan a product launch']) {
    const state = chatReducer(createChat(), { type: 'submit', text });
    assert.equal(state.messages[0]?.text, text);
    assert.equal(state.messages[0]?.kind, 'outgoing');
    assert.equal(state.messages[1]?.text, '');
    assert.equal(state.pending?.text, text);
  }
});

test('empty and oversized prompts are explained without sending a request', () => {
  for (const text of ['  ', 'x'.repeat(MAX_MESSAGE_LENGTH + 1)]) {
    const state = chatReducer(createChat(), { type: 'submit', text });
    assert.ok(state.notice);
    assert.equal(state.pending, null);
    assert.deepEqual(state.messages, []);
  }
});

test('streamed text is replaced by the authoritative completed response', () => {
  let state = chatReducer(createChat(), { type: 'submit', text: 'A learning plan, please' });
  const requestId = state.version;
  state = chatReducer(state, { type: 'delta', requestId, text: 'Start ' });
  state = chatReducer(state, { type: 'delta', requestId, text: 'small.' });
  assert.equal(state.messages.at(-1)?.text, 'Start small.');
  state = chatReducer(state, { type: 'finish', requestId, text: 'Start small.\n\nPractice daily.' });
  assert.equal(state.pending, null);
  assert.equal(state.messages.at(-1)?.text, 'Start small.\n\nPractice daily.');
});

test('follow-up messages retain the same model session', () => {
  let state = chatReducer(createChat(), { type: 'submit', text: 'Plan a party' });
  const requestId = state.version;
  state = chatReducer(state, { type: 'session', requestId, sessionId: 'session-one' });
  state = chatReducer(state, { type: 'finish', requestId, text: 'Here is a plan.' });
  state = chatReducer(state, { type: 'submit', text: 'Make it suitable for six people' });
  assert.equal(state.pending?.sessionId, 'session-one');
  assert.equal(state.messages.length, 4);
});

test('reset ignores late model output and old session identifiers', () => {
  const pending = chatReducer(createChat(), { type: 'submit', text: 'An old request' });
  const state = chatReducer(pending, { type: 'reset' });
  assert.equal(chatReducer(state, { type: 'delta', requestId: pending.version, text: 'Late reply' }), state);
  assert.equal(chatReducer(state, { type: 'session', requestId: pending.version, sessionId: 'old' }), state);
  assert.equal(chatReducer(state, { type: 'finish', requestId: pending.version, text: 'Late reply' }), state);
  assert.equal(state.messages.length, 0);
});

test('stopping preserves partial text, marks it incomplete, and rejects late chunks', () => {
  let state = chatReducer(createChat(), { type: 'submit', text: 'Plan a project' });
  const requestId = state.version;
  state = chatReducer(state, { type: 'delta', requestId, text: 'First, define the goal.' });
  state = chatReducer(state, { type: 'stop' });
  assert.equal(state.pending, null);
  assert.equal(state.messages.at(-1)?.interrupted, true);
  assert.equal(chatReducer(state, { type: 'delta', requestId, text: 'Old extra text' }), state);
});

test('connection failures surface an error instead of inventing a response', () => {
  const pending = chatReducer(createChat(), { type: 'submit', text: 'Plan anything' });
  const state = chatReducer(pending, { type: 'error', requestId: pending.version, message: 'Connection unavailable' });
  assert.equal(state.messages.length, 1);
  assert.equal(state.notice, 'Connection unavailable');
  assert.equal(state.pending, null);
});

test('preference controls and confirmations become actionable only when a reply completes', () => {
  const dates: PreferenceValue = { kind: 'dates', label: 'Dates', value: 'Oct 2 - 4, 2026', source: 'user' };
  const budget: PreferenceValue = { kind: 'budget', label: 'Budget', value: '$900', source: 'user' };
  const presentation: PreferencePresentation = {
    question: { kind: 'budget', label: 'Budget', mode: 'ask', text: 'What budget do you have in mind?' },
    preferences: [dates],
  };
  let state = chatReducer(createChat(), { type: 'submit', text: 'Oct 2 - 4' });
  const requestId = state.version;
  state = chatReducer(state, { type: 'delta', requestId, text: 'What budget' });
  assert.deepEqual(state.preferences, []);
  assert.equal(state.messages.at(-1)?.question, undefined);
  assert.ok(presentation.question);
  state = chatReducer(state, { type: 'finish', requestId, text: presentation.question.text, presentation });
  assert.deepEqual(state.preferences, [dates]);
  assert.deepEqual(state.messages.at(-1)?.confirmations, [dates]);
  assert.equal(state.messages.at(-1)?.question?.kind, 'budget');
  state = chatReducer(state, { type: 'submit', text: '$900' });
  state = chatReducer(state, {
    type: 'finish', requestId: state.version, text: 'Preferred activities?',
    presentation: { question: { kind: 'activities', label: 'Activities', mode: 'ask', text: 'Preferred activities?' }, preferences: [dates, budget] },
  });
  assert.deepEqual(state.messages.at(-1)?.confirmations, [budget]);
});

test('reset and stop reject late preference cards, and a new goal can clear old preferences', () => {
  const presentation: PreferencePresentation = {
    question: { kind: 'budget', label: 'Budget', mode: 'proposal', text: 'Use an estimated $900?' },
    preferences: [{ kind: 'dates', label: 'Dates', value: 'Oct 2 - 4, 2026', source: 'user' }],
  };
  const pending = chatReducer(createChat(), { type: 'submit', text: 'Choose for me' });
  for (const action of ['reset', 'stop'] as const) {
    const state = chatReducer(pending, { type: action });
    assert.equal(chatReducer(state, { type: 'finish', requestId: pending.version, text: 'Old card', presentation }), state);
    assert.deepEqual(state.preferences, []);
  }
  let state = chatReducer(pending, { type: 'finish', requestId: pending.version, text: 'A proposal', presentation });
  state = chatReducer(state, { type: 'submit', text: 'Help me learn painting instead' });
  state = chatReducer(state, { type: 'finish', requestId: state.version, text: 'A new goal.', presentation: { question: null, preferences: [] } });
  assert.deepEqual(state.preferences, []);
  assert.equal(state.messages.at(-1)?.question, null);
});

test('a server-rejected proposal leaves previous confirmed choices unchanged', () => {
  const dates: PreferenceValue = { kind: 'dates', label: 'Dates', value: 'Oct 2 - 4, 2026', source: 'user' };
  let state = chatReducer(createChat(), { type: 'submit', text: 'Oct 2 - 4' });
  state = chatReducer(state, {
    type: 'finish', requestId: state.version, text: 'What budget do you have in mind?',
    presentation: { question: { kind: 'budget', label: 'Budget', mode: 'ask', text: 'What budget do you have in mind?' }, preferences: [dates] },
  });

  state = chatReducer(state, { type: 'submit', text: 'Choose for me' });
  state = chatReducer(state, {
    type: 'error', requestId: state.version,
    message: 'Copilot could not prepare valid preference choices. Your previous choices are unchanged. Try again.',
  });
  assert.deepEqual(state.preferences, [dates]);
  assert.equal(state.messages.length, 3);
  assert.equal(state.pending, null);
  assert.match(state.notice, /previous choices are unchanged/);
});

test('demo Calendar permission is explicit, persists for the chat, and is cleared by reset', () => {
  const calendar = createDemoCalendar(Date.UTC(2026, 8, 12));
  let state = chatReducer(createChat(), { type: 'submit', text: 'Choose dates' });
  assert.equal(state.pending?.calendarConsent, undefined);
  const rejected = chatReducer(state, { type: 'calendar', requestId: state.version, calendar });
  assert.equal(rejected.calendar, null);
  assert.match(rejected.notice, /not allowed/);
  state = chatReducer(state, { type: 'stop' });
  state = chatReducer(state, { type: 'submit', text: 'Allow demo Calendar', calendarConsent: 'granted' });
  assert.equal(state.pending?.calendarConsent, 'granted');
  state = chatReducer(state, { type: 'calendar', requestId: state.version, calendar });
  assert.deepEqual(state.calendar, calendar);
  state = chatReducer(state, { type: 'finish', requestId: state.version, text: 'A suggested range.' });
  state = chatReducer(state, { type: 'submit', text: 'Another suggestion' });
  assert.equal(state.pending?.calendarConsent, 'granted');
  const oldVersion = state.version;
  state = chatReducer(state, { type: 'reset' });
  assert.equal(state.calendarConsent, null);
  assert.equal(state.calendar, null);
  assert.equal(chatReducer(state, { type: 'calendar', requestId: oldVersion, calendar }), state);
});

test('demo app consent is explicit and independent, with late or unauthorized data rejected', () => {
  const read = { data: createDemoAppData('bank', Date.UTC(2026, 8, 12)), kind: 'budget' } as const;
  let state = chatReducer(createChat(), { type: 'submit', text: 'Choose for me' });
  assert.equal(state.pending?.appConsents, undefined);
  const unauthorized = chatReducer(state, { type: 'app', requestId: state.version, read });
  assert.deepEqual(unauthorized.appData, {});
  assert.match(unauthorized.notice, /not allowed/);
  state = chatReducer(state, { type: 'stop' });
  state = chatReducer(state, { type: 'submit', text: 'Allow demo Bank access.', appConsent: { app: 'bank', consent: 'granted' } });
  assert.deepEqual(state.pending?.appConsents, { bank: 'granted' });
  assert.equal(state.pending?.calendarConsent, undefined);
  const frozenPermissions = state.pending?.appConsents;
  const blockedChange = chatReducer(state, { type: 'app-consent', decision: { app: 'bank', consent: 'denied' } });
  assert.equal(blockedChange.appConsents.bank, 'granted');
  assert.match(blockedChange.notice, /Stop the current reply/);
  state = chatReducer(state, { type: 'app', requestId: state.version, read });
  assert.deepEqual(state.appData.bank, read.data);
  assert.deepEqual(state.preferences, []);
  const oldId = state.version;
  state = chatReducer(state, { type: 'finish', requestId: state.version, text: 'Review this sample-based budget.' });
  state = chatReducer(state, { type: 'app-consent', decision: { app: 'maps', consent: 'granted' } });
  state = chatReducer(state, { type: 'app-consent', decision: { app: 'bank', consent: 'denied' } });
  assert.deepEqual(state.appConsents, { bank: 'denied', maps: 'granted' });
  assert.equal(state.appData.bank, undefined);
  assert.deepEqual(frozenPermissions, { bank: 'granted' });
  state = chatReducer(state, { type: 'reset' });
  assert.deepEqual(state.appConsents, {});
  assert.deepEqual(state.appData, {});
  assert.equal(chatReducer(state, { type: 'app', requestId: oldId, read }), state);
});

test('trip plans persist per completed message, but stopped or reset replies cannot add booking actions', () => {
  const trip: TripPlanData = {
    destination: 'Lisbon', summary: 'A flexible Lisbon walking plan.',
    itinerary: [{ title: 'Day 1', activities: ['Explore a neighborhood on foot.'] }],
  };
  const presentation: PreferencePresentation = { question: null, planType: 'trip', preferences: [], trip };
  const pending = chatReducer(createChat(), { type: 'submit', text: 'Plan Lisbon' });
  assert.equal(pending.messages.at(-1)?.trip, undefined);
  const finished = chatReducer(pending, { type: 'finish', requestId: pending.version, text: trip.summary, presentation });
  assert.deepEqual(finished.messages.at(-1)?.trip, trip);
  const followUp = chatReducer(finished, { type: 'submit', text: 'Add another day' });
  assert.deepEqual(followUp.messages[1]?.trip, trip);
  assert.equal(followUp.messages.at(-1)?.trip, undefined);
  for (const type of ['reset', 'stop'] as const) {
    const stopped = chatReducer(pending, { type });
    assert.equal(chatReducer(stopped, { type: 'finish', requestId: pending.version, text: trip.summary, presentation }), stopped);
    assert.equal(stopped.messages.some(message => message.trip), false);
  }
  assert.deepEqual(chatReducer(finished, { type: 'reset' }).messages, []);
});
