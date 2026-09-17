import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { deferredReply, mockAI } from './ai-mock';
import type { MockReply } from './ai-mock';
import type { TripPlanData } from '../src/trip-plan';
import { createDemoTravelOffers, formatDemoMoney, parseDemoCheckout } from '../src/demo-travel';
import type { DemoTravelOffer } from '../src/demo-travel';

const trip: TripPlanData = {
  destination: 'Kyoto, Japan', origin: 'Seattle', dates: { start: '2030-04-10', end: '2030-04-12' },
  summary: 'Your Kyoto plan pairs gardens and small galleries with vegetarian meals.',
  itinerary: [
    { title: 'Arrival and the river', date: '2030-04-10', activities: ['Settle in near the river.', 'Choose a vegetarian dinner.'] },
    { title: 'Gardens and galleries', date: '2030-04-11', activities: ['Visit a garden early.', 'Explore a small gallery after lunch.'] },
    { title: 'A slow final morning', date: '2030-04-12', activities: ['Have breakfast before leaving.'] },
  ],
};

const reply = (plan: TripPlanData): MockReply => ({
  text: plan.summary, presentation: {
    question: null, planType: 'trip', preferences: [],
    trip: { ...plan, offers: createDemoTravelOffers(plan, '2030-03-01') },
  },
});

function offerFromLink(href: string | null): DemoTravelOffer {
  const offer = parseDemoCheckout(new URL(href ?? '').searchParams.get('demoCheckout') ?? '');
  if (!offer) throw new Error('The Book link must contain one valid selected demo offer.');
  return offer;
}

async function begin(page: Page) {
  await page.goto('/?screen=siri');
  await expect(page.getByText('Copilot connected', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message Siri' }).fill('Plan my Kyoto trip with the preferences I supplied.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}

test('flight cards open exactly the selected demo fare in a checkout tab with one click', async ({ page, context }, testInfo) => {
  const apiRequests: string[] = [];
  context.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  const ai = await mockAI(page, () => reply(trip));
  const offers = createDemoTravelOffers(trip, '2030-03-01');
  await begin(page);
  for (const name of ['Book flight', 'Book hotel', 'View itinerary']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('.trip-plan-card')).toContainText('Kyoto, Japan');
  await expect(page.locator('.trip-plan-card')).toContainText('2030');
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('trip-plan-ready.png'), animations: 'disabled' });
  const composer = page.getByRole('textbox', { name: 'Message Siri' });
  await composer.fill('Keep this unsent question');
  await page.getByRole('button', { name: 'Book flight', exact: true }).click();
  const flight = page.getByRole('dialog', { name: 'Flight options', exact: true });
  await expect(flight.locator('article[data-offer-id]')).toHaveCount(3);
  await expect(flight.locator('form, input')).toHaveCount(0);
  for (const offer of offers.flights) {
    const card = flight.locator(`[data-offer-id="${offer.id}"]`);
    await expect(card).toContainText(offer.airline);
    await expect(card).toContainText(offer.flightNumber);
    await expect(card).toContainText(formatDemoMoney(offer.priceCents));
    const link = card.getByRole('link', { name: `Book ${offer.airline} ${offer.flightNumber}`, exact: true });
    expect(offerFromLink(await link.getAttribute('href'))).toEqual(offer);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener.*noreferrer|noreferrer.*noopener/);
  }
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('trip-flight-options.png'), animations: 'disabled' });
  const selected = offers.flights[1];
  if (!selected) throw new Error('Missing the second demo flight.');
  const beforeCheckout = apiRequests.length;
  const opened = context.waitForEvent('page');
  await flight.getByRole('link', { name: `Book ${selected.airline} ${selected.flightNumber}`, exact: true }).click();
  const checkout = await opened;
  await expect(checkout.getByRole('heading', { name: 'Demo flight checkout', exact: true })).toBeVisible();
  await expect(checkout.locator('[data-checkout-offer-id]')).toHaveAttribute('data-checkout-offer-id', selected.id);
  await expect(checkout.locator('[data-checkout-offer-id]')).toContainText(formatDemoMoney(selected.priceCents));
  expect(offerFromLink(checkout.url())).toEqual(selected);
  expect(new URL(checkout.url()).origin).toBe(new URL(page.url()).origin);
  expect(await checkout.evaluate(() => window.opener === null)).toBe(true);
  await expect(checkout.locator('.phone-screen, input, textarea')).toHaveCount(0);
  expect(apiRequests).toHaveLength(beforeCheckout);
  await checkout.screenshot({ path: testInfo.outputPath('demo-flight-checkout.png'), fullPage: true });
  await checkout.close();
  expect(ai.requests).toHaveLength(1);
  await expect(flight).toBeVisible();
  await flight.getByRole('button', { name: 'Close Flight options', exact: true }).click();
  await expect(composer).toHaveValue('Keep this unsent question');
});

