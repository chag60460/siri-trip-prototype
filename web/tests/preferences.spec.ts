import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { deferredReply, mockAI } from './ai-mock';
import type { MockReply } from './ai-mock';
import { MAX_MESSAGE_LENGTH } from '../src/chat-protocol';
import type { PreferenceKind, PreferenceValue } from '../src/preferences';
import type { TripPlanData } from '../src/trip-plan';
import { createDemoTravelOffers } from '../src/demo-travel';

const dates: PreferenceValue = { kind: 'dates', label: 'Dates', value: 'Sep 18 - Sep 21, 2026', source: 'user' };
const budget: PreferenceValue = { kind: 'budget', label: 'Budget', value: '$1,200 USD', source: 'user' };
const activities: PreferenceValue = { kind: 'activities', label: 'Activities', value: 'Art museums and river walks', source: 'user' };
const food: PreferenceValue = { kind: 'food', label: 'Food', value: 'Vegetarian and small local restaurants', source: 'user' };
const lodging: PreferenceValue = { kind: 'lodging', label: 'Lodging', value: 'A quiet hotel near downtown', source: 'user' };

function card(kind: PreferenceKind, text: string, preferences: PreferenceValue[] = [], mode: 'ask' | 'proposal' = 'ask', inputPlaceholder?: string): MockReply {
  return { text, presentation: { question: { kind, label: kind.charAt(0).toUpperCase() + kind.slice(1), mode, text, inputPlaceholder }, preferences } };
}

const choices = (page: Page, kind: PreferenceKind) => page.locator(`.reply-options[data-preference-kind="${kind}"]`);

