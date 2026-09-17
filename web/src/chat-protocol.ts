import { isDemoCalendarData } from './demo-calendar.ts';
import type { CalendarConsent, DemoCalendarData } from './demo-calendar.ts';
import { isPreferencePresentation } from './preferences.ts';
import type { PreferencePresentation } from './preferences.ts';
import { isDemoAppRead } from './demo-apps.ts';
import type { DemoAppConsents, DemoAppRead } from './demo-apps.ts';

export const MAX_MESSAGE_LENGTH = 8000;

export interface ChatRequest {
  message: string;
  sessionId: string | null;
  localDate: string;
  timeZone: string;
  calendarConsent?: CalendarConsent;
  appConsents?: DemoAppConsents;
}

export type ChatEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'delta'; text: string }
  | { type: 'calendar'; calendar: DemoCalendarData }
  | { type: 'app'; read: DemoAppRead }
  | { type: 'done'; text: string; presentation?: PreferencePresentation }
  | { type: 'error'; message: string };

export interface AIStatus {
  ready: boolean;
  model: string;
  message?: string;
}

export function isChatEvent(value: unknown): value is ChatEvent {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  switch (value.type) {
    case 'session': return 'sessionId' in value && typeof value.sessionId === 'string';
    case 'delta': return 'text' in value && typeof value.text === 'string';
    case 'calendar': return 'calendar' in value && isDemoCalendarData(value.calendar);
    case 'app': return 'read' in value && isDemoAppRead(value.read);
    case 'done': return 'text' in value && typeof value.text === 'string'
      && (!('presentation' in value) || isPreferencePresentation(value.presentation));
    case 'error': return 'message' in value && typeof value.message === 'string';
    default: return false;
  }
}
