import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DemoAppAccess } from '../server/demo-app-tool';
import { appForPreference, demoAppDetails } from '../src/demo-apps';
import type { AppPreferenceKind } from '../src/demo-apps';
import type { PreferenceValue } from '../src/preferences';
import { deferredReply, mockAI } from './ai-mock';
import type { MockReply } from './ai-mock';

const today = Date.UTC(2026, 8, 12);
const suggestions: Record<AppPreferenceKind, string> = {
  budget: '$900 USD total',
  activities: 'Art museums and relaxed walks',
  food: 'Plant-friendly local cafes',
  lodging: 'A quiet hotel near transit',
};
const label = (kind: AppPreferenceKind) => kind.charAt(0).toUpperCase() + kind.slice(1);
const confirmed = (kind: AppPreferenceKind): PreferenceValue => ({ kind, label: label(kind), value: suggestions[kind], source: 'siri' });
const choices = (page: Page, kind: AppPreferenceKind) => page.locator(`.reply-options[data-preference-kind="${kind}"]`);

function question(kind: AppPreferenceKind, preferences: PreferenceValue[] = []): MockReply {
  const text = `What ${kind} preferences do you have?`;
  return { text, presentation: { question: { kind, label: label(kind), mode: 'ask', text }, preferences } };
}

function permission(kind: AppPreferenceKind, preferences: PreferenceValue[] = []): MockReply {
  const app = appForPreference(kind);
  if (!app) throw new Error('Missing relevant app.');
  const text = `May I read demo ${demoAppDetails[app].name} sample data for ${kind}?`;
  return { text, presentation: { question: { kind, label: label(kind), mode: 'permission', text, app }, preferences } };
}

function proposal(kind: AppPreferenceKind, preferences: PreferenceValue[] = [], general = false): MockReply {
  const app = appForPreference(kind);
  if (!app) throw new Error('Missing relevant app.');
  const access = new DemoAppAccess();
  access.setConsents({ [app]: 'granted' });
  const text = general
    ? `Without app data, use a general estimate of ${suggestions[kind]}?`
    : `Based on demo ${demoAppDetails[app].name} sample data, use ${suggestions[kind]}?`;
  return {
    text,
    ...(!general ? { appRead: access.read(app, kind, today) } : {}),
    presentation: {
      question: { kind, label: label(kind), mode: 'proposal', text, suggestion: suggestions[kind], ...(!general ? { app } : {}) },
      preferences,
    },
  };
}

async function begin(page: Page) {
  await page.goto('/?screen=siri');
  await expect(page.getByText('Copilot connected', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message Siri' }).fill('Plan Chicago for May 8-10, 2027');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-12T19:00:00Z') });
});

test('Home opens the same demo Bank and Maps without granting AI access', async ({ page }, testInfo) => {
  const ai = await mockAI(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Bank', exact: true }).click();
  const bank = page.getByRole('dialog', { name: 'Demo Bank', exact: true });
  await expect(bank).toBeVisible();
  await expect(bank).toContainText(/1,250/);
  await expect(bank).toContainText(/sample|synthetic/i);
  await expect(bank.getByRole('button', { name: 'Use suggestion', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Go to Siri screen', exact: true })).toBeDisabled();
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('demo-bank-home.png'), animations: 'disabled' });
  await bank.getByRole('button', { name: 'Back to Home', exact: true }).click();
  await page.getByRole('button', { name: 'Open Maps', exact: true }).click();
  const maps = page.getByRole('dialog', { name: 'Demo Maps', exact: true });
  await expect(maps).toBeVisible();
  await expect(maps).toContainText(/fictional|illustrative/i);
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('demo-maps-home.png'), animations: 'disabled' });
  await maps.getByRole('button', { name: 'Food', exact: true }).click();
  await expect(maps.getByRole('heading', { name: 'Garden Table', exact: true })).toBeVisible();
  await maps.getByRole('button', { name: 'Show sample place: Market Cafe', exact: true }).click();
  await expect(maps.locator('article[data-place-id="market-cafe"]')).toBeFocused();
  await maps.getByRole('button', { name: 'Lodging', exact: true }).click();
  await expect(maps.getByRole('heading', { name: 'Quiet Central Hotel', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(maps).toHaveCount(0);
  expect(ai.requests).toHaveLength(0);
});

test('Choose for me asks Bank permission, shows sample context, and waits for approval', async ({ page }, testInfo) => {
  const reading = deferredReply<MockReply>();
  const ai = await mockAI(page, (_, index) => index === 0 ? question('budget')
    : index === 1 ? permission('budget') : index === 2 ? reading.promise : question('activities', [confirmed('budget')]));
  await begin(page);
  const composer = page.getByRole('textbox', { name: 'Message Siri' });
  await composer.fill('Keep my separate draft');
  await choices(page, 'budget').getByRole('button', { name: 'Choose for me', exact: true }).click();
  const prompt = page.getByRole('dialog', { name: 'Allow demo Bank access?', exact: true });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('No real bank account is connected');
  await expect(page.getByRole('dialog', { name: 'Demo Bank', exact: true })).toHaveCount(0);
  expect(ai.requests[1]?.appConsents).toBeUndefined();
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('demo-bank-permission.png'), animations: 'disabled' });
  await prompt.getByRole('button', { name: 'Allow', exact: true }).click();
  const bank = page.getByRole('dialog', { name: 'Demo Bank', exact: true });
  await expect(bank).toBeVisible();
  await expect(bank.getByRole('button', { name: 'Use suggestion', exact: true })).toBeDisabled();
  await expect.poll(() => ai.requests.length).toBe(3);
  expect(ai.requests[2]?.appConsents).toEqual({ bank: 'granted' });
  expect(ai.requests[2]?.calendarConsent).toBeUndefined();
  reading.resolve(proposal('budget'));
  await expect(bank.getByRole('button', { name: 'Use suggestion', exact: true })).toBeEnabled();
  await expect(bank).toContainText(suggestions.budget);
  await expect(page.getByText(/^Set budget as /)).toHaveCount(0);
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('demo-bank-suggestion.png'), animations: 'disabled' });
  await bank.getByRole('button', { name: 'Use suggestion', exact: true }).click();
  await expect(bank).toHaveCount(0);
  await expect(choices(page, 'activities')).toBeVisible();
  await expect(page.getByText('Set budget as $900 USD total', { exact: true })).toBeVisible();
  await expect(composer).toHaveValue('Keep my separate draft');
  expect(ai.requests[3]?.message).toBe('Use budget: $900 USD total');
});

