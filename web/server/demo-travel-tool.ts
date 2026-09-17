import { defineTool } from '@github/copilot-sdk';
import { isDemoTravelOffers, isDemoTravelSearch, offersMatchTrip } from '../src/demo-travel.ts';
import type { DemoTravelOffers, DemoTravelSearch } from '../src/demo-travel.ts';
import type { TripPlanData } from '../src/trip-plan.ts';

export const DEMO_TRAVEL_TOOL_NAME = 'read_demo_travel_offers';
export class DemoTravelAccessError extends Error {}

export function attachDemoTravelOffers(trip: TripPlanData, offers?: DemoTravelOffers): TripPlanData {
  if (!offers || !isDemoTravelOffers(offers)) {
    throw new DemoTravelAccessError('Before displaying a completed trip, call read_demo_travel_offers with its destination, supplied origin (or null), and dates (or null). Do not invent offer data.');
  }
  if (!offersMatchTrip(offers, trip)) {
    throw new DemoTravelAccessError('The trip route or dates differ from the fetched demo offers. Copy the exact destination, origin, and dates from the search criteria, or fetch offers for the updated trip before presenting it.');
  }
  return { ...trip, offers };
}

export function runDemoTravelTool(value: unknown, read: (search: DemoTravelSearch) => DemoTravelOffers): string {
  if (!isDemoTravelSearch(value)) throw new TypeError('Provide a destination, optional user-supplied origin, and valid chosen dates or null.');
  return JSON.stringify({
    ...read(value),
    rule: 'These are fictional demo providers, fares, rooms, and policies, not live availability. Copy criteria.destination, criteria.origin, and criteria.dates exactly into the completed trip. The app attaches these offers; do not recreate or change their prices. Book opens the selected offer in a separate demo checkout tab, with no payment or reservation.',
  });
}

export function createDemoTravelTool(read: (search: DemoTravelSearch) => DemoTravelOffers) {
  return defineTool(DEMO_TRAVEL_TOOL_NAME, {
    description: 'Read three synthetic flight fares and three synthetic hotel offers for a completed trip. Fictional demo inventory only, not live availability. Cannot book, charge, access accounts, or collect payment details.',
    skipPermission: true,
    defer: 'never',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        destination: { type: 'string', minLength: 1, maxLength: 120 },
        origin: {
          anyOf: [{ type: 'string', minLength: 1, maxLength: 120 }, { type: 'null' }],
          description: 'Departure city only if the user supplied it; otherwise null. Demo offers can show departure TBD.',
        },
        dates: {
          anyOf: [
            {
              type: 'object', additionalProperties: false,
              properties: { start: { type: 'string', format: 'date' }, end: { type: 'string', format: 'date' } },
              required: ['start', 'end'],
            },
            { type: 'null' },
          ],
          description: 'The chosen inclusive trip start/end, or null for flexible dates. Never choose new dates here.',
        },
      },
      required: ['destination'],
    },
    handler: value => ({ resultType: 'success', textResultForLlm: runDemoTravelTool(value, read) }),
  });
}
