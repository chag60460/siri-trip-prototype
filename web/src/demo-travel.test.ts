import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoTravelOffers, demoCheckoutUrl, formatDemoMoney, isDemoTravelOffer, isDemoTravelOffers, offersMatchTrip, parseDemoCheckout } from './demo-travel.ts';
import type { DemoTravelSearch } from './demo-travel.ts';

const search: DemoTravelSearch = {
  destination: 'Kyoto, Japan', origin: 'Seattle', dates: { start: '2030-04-10', end: '2030-04-12' },
};
const asOf = '2030-03-01';

test('demo lookup returns three distinct flight and hotel choices for the actual route and dates', () => {
  const offers = createDemoTravelOffers(search, asOf);
  assert.equal(isDemoTravelOffers(offers), true);
  assert.equal(offersMatchTrip(offers, search), true);
  assert.equal(offers.flights.length, 3);
  assert.equal(offers.hotels.length, 3);
  assert.equal(new Set([...offers.flights, ...offers.hotels].map(offer => offer.id)).size, 6);
  assert.equal(new Set(offers.flights.map(offer => offer.priceCents)).size, 3);
  assert.equal(new Set(offers.hotels.map(offer => offer.nightlyCents)).size, 3);
  for (const offer of offers.flights) {
    assert.equal(offer.source, 'demo');
    assert.equal(offer.origin, 'Seattle');
    assert.equal(offer.destination, 'Kyoto, Japan');
    assert.deepEqual(offer.dates, search.dates);
  }
  for (const offer of offers.hotels) {
    assert.equal(offer.nights, 2);
    assert.equal(offer.totalCents, offer.nightlyCents * 2);
    assert.deepEqual(offer.stay, search.dates);
  }
  assert.deepEqual(createDemoTravelOffers(search, asOf), offers);
  assert.notEqual(createDemoTravelOffers({ ...search, destination: 'Lisbon' }, asOf).searchId, offers.searchId);
  assert.equal(offersMatchTrip(offers, { ...search, origin: 'Vancouver' }), false);
  assert.equal(offersMatchTrip(offers, { ...search, dates: { start: '2030-04-11', end: '2030-04-12' } }), false);
});

test('flexible dates, missing origin, and same-day trips do not invent travel or hotel nights', () => {
  const flexible = createDemoTravelOffers({ destination: 'Lisbon' }, asOf);
  assert.equal(isDemoTravelOffers(flexible), true);
  assert.equal(flexible.criteria.origin, null);
  for (const offer of flexible.flights) {
    assert.equal(offer.origin, null);
    assert.equal(offer.dates, null);
  }
  for (const offer of flexible.hotels) {
    assert.equal(offer.stay, null);
    assert.equal(offer.nights, null);
    assert.equal(offer.totalCents, null);
  }
  const sameDay = createDemoTravelOffers({ ...search, dates: { start: '2030-04-10', end: '2030-04-10' } }, asOf);
  assert.equal(isDemoTravelOffers(sameDay), true);
  assert.ok(sameDay.hotels.every(offer => offer.stay === null && offer.totalCents === null));
  assert.deepEqual(sameDay.flights[0]?.dates, { start: '2030-04-10', end: '2030-04-10' });
});

test('checkout links preserve exactly one selected offer without chat, session, or app data', () => {
  const offers = createDemoTravelOffers(search, asOf);
  for (const offer of [...offers.flights, ...offers.hotels]) {
    const url = new URL(demoCheckoutUrl(offer, 'https://demo:never-copy@example.com/prototypes/siri/?screen=siri&session=private#draft'));
    assert.equal(url.origin, 'https://example.com');
    assert.equal(url.pathname, '/prototypes/siri/');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
    assert.equal(url.hash, '');
    assert.deepEqual([...url.searchParams.keys()], ['demoCheckout']);
    const payload = url.searchParams.get('demoCheckout');
    assert.ok(payload);
    assert.deepEqual(parseDemoCheckout(payload), offer);
    assert.doesNotMatch(payload, /private|session|permissions|balance|reserved|budget/);
  }
  const first = offers.flights[0];
  assert.ok(first);
  const escaped = { ...first, destination: 'A & B?next=https://elsewhere.example' };
  const url = new URL(demoCheckoutUrl(escaped, 'http://127.0.0.1:5173/'));
  assert.equal(url.origin, 'http://127.0.0.1:5173');
  assert.deepEqual(parseDemoCheckout(url.searchParams.get('demoCheckout') ?? ''), escaped);
  assert.throws(() => demoCheckoutUrl(first, 'javascript:alert(1)'), TypeError);
  assert.equal(formatDemoMoney(24900), '$249');
});

test('malformed checkout and inventory data are rejected, not treated as a reservation', () => {
  const offers = createDemoTravelOffers(search, asOf);
  const flight = offers.flights[0];
  const hotel = offers.hotels[0];
  assert.ok(flight && hotel);
  for (const invalid of [
    null, {}, { ...flight, source: 'live' }, { ...flight, currency: 'EUR' },
    { ...flight, priceCents: -1 }, { ...flight, priceCents: Infinity }, { ...flight, priceCents: 1.5 },
    { ...flight, outboundTime: '25:00' }, { ...flight, dates: { start: '2030-04-12', end: '2030-04-10' } },
    { ...hotel, nights: 3 }, { ...hotel, totalCents: hotel.nightlyCents },
    { ...hotel, stay: null }, { ...hotel, hotel: 'x'.repeat(121) },
  ]) assert.equal(isDemoTravelOffer(invalid), false);
  assert.equal(parseDemoCheckout('{not json'), null);
  assert.equal(parseDemoCheckout('null'), null);
  assert.equal(parseDemoCheckout('x'.repeat(12_001)), null);
  assert.equal(isDemoTravelOffers({ ...offers, flights: offers.flights.slice(0, 1) }), false);
  assert.equal(isDemoTravelOffers({ ...offers, flights: [flight, flight, flight] }), false);
  assert.equal(isDemoTravelOffers({ ...offers, criteria: { ...search, destination: 'Elsewhere' } }), false);
  assert.throws(() => createDemoTravelOffers({ destination: '' }, asOf), TypeError);
});
