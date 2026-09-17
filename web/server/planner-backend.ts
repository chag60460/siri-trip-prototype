import type { PreferencePresentation } from '../src/preferences.ts';
import type { DemoCalendarData } from '../src/demo-calendar.ts';
import type { AppPreferenceKind, DemoAppId, DemoAppRead } from '../src/demo-apps.ts';
import type { DemoTravelOffers, DemoTravelSearch } from '../src/demo-travel.ts';

export interface PlannerSession {
  onDelta(listener: (text: string) => void): () => void;
  send(prompt: string, displayPrompt: string, timeout: number): Promise<string>;
  abort(): Promise<void>;
  disconnect(): Promise<void>;
}

export const RETRY_DELAYS = [700, 2_000, 5_000, 10_000];
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Backoff for a transient upstream failure, or null when the caller should give up. */
export function retryDelay(response: Response, attempt: number): number | null {
  const base = RETRY_DELAYS[attempt];
  if (!RETRYABLE_STATUS.has(response.status) || base === undefined) return null;
  const after = Number(response.headers.get('retry-after'));
  return Number.isFinite(after) && after > 0 ? Math.min(after * 1_000, 15_000) : base;
}

export function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error('The request was cancelled.'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** One chat backed by a model provider. Tool callbacks carry the same contracts for every provider. */
export interface PlannerBackend {
  readonly model: string;
  ready(): Promise<void>;
  createSession(
    present: (value: PreferencePresentation) => void,
    readCalendar: () => DemoCalendarData,
    readApp: (app: DemoAppId, kind: AppPreferenceKind) => DemoAppRead,
    readTravel: (search: DemoTravelSearch) => DemoTravelOffers,
    reportInvalid: (reason: string) => void,
  ): Promise<PlannerSession>;
  close(): Promise<void>;
}