test('hotel cards carry the selected room and stay total to checkout without losing keyboard focus', async ({ page, context }, testInfo) => {
  const ai = await mockAI(page, () => reply(trip));
  const offers = createDemoTravelOffers(trip, '2030-03-01');
  const selected = offers.hotels[2];
  if (!selected) throw new Error('Missing the third demo hotel.');
  await begin(page);
  await page.getByRole('button', { name: 'Book hotel', exact: true }).click();
  const hotel = page.getByRole('dialog', { name: 'Hotel options', exact: true });
  await expect(hotel.locator('article[data-offer-id]')).toHaveCount(3);
  await expect(hotel.locator('form, input')).toHaveCount(0);
  for (const offer of offers.hotels) {
    const card = hotel.locator(`[data-offer-id="${offer.id}"]`);
    await expect(card).toContainText(offer.hotel);
    await expect(card).toContainText(formatDemoMoney(offer.nightlyCents));
    expect(offerFromLink(await card.getByRole('link', { name: `Book ${offer.hotel}`, exact: true }).getAttribute('href'))).toEqual(offer);
  }
  const link = hotel.getByRole('link', { name: `Book ${selected.hotel}`, exact: true });
  const close = hotel.getByRole('button', { name: 'Close Hotel options', exact: true });
  await expect(link).toHaveAttribute('rel', /noreferrer/);
  await expect(page.getByRole('button', { name: 'Go to Today screen', exact: true })).toBeDisabled();
  await link.focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(link).toBeFocused();
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('trip-hotel-options.png'), animations: 'disabled' });
  const opened = context.waitForEvent('page');
  await link.click();
  const checkout = await opened;
  await expect(checkout.getByRole('heading', { name: 'Demo hotel checkout', exact: true })).toBeVisible();
  await expect(checkout.locator('[data-checkout-offer-id]')).toHaveAttribute('data-checkout-offer-id', selected.id);
  await expect(checkout.locator('[data-checkout-offer-id]')).toContainText(selected.room);
  expect(offerFromLink(checkout.url())).toEqual(selected);
  expect(selected.nights).toBe(2);
  expect(selected.totalCents).toBe(selected.nightlyCents * 2);
  await expect(checkout.locator('.phone-screen, input, textarea')).toHaveCount(0);
  await checkout.screenshot({ path: testInfo.outputPath('demo-hotel-checkout.png'), fullPage: true });
  await checkout.close();
  expect(ai.requests).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(hotel).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Book hotel', exact: true })).toBeFocused();
});

