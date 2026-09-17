import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoTravelOffers } from '../src/demo-travel.ts';
import type { DemoTravelSearch } from '../src/demo-travel.ts';
import type { TripPlanData } from '../src/trip-plan.ts';
import { attachDemoTravelOffers, createDemoTravelTool, DemoTravelAccessError } from './demo-travel-tool.ts';

const trip: TripPlanData = {
  destination: 'Lisbon', origin: 'Boston', dates: { start: '2030-05-02', end: '2030-05-04' },
  summary: 'A Lisbon walking plan.',
  itinerary: [{ title: 'Day 1', date: '2030-05-02', activities: ['Explore on foot.'] }],
};

test('the synthetic inventory tool performs an explicit read without accessing or booking a real provider', () => {
  const calls: DemoTravelSearch[] = [];
  const tool = createDemoTravelTool(search => {
    calls.push(search);
    return createDemoTravelOffers(search, '2030-04-01');
  });
  assert.ok(tool.handler);
  assert.equal(tool.skipPermission, true);
  assert.equal(tool.defer, 'never');
  const args: DemoTravelSearch = { destination: trip.destination, origin: trip.origin, dates: trip.dates };
  const invocation = { sessionId: 'test', toolCallId: 'travel-call', toolName: tool.name, arguments: args };
  const result = tool.handler(args, invocation);
  assert.equal(calls.length, 1);
  assert.ok(typeof result === 'object' && result !== null && 'textResultForLlm' in result && typeof result.textResultForLlm === 'string');
  assert.match(result.textResultForLlm, /fictional demo providers/);
  assert.match(result.textResultForLlm, /no payment or reservation/);
  const handler = tool.handler;
  assert.throws(() => handler({ destination: '', dates: 'anytime' }, invocation), TypeError);
  assert.equal(calls.length, 1);
});

test('completed plans require a current matching inventory read and cannot substitute model-authored prices', () => {
  const offers = createDemoTravelOffers(trip, '2030-04-01');
  assert.throws(() => attachDemoTravelOffers(trip), DemoTravelAccessError);
  assert.throws(() => attachDemoTravelOffers({ ...trip, destination: 'Porto' }, offers), DemoTravelAccessError);
  assert.throws(() => attachDemoTravelOffers({ ...trip, dates: null }, offers), DemoTravelAccessError);
  const forged = { ...offers, flights: offers.flights.map(offer => ({ ...offer, priceCents: 1 })) };
  const attached = attachDemoTravelOffers({ ...trip, offers: forged }, offers);
  assert.equal(attached.offers, offers);
  assert.notEqual(attached.offers?.flights[0]?.priceCents, 1);
  assert.equal(trip.offers, undefined);
});
