import { formatRange, parseDateSelection } from './dates.ts';
import type { DateSelection } from './dates.ts';
import { appForPreference, isDemoAppId } from './demo-apps.ts';
import type { DemoAppId } from './demo-apps.ts';
import { isTripPlanData } from './trip-plan.ts';
import type { TripPlanData } from './trip-plan.ts';

export const preferenceKinds = ['dates', 'budget', 'activities', 'food', 'lodging', 'other'] as const;
export type PreferenceKind = typeof preferenceKinds[number];

export interface PreferenceValue {
  kind: PreferenceKind;
  label: string;
  value: string;
  source: 'user' | 'siri';
}

export interface PreferenceQuestion {
  kind: PreferenceKind;
  label: string;
  mode: 'ask' | 'proposal' | 'permission';
  text: string;
  inputPlaceholder?: string | null;
  app?: DemoAppId | null;
  suggestion?: string | null;
  selection?: DateSelection | null;
}

export interface PreferencePresentation {
  question: PreferenceQuestion | null;
  preferences: PreferenceValue[];
  planType?: 'trip' | 'other';
  trip?: TripPlanData | null;
}

export type PreferenceAction = 'type' | 'calendar' | 'delegate' | 'accept' | 'decline'
  | 'allow-calendar' | 'deny-calendar' | 'allow-app' | 'deny-app';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}

function kind(value: unknown): value is PreferenceKind {
  return preferenceKinds.some(candidate => candidate === value);
}

function isPreferenceValue(value: unknown): value is PreferenceValue {
  return record(value) && kind(value.kind) && text(value.label, 32) && text(value.value, 240)
    && (value.source === 'user' || value.source === 'siri');
}

function isPreferenceQuestion(value: unknown): value is PreferenceQuestion {
  return record(value) && kind(value.kind) && text(value.label, 32) && text(value.text, 400)
    && (value.mode === 'ask' || value.mode === 'proposal' || (value.mode === 'permission'
      && (value.kind === 'dates' || (isDemoAppId(value.app) && appForPreference(value.kind) === value.app))))
    && (value.inputPlaceholder === undefined || value.inputPlaceholder === null || text(value.inputPlaceholder, 32))
    && (value.suggestion === undefined || value.suggestion === null || text(value.suggestion, 240))
    && (value.app === undefined || value.app === null || (isDemoAppId(value.app) && appForPreference(value.kind) === value.app
      && (value.mode === 'permission' || (value.mode === 'proposal' && text(value.suggestion, 240)))))
    && (value.selection === undefined || value.selection === null || parseDateSelection(value.selection) !== null)
    && (!(value.kind === 'dates' && value.mode === 'proposal') || parseDateSelection(value.selection) !== null);
}

export function preferenceKey(value: Pick<PreferenceValue, 'kind' | 'label'>): string {
  return value.kind === 'other' ? `other:${value.label.toLowerCase()}` : value.kind;
}

export function isPreferencePresentation(value: unknown): value is PreferencePresentation {
  if (!record(value) || !(value.question === null || isPreferenceQuestion(value.question))
    || !Array.isArray(value.preferences) || value.preferences.length > 8
    || !value.preferences.every(isPreferenceValue)
    || !(value.planType === undefined || value.planType === 'trip' || value.planType === 'other')
    || !(value.trip === undefined || value.trip === null
      || (value.question === null && value.planType !== 'other' && isTripPlanData(value.trip)))
    || (value.planType === 'trip' && value.question === null && !value.trip)) return false;
  return new Set(value.preferences.map(preferenceKey)).size === value.preferences.length;
}

export function changedPreferences(previous: PreferenceValue[], current: PreferenceValue[]): PreferenceValue[] {
  return current.filter(value => {
    const old = previous.find(candidate => preferenceKey(candidate) === preferenceKey(value));
    return !old || old.value !== value.value || old.source !== value.source;
  });
}

export function acceptedPreferenceProposal(question: PreferenceQuestion | null, message: string): PreferenceValue | null {
  if (question?.mode !== 'proposal') return null;
  const range = question.kind === 'dates' ? parseDateSelection(question.selection) : null;
  const value = range ? formatRange(range) : question.suggestion;
  if (!value) return null;
  const answer = message.trim().toLowerCase();
  const approval = question.kind === 'dates' && range ? `Dates: ${value}` : `Use ${question.kind}: ${value}`;
  return /^(?:yes|yes please|use suggestion|use it|sounds good)[.!]?$/.test(answer) || answer === approval.toLowerCase()
    ? { kind: question.kind, label: question.label, value, source: 'siri' } : null;
}

export function preservePreferenceSources(
  presentation: PreferencePresentation, previous: PreferenceValue[], approved: PreferenceValue | null,
): PreferencePresentation {
  return {
    ...presentation,
    preferences: presentation.preferences.map(preference => {
      const key = preferenceKey(preference);
      if (approved && preferenceKey(approved) === key) return { ...preference, value: approved.value, source: approved.source };
      const existing = previous.find(value => preferenceKey(value) === key);
      return existing?.value === preference.value ? { ...preference, source: existing.source } : preference;
    }),
  };
}

export function hasUnconfirmedAnswer(presentation: PreferencePresentation, confirmed: PreferenceValue[]): boolean {
  if (!presentation.question) return false;
  const key = preferenceKey(presentation.question);
  const proposed = presentation.preferences.find(value => preferenceKey(value) === key);
  if (!proposed) return false;
  const previous = confirmed.find(value => preferenceKey(value) === key);
  return !previous || previous.value !== proposed.value || previous.source !== proposed.source;
}

export function preferenceSummary(preference: PreferenceValue): string {
  if (preference.kind === 'dates') return `Set dates ${preference.value}`;
  if (preference.kind === 'budget') return `Set budget as ${preference.value}`;
  return `${preference.label}: ${preference.source === 'siri' ? "Siri's picks" : preference.value}`;
}

export function preferenceInputPlaceholder(question: PreferenceQuestion): string {
  if (question.inputPlaceholder) return question.inputPlaceholder;
  switch (question.kind) {
    case 'dates': return 'Your travel dates';
    case 'budget': return 'e.g., $1,500 USD';
    case 'activities': return 'e.g., museums, hiking';
    case 'food': return 'e.g., Thai, vegetarian';
    case 'lodging': return 'e.g., a downtown hotel';
    case 'other': return `Your ${question.label.toLowerCase()}`;
  }
}

export function preferenceChoices(question: PreferenceQuestion): { action: PreferenceAction; label: string }[] {
  const type = { action: 'type', label: 'Type your preference' } as const;
  if (question.mode === 'permission') {
    return question.kind === 'dates'
      ? [{ action: 'allow-calendar', label: 'Yes' }, { action: 'deny-calendar', label: 'No' }]
      : [{ action: 'allow-app', label: 'Yes' }, { action: 'deny-app', label: 'No' }];
  }
  if (question.mode === 'proposal') {
    return [{ action: 'accept', label: 'Yes' }, { action: 'decline', label: 'No' }];
  }
  if (question.kind === 'dates') {
    return [{ action: 'calendar', label: 'Yes' }, { action: 'delegate', label: 'No' }];
  }
  return [type, { action: 'delegate', label: question.kind === 'budget' || question.kind === 'other' ? 'Choose for me' : 'No' }];
}