test('itinerary details and fetched offers stay intact while switching plan views', async ({ page }, testInfo) => {
  const ai = await mockAI(page, () => reply(trip));
  await begin(page);
  await page.getByRole('button', { name: 'Book flight', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Flight options', exact: true }).locator('article[data-offer-id]')).toHaveCount(3);
  await page.getByRole('navigation', { name: 'Plan sections', exact: true }).getByRole('button', { name: 'Itinerary', exact: true }).click();
  const itinerary = page.getByRole('dialog', { name: 'Suggested itinerary', exact: true });
  for (const day of trip.itinerary) {
    await expect(itinerary.getByText(day.title, { exact: true })).toBeVisible();
    for (const activity of day.activities) await expect(itinerary.getByText(activity, { exact: true })).toBeVisible();
  }
  const width = await itinerary.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('trip-itinerary.png'), animations: 'disabled' });
  await itinerary.getByRole('navigation', { name: 'Plan sections', exact: true }).getByRole('button', { name: 'Flights', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Flight options', exact: true }).locator('article[data-offer-id]')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Go to Today screen', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Siri screen', exact: true }).click();
  await page.getByRole('button', { name: 'View itinerary', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Suggested itinerary', exact: true })).toContainText(trip.itinerary[0]?.title ?? '');
  expect(ai.requests).toHaveLength(1);
});

for (const mode of ['flexible', 'same-day'] as const) {
  test(`${mode} trips do not invent hotel dates or an extra night`, async ({ page }) => {
    const plan: TripPlanData = mode === 'flexible'
      ? { ...trip, dates: null, itinerary: trip.itinerary.map(day => ({ ...day, date: null })) }
      : { ...trip, dates: { start: '2030-04-10', end: '2030-04-10' }, itinerary: trip.itinerary.slice(0, 1) };
    await mockAI(page, () => reply(plan));
    await begin(page);
    if (mode === 'flexible') await expect(page.locator('.trip-plan-card')).toContainText('Dates flexible');
    await page.getByRole('button', { name: 'Book hotel', exact: true }).click();
    const hotel = page.getByRole('dialog', { name: 'Hotel options', exact: true });
    await expect(hotel.locator('article[data-offer-id]')).toHaveCount(3);
    const selected = offerFromLink(await hotel.locator('article[data-offer-id]').first().getByRole('link', { name: /^Book / }).getAttribute('href'));
    expect(selected.kind).toBe('hotel');
    if (selected.kind !== 'hotel') throw new Error('The hotel Book link must select a hotel.');
    expect(selected.destination).toBe('Kyoto, Japan');
    expect(selected.stay).toBeNull();
    expect(selected.nights).toBeNull();
    expect(selected.totalCents).toBeNull();
    await expect(hotel).toContainText(mode === 'flexible' ? /flexible/i : /no overnight stay/i);
  });
}

test('revisions retain the correct offers for each plan, while New chat clears plan views', async ({ page }) => {
  const pending = deferredReply<MockReply>();
  const revised: TripPlanData = {
    ...trip, destination: 'Osaka, Japan', origin: 'Vancouver',
    summary: 'An Osaka revision with a neighborhood-focused schedule.',
  };
  const ai = await mockAI(page, (_, index) => index === 0 ? reply(trip) : pending.promise);
  await begin(page);
  await page.getByRole('button', { name: 'Book flight', exact: true }).click();
  const originalLink = await page.getByRole('dialog', { name: 'Flight options', exact: true }).getByRole('link', { name: /^Book / }).first().getAttribute('href');
  const original = offerFromLink(originalLink);
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: 'Message Siri' }).fill('Switch this trip to Osaka');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Book flight', exact: true })).toBeDisabled();
  pending.resolve(reply(revised));
  await expect(page.locator('.trip-plan-card')).toHaveCount(2);
  const osaka = page.locator('.trip-plan-card').filter({ hasText: 'Osaka, Japan' });
  await osaka.getByRole('button', { name: 'Book flight', exact: true }).click();
  const revisedOffer = offerFromLink(await page.getByRole('dialog', { name: 'Flight options', exact: true }).getByRole('link', { name: /^Book / }).first().getAttribute('href'));
  expect(revisedOffer.destination).toBe('Osaka, Japan');
  expect(revisedOffer.id).not.toBe(original.id);
  await page.keyboard.press('Escape');
  const kyoto = page.locator('.trip-plan-card').filter({ hasText: 'Kyoto, Japan' });
  await kyoto.getByRole('button', { name: 'Book flight', exact: true }).click();
  const restored = offerFromLink(await page.getByRole('dialog', { name: 'Flight options', exact: true }).getByRole('link', { name: /^Book / }).first().getAttribute('href'));
  expect(restored).toEqual(original);
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.trip-plan-card')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message Siri' })).toHaveValue('');
  expect(ai.requests).toHaveLength(2);
});

test('ordinary plans and stopped trip replies do not gain booking controls', async ({ page }) => {
  const pending = deferredReply<MockReply>();
  const ai = await mockAI(page, (_, index) => index === 0 ? 'Practice blue and yellow watercolor washes for 20 minutes.' : pending.promise);
  await begin(page);
  await expect(page.getByText('Practice blue and yellow watercolor washes for 20 minutes.', { exact: true })).toBeVisible();
  await expect(page.locator('.trip-plan-card')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Message Siri' }).fill('Make a trip plan instead');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(() => ai.requests.length).toBe(2);
  await page.getByRole('button', { name: 'Stop reply', exact: true }).click();
  pending.resolve(reply(trip));
  await expect.poll(() => ai.completed.includes(1)).toBe(true);
  await expect(page.locator('.trip-plan-card')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Reply stopped.', { exact: true })).toBeVisible();
});

test('missing departure remains TBD in demo fares instead of becoming another search form', async ({ page }) => {
  await mockAI(page, () => reply({ ...trip, origin: null }));
  await begin(page);
  await page.getByRole('button', { name: 'Book flight', exact: true }).click();
  const flights = page.getByRole('dialog', { name: 'Flight options', exact: true });
  await expect(flights).toContainText('Departure city TBD');
  await expect(flights.locator('input, form')).toHaveCount(0);
  const selected = offerFromLink(await flights.getByRole('link', { name: /^Book / }).first().getAttribute('href'));
  if (selected.kind !== 'flight') throw new Error('Expected a demo flight.');
  expect(selected.origin).toBeNull();
});

test('invalid checkout links show an error without mounting Siri or collecting data', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/?demoCheckout=%7Bbroken');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.phone-screen, input, textarea, [data-checkout-offer-id]')).toHaveCount(0);
  expect(apiRequests).toHaveLength(0);
});
