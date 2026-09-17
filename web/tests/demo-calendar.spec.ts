import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createDemoCalendar } from '../src/demo-calendar';
import { deferredReply, mockAI } from './ai-mock';
import type { MockReply } from './ai-mock';

const data = createDemoCalendar(Date.UTC(2026, 8, 12));
const question: MockReply = {
  text: 'Do you have preferred dates?',
  presentation: { question: { kind: 'dates', label: 'Dates', mode: 'ask', text: 'Do you have preferred dates?' }, preferences: [] },
};
const permission: MockReply = {
  text: 'May I open the demo Calendar and check its sample events?',
  presentation: {
    question: { kind: 'dates', label: 'Dates', mode: 'permission', text: 'May I open the demo Calendar and check its sample events?' },
    preferences: [],
  },
};
const proposed: MockReply = {
  text: 'September 19-21 has no demo events. Use that range?',
  calendar: data,
  presentation: {
    question: {
      kind: 'dates', label: 'Dates', mode: 'proposal', text: 'September 19-21 has no demo events. Use that range?',
      selection: { start: '2026-09-19', end: '2026-09-21' },
    },
    preferences: [],
  },
};

function budget(dates: string): MockReply {
  return {
    text: 'What budget do you have in mind?',
    presentation: {
      question: { kind: 'budget', label: 'Budget', mode: 'ask', text: 'What budget do you have in mind?' },
      preferences: [{ kind: 'dates', label: 'Dates', value: dates, source: 'user' }],
    },
  };
}

const dateChoices = (page: Page) => page.locator('.reply-options[data-preference-kind="dates"]');

async function startChoosing(page: Page) {
  await page.goto('/?screen=siri');
  await expect(page.getByText('Copilot connected', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message Siri' }).fill('I want to plan a trip to Chicago');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await dateChoices(page).getByRole('button', { name: 'No', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Allow demo Calendar access?', exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-12T19:00:00Z') });
});

test('Home Calendar and the Today widget open the same functional sample calendar without AI access', async ({ page }, testInfo) => {
  const ai = await mockAI(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Calendar', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Demo Calendar', exact: true });
  await expect(calendar).toBeVisible();
  await expect(calendar).toContainText('September');
  await expect(calendar.getByText('Family visit', { exact: true })).toBeVisible();
  await expect(calendar).toContainText(/sample events/i);
  expect(ai.requests).toHaveLength(0);
  await calendar.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(calendar).toContainText('October');
  await calendar.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(calendar).toContainText('September');
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('demo-calendar-home.png'), animations: 'disabled' });
  await calendar.getByRole('button', { name: 'Back to Home', exact: true }).click();
  await expect(calendar).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to Today screen', exact: true }).click();
  await page.getByRole('button', { name: 'Open demo Calendar', exact: true }).click();
  await expect(calendar.getByText('Family visit', { exact: true })).toBeVisible();
  await calendar.getByRole('button', { name: 'Back to Today', exact: true }).click();
  await expect(calendar).toHaveCount(0);
  expect(ai.requests).toHaveLength(0);
});

test('Siri asks first, opens Calendar after Allow, highlights dates, and waits for approval', async ({ page }, testInfo) => {
  const reading = deferredReply<MockReply>();
  const ai = await mockAI(page, (_, index) => {
    if (index === 0) return question;
    if (index === 1) return permission;
    if (index === 2) return reading.promise;
    return budget('Sep 20 - Sep 22, 2026');
  });
  await startChoosing(page);
  const prompt = page.getByRole('dialog', { name: 'Allow demo Calendar access?', exact: true });
  await expect(prompt).toContainText('Your personal calendars are not connected');
  await expect(page.getByRole('dialog', { name: 'Demo Calendar', exact: true })).toHaveCount(0);
  expect(ai.requests).toHaveLength(2);
  expect(ai.requests.every(request => request.calendarConsent === undefined)).toBe(true);
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('demo-calendar-permission.png'), animations: 'disabled' });
  await prompt.getByRole('button', { name: 'Allow', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Demo Calendar', exact: true });
  await expect(calendar).toBeVisible();
  await expect.poll(() => ai.requests.length).toBe(3);
  expect(ai.requests[2]?.calendarConsent).toBe('granted');
  await expect(calendar.getByRole('button', { name: /Waiting for dates/ })).toBeDisabled();
  reading.resolve(proposed);
  await expect(calendar.getByRole('button', { name: 'Use Sep 19 - 21', exact: true })).toBeEnabled();
  for (const day of [19, 20, 21]) {
    await expect(calendar.getByRole('button', { name: new RegExp(`September ${day}, 2026`) })).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.getByText(/^Set dates /)).toHaveCount(0);
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('demo-calendar-agent-selection.png'), animations: 'disabled' });
  await calendar.getByRole('button', { name: /September 20, 2026/ }).click();
  await calendar.getByRole('button', { name: /September 22, 2026/ }).click();
  await calendar.getByRole('button', { name: 'Use Sep 20 - 22', exact: true }).click();
  await expect(calendar).toHaveCount(0);
  await expect(page.locator('.reply-options[data-preference-kind="budget"]')).toBeVisible();
  expect(ai.requests[3]?.message).toBe('Dates: Sep 20 - Sep 22, 2026');
  await expect(page.getByText('Set dates Sep 20 - Sep 22, 2026', { exact: true })).toBeVisible();
});

