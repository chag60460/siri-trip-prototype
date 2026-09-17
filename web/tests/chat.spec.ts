import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { deferredReply, mockAI } from './ai-mock';

async function openChat(page: Page) {
  await page.goto('/?screen=siri');
  await expect(page.getByText('Copilot connected', { exact: true })).toBeVisible();
}

async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message Siri' }).fill(text);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}

test('the chat stays blank until the user initiates, including after a reset', async ({ page }, testInfo) => {
  const ai = await mockAI(page);
  await openChat(page);
  await expect(page.locator('.message')).toHaveCount(0);
  expect(ai.requests).toHaveLength(0);
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('blank-user-led-chat.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.locator('.message')).toHaveCount(0);
  expect(ai.requests).toHaveLength(0);
});

test('different planning topics use model replies and retain follow-up context', async ({ page }, testInfo) => {
  const replies = ['## Birthday gathering\n\n1. Pick a cozy space.\n2. Keep snacks simple.',
    '## Watercolor practice\n\n- Warm up with washes.\n- Paint one small scene.'];
  const ai = await mockAI(page, (_, index) => replies[index] ?? 'Continue with the current goal.');
  await openChat(page);
  await send(page, 'Plan a birthday gathering for six friends');
  await expect(page.getByRole('heading', { name: 'Birthday gathering', exact: true })).toBeVisible();
  await send(page, 'Now plan an afternoon learning watercolor instead');
  await expect(page.getByRole('heading', { name: 'Watercolor practice', exact: true })).toBeVisible();
  expect(ai.requests[0]?.message).toBe('Plan a birthday gathering for six friends');
  expect(ai.requests[1]?.sessionId).toBe('11111111-1111-4111-8111-000000000001');
  await expect(page.locator('.reply-options')).toHaveCount(0);
  await expect(page.locator('.plan-card')).toHaveCount(0);
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('open-ended-planning.png'), animations: 'disabled' });
});

test('dates are optional, start unselected, and are not sent before the user submits', async ({ page }) => {
  const ai = await mockAI(page, () => 'Here is a flexible study schedule for your selected dates.');
  await page.clock.install({ time: new Date('2026-09-12T19:00:00Z') });
  await openChat(page);
  await page.getByRole('button', { name: 'Conversation actions' }).click();
  await page.getByRole('button', { name: 'Add dates', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Choose dates' });
  await expect(calendar.getByText('September 2026', { exact: true })).toBeVisible();
  await expect(calendar.locator('.calendar-day[aria-pressed="true"]')).toHaveCount(0);
  await expect(calendar.getByRole('button', { name: 'Select a date range', exact: true })).toBeDisabled();
  await expect(calendar.getByRole('button', { name: 'September 11, 2026', exact: true })).toBeDisabled();
  await calendar.getByRole('button', { name: 'September 18, 2026', exact: true }).click();
  await calendar.getByRole('button', { name: 'September 21, 2026', exact: true }).click();
  await calendar.getByRole('button', { name: 'Use Sep 18 - 21', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Attached dates, not yet sent' })).toBeVisible();
  await expect(page.locator('.message')).toHaveCount(0);
  expect(ai.requests).toHaveLength(0);
  await send(page, 'Plan a study schedule');
  await expect(page.getByText('Here is a flexible study schedule for your selected dates.', { exact: true })).toBeVisible();
  expect(ai.requests[0]?.message).toBe('Plan a study schedule\n\nDates: Sep 18 - Sep 21, 2026');
});

test('replies continue across screen changes and new chat cancels late responses', async ({ page }) => {
  const first = deferredReply();
  const second = deferredReply();
  const ai = await mockAI(page, (_, index) => index === 0 ? first.promise : second.promise);
  await openChat(page);
  await send(page, 'Plan a dinner');
  await expect(page.getByRole('status', { name: 'Siri is thinking' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to Today screen', exact: true }).click();
  first.resolve('A dinner plan that stayed with the conversation.');
  await expect.poll(() => ai.completed.length).toBe(1);
  await page.getByRole('button', { name: 'Go to Siri screen', exact: true }).click();
  await expect(page.getByText('A dinner plan that stayed with the conversation.', { exact: true })).toBeVisible();
  await send(page, 'Another request');
  await expect.poll(() => ai.requests.length).toBe(2);
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  second.resolve('This old reply must not enter the new chat.');
  await expect.poll(() => ai.completed.length).toBe(2);
  await expect(page.locator('.message')).toHaveCount(0);
});

test('users can stop generation without getting a made-up fallback', async ({ page }) => {
  const reply = deferredReply();
  const ai = await mockAI(page, () => reply.promise);
  await openChat(page);
  await send(page, 'Plan a project');
  await expect.poll(() => ai.requests.length).toBe(1);
  await page.getByRole('button', { name: 'Stop reply', exact: true }).click();
  reply.resolve('A reply after cancellation.');
  await expect.poll(() => ai.completed.length).toBe(1);
  await expect(page.getByText('Reply stopped.', { exact: true })).toBeVisible();
  await expect(page.locator('.message--incoming')).toHaveCount(0);
  await expect(page.locator('.message--outgoing')).toHaveCount(1);
});

test('model failures are visible and Markdown does not execute HTML or fetch images', async ({ page }) => {
  await mockAI(page);
  await page.route('**/api/chat', route => route.fulfill({ status: 502, json: { message: 'The model is unavailable.' } }));
  await openChat(page);
  await send(page, 'A request');
  await expect(page.getByText('The model is unavailable.', { exact: true })).toBeVisible();
  await expect(page.locator('.message--incoming')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message Siri' })).toHaveValue('A request');
  await mockAI(page, () => '## A safe plan\n\n<script>alert("no")</script>\n\n![image](https://untrusted.example/image.png)\n\n[link](javascript:alert(1))');
  await send(page, 'Try again');
  await expect(page.getByRole('heading', { name: 'A safe plan', exact: true })).toBeVisible();
  await expect(page.locator('.message-markdown img, .message-markdown script, .message-markdown a')).toHaveCount(0);
});
