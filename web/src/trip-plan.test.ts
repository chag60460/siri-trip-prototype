import assert from 'node:assert/strict';
import test from 'node:test';
import { isChatEvent } from './chat-protocol.ts';
import { isPreferencePresentation } from './preferences.ts';
import { isTripPlanData, tripDateLabel } from './trip-plan.ts';
import type { TripPlanData } from './trip-plan.ts';
import { createDemoTravelOffers } from './demo-travel.ts';

const trip: TripPlanData = {
  destination: 'Kyoto, Japan', origin: 'Seattle',
  dates: { start: '2030-04-10', end: '2030-04-12' },
  summary: 'A relaxed Kyoto plan with gardens and vegetarian meals.',
  itinerary: [
    { title: 'Arrival and a riverside walk', date: '2030-04-10', activities: ['Settle in near the river.', 'Find a vegetarian dinner.'] },
    { title: 'Gardens and art', date: '2030-04-11', activities: ['Visit a garden early.', 'Spend the afternoon in a small gallery.'] },
    { title: 'A slow final morning', date: '2030-04-12', activities: ['Have breakfast before leaving.'] },
  ],
};

test('trip metadata carries dynamic itinerary data only after planning is complete', () => {
  assert.equal(isTripPlanData(trip), true);
  const presentation = { question: null, planType: 'trip', preferences: [], trip };
  assert.equal(isPreferencePresentation(presentation), true);
  assert.equal(isChatEvent({ type: 'done', text: trip.summary, presentation }), true);
  assert.equal(isPreferencePresentation({ ...presentation, trip: undefined }), false);
  assert.equal(isPreferencePresentation({ ...presentation, planType: 'other' }), false);
  assert.equal(isPreferencePresentation({
    ...presentation, question: { kind: 'budget', label: 'Budget', mode: 'ask', text: 'What is your budget?' },
  }), false);
  assert.equal(isPreferencePresentation({ question: null, planType: 'other', preferences: [] }), true);
  assert.equal(isPreferencePresentation({ question: null, preferences: [] }), true);
});

test('malformed, oversized, out-of-order, and out-of-range itineraries are rejected', () => {
  for (const invalid of [
    null, {}, { ...trip, destination: '' }, { ...trip, destination: 'x'.repeat(121) },
    { ...trip, summary: ' ' }, { ...trip, origin: 'x'.repeat(121) },
    { ...trip, dates: { start: '2030-04-12', end: '2030-04-10' } },
    { ...trip, itinerary: [] }, { ...trip, itinerary: Array.from({ length: 61 }, () => trip.itinerary[0]) },
    { ...trip, itinerary: [{ title: '', activities: ['An activity'] }] },
    { ...trip, itinerary: [{ title: 'A day', activities: [] }] },
    { ...trip, itinerary: [{ title: 'A day', activities: [42] }] },
    { ...trip, itinerary: [{ title: 'A day', activities: ['x'.repeat(361)] }] },
    { ...trip, itinerary: [{ title: 'A day', date: '2030-02-30', activities: ['An activity'] }] },
    { ...trip, itinerary: [{ ...trip.itinerary[0], date: '2030-04-09' }] },
    { ...trip, itinerary: [{ ...trip.itinerary[0], date: '2030-04-13' }] },
    { ...trip, itinerary: [trip.itinerary[1], trip.itinerary[0]] },
    { ...trip, itinerary: [trip.itinerary[0], trip.itinerary[0]] },
    { ...trip, dates: null },
  ]) assert.equal(isTripPlanData(invalid), false);
});

test('attached inventory must match the plan, not a previous destination or date range', () => {
  const offers = createDemoTravelOffers(trip, '2030-03-01');
  assert.equal(isTripPlanData({ ...trip, offers }), true);
  assert.equal(isTripPlanData({ ...trip, destination: 'Osaka', offers }), false);
  assert.equal(isTripPlanData({ ...trip, origin: 'Vancouver', offers }), false);
  assert.equal(isTripPlanData({ ...trip, offers: { ...offers, hotels: [] } }), false);
});

test('flexible plans keep dates flexible instead of substituting a fixed week', () => {
  const flexible: TripPlanData = { ...trip, dates: null, origin: null, itinerary: trip.itinerary.map(day => ({ ...day, date: null })) };
  assert.equal(isTripPlanData(flexible), true);
  assert.equal(tripDateLabel(flexible), 'Dates flexible');
  assert.equal(tripDateLabel(trip), 'Apr 10 - Apr 12, 2030');
  assert.equal(isTripPlanData({ ...flexible, offers: createDemoTravelOffers(flexible, '2030-03-01') }), true);
});
