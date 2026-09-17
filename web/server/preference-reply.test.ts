import assert from 'node:assert/strict';
import test from 'node:test';
import { sendPreferenceReply } from './preference-reply.ts';

test('valid replies do not cause a second model request', async () => {
  const calls: string[] = [];
  const result = await sendPreferenceReply(async prompt => { calls.push(prompt); return 'valid'; },
    'Original request', () => undefined, new AbortController().signal);
  assert.equal(result, 'valid');
  assert.deepEqual(calls, ['Original request']);
});

test('one correction preserves the request and permission state without granting access', async () => {
  const calls: string[] = [];
  let rejection: string | undefined = 'Ask Maps permission first.';
  const prompt = 'Bank granted. Maps not requested. User: No preference.';
  const result = await sendPreferenceReply(async value => {
    calls.push(value);
    if (calls.length === 2) rejection = undefined;
    return calls.length === 1 ? 'invalid' : 'corrected';
  }, prompt, () => rejection, new AbortController().signal);
  assert.equal(result, 'corrected');
  assert.equal(calls.length, 2);
  assert.ok(calls[1]?.startsWith(prompt));
  assert.match(calls[1] ?? '', /does NOT mean the user denied access/);
  assert.match(calls[1] ?? '', /Ask Maps permission first/);
  assert.doesNotMatch(calls[1] ?? '', /Maps granted/);
});

test('a still-invalid reply is returned to the caller for rejection, not retried indefinitely', async () => {
  let calls = 0;
  const result = await sendPreferenceReply(async () => { calls += 1; return 'invalid'; },
    'A request', () => 'Still invalid.', new AbortController().signal);
  assert.equal(calls, 2);
  assert.equal(result, 'invalid');
});

test('correction stays inside the original 90-second response deadline', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const timeouts: number[] = [];
  await sendPreferenceReply(async (_, timeout) => {
    timeouts.push(timeout);
    context.mock.timers.tick(2500);
    return 'reply';
  }, 'A request', () => 'Correct the card.', new AbortController().signal);
  assert.deepEqual(timeouts, [90_000, 87_500]);
});

test('expired and cancelled requests are never repaired', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: 1000 });
  let calls = 0;
  await sendPreferenceReply(async () => {
    calls += 1;
    context.mock.timers.tick(90_001);
    return 'late';
  }, 'A request', () => 'Correct the card.', new AbortController().signal);
  assert.equal(calls, 1);
  const controller = new AbortController();
  calls = 0;
  await assert.rejects(sendPreferenceReply(async () => {
    calls += 1;
    controller.abort();
    return 'cancelled';
  }, 'A request', () => 'Correct the card.', controller.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('provider failures propagate without a success-shaped fallback', async () => {
  let calls = 0;
  await assert.rejects(sendPreferenceReply(async () => {
    calls += 1;
    throw new Error('Connection failed.');
  }, 'A request', () => 'Correct the card.', new AbortController().signal), /Connection failed/);
  assert.equal(calls, 1);
});