test('denying Bank access keeps the app out of AI suggestions and does not deny Maps', async ({ page }) => {
  const replies = [question('budget'), permission('budget'), proposal('budget', [], true),
    question('activities', [confirmed('budget')]), permission('activities', [confirmed('budget')])];
  const ai = await mockAI(page, (_, index) => {
    const reply = replies[index];
    if (!reply) throw new Error('Unexpected extra app request.');
    return reply;
  });
  await begin(page);
  await choices(page, 'budget').getByRole('button', { name: 'Choose for me', exact: true }).click();
  await page.getByRole('dialog', { name: 'Allow demo Bank access?', exact: true }).getByRole('button', { name: "Don't Allow", exact: true }).click();
  await expect(choices(page, 'budget').getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
  await expect(page.getByText('General estimate', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(ai.requests[2]?.appConsents).toEqual({ bank: 'denied' });
  await page.getByRole('button', { name: 'Go to Home screen', exact: true }).click();
  await page.getByRole('button', { name: 'Open Bank', exact: true }).click();
  await page.getByRole('dialog', { name: 'Demo Bank', exact: true }).getByRole('button', { name: 'Back to Home', exact: true }).click();
  expect(ai.requests).toHaveLength(3);
  await page.getByRole('button', { name: 'Go to Siri screen', exact: true }).click();
  await choices(page, 'budget').getByRole('button', { name: 'Yes', exact: true }).click();
  await choices(page, 'activities').getByRole('button', { name: 'No', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Allow demo Maps access?', exact: true })).toBeVisible();
  expect(ai.requests[4]?.appConsents).toEqual({ bank: 'denied' });
});

test('Maps permission is reused for relevant categories and typed no preference opens the app', async ({ page }, testInfo) => {
  const activities = confirmed('activities');
  const food = confirmed('food');
  const lodging = confirmed('lodging');
  const replies: MockReply[] = [
    question('activities'), permission('activities'), proposal('activities'),
    question('food', [activities]), proposal('food', [activities]),
    question('lodging', [activities, food]), proposal('lodging', [activities, food]),
    { text: 'Here is a plan using the sample-informed styles you approved.', presentation: { question: null, preferences: [activities, food, lodging] } },
    question('food'),
  ];
  const ai = await mockAI(page, (_, index) => {
    const reply = replies[index];
    if (!reply) throw new Error('Unexpected extra Maps request.');
    return reply;
  });
  await begin(page);
  for (const kind of ['activities', 'food', 'lodging'] as const) {
    if (kind === 'food') {
      await choices(page, kind).getByRole('textbox').fill('No preference');
      await choices(page, kind).getByRole('textbox').press('Enter');
    } else await choices(page, kind).getByRole('button', { name: 'No', exact: true }).click();
    if (kind === 'activities') {
      await page.getByRole('dialog', { name: 'Allow demo Maps access?', exact: true }).getByRole('button', { name: 'Allow', exact: true }).click();
    } else await expect(page.getByRole('dialog', { name: 'Allow demo Maps access?', exact: true })).toHaveCount(0);
    const maps = page.getByRole('dialog', { name: 'Demo Maps', exact: true });
    await expect(maps.getByRole('button', { name: 'Use suggestion', exact: true })).toBeEnabled();
    await expect(maps).toContainText(suggestions[kind]);
    const place = kind === 'activities' ? 'Modern Art Museum' : kind === 'food' ? 'Garden Table' : 'Quiet Central Hotel';
    await expect(maps).toContainText(place);
    if (kind === 'food') {
      await expect(maps).not.toContainText('Modern Art Museum');
      await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('demo-maps-food-suggestion.png'), animations: 'disabled' });
    }
    await maps.getByRole('button', { name: 'Use suggestion', exact: true }).click();
    await expect(maps).toHaveCount(0);
  }
  await expect(page.locator('.reply-options')).toHaveCount(0);
  expect(ai.requests).toHaveLength(8);
  expect(ai.requests[4]?.message).toBe('No preference');
  expect(ai.requests.slice(2).every(request => request.appConsents?.maps === 'granted')).toBe(true);
  expect(ai.requests.every(request => request.appConsents?.bank === undefined && request.calendarConsent === undefined)).toBe(true);
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Siri' }).fill('Start a new trip');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(choices(page, 'food')).toBeVisible();
  expect(ai.requests[8]?.appConsents).toBeUndefined();
});

test('closing an active app cancels late reads and suggestions without reopening it', async ({ page }) => {
  const reading = deferredReply<MockReply>();
  const ai = await mockAI(page, (_, index) => index === 0 ? question('budget') : index === 1 ? permission('budget') : reading.promise);
  await begin(page);
  await choices(page, 'budget').getByRole('button', { name: 'Choose for me', exact: true }).click();
  await page.getByRole('dialog', { name: 'Allow demo Bank access?', exact: true }).getByRole('button', { name: 'Allow', exact: true }).click();
  await expect.poll(() => ai.requests.length).toBe(3);
  await page.getByRole('dialog', { name: 'Demo Bank', exact: true }).getByRole('button', { name: 'Back to Siri', exact: true }).click();
  reading.resolve(proposal('budget'));
  await expect.poll(() => ai.completed.length).toBe(3);
  await expect(page.getByText('Reply stopped.', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(/^Set budget as /)).toHaveCount(0);
  await expect(page.locator('.reply-options')).toHaveCount(0);
});

test('New chat cancels an active app and clears its permission before the next request', async ({ page }) => {
  const reading = deferredReply<MockReply>();
  const ai = await mockAI(page, (_, index) => index === 1 ? permission('budget') : index === 2 ? reading.promise : question('budget'));
  await begin(page);
  await choices(page, 'budget').getByRole('button', { name: 'Choose for me', exact: true }).click();
  await page.getByRole('dialog', { name: 'Allow demo Bank access?', exact: true }).getByRole('button', { name: 'Allow', exact: true }).click();
  await expect.poll(() => ai.requests.length).toBe(3);
  await expect(page.getByRole('dialog', { name: 'Demo Bank', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  reading.resolve(proposal('budget'));
  await expect.poll(() => ai.completed.length).toBe(3);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.message')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Message Siri' }).fill('Start another trip');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(choices(page, 'budget')).toBeVisible();
  expect(ai.requests[3]?.appConsents).toBeUndefined();
  expect(ai.requests[3]?.sessionId).toBeNull();
});

test('app permissions can be granted or revoked independently without reading an app', async ({ page }) => {
  const ai = await mockAI(page);
  await page.goto('/?screen=siri');
  await expect(page.getByText('Copilot connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Conversation actions', exact: true }).click();
  await page.getByRole('button', { name: 'Demo app permissions', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Demo app permissions', exact: true });
  await expect(settings.getByText('Not requested', { exact: true })).toHaveCount(2);
  await settings.getByRole('button', { name: 'Allow demo Bank access', exact: true }).click();
  await settings.getByRole('button', { name: 'Revoke demo Bank access', exact: true }).click();
  await settings.getByRole('button', { name: 'Allow demo Maps access', exact: true }).click();
  await expect(settings.getByText('Access denied', { exact: true })).toHaveCount(1);
  await expect(settings.getByText('Allowed for this chat', { exact: true })).toHaveCount(1);
  expect(ai.requests).toHaveLength(0);
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: 'Message Siri' }).fill('Plan something');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(() => ai.requests.length).toBe(1);
  expect(ai.requests[0]?.appConsents).toEqual({ bank: 'denied', maps: 'granted' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
