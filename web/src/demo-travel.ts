import { dayCount, parseDateSelection, parseDay } from './dates.ts';
import type { DateSelection } from './dates.ts';

export interface DemoTravelSearch {
  destination: string;
  origin?: string | null;
  dates?: DateSelection | null;
}

interface DemoOfferBase {
  source: 'demo';
  id: string;
  destination: string;
  currency: 'USD';
}

export interface DemoFlightOffer extends DemoOfferBase {
  kind: 'flight';
  airline: string;
  flightNumber: string;
  origin: string | null;
  dates: DateSelection | null;
  outboundTime: string;
  returnTime: string;
  stops: 0 | 1;
  cabin: 'Economy';
  baggage: string;
  priceCents: number;
}

export interface DemoHotelOffer extends DemoOfferBase {
  kind: 'hotel';
  hotel: string;
  area: string;
  room: string;
  cancellation: string;
  stay: DateSelection | null;
  nights: number | null;
  nightlyCents: number;
  totalCents: number | null;
}

export type DemoTravelOffer = DemoFlightOffer | DemoHotelOffer;

export interface DemoTravelOffers {
  source: 'demo';
  searchId: string;
  asOf: string;
  criteria: DemoTravelSearch;
  flights: DemoFlightOffer[];
  hotels: DemoHotelOffer[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, limit = 120): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}

function cents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function time(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isDemoTravelSearch(value: unknown): value is DemoTravelSearch {
  return record(value) && text(value.destination)
    && (value.origin === undefined || value.origin === null || text(value.origin))
    && (value.dates === undefined || value.dates === null || parseDateSelection(value.dates) !== null);
}

export function isDemoTravelOffer(value: unknown): value is DemoTravelOffer {
  if (!record(value) || value.source !== 'demo' || !text(value.id, 100)
    || !text(value.destination) || value.currency !== 'USD') return false;
  if (value.kind === 'flight') {
    return text(value.airline) && text(value.flightNumber, 32)
      && (value.origin === null || text(value.origin))
      && (value.dates === null || parseDateSelection(value.dates) !== null)
      && time(value.outboundTime) && time(value.returnTime)
      && (value.stops === 0 || value.stops === 1) && value.cabin === 'Economy'
      && text(value.baggage) && cents(value.priceCents);
  }
  if (value.kind !== 'hotel' || !text(value.hotel) || !text(value.area)
    || !text(value.room) || !text(value.cancellation) || !cents(value.nightlyCents)) return false;
  if (value.stay === null) return value.nights === null && value.totalCents === null;
  const range = parseDateSelection(value.stay);
  return range !== null && range.start < range.end && value.nights === dayCount(range) - 1
    && cents(value.totalCents) && value.totalCents === value.nightlyCents * (dayCount(range) - 1);
}

function sameDates(a: unknown, b: unknown): boolean {
  const first = parseDateSelection(a);
  const second = parseDateSelection(b);
  return first === null ? second === null : second !== null && first.start === second.start && first.end === second.end;
}

function samePlace(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a?.trim().toLowerCase() ?? '') === (b?.trim().toLowerCase() ?? '');
}

export function offersMatchTrip(offers: DemoTravelOffers, trip: DemoTravelSearch): boolean {
  return samePlace(offers.criteria.destination, trip.destination)
    && samePlace(offers.criteria.origin, trip.origin) && sameDates(offers.criteria.dates, trip.dates);
}

export function isDemoTravelOffers(value: unknown): value is DemoTravelOffers {
  if (!record(value) || value.source !== 'demo' || !text(value.searchId, 100) || parseDay(value.asOf) === null
    || !isDemoTravelSearch(value.criteria) || !Array.isArray(value.flights) || value.flights.length !== 3
    || !Array.isArray(value.hotels) || value.hotels.length !== 3
    || !value.flights.every((offer): offer is DemoFlightOffer => isDemoTravelOffer(offer) && offer.kind === 'flight')
    || !value.hotels.every((offer): offer is DemoHotelOffer => isDemoTravelOffer(offer) && offer.kind === 'hotel')) return false;
  const criteria = value.criteria;
  const range = parseDateSelection(criteria.dates);
  const stay = range && range.start < range.end ? criteria.dates : null;
  return new Set([...value.flights, ...value.hotels].map(offer => offer.id)).size === 6
    && value.flights.every(offer => samePlace(offer.destination, criteria.destination)
      && samePlace(offer.origin, criteria.origin) && sameDates(offer.dates, criteria.dates))
    && value.hotels.every(offer => samePlace(offer.destination, criteria.destination) && sameDates(offer.stay, stay));
}