async function begin(page: Page, message = 'I want to plan a trip to Chicago') {
  await page.goto('/?screen=siri');
  await expect(page.getByText('Copilot connected', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message Siri' }).fill(message);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}

test('High-Fi date choices support typing and a real unselected calendar', async ({ page }, testInfo) => {
  const ai = await mockAI(page, (_, index) => index === 0
    ? card('dates', 'Do you have preferred dates?')
    : card('budget', "What's your budget in mind?", [dates]));
  await page.clock.install({ time: new Date('2026-09-12T19:00:00Z') });
  await begin(page);
  await expect(choices(page, 'dates').getByRole('button')).toHaveText(['Yes', 'No']);
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('high-fi-date-choices.png'), animations: 'disabled' });
  const input = page.getByRole('textbox', { name: 'Message Siri' });
  await input.fill('I also like museums');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('I also like museums');
  expect(ai.requests).toHaveLength(1);
  await choices(page, 'dates').getByRole('button', { name: 'Yes', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Demo Calendar', exact: true });
  await expect(calendar).toContainText('September');
  await expect(calendar.locator('[aria-pressed="true"]')).toHaveCount(0);
  expect(ai.requests).toHaveLength(1);
  await calendar.getByRole('button', { name: /September 18, 2026/ }).click();
  await calendar.getByRole('button', { name: /September 21, 2026/ }).click();
  await calendar.getByRole('button', { name: 'Use Sep 18 - 21', exact: true }).click();
  await expect(choices(page, 'budget')).toBeVisible();
  expect(ai.requests[1]?.message).toBe('Dates: Sep 18 - Sep 21, 2026');
  await expect(input).toHaveValue('I also like museums');
  await expect(page.getByText('Set dates Sep 18 - Sep 21, 2026', { exact: true })).toBeVisible();
  await expect(choices(page, 'dates')).toHaveCount(0);
  const bottomGap = await page.locator('.preference-bubble').last().evaluate(element => {
    const scroll = element.closest('.conversation-scroll');
    if (!scroll) throw new Error('Missing conversation scroller.');
    return scroll.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom;
  });
  expect(bottomGap).toBeGreaterThanOrEqual(0);
  expect(bottomGap).toBeLessThan(40);
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('high-fi-budget-choices.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Go to Today screen', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Siri screen', exact: true }).click();
  await expect(choices(page, 'budget')).toBeVisible();
  await expect(input).toHaveValue('I also like museums');
  expect(ai.requests).toHaveLength(2);
});

test('dates can still be typed directly without a Type your preference button', async ({ page }) => {
  const ai = await mockAI(page, (_, index) => index === 0
    ? card('dates', 'Do you have preferred dates?')
    : card('budget', 'What budget do you have in mind?', [dates]));
  await begin(page);
  await expect(choices(page, 'dates').getByRole('button')).toHaveText(['Yes', 'No']);
  const input = page.getByRole('textbox', { name: 'Message Siri' });
  await input.fill('September 18-21, 2026');
  await input.press('Enter');
  await expect(choices(page, 'budget').getByRole('textbox', { name: 'Budget preference', exact: true }))
    .toHaveAttribute('placeholder', 'e.g., $1,500 USD');
  await expect(choices(page, 'budget').getByRole('button', { name: 'Choose for me', exact: true })).toBeVisible();
  expect(ai.requests[1]?.message).toBe('September 18-21, 2026');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('inline preferences create confirmations without changing the composer draft', async ({ page }, testInfo) => {
  const trip: TripPlanData = {
    destination: 'Chicago', dates: { start: '2026-09-18', end: '2026-09-21' },
    summary: 'Your Chicago plan includes vegetarian restaurants, art museums, and river walks.',
    itinerary: [
      { title: 'Arrival and a river walk', date: '2026-09-18', activities: ['Settle into the hotel and find a vegetarian dinner.'] },
      { title: 'Art museums', date: '2026-09-19', activities: ['Visit an art museum and a local restaurant.'] },
      { title: 'A relaxed river day', date: '2026-09-20', activities: ['Explore the riverfront at an easy pace.'] },
      { title: 'One last breakfast', date: '2026-09-21', activities: ['Have breakfast before heading home.'] },
    ],
  };
  const replies: MockReply[] = [
    card('budget', 'What total trip budget and currency do you have in mind?', [dates], 'ask', 'e.g., $1,200 USD total'),
    card('activities', 'Any activity preferences, such as architecture tours or live music?', [dates, budget], 'ask', 'e.g., architecture, jazz'),
    card('food', 'Any food preferences, such as favorite cuisines or dietary needs?', [dates, budget, activities], 'ask', 'e.g., Thai, vegetarian'),
    card('lodging', 'Any lodging preferences, such as a hotel or rental in a particular neighborhood?', [dates, budget, activities, food], 'ask', 'e.g., a quiet hotel'),
    { text: trip.summary,
      presentation: { question: null, planType: 'trip', preferences: [dates, budget, activities, food, lodging],
        trip: { ...trip, offers: createDemoTravelOffers(trip, '2026-09-12') } } },
  ];
  const ai = await mockAI(page, (_, index) => {
    const reply = replies[index];
    if (!reply) throw new Error('Unexpected extra planning request.');
    return reply;
  });
  await begin(page, 'Plan Chicago for Sep 18-21, 2026');
  const input = page.getByRole('textbox', { name: 'Message Siri' });
  await input.fill('Keep this separate message draft');
  const budgetInput = choices(page, 'budget').getByRole('textbox', { name: 'Budget preference', exact: true });
  await expect(page.locator('.preference-category').last()).toHaveText('Budget');
  await expect(budgetInput).toHaveAttribute('placeholder', 'e.g., $1,200 USD total');
  await expect(budgetInput).toHaveValue('');
  await budgetInput.click();
  await expect(budgetInput).toBeFocused();
  await expect(input).not.toBeFocused();
  await expect(choices(page, 'budget').getByRole('button', { name: 'Type your preference', exact: true })).toHaveCount(0);
  expect(ai.requests).toHaveLength(1);
  await budgetInput.fill('About $1,200 USD total');
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('high-fi-inline-budget.png'), animations: 'disabled' });
  await budgetInput.press('Enter');
  await expect(choices(page, 'activities')).toBeVisible();
  await expect(page.locator('.preference-category').last()).toHaveText('Activities');
  await expect(choices(page, 'activities').getByRole('textbox')).toHaveAttribute('placeholder', 'e.g., architecture, jazz');
  await expect(choices(page, 'activities').getByRole('textbox')).toBeFocused();
  await expect(choices(page, 'activities').getByRole('textbox')).toHaveValue('');
  await expect(budgetInput).toHaveCount(0);
  await expect(input).toHaveValue('Keep this separate message draft');
  await expect(page.getByText('Set budget as $1,200 USD', { exact: true })).toBeVisible();
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('high-fi-activities-choices.png'), animations: 'disabled' });
  await choices(page, 'activities').getByRole('textbox').fill(activities.value);
  await choices(page, 'activities').getByRole('textbox').press('Enter');
  await expect(choices(page, 'food')).toBeVisible();
  await expect(page.getByText(`Activities: ${activities.value}`, { exact: true })).toBeVisible();
  const foodInput = choices(page, 'food').getByRole('textbox', { name: 'Food preference', exact: true });
  await expect(page.locator('.preference-category').last()).toHaveText('Food');
  await expect(foodInput).toHaveAttribute('placeholder', 'e.g., Thai, vegetarian');
  await expect(foodInput).toHaveValue('');
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('high-fi-food-question.png'), animations: 'disabled' });
  await foodInput.fill(food.value);
  await choices(page, 'food').getByRole('button', { name: 'Send food preference', exact: true }).click();
  await expect(choices(page, 'lodging')).toBeVisible();
  await expect(page.locator('.preference-category').last()).toHaveText('Lodging');
  await expect(choices(page, 'lodging').getByRole('textbox')).toHaveAttribute('placeholder', 'e.g., a quiet hotel');
  await expect(choices(page, 'lodging').getByRole('textbox', { name: 'Lodging preference', exact: true })).toHaveValue('');
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('high-fi-lodging-question.png'), animations: 'disabled' });
  await expect(page.getByText(`Food: ${food.value}`, { exact: true })).toBeVisible();
  await choices(page, 'lodging').getByRole('textbox').fill(lodging.value);
  await choices(page, 'lodging').getByRole('textbox').press('Enter');
  await expect(page.getByText(`Lodging: ${lodging.value}`, { exact: true })).toBeVisible();
  await expect(page.locator('.reply-options')).toHaveCount(0);
  for (const name of ['Book flight', 'Book hotel', 'View itinerary']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  expect(ai.requests.map(request => request.message)).toEqual([
    'Plan Chicago for Sep 18-21, 2026', 'About $1,200 USD total', activities.value, food.value, lodging.value,
  ]);
  await expect(input).toHaveValue('Keep this separate message draft');
  expect(new Set(ai.requests.slice(1).map(request => request.sessionId)).size).toBe(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('inline fields preserve independent drafts across screens and submit only an intentional answer', async ({ page }, testInfo) => {
  const duration: PreferenceValue = { kind: 'other', label: 'Duration', value: '30 minutes', source: 'user' };
  const ai = await mockAI(page, (_, index) => {
    const question = index === 1
      ? { kind: 'other', label: 'Materials', mode: 'ask', text: 'What materials would you like to use?' } as const
      : { kind: 'other', label: 'Duration', mode: 'ask', text: 'How much time can you set aside each day?', inputPlaceholder: 'e.g., 20 minutes' } as const;
    return { text: question.text, presentation: { question, preferences: index === 1 ? [duration] : [] } };
  });

  await begin(page, 'Help me make a drawing practice plan');
  const input = choices(page, 'other').getByRole('textbox', { name: 'Duration preference', exact: true });
  const send = choices(page, 'other').getByRole('button', { name: 'Send duration preference', exact: true });
  const composer = page.getByRole('textbox', { name: 'Message Siri' });
  await expect(page.locator('.preference-category').last()).toHaveText('Duration');
  await expect(input).toHaveAttribute('placeholder', 'e.g., 20 minutes');
  await expect(input).toHaveAttribute('maxlength', String(MAX_MESSAGE_LENGTH));
  await expect(send).toBeDisabled();
  await input.press('Enter');
  await input.fill('   ');
  await expect(send).toBeDisabled();
  await input.press('Enter');
  expect(ai.requests).toHaveLength(1);
  await input.fill('30 minutes');
  await composer.fill('Keep my separate message');
  await input.press('ArrowLeft');
  await input.press('ArrowRight');
  await expect(page.locator('.screen-pager')).toHaveAttribute('data-active-screen', 'siri');
  await page.getByRole('button', { name: 'Go to Home screen', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Siri screen', exact: true }).click();
  await expect(input).toHaveValue('30 minutes');
  await expect(composer).toHaveValue('Keep my separate message');
  await input.focus();
  const composingEnterWasCancelled = await input.evaluate(element => !element.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', isComposing: true, bubbles: true, cancelable: true,
  })));
  expect(composingEnterWasCancelled).toBe(true);
  expect(ai.requests).toHaveLength(1);
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('high-fi-inline-preference.png'), animations: 'disabled' });
  await send.click();
  const materials = choices(page, 'other').getByRole('textbox', { name: 'Materials preference', exact: true });
  await expect(page.locator('.preference-category').last()).toHaveText('Materials');
  await expect(materials).toHaveAttribute('placeholder', 'Your materials');
  await expect(materials).toHaveValue('');
  await expect(input).toHaveCount(0);
  await expect(composer).toHaveValue('Keep my separate message');
  expect(ai.requests[1]?.message).toBe('30 minutes');
  await materials.fill('A notebook');
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.locator('.message, .reply-options')).toHaveCount(0);
  await composer.fill('Start a new drawing plan');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(composer).toHaveValue('');
  expect(ai.requests).toHaveLength(3);
});