test('denying access never opens Calendar for Siri but still allows manual date selection', async ({ page }) => {
  const ai = await mockAI(page, (_, index) => {
    if (index === 0) return question;
    if (index === 1) return permission;
    if (index === 2) return question;
    return budget('Sep 19 - Sep 21, 2026');
  });
  await startChoosing(page);
  await page.getByRole('button', { name: "Don't Allow", exact: true }).click();
  await expect(dateChoices(page)).toBeVisible();
  expect(ai.requests[2]?.calendarConsent).toBe('denied');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await dateChoices(page).getByRole('button', { name: 'Yes', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Demo Calendar', exact: true });
  await expect(calendar).toBeVisible();
  expect(ai.requests).toHaveLength(3);
  await calendar.getByRole('button', { name: /September 19, 2026/ }).click();
  await calendar.getByRole('button', { name: /September 21, 2026/ }).click();
  await calendar.getByRole('button', { name: 'Use Sep 19 - 21', exact: true }).click();
  await expect(page.locator('.reply-options[data-preference-kind="budget"]')).toBeVisible();
  expect(ai.requests[3]?.calendarConsent).toBe('denied');
});

test('returning to Siri while the agent chooses cancels late calendar highlights', async ({ page }) => {
  const reading = deferredReply<MockReply>();
  const ai = await mockAI(page, (_, index) => index === 0 ? question : index === 1 ? permission : reading.promise);
  await startChoosing(page);
  await page.getByRole('button', { name: 'Allow', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Demo Calendar', exact: true });
  await expect(calendar).toBeVisible();
  await expect.poll(() => ai.requests.length).toBe(3);
  await calendar.getByRole('button', { name: 'Back to Siri', exact: true }).click();
  reading.resolve(proposed);
  await expect.poll(() => ai.completed.length).toBe(3);
  await expect(calendar).toHaveCount(0);
  await expect(page.getByText('Reply stopped.', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Set dates /)).toHaveCount(0);
  await expect(page.getByText(proposed.text, { exact: true })).toHaveCount(0);
});

test('requesting different dates reopens Calendar even when the permitted snapshot is reused', async ({ page }) => {
  const alternative: MockReply = {
    text: 'September 26-28 also avoids demo events. Use these dates?',
    presentation: {
      question: {
        kind: 'dates', label: 'Dates', mode: 'proposal',
        text: 'September 26-28 also avoids demo events. Use these dates?',
        selection: { start: '2026-09-26', end: '2026-09-28' },
      },
      preferences: [],
    },
  };
  await mockAI(page, (_, index) => index === 0 ? question : index === 1 ? permission : index === 2 ? proposed : alternative);
  await startChoosing(page);
  await page.getByRole('button', { name: 'Allow', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Demo Calendar', exact: true });
  await expect(calendar.getByRole('button', { name: 'Use Sep 19 - 21', exact: true })).toBeEnabled();
  await calendar.getByRole('button', { name: 'Back to Siri', exact: true }).click();
  await dateChoices(page).getByRole('button', { name: 'No', exact: true }).click();
  await expect(calendar.getByRole('button', { name: 'Use Sep 26 - 28', exact: true })).toBeEnabled();
  for (const day of [26, 27, 28]) {
    await expect(calendar.getByRole('button', { name: new RegExp(`September ${day}, 2026`) })).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.getByText(/^Set dates /)).toHaveCount(0);
});