const flightInventory = [
  { airline: 'Skyline Air', code: 'SL', outboundTime: '08:05', returnTime: '18:30', stops: 0, baggage: 'Cabin bag included', supplement: 0 },
  { airline: 'Northstar Air', code: 'NS', outboundTime: '11:20', returnTime: '16:45', stops: 1, baggage: 'Personal item included', supplement: -28 },
  { airline: 'Horizon Airworks', code: 'HW', outboundTime: '15:40', returnTime: '20:10', stops: 0, baggage: 'Cabin bag and checked bag included', supplement: 46 },
] as const;

const hotelInventory = [
  { hotel: 'Central Garden Hotel', area: 'Central area, near transit', room: 'Quiet queen room', cancellation: 'Flexible cancellation (demo)', supplement: 0 },
  { hotel: 'Riverfront House', area: 'Waterfront-style setting', room: 'City-view king room', cancellation: 'Flexible cancellation (demo)', supplement: 32 },
  { hotel: 'Neighborhood Suites', area: 'Residential-style neighborhood', room: 'Studio with kitchenette', cancellation: 'Non-refundable rate (demo)', supplement: -19 },
] as const;

export function createDemoTravelOffers(search: DemoTravelSearch, asOf: string): DemoTravelOffers {
  if (!isDemoTravelSearch(search) || parseDay(asOf) === null) throw new TypeError('A valid demo destination, optional origin, date range, and snapshot date are required.');
  const criteria: DemoTravelSearch = {
    destination: search.destination.trim(), origin: search.origin?.trim() ?? null,
    dates: search.dates ? { ...search.dates } : null,
  };
  // Stable fixture variation is not a real fare or availability model.
  let seed = 2166136261;
  for (const character of JSON.stringify(criteria)) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  const searchId = `demo-${seed.toString(16)}-${asOf}`;
  const range = parseDateSelection(criteria.dates);
  const stay = range && range.start < range.end && criteria.dates ? { ...criteria.dates } : null;
  const nights = stay && range ? dayCount(range) - 1 : null;
  return {
    source: 'demo', searchId, asOf, criteria,
    flights: flightInventory.map((item, index) => ({
      source: 'demo', kind: 'flight', id: `${searchId}-flight-${index}`, currency: 'USD',
      destination: criteria.destination, origin: criteria.origin ?? null, dates: criteria.dates ?? null,
      airline: item.airline, flightNumber: `${item.code} ${300 + seed % 500 + index}`,
      outboundTime: item.outboundTime, returnTime: item.returnTime, stops: item.stops, cabin: 'Economy',
      baggage: item.baggage, priceCents: (210 + seed % 85 + item.supplement) * 100,
    })),
    hotels: hotelInventory.map((item, index) => {
      const nightlyCents = (129 + seed % 37 + item.supplement) * 100;
      return {
        source: 'demo', kind: 'hotel', id: `${searchId}-hotel-${index}`, currency: 'USD',
        destination: criteria.destination, hotel: item.hotel, area: item.area, room: item.room,
        cancellation: item.cancellation, stay, nights, nightlyCents, totalCents: nights === null ? null : nights * nightlyCents,
      };
    }),
  };
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const formatDemoMoney = (amountCents: number): string => money.format(amountCents / 100);

export function demoCheckoutUrl(offer: DemoTravelOffer, currentUrl: string): string {
  if (!isDemoTravelOffer(offer)) throw new TypeError('A valid demo offer is required for checkout.');
  const url = new URL(currentUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new TypeError('Demo checkout requires an HTTP or HTTPS preview.');
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  url.searchParams.set('demoCheckout', JSON.stringify(offer));
  return url.href;
}

export function parseDemoCheckout(payload: string): DemoTravelOffer | null {
  if (payload.length > 12_000) return null;
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
  return isDemoTravelOffer(value) ? value : null;
}
