import { DAY } from './dates.ts';
import type { CalendarConsent } from './demo-calendar.ts';
import type { PreferenceKind } from './preferences.ts';

export const demoAppIds = ['bank', 'maps'] as const;
export type DemoAppId = typeof demoAppIds[number];
export type AppPreferenceKind = 'budget' | 'activities' | 'food' | 'lodging';
export type DemoAppConsents = Partial<Record<DemoAppId, CalendarConsent>>;
export interface DemoAppConsent { app: DemoAppId; consent: CalendarConsent }

export const demoAppDetails: Record<DemoAppId, { name: string; permission: string }> = {
  bank: {
    name: 'Bank',
    permission: 'Siri will read sample balances and transactions to suggest a demo budget. No real bank account is connected. Nothing can be moved or spent.',
  },
  maps: {
    name: 'Maps',
    permission: 'Siri will read fictional saved places for activity, food, and lodging ideas in this chat. Your real location and Maps history are not connected.',
  },
};

export interface DemoBankTransaction {
  id: string;
  title: string;
  amount: number;
  date: number;
}

export interface DemoBankData {
  source: 'demo';
  app: 'bank';
  today: number;
  currency: 'USD';
  balance: number;
  reserved: number;
  travelFund: number;
  transactions: DemoBankTransaction[];
}

export interface DemoSavedPlace {
  id: string;
  kind: Exclude<AppPreferenceKind, 'budget'>;
  name: string;
  area: string;
  tags: string[];
  detail: string;
  x: number;
  y: number;
}

export interface DemoMapsData {
  source: 'demo';
  app: 'maps';
  today: number;
  places: DemoSavedPlace[];
}

export type DemoAppData = DemoBankData | DemoMapsData;
export interface DemoAppRead { data: DemoAppData; kind: AppPreferenceKind }

export function isDemoAppId(value: unknown): value is DemoAppId {
  return value === 'bank' || value === 'maps';
}

export function appForPreference(kind: PreferenceKind): DemoAppId | null {
  if (kind === 'budget') return 'bank';
  if (kind === 'activities' || kind === 'food' || kind === 'lodging') return 'maps';
  return null;
}

export function isAppPreferenceKind(value: unknown): value is AppPreferenceKind {
  return value === 'budget' || value === 'activities' || value === 'food' || value === 'lodging';
}

export function isPreferenceDelegation(message: string): boolean {
  return /^(?:no(?: preferences?)?|choose for me|you choose|surprise me)[.!]?$/i.test(message.trim());
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isDemoAppConsents(value: unknown): value is DemoAppConsents {
  return record(value) && Object.entries(value).every(([app, consent]) =>
    isDemoAppId(app) && (consent === 'granted' || consent === 'denied'));
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 240;
}

function day(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value % DAY === 0;
}

function money(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000;
}

export function isDemoAppData(value: unknown): value is DemoAppData {
  if (!record(value) || value.source !== 'demo' || !day(value.today)) return false;
  if (value.app === 'bank') {
    return value.currency === 'USD' && money(value.balance) && value.balance >= 0
      && money(value.reserved) && value.reserved >= 0 && value.reserved <= value.balance
      && money(value.travelFund) && value.travelFund >= 0 && value.travelFund <= value.balance - value.reserved
      && Array.isArray(value.transactions) && value.transactions.length <= 12
      && value.transactions.every(item => record(item) && text(item.id) && text(item.title)
        && money(item.amount) && day(item.date));
  }
  return value.app === 'maps' && Array.isArray(value.places) && value.places.length <= 12
    && value.places.every(place => record(place) && text(place.id) && text(place.name) && text(place.area)
      && (place.kind === 'activities' || place.kind === 'food' || place.kind === 'lodging')
      && text(place.detail) && Array.isArray(place.tags) && place.tags.length <= 6 && place.tags.every(text)
      && typeof place.x === 'number' && place.x >= 0 && place.x <= 100
      && typeof place.y === 'number' && place.y >= 0 && place.y <= 100);
}

export function isDemoAppRead(value: unknown): value is DemoAppRead {
  return record(value) && isDemoAppData(value.data) && isAppPreferenceKind(value.kind)
    && appForPreference(value.kind) === value.data.app;
}

export function createDemoAppData(app: DemoAppId, today: number): DemoAppData {
  if (app === 'bank') {
    return {
      source: 'demo', app, today, currency: 'USD',
      balance: 4850, reserved: 3600, travelFund: 1250,
      transactions: [
        { id: 'trip-fund', title: 'Transfer to trip fund', amount: 180, date: today - DAY },
        { id: 'groceries', title: 'Groceries', amount: -82.4, date: today - 2 * DAY },
        { id: 'dining', title: 'Neighborhood cafe', amount: -28, date: today - 3 * DAY },
        { id: 'transit', title: 'Transit pass', amount: -30, date: today - 4 * DAY },
      ],
    };
  }
  return {
    source: 'demo', app, today,
    places: [
      { id: 'art-museum', kind: 'activities', name: 'Modern Art Museum', area: 'Arts district',
        tags: ['art', 'museums', 'unhurried'], detail: 'A fictional saved museum for a relaxed afternoon.', x: 26, y: 28 },
      { id: 'river-walk', kind: 'activities', name: 'Riverside Walk', area: 'Riverfront',
        tags: ['architecture', 'walking', 'outdoors'], detail: 'A fictional saved walk with architecture and river views.', x: 62, y: 42 },
      { id: 'garden-table', kind: 'food', name: 'Garden Table', area: 'Old town',
        tags: ['plant-friendly', 'local', 'casual'], detail: 'A fictional saved restaurant with plant-friendly dishes. No dietary restriction is inferred.', x: 34, y: 58 },
      { id: 'market-cafe', kind: 'food', name: 'Market Cafe', area: 'Market quarter',
        tags: ['cafes', 'small local places', 'breakfast'], detail: 'A fictional saved neighborhood cafe, not a real booking or recommendation.', x: 70, y: 66 },
      { id: 'quiet-hotel', kind: 'lodging', name: 'Quiet Central Hotel', area: 'Downtown',
        tags: ['hotel', 'quiet', 'near transit'], detail: 'A fictional saved hotel style. No live prices or room availability.', x: 43, y: 40 },
      { id: 'neighborhood-stay', kind: 'lodging', name: 'Neighborhood Apartment', area: 'Residential quarter',
        tags: ['rental', 'kitchen', 'residential'], detail: 'A fictional saved rental style, not an available property.', x: 76, y: 22 },
    ],
  };
}
