import assert from 'node:assert/strict';
import test from 'node:test';
import { DemoAppAccess, DemoAppAccessError, createDemoAppTool, requestedAppAssistance } from './demo-app-tool.ts';
import type { PreferencePresentation, PreferenceQuestion } from '../src/preferences.ts';
import { createDemoAppData } from '../src/demo-apps.ts';

const today = Date.UTC(2026, 8, 12);
const budget: PreferenceQuestion = { kind: 'budget', label: 'Budget', mode: 'ask', text: 'What budget do you have in mind?' };
const permission: PreferencePresentation = { question: { ...budget, mode: 'permission', app: 'bank' }, preferences: [] };
const proposal: PreferencePresentation = {
  question: { ...budget, mode: 'proposal', app: 'bank', suggestion: '$900 USD total', text: 'The sample trip fund supports an estimated $900 budget. Use it?' },
  preferences: [],
};

test('app access is explicit, independent per app, isolated per chat, and revocable', () => {
  const apps = new DemoAppAccess();
  assert.throws(() => apps.read('bank', 'budget', today), /First ask permission/);
  apps.setConsents({ bank: 'granted' });
  assert.deepEqual(apps.read('bank', 'budget', today).data, createDemoAppData('bank', today));
  assert.throws(() => apps.read('maps', 'food', today), /First ask permission/);
  assert.throws(() => new DemoAppAccess().read('bank', 'budget', today), DemoAppAccessError);
  apps.setConsents({ bank: 'denied', maps: 'granted' });
  assert.throws(() => apps.read('bank', 'budget', today), /denied/);
  assert.doesNotThrow(() => apps.read('maps', 'activities', today));
  assert.throws(() => apps.validatePresentation(proposal, null), /permission and a read/);
  apps.setConsents({ bank: 'granted' });
  assert.throws(() => apps.validatePresentation(proposal, null), /permission and a read/);
  const freshRead = apps.read('bank', 'budget', today);
  assert.throws(() => apps.validatePresentation(proposal, null), /Read the relevant app in this turn/);
  assert.doesNotThrow(() => apps.validatePresentation(proposal, null, freshRead));
});

test('the reader exposes only the category needed for the current preference', () => {
  const apps = new DemoAppAccess();
  apps.setConsents({ bank: 'granted', maps: 'granted' });
  assert.throws(() => apps.read('bank', 'food', today), /Bank only for budget/);
  for (const kind of ['activities', 'food', 'lodging'] as const) {
    const read = apps.read('maps', kind, today);
    assert.ok(read.data.app === 'maps');
    assert.equal(read.data.places.length, 2);
    assert.ok(read.data.places.every(place => place.kind === kind));
  }
});

test('delegation requests permission, then requires a read and an unconfirmed proposal', () => {
  const apps = new DemoAppAccess();
  const assistance = requestedAppAssistance(budget, 'No preference');
  assert.deepEqual(assistance, { app: 'bank', kind: 'budget' });
  assert.equal(requestedAppAssistance({ ...budget, kind: 'other' }, 'Choose for me'), null);
  assert.equal(requestedAppAssistance(budget, 'No flights, please'), null);
  assert.equal(requestedAppAssistance(permission.question, 'Plan a different goal'), null);
  assert.deepEqual(requestedAppAssistance(permission.question, 'Allow demo Bank access. Please read it.'), assistance);
  assert.throws(() => apps.validatePresentation(proposal, assistance), /Ask permission/);
  assert.throws(() => apps.validatePresentation({ question: null, preferences: [] }, assistance), /Do not confirm or advance/);
  assert.throws(() => apps.validatePresentation(permission, null), /not delegated/);
  assert.doesNotThrow(() => apps.validatePresentation(permission, assistance));
  apps.setConsents({ bank: 'granted' });
  assert.throws(() => apps.validatePresentation(permission, assistance), /already allowed/);
  assert.throws(() => apps.validatePresentation(proposal, assistance), /Call read_demo_app/);
  const read = apps.read('bank', 'budget', today);
  assert.throws(() => apps.validatePresentation({ question: null, preferences: [] }, assistance, read), /Wait for user approval/);
  assert.doesNotThrow(() => apps.validatePresentation(proposal, assistance, read));
  const mapsProposal: PreferencePresentation = {
    question: { kind: 'food', label: 'Food', mode: 'proposal', app: 'maps', suggestion: 'Local cafes', text: 'Use local cafes?' }, preferences: [],
  };
  apps.setConsents({ maps: 'granted' });
  apps.read('maps', 'activities', today);
  assert.throws(() => apps.validatePresentation(mapsProposal, null), /exact preference/);
});

test('denial prevents reads and repeated permission requests while allowing general suggestions', () => {
  const apps = new DemoAppAccess();
  apps.setConsents({ bank: 'denied' });
  assert.throws(() => apps.validatePresentation(permission, null), /denied/);
  assert.throws(() => apps.read('bank', 'budget', today), /denied/);
  assert.throws(() => apps.validatePresentation(proposal, null), /permission and a read/);
  assert.doesNotThrow(() => apps.validatePresentation({
    question: { ...budget, mode: 'proposal', suggestion: '$900 USD total', text: 'Without app data, use a rough $900 estimate?' }, preferences: [],
  }, { app: 'bank', kind: 'budget' }));
});

test('the SDK tool cannot select unsupported apps or bypass the application consent gate', () => {
  const access = new DemoAppAccess();
  const tool = createDemoAppTool((app, kind) => access.read(app, kind, today));
  const invoke = { sessionId: 'test', toolCallId: 'app', toolName: tool.name, arguments: { app: 'bank', preference: 'budget' } };
  const handler = tool.handler;
  assert.ok(handler);
  assert.throws(() => handler(invoke.arguments, invoke), /First ask permission/);
  for (const arguments_ of [{ app: 'files', preference: 'budget' }, { app: 'bank', preference: 'food' }, {}]) {
    assert.throws(() => handler(arguments_, invoke), TypeError);
  }
  access.setConsents({ bank: 'granted' });
  const result = handler(invoke.arguments, invoke);
  assert.ok(typeof result === 'object' && result !== null && 'textResultForLlm' in result && typeof result.textResultForLlm === 'string');
  const payload = JSON.parse(result.textResultForLlm);
  assert.match(payload.source, /synthetic sample data only/);
  assert.equal(payload.data.travelFund, 1250);
  assert.match(payload.rule, /not the whole balance or reserved funds/);
});
