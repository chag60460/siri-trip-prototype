import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createChatApi, validateRequest } from './chat-api.ts';
import { ChatError, plannerSessionConfig } from './copilot-planner.ts';
import type { PlannerService } from './copilot-planner.ts';
import { createMemoryFiles } from './memory-files.ts';
import { PREFERENCE_TOOL_NAME } from './preference-tool.ts';
import { DEMO_CALENDAR_TOOL_NAME } from './demo-calendar-tool.ts';
import { DEMO_APP_TOOL_NAME } from './demo-app-tool.ts';
import { DEMO_TRAVEL_TOOL_NAME } from './demo-travel-tool.ts';

const request = { message: 'Plan a learning session', sessionId: null, localDate: '2026-09-12', timeZone: 'America/Los_Angeles' };
const sessionId = '11111111-1111-4111-8111-111111111111';

test('request validation rejects missing text, unsafe identifiers, and invalid calendar context', () => {
  assert.deepEqual(validateRequest(request), request);
  for (const value of [
    {}, { ...request, message: ' ' }, { ...request, sessionId: '../other-session' },
    { ...request, localDate: '2026-02-30' }, { ...request, timeZone: 'invalid-zone' },
    { ...request, calendarConsent: 'automatic' },
    ...[{ bank: 'automatic' }, { maps: true }, { files: 'granted' }, null].map(appConsents => ({ ...request, appConsents })),
  ]) assert.throws(() => validateRequest(value), ChatError);
  assert.deepEqual(validateRequest({ ...request, calendarConsent: 'granted' }), { ...request, calendarConsent: 'granted' });
  assert.deepEqual(validateRequest({ ...request, calendarConsent: 'denied' }), { ...request, calendarConsent: 'denied' });
  assert.deepEqual(validateRequest({ ...request, appConsents: { bank: 'granted', maps: 'denied' } }),
    { ...request, appConsents: { bank: 'granted', maps: 'denied' } });
});

test('Copilot allows only UI and consent-gated demo app tools, excluding host access and discovery', () => {
  const config = plannerSessionConfig('gpt-5.4-mini',
    () => assert.fail('Configuration must not render a card.'), () => assert.fail('Configuration must not read a calendar.'),
    () => assert.fail('Configuration must not read an app.'), () => assert.fail('Configuration must not fetch offers.'));
  assert.deepEqual(config.availableTools, [`custom:${PREFERENCE_TOOL_NAME}`, `custom:${DEMO_CALENDAR_TOOL_NAME}`, `custom:${DEMO_APP_TOOL_NAME}`, `custom:${DEMO_TRAVEL_TOOL_NAME}`]);
  assert.deepEqual(config.excludedTools, ['builtin:*', 'mcp:*']);
  assert.deepEqual(config.tools?.map(tool => tool.name), [PREFERENCE_TOOL_NAME, DEMO_CALENDAR_TOOL_NAME, DEMO_APP_TOOL_NAME, DEMO_TRAVEL_TOOL_NAME]);
  assert.equal(config.enableFileHooks, false);
  assert.equal(config.enableHostGitOperations, false);
  assert.equal(config.enableSessionStore, false);
  assert.equal(config.enableSkills, false);
  assert.equal(config.enableConfigDiscovery, false);
  assert.equal(config.skipCustomInstructions, true);
  assert.equal(config.remoteSession, 'off');
  assert.deepEqual(config.memory, { enabled: false });
  assert.deepEqual(config.infiniteSessions, { enabled: false });
  assert.equal(config.systemMessage?.mode, 'customize');
});

test('the live session prompt gathers trip preferences without forcing a scripted questionnaire', () => {
  const message = plannerSessionConfig('gpt-5.4-mini',
    () => assert.fail('Configuration must not render a card.'), () => assert.fail('Configuration must not read a calendar.'),
    () => assert.fail('Configuration must not read an app.'), () => assert.fail('Configuration must not fetch offers.')).systemMessage;
  assert.ok(message?.mode === 'customize');
  assert.ok(typeof message.content === 'string');
  assert.ok(message.sections?.identity?.action === 'replace');
  assert.ok(typeof message.sections.identity.content === 'string');
  assert.ok(message.content.includes(message.sections.identity.content));
  assert.match(message.content, /gather preferences before planning: dates, budget, lodging, food, and activities/);
  assert.match(message.content, /ask only one short question per reply/);
  assert.match(message.content, /Never ask again for a preference already answered/);
  assert.match(message.content, /Accept flexible dates, no preference, undecided, or skip as answers/);
  assert.match(message.content, /asks to skip questions, or asks you to make assumptions, proceed/);
  assert.match(message.content, /other planning topics.*not travel-specific preferences/);
  assert.match(message.content, /display-only tool/);
  assert.match(message.content, /Do not treat this as permission to skip all other preferences/);
  assert.match(message.content, /first use a dates question with mode="permission"/);
  assert.match(message.content, /If permission is denied, do not read the Calendar/);
  assert.doesNotMatch(message.content, /otherwise provide a useful first plan/);
});

test('session files are isolated in memory', async () => {
  const one = createMemoryFiles('/workspace');
  const two = createMemoryFiles('/workspace');
  await one.writeFile('/state/events.jsonl', 'first\n');
  await one.appendFile('/state/events.jsonl', 'second\n');
  assert.equal(await one.readFile('/state/events.jsonl'), 'first\nsecond\n');
  assert.equal(await two.exists('/state/events.jsonl'), false);
  assert.deepEqual(await one.readdirWithTypes('/state'), [{ name: 'events.jsonl', type: 'file' }]);
  await one.rename('/state/events.jsonl', '/state/history.jsonl');
  assert.equal((await one.stat('/state/history.jsonl')).isFile, true);
  await one.mkdir('/state/draft', false);
  await one.writeFile('/state/draft/text', 'draft', 0o600);
  assert.deepEqual(await one.readdir('/state/draft'), ['text']);
  assert.equal(await two.exists('/state/draft'), false);
  await one.rm('/state/draft', true, false);
  assert.equal(await one.exists('/state/draft'), false);
});

test('the local API streams replies and rejects cross-origin or malformed requests', async () => {
  let calls = 0;
  const released: string[] = [];
  const service: PlannerService = {
    async status() { return { ready: true, model: 'test-model' }; },
    async stream(body, emit) {
      calls += 1;
      emit({ type: 'session', sessionId });
      emit({ type: 'delta', text: 'A custom reply' });
      emit({ type: 'done', text: `A custom reply to: ${body.message}` });
    },
    async release(id) { released.push(id); },
    async close() {},
  };
  const api = createChatApi(service);
  const server = createServer((req, res) => { void api.handle(req, res); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No API listener address.');
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Origin: base, 'X-Siri-Client': 'web', 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${base}/api/ai/status`)).status, 200);
    assert.equal(calls, 0);
    const blocked = await fetch(`${base}/api/chat`, {
      method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' }, body: JSON.stringify(request),
    });
    assert.equal(blocked.status, 403);
    assert.equal(calls, 0);
    const malformed = await fetch(`${base}/api/chat`, { method: 'POST', headers, body: '{bad json' });
    assert.equal(malformed.status, 400);
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers, body: JSON.stringify(request) });
    const events: unknown[] = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(response.status, 200);
    assert.deepEqual(events.at(-1), { type: 'done', text: 'A custom reply to: Plan a learning session' });
    assert.equal(calls, 1);
    assert.equal((await fetch(`${base}/api/chat/${sessionId}`, { method: 'DELETE', headers })).status, 204);
    assert.deepEqual(released, [sessionId]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await api.close();
  }
});