test('an arriving preference question does not steal the composer while the user prepares a draft', async ({ page }) => {
  const pending = deferredReply<MockReply>();
  const ai = await mockAI(page, () => pending.promise);
  await begin(page);
  await expect.poll(() => ai.requests.length).toBe(1);
  const composer = page.getByRole('textbox', { name: 'Message Siri' });
  await composer.focus();
  pending.resolve(card('budget', 'What total budget and currency should I use?', [dates]));
  await expect(choices(page, 'budget')).toBeVisible();
  await expect(composer).toBeFocused();
  await composer.fill('Keep this separate draft while I answer');
  await expect(composer).toHaveValue('Keep this separate draft while I answer');
  await expect(choices(page, 'budget').getByRole('textbox')).toHaveValue('');
  expect(ai.requests).toHaveLength(1);
});

test('declining Bank access leaves general budget proposals available for review', async ({ page }) => {
  const suggested: PreferenceValue = { ...budget, value: '$1,100 USD', source: 'siri' };
  const replies: MockReply[] = [
    card('budget', "What's your budget in mind?", [dates]),
    { text: 'May I read demo Bank sample data for a budget?',
      presentation: { question: { kind: 'budget', label: 'Budget', mode: 'permission', app: 'bank', text: 'May I read demo Bank sample data for a budget?' }, preferences: [dates] } },
    card('budget', 'Without app data, an estimated $900 USD total could be a starting point. Use that budget?', [dates], 'proposal'),
    card('budget', 'Would an estimated $1,100 USD total suit you better?', [dates], 'proposal'),
    card('activities', 'Preferred activities in mind?', [dates, suggested]),
  ];
  const ai = await mockAI(page, (_, index) => {
    const reply = replies[index];
    if (!reply) throw new Error('Unexpected extra budget request.');
    return reply;
  });
  await begin(page, 'Help me plan Chicago for Sep 18-21, 2026');
  await choices(page, 'budget').getByRole('button', { name: 'Choose for me', exact: true }).click();
  await page.getByRole('dialog', { name: 'Allow demo Bank access?', exact: true })
    .getByRole('button', { name: "Don't Allow", exact: true }).click();
  await expect(choices(page, 'budget').getByRole('button')).toHaveText(['Yes', 'No']);
  await expect(page.getByText('Set budget as $900 USD', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await choices(page, 'budget').getByRole('button', { name: 'No', exact: true }).click();
  await expect(page.getByText('Would an estimated $1,100 USD total suit you better?', { exact: true })).toBeVisible();
  await expect(choices(page, 'budget').getByRole('button')).toHaveText(['Yes', 'No']);
  await expect(page.getByText('Set budget as $1,100 USD', { exact: true })).toHaveCount(0);
  await choices(page, 'budget').getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(choices(page, 'activities')).toBeVisible();
  await expect(page.getByText('Set budget as $1,100 USD', { exact: true })).toBeVisible();
  expect(ai.requests[1]?.message).toBe('Choose for me');
  expect(ai.requests[2]?.appConsents).toEqual({ bank: 'denied' });
  expect(ai.requests[3]?.message).toBe('No');
  expect(ai.requests[4]?.message).toBe('Yes');
});

test('stopping a reply cannot activate late preference controls or confirm a proposal', async ({ page }) => {
  const deferred = deferredReply<MockReply>();
  const ai = await mockAI(page, (_, index) => index === 0
    ? card('budget', 'What budget do you have in mind?', [dates]) : deferred.promise);
  await begin(page);
  await choices(page, 'budget').getByRole('button', { name: 'Choose for me', exact: true }).click();
  await expect.poll(() => ai.requests.length).toBe(2);
  await page.getByRole('button', { name: 'Stop reply', exact: true }).click();
  deferred.resolve(card('budget', 'Use $900?', [dates], 'proposal'));
  await expect.poll(() => ai.completed.length).toBe(2);
  await expect(page.getByText('Reply stopped.', { exact: true })).toBeVisible();
  await expect(page.locator('.reply-options')).toHaveCount(0);
  await expect(page.getByText('Use $900?', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.locator('.message, .message--fact, .reply-options')).toHaveCount(0);
});

test('a server-rejected proposal preserves confirmed choices and restores the reply for retry', async ({ page }) => {
  await mockAI(page, () => card('budget', 'What budget do you have in mind?', [dates]));
  await begin(page);
  await expect(choices(page, 'budget')).toBeVisible();
  await page.route('**/api/chat', route => route.fulfill({
    contentType: 'application/x-ndjson',
    body: `${JSON.stringify({ type: 'error', message: 'Copilot could not prepare valid preference choices. Your previous choices are unchanged. Try again.' })}\n`,
  }));
  await choices(page, 'budget').getByRole('button', { name: 'Choose for me', exact: true }).click();
  await expect(page.getByText(/could not prepare valid preference choices/)).toBeVisible();
  await expect(page.getByText('Set budget as $900', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Set dates Sep 18 - Sep 21, 2026', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message Siri' })).toHaveValue('Choose for me');
  await expect(page.locator('.reply-options')).toHaveCount(0);
});
