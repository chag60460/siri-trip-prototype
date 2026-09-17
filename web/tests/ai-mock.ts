import type { Page } from '@playwright/test';
import { validateRequest } from '../server/chat-api';
import type { ChatRequest } from '../src/chat-protocol';
import type { PreferencePresentation } from '../src/preferences';
import type { DemoCalendarData } from '../src/demo-calendar';
import type { DemoAppRead } from '../src/demo-apps';

export type MockReply = string | { text: string; presentation: PreferencePresentation; calendar?: DemoCalendarData; appRead?: DemoAppRead };

export async function mockAI(page: Page, answer: (request: ChatRequest, index: number) => MockReply | Promise<MockReply> = () => 'A model-generated reply for this request.') {
  const requests: ChatRequest[] = [];
  const completed: number[] = [];
  await page.route('**/api/ai/status', route => route.fulfill({ json: { ready: true, model: 'test-model' } }));
  await page.route('**/api/chat/*', route => route.fulfill({ status: 204 }));
  await page.route('**/api/chat', async route => {
    const request = validateRequest(route.request().postDataJSON());
    const index = requests.length;
    requests.push(request);
    const reply = await answer(request, index);
    const text = typeof reply === 'string' ? reply : reply.text;
    const sessionId = request.sessionId ?? `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`;
    const events = [
      { type: 'session', sessionId },
      ...(typeof reply !== 'string' && reply.calendar ? [{ type: 'calendar', calendar: reply.calendar }] : []),
      ...(typeof reply !== 'string' && reply.appRead ? [{ type: 'app', read: reply.appRead }] : []),
      { type: 'delta', text: text.slice(0, Math.floor(text.length / 2)) },
      { type: 'delta', text: text.slice(Math.floor(text.length / 2)) },
      { type: 'done', text, ...(typeof reply === 'string' ? {} : { presentation: reply.presentation }) },
    ];
    await route.fulfill({ contentType: 'application/x-ndjson', body: `${events.map(event => JSON.stringify(event)).join('\n')}\n` });
    completed.push(index);
  });
  return { requests, completed };
}

export function deferredReply<T = string>() {
  let settle: ((text: T) => void) | undefined;
  const promise = new Promise<T>(resolve => { settle = resolve; });
  return {
    promise,
    resolve(text: T) {
      if (!settle) throw new Error('The reply promise was not initialized.');
      settle(text);
    },
  };
}
