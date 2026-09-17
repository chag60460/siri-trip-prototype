import { defineTool } from '@github/copilot-sdk';
import {
  appForPreference, createDemoAppData, demoAppDetails, demoAppIds,
  isAppPreferenceKind, isDemoAppId, isPreferenceDelegation,
} from '../src/demo-apps.ts';
import type { AppPreferenceKind, DemoAppConsents, DemoAppId, DemoAppRead } from '../src/demo-apps.ts';
import type { CalendarConsent } from '../src/demo-calendar.ts';
import type { PreferencePresentation, PreferenceQuestion } from '../src/preferences.ts';

export const DEMO_APP_TOOL_NAME = 'read_demo_app';
export class DemoAppAccessError extends Error {}
export interface AppAssistance { app: DemoAppId; kind: AppPreferenceKind }

export function requestedAppAssistance(question: PreferenceQuestion | null, message: string): AppAssistance | null {
  if (!question || !isAppPreferenceKind(question.kind)) return null;
  const app = appForPreference(question.kind);
  if (!app) return null;
  if ((question.mode === 'ask' && isPreferenceDelegation(message))
    || (question.app === app && ((question.mode === 'permission' && /^(?:allow|do not allow) demo (?:bank|maps) access[.!]?/i.test(message.trim()))
      || (question.mode === 'proposal' && isPreferenceDelegation(message))))) {
    return { app, kind: question.kind };
  }
  return null;
}

export class DemoAppAccess {
  private decisions: DemoAppConsents = {};
  private snapshots = new Map<AppPreferenceKind, DemoAppRead>();

  consent(app: DemoAppId): CalendarConsent | null {
    return this.decisions[app] ?? null;
  }

  setConsents(consents: DemoAppConsents) {
    for (const app of demoAppIds) {
      const decision = consents[app];
      if (!decision) continue;
      this.decisions[app] = decision;
      if (decision === 'denied') {
        for (const [kind, read] of this.snapshots) if (read.data.app === app) this.snapshots.delete(kind);
      }
    }
  }

  read(app: DemoAppId, kind: AppPreferenceKind, today: number): DemoAppRead {
    if (appForPreference(kind) !== app) {
      throw new DemoAppAccessError('Use Bank only for budget, and Maps only for activities, food, or lodging.');
    }
    if (this.consent(app) !== 'granted') {
      throw new DemoAppAccessError(this.consent(app) === 'denied'
        ? `Demo ${demoAppDetails[app].name} access was denied. Do not read it or ask again. Offer a general suggestion or manual input without claiming app data.`
        : `First ask permission for demo ${demoAppDetails[app].name} using a ${kind} permission question with app="${app}". Wait for an explicit Allow.`);
    }
    const data = createDemoAppData(app, today);
    const read: DemoAppRead = {
      kind, data: data.app === 'maps' ? { ...data, places: data.places.filter(place => place.kind === kind) } : data,
    };
    this.snapshots.set(kind, read);
    return read;
  }

  validatePresentation(value: PreferencePresentation, assistance: AppAssistance | null, read?: DemoAppRead) {
    const question = value.question;
    if (assistance && this.consent(assistance.app) === null) {
      if (question?.mode !== 'permission' || question.app !== assistance.app || question.kind !== assistance.kind) {
        throw new DemoAppAccessError(`The user delegated ${assistance.kind}. Ask permission for demo ${demoAppDetails[assistance.app].name} with mode="permission", kind="${assistance.kind}", app="${assistance.app}". Do not confirm or advance yet.`);
      }
    }
    if (question?.mode === 'permission' && question.app) {
      const consent = this.consent(question.app);
      if (consent !== null) throw new DemoAppAccessError(consent === 'granted'
        ? `Demo ${demoAppDetails[question.app].name} is already allowed. Read it instead of asking again.`
        : `Demo ${demoAppDetails[question.app].name} was denied. Do not ask again. Offer manual input or a general suggestion.`);
      if (!assistance || assistance.app !== question.app || assistance.kind !== question.kind) {
        throw new DemoAppAccessError(`The user has not delegated ${question.kind}. Ask their ${question.kind} preference first using mode="ask", without app. Delegating or approving one category does not delegate the next category.`);
      }
    }
    const needsRead = assistance && this.consent(assistance.app) === 'granted';
    if (needsRead && (!read || read.data.app !== assistance.app || read.kind !== assistance.kind)) {
      throw new DemoAppAccessError(`Call read_demo_app for app="${assistance.app}", preference="${assistance.kind}" before proposing. Do not claim to have looked without a permitted read.`);
    }
    if (read && (question?.mode !== 'proposal' || question.app !== read.data.app || question.kind !== read.kind || !question.suggestion)) {
      throw new DemoAppAccessError(`After reading demo ${demoAppDetails[read.data.app].name}, show a ${read.kind} proposal with app="${read.data.app}" and a concrete suggestion. Wait for user approval; do not confirm or advance yet.`);
    }
    if (question?.app && question.mode === 'proposal') {
      const snapshot = isAppPreferenceKind(question.kind) ? this.snapshots.get(question.kind) : undefined;
      if (this.consent(question.app) !== 'granted' || !snapshot || snapshot.data.app !== question.app) {
        throw new DemoAppAccessError('An app-based suggestion requires permission and a read for this exact preference. Do not invent app context.');
      }
      if (!read || read !== snapshot) {
        throw new DemoAppAccessError('Read the relevant app in this turn after the user delegates that preference. A previous suggestion is not permission to choose another category.');
      }
    }
  }
}

export function runDemoAppTool(value: unknown, read: (app: DemoAppId, kind: AppPreferenceKind) => DemoAppRead): string {
  if (typeof value !== 'object' || value === null || !('app' in value) || !isDemoAppId(value.app)
    || !('preference' in value) || !isAppPreferenceKind(value.preference)
    || appForPreference(value.preference) !== value.app) {
    throw new TypeError('Specify Bank/budget or Maps/activities, Maps/food, or Maps/lodging.');
  }
  const result = read(value.app, value.preference);
  return JSON.stringify({
    source: `Demo ${demoAppDetails[value.app].name}: synthetic sample data only, never the user's real history`,
    ...result,
    rule: value.app === 'bank'
      ? 'Use the sample travelFund as an illustrative limit, not the whole balance or reserved funds. Propose an estimated budget, not financial advice or actual affordability. No money can be moved. Set question.mode="proposal", question.app="bank", and question.suggestion to the proposed budget; explain the sample basis and wait for approval.'
      : 'Use only these fictional saved-place styles to propose the requested preference. Do not present these names as real venues in the destination, infer allergies, invent bookings/prices, or overwrite supplied preferences. Set question.mode="proposal", question.app="maps", and question.suggestion to the proposed preference; explain the sample basis and wait for approval.',
  });
}

export function createDemoAppTool(read: (app: DemoAppId, kind: AppPreferenceKind) => DemoAppRead) {
  return defineTool(DEMO_APP_TOOL_NAME, {
    description: 'Read synthetic Bank budget context or the relevant category of fictional Maps saved places after per-app permission. Never accesses real accounts, location, or external apps.',
    skipPermission: true,
    defer: 'never',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        app: { type: 'string', enum: [...demoAppIds] },
        preference: { type: 'string', enum: ['budget', 'activities', 'food', 'lodging'] },
      },
      required: ['app', 'preference'],
    },
    handler: value => ({ resultType: 'success', textResultForLlm: runDemoAppTool(value, read) }),
  });
}
