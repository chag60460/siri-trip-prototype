import { expect, test } from '@playwright/test';
import { validateRequest } from '../server/chat-api';
import type { ChatRequest } from '../src/chat-protocol';
import { parseDemoCheckout } from '../src/demo-travel';

test('live: app-assisted preferences become selectable offers and demo checkout in the served browser', async ({ page, context }, testInfo) => {
  test.skip(process.env.COPILOT_BROWSER_LIVE_TESTS !== '1', 'Opt in to use the connected Copilot allowance.');
  test.setTimeout(300_000);
  const base = new URL(process.env.LIVE_PREVIEW_URL ?? 'http://127.0.0.1:4187').origin;
  const year = new Date().getUTCFullYear() + 1;
  const requests: ChatRequest[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('page', child => child.on('pageerror', error => errors.push(error.message)));
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/chat') {
      requests.push(validateRequest(request.postDataJSON()));
    }
  });
  const choices = (kind: string) => page.locator(`.reply-options[data-preference-kind="${kind}"]`);
  const screenshot = (name: string) => page.locator('.phone-screen').screenshot({
    path: testInfo.outputPath(name), animations: 'disabled',
  });
  try {
    await page.goto(`${base}/`);
    await page.getByRole('button', { name: 'Open Bank', exact: true }).click();
    const bank = page.getByRole('dialog', { name: 'Demo Bank', exact: true });
    await expect(bank).toContainText('1,250');
    await screenshot('live-bank-home.png');
    await bank.getByRole('button', { name: 'Back to Home', exact: true }).click();
    await page.getByRole('button', { name: 'Open Maps', exact: true }).click();
    const maps = page.getByRole('dialog', { name: 'Demo Maps', exact: true });
    await expect(maps).toContainText(/fictional/i);
    await screenshot('live-maps-home.png');
    await maps.getByRole('button', { name: 'Back to Home', exact: true }).click();
    expect(requests).toHaveLength(0);
    await page.getByRole('button', { name: 'Go to Siri screen', exact: true }).click();
    await expect(page.getByText('Copilot connected', { exact: true })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('textbox', { name: 'Message Siri' }).fill(`Plan a Chicago trip from Seattle for just me, May 8-10, ${year}. Exclude flights from my budget.`);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(choices('budget')).toBeVisible({ timeout: 90_000 });
    await choices('budget').getByRole('button', { name: 'Choose for me', exact: true }).click();
    const bankPermission = page.getByRole('dialog', { name: 'Allow demo Bank access?', exact: true });
    await expect(bankPermission).toBeVisible({ timeout: 90_000 });
    expect(requests.at(-1)?.appConsents?.bank).toBeUndefined();
    await expect(bank).toHaveCount(0);
    await screenshot('live-bank-permission.png');
    await bankPermission.getByRole('button', { name: 'Allow', exact: true }).click();
    await expect(bank.getByRole('button', { name: 'Use suggestion', exact: true })).toBeEnabled({ timeout: 90_000 });
    await expect(bank.locator('.demo-connected-app__suggestion')).not.toBeEmpty();
    expect(requests.at(-1)?.appConsents).toEqual({ bank: 'granted' });
    await screenshot('live-bank-proposal.png');
    await bank.getByRole('button', { name: 'Use suggestion', exact: true }).click();
    await expect(choices('activities')).toBeVisible({ timeout: 90_000 });
    await choices('activities').getByRole('button', { name: 'No', exact: true }).click();
    const mapsPermission = page.getByRole('dialog', { name: 'Allow demo Maps access?', exact: true });
    await expect(mapsPermission).toBeVisible({ timeout: 90_000 });
    expect(requests.at(-1)?.appConsents).toEqual({ bank: 'granted' });
    await screenshot('live-maps-permission.png');
    await mapsPermission.getByRole('button', { name: 'Allow', exact: true }).click();
    await expect(maps.getByRole('button', { name: 'Use suggestion', exact: true })).toBeEnabled({ timeout: 90_000 });
    expect(requests.at(-1)?.appConsents).toEqual({ bank: 'granted', maps: 'granted' });
    await screenshot('live-maps-activities.png');
    await maps.getByRole('button', { name: 'Use suggestion', exact: true }).click();
    await expect(choices('food')).toBeVisible({ timeout: 90_000 });
    await choices('food').getByRole('textbox').fill('No preference');
    await choices('food').getByRole('textbox').press('Enter');
    await expect(maps.getByRole('button', { name: 'Use suggestion', exact: true })).toBeEnabled({ timeout: 90_000 });
    await expect(mapsPermission).toHaveCount(0);
    await expect(maps.getByRole('heading', { name: 'Saved food', exact: true })).toBeVisible();
    await expect(maps.locator('article[data-place-id]')).toHaveCount(2);
    await screenshot('live-maps-food.png');
    await maps.getByRole('button', { name: 'Use suggestion', exact: true }).click();
    await expect(choices('lodging')).toBeVisible({ timeout: 90_000 });
    await choices('lodging').getByRole('button', { name: 'No', exact: true }).click();
    await expect(maps.getByRole('button', { name: 'Use suggestion', exact: true })).toBeEnabled({ timeout: 90_000 });
    await expect(mapsPermission).toHaveCount(0);
    await expect(maps.getByRole('heading', { name: 'Saved lodging', exact: true })).toBeVisible();
    await maps.getByRole('button', { name: 'Use suggestion', exact: true }).click();
    await expect(page.getByRole('button', { name: 'View itinerary', exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(choices('lodging')).toHaveCount(0);
    await screenshot('live-trip-plan-ready.png');
    await page.getByRole('button', { name: 'Book flight', exact: true }).click();
    const flights = page.getByRole('dialog', { name: 'Flight options', exact: true });
    await expect(flights.locator('article[data-offer-id]')).toHaveCount(3);
    await expect(flights.locator('form, input')).toHaveCount(0);
    const flightLink = flights.getByRole('link', { name: /^Book / }).nth(1);
    const flightUrl = new URL(await flightLink.getAttribute('href') ?? '');
    const selectedFlight = parseDemoCheckout(flightUrl.searchParams.get('demoCheckout') ?? '');
    if (selectedFlight?.kind !== 'flight') throw new Error('Expected a valid selected demo flight.');
    expect(selectedFlight.origin).toMatch(/Seattle|SEA/i);
    expect(selectedFlight.destination).toMatch(/Chicago/i);
    expect(selectedFlight.dates).toEqual({ start: `${year}-05-08`, end: `${year}-05-10` });
    await screenshot('live-trip-flight-options.png');
    const flightOpened = context.waitForEvent('page');
    await flightLink.click();
    const flightCheckout = await flightOpened;
    await expect(flightCheckout.getByRole('heading', { name: 'Demo flight checkout', exact: true })).toBeVisible();
    await expect(flightCheckout.locator('[data-checkout-offer-id]')).toHaveAttribute('data-checkout-offer-id', selectedFlight.id);
    await flightCheckout.screenshot({ path: testInfo.outputPath('live-demo-flight-checkout.png'), fullPage: true });
    await flightCheckout.close();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Book hotel', exact: true }).click();
    const hotel = page.getByRole('dialog', { name: 'Hotel options', exact: true });
    await expect(hotel.locator('article[data-offer-id]')).toHaveCount(3);
    const hotelLink = hotel.getByRole('link', { name: /^Book / }).nth(2);
    const href = await hotelLink.getAttribute('href');
    const url = new URL(href ?? '');
    const selectedHotel = parseDemoCheckout(url.searchParams.get('demoCheckout') ?? '');
    if (selectedHotel?.kind !== 'hotel') throw new Error('Expected a valid selected demo hotel.');
    expect(selectedHotel.destination).toMatch(/Chicago/i);
    expect(selectedHotel.stay).toEqual({ start: `${year}-05-08`, end: `${year}-05-10` });
    expect(selectedHotel.totalCents).toBe(selectedHotel.nightlyCents * 2);
    await screenshot('live-trip-hotel-options.png');
    const hotelOpened = context.waitForEvent('page');
    await hotelLink.click();
    const hotelCheckout = await hotelOpened;
    await expect(hotelCheckout.getByRole('heading', { name: 'Demo hotel checkout', exact: true })).toBeVisible();
    await expect(hotelCheckout.locator('[data-checkout-offer-id]')).toHaveAttribute('data-checkout-offer-id', selectedHotel.id);
    await hotelCheckout.screenshot({ path: testInfo.outputPath('live-demo-hotel-checkout.png'), fullPage: true });
    await hotelCheckout.close();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'View itinerary', exact: true }).click();
    const itinerary = page.getByRole('dialog', { name: 'Suggested itinerary', exact: true });
    await expect(itinerary).toContainText(/Chicago|river|museum|art/i);
    await screenshot('live-trip-itinerary.png');
    expect(requests.every(request => request.calendarConsent === undefined)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    const id = requests.at(-1)?.sessionId;
    if (id) {
      const response = await page.request.delete(`${base}/api/chat/${encodeURIComponent(id)}`, {
        headers: { Origin: base, 'X-Siri-Client': 'web' },
      });
      expect(response.status()).toBe(204);
    }
  }
});
