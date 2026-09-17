import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appForPreference, createDemoAppData, isDemoAppConsents, isDemoAppData, isDemoAppRead, isPreferenceDelegation,
} from './demo-apps.ts';
import { isChatEvent } from './chat-protocol.ts';

const today = Date.UTC(2026, 8, 12);

test('Bank and Maps contain only shared synthetic data, not account or location connections', () => {
  const bank = createDemoAppData('bank', today);
  const maps = createDemoAppData('maps', today);
  assert.ok(bank.app === 'bank' && maps.app === 'maps');
  assert.equal(bank.source, 'demo');
  assert.equal(bank.travelFund, bank.balance - bank.reserved);
  assert.equal(bank.travelFund, 1250);
  assert.ok(bank.transactions.every(item => item.date < today));
  assert.equal(maps.places.length, 6);
  assert.deepEqual(new Set(maps.places.map(place => place.kind)), new Set(['activities', 'food', 'lodging']));
  assert.ok(maps.places.every(place => /fictional/i.test(place.detail)));
  assert.equal(isDemoAppData(bank), true);
  assert.equal(isDemoAppData(maps), true);
  assert.equal(isDemoAppData({ ...bank, source: 'real' }), false);
  assert.equal(isDemoAppData({ ...bank, travelFund: bank.balance }), false);
  assert.equal(isDemoAppData({ ...maps, places: [{ ...maps.places[0], x: Infinity }] }), false);
  assert.deepEqual(createDemoAppData('bank', today), bank);
});

test('app permissions name only supported apps and never treat delegation as consent', () => {
  assert.equal(isDemoAppConsents({ bank: 'granted', maps: 'denied' }), true);
  assert.equal(isDemoAppConsents({}), true);
  for (const invalid of [null, [], { bank: true }, { bank: 'automatic' }, { calendar: 'granted' }, { files: 'granted' }]) {
    assert.equal(isDemoAppConsents(invalid), false);
  }
  assert.equal(appForPreference('budget'), 'bank');
  for (const kind of ['activities', 'food', 'lodging'] as const) assert.equal(appForPreference(kind), 'maps');
  assert.equal(appForPreference('dates'), null);
  assert.equal(appForPreference('other'), null);
  for (const text of ['No', 'No preference', 'no preferences.', 'Choose for me', 'you choose!']) {
    assert.equal(isPreferenceDelegation(text), true);
  }
  for (const text of ['No seafood', 'No flights, but I want museums', 'Plan a product launch', 'Yes']) {
    assert.equal(isPreferenceDelegation(text), false);
  }
});

test('streamed app reads must match the relevant category and contain valid demo data', () => {
  const read = { data: createDemoAppData('bank', today), kind: 'budget' };
  assert.equal(isDemoAppRead(read), true);
  assert.equal(isChatEvent({ type: 'app', read }), true);
  assert.equal(isDemoAppRead({ ...read, kind: 'food' }), false);
  assert.equal(isChatEvent({ type: 'app', read: { ...read, data: { source: 'real' } } }), false);
});
