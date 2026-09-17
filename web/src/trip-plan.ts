import { dateSelection, formatRange, parseDateSelection, parseDay } from './dates.ts';
import type { DateSelection } from './dates.ts';
import { isDemoTravelOffers, offersMatchTrip } from './demo-travel.ts';
import type { DemoTravelOffers } from './demo-travel.ts';

export type TripPlanSection = 'flights' | 'hotels' | 'itinerary';

export interface TripItineraryDay {
  title: string;
  date?: string | null;
  activities: string[];
}

export interface TripPlanData {
  destination: string;
  origin?: string | null;
  dates?: DateSelection | null;
  summary: string;
  itinerary: TripItineraryDay[];
  offers?: DemoTravelOffers | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}

function isItineraryDay(value: unknown): value is TripItineraryDay {
  return record(value) && text(value.title, 120)
    && (value.date === undefined || value.date === null || parseDay(value.date) !== null)
    && Array.isArray(value.activities) && value.activities.length > 0 && value.activities.length <= 8
    && value.activities.every(activity => text(activity, 360));
}

export function isTripPlanData(value: unknown): value is TripPlanData {
  if (!record(value) || !text(value.destination, 120) || !text(value.summary, 400)
    || !(value.origin === undefined || value.origin === null || text(value.origin, 120))
    || !(value.dates === undefined || value.dates === null || parseDateSelection(value.dates) !== null)
    || !Array.isArray(value.itinerary) || value.itinerary.length === 0 || value.itinerary.length > 60
    || !value.itinerary.every(isItineraryDay)) return false;
  const range = parseDateSelection(value.dates);
  let previous: number | null = null;
  for (const day of value.itinerary) {
    if (!day.date) continue;
    const date = parseDay(day.date);
    if (date === null || !range || date < range.start || date > range.end || (previous !== null && date <= previous)) return false;
    previous = date;
  }
  if (value.offers !== undefined && value.offers !== null
    && (!isDemoTravelOffers(value.offers) || !offersMatchTrip(value.offers, {
      destination: value.destination, origin: typeof value.origin === 'string' ? value.origin : null,
      dates: range ? dateSelection(range) : null,
    }))) return false;
  return true;
}

export function tripDateLabel(plan: TripPlanData): string {
  const range = parseDateSelection(plan.dates);
  return range ? formatRange(range) : 'Dates flexible';
}
