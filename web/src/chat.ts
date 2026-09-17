import { MAX_MESSAGE_LENGTH } from './chat-protocol.ts';
import { changedPreferences } from './preferences.ts';
import type { PreferencePresentation, PreferenceQuestion, PreferenceValue } from './preferences.ts';
import type { CalendarConsent, DemoCalendarData } from './demo-calendar.ts';
import type { DemoAppConsent, DemoAppConsents, DemoAppData, DemoAppId, DemoAppRead } from './demo-apps.ts';
import type { TripPlanData } from './trip-plan.ts';

export interface Message {
  id: number;
  kind: 'incoming' | 'outgoing';
  text: string;
  interrupted?: boolean;
  question?: PreferenceQuestion | null;
  confirmations?: PreferenceValue[];
  trip?: TripPlanData | null;
}

export interface ChatState {
  messages: Message[];
  sessionId: string | null;
  pending: { id: number; text: string; sessionId: string | null; calendarConsent?: CalendarConsent; appConsents?: DemoAppConsents } | null;
  version: number;
  notice: string;
  preferences: PreferenceValue[];
  calendarConsent: CalendarConsent | null;
  calendar: DemoCalendarData | null;
  appConsents: DemoAppConsents;
  appData: Partial<Record<DemoAppId, DemoAppData>>;
}

export type ChatAction =
  | { type: 'submit'; text: string; calendarConsent?: CalendarConsent; appConsent?: DemoAppConsent }
  | { type: 'app-consent'; decision: DemoAppConsent }
  | { type: 'session'; requestId: number; sessionId: string }
  | { type: 'delta'; requestId: number; text: string }
  | { type: 'calendar'; requestId: number; calendar: DemoCalendarData }
  | { type: 'app'; requestId: number; read: DemoAppRead }
  | { type: 'finish'; requestId: number; text: string; presentation?: PreferencePresentation }
  | { type: 'error'; requestId: number; message: string }
  | { type: 'stop' }
  | { type: 'reset' }
  | { type: 'notice'; message: string }
  | { type: 'dismiss-notice' };

export function createChat(): ChatState {
  return {
    messages: [], sessionId: null, pending: null, version: 0, notice: '', preferences: [],
    calendarConsent: null, calendar: null, appConsents: {}, appData: {},
  };
}

function changeAppConsent(state: ChatState, decision: DemoAppConsent): ChatState {
  const appData = { ...state.appData };
  if (decision.consent === 'denied') delete appData[decision.app];
  return { ...state, appConsents: { ...state.appConsents, [decision.app]: decision.consent }, appData };
}

function interrupted(state: ChatState, notice: string): ChatState {
  const id = state.pending?.id;
  return {
    ...state, pending: null, notice, version: state.version + 1,
    messages: state.messages
      .filter(message => message.id !== (id ?? -1) * 2 || message.text.length > 0)
      .map(message => message.id === (id ?? -1) * 2 ? { ...message, interrupted: true } : message),
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if ('requestId' in action && action.requestId !== state.pending?.id) return state;
  switch (action.type) {
    case 'submit': {
      if (state.pending) return state;
      const text = action.text.trim();
      if (!text) return { ...state, notice: 'Type a message first.' };
      if (text.length > MAX_MESSAGE_LENGTH) return { ...state, notice: `Keep your message under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.` };
      const id = state.version + 1;
      const calendarConsent = action.calendarConsent ?? state.calendarConsent;
      const permitted = action.appConsent ? changeAppConsent(state, action.appConsent) : state;
      return {
        ...permitted, version: id, notice: '', calendarConsent,
        calendar: calendarConsent === 'denied' ? null : state.calendar,
        pending: {
          id, text, sessionId: state.sessionId, ...(calendarConsent ? { calendarConsent } : {}),
          ...(Object.keys(permitted.appConsents).length ? { appConsents: permitted.appConsents } : {}),
        },
        messages: [...state.messages,
          { id: id * 2 - 1, kind: 'outgoing', text },
          { id: id * 2, kind: 'incoming', text: '' },
        ],
      };
    }
    case 'session': return { ...state, sessionId: action.sessionId };
    case 'app-consent':
      return state.pending
        ? { ...state, notice: 'Stop the current reply before changing app permissions.' }
        : changeAppConsent(state, action.decision);
    case 'calendar':
      if (state.calendarConsent !== 'granted') return interrupted(state, 'Demo Calendar access was not allowed.');
      return { ...state, calendar: action.calendar };
    case 'app':
      if (state.appConsents[action.read.data.app] !== 'granted') return interrupted(state, 'Demo app access was not allowed.');
      return { ...state, appData: { ...state.appData, [action.read.data.app]: action.read.data } };
    case 'delta':
      return {
        ...state, messages: state.messages.map(message =>
          message.id === action.requestId * 2 ? { ...message, text: message.text + action.text } : message),
      };
    case 'finish': {
      if (!action.text.trim()) return interrupted(state, 'Copilot returned no reply. Please try again.');
      const preferences = action.presentation?.preferences ?? state.preferences;
      return {
        ...state, pending: null, preferences,
        messages: state.messages.map(message => message.id === action.requestId * 2
          ? {
            ...message, text: action.text, question: action.presentation?.question ?? null,
            confirmations: changedPreferences(state.preferences, preferences),
            trip: action.presentation?.trip ?? null,
          } : message),
      };
    }
    case 'error': return interrupted(state, action.message);
    case 'stop': return state.pending ? interrupted(state, 'Reply stopped.') : state;
    case 'reset': return { ...createChat(), version: state.version + 1 };
    case 'notice': return { ...state, notice: action.message };
    case 'dismiss-notice': return { ...state, notice: '' };
  }
}
