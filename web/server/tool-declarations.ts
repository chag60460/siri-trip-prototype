import { preferenceKinds } from '../src/preferences.ts';
import { demoAppIds } from '../src/demo-apps.ts';
import { PREFERENCE_TOOL_NAME } from './preference-tool.ts';
import { DEMO_CALENDAR_TOOL_NAME } from './demo-calendar-tool.ts';
import { DEMO_APP_TOOL_NAME } from './demo-app-tool.ts';
import { DEMO_TRAVEL_TOOL_NAME } from './demo-travel-tool.ts';

const dateRange = (description: string) => ({
  type: 'object', nullable: true, description,
  properties: { start: { type: 'string', description: 'Inclusive ISO start date, YYYY-MM-DD.' }, end: { type: 'string', description: 'Inclusive ISO end date, YYYY-MM-DD.' } },
  required: ['start', 'end'],
});

// Shared by every hosted backend. Kept to the OpenAPI subset Gemini accepts; the runtime validators enforce the rest.
export const TOOL_DECLARATIONS = [
  {
    name: PREFERENCE_TOOL_NAME,
    description: 'Display High-Fi preference controls or a completed trip with booking-search options and a personalized itinerary. Display only; no external access, reservations, or purchases.',
    parameters: {
      type: 'object',
      properties: {
        planType: { type: 'string', enum: ['trip', 'other'], description: 'Always identify the current goal. A completed trip (question=null) must include trip. Use other for non-travel goals.' },
        question: {
          type: 'object', nullable: true,
          description: 'The single preference question or proposal to display. Use null only when presenting a completed trip or confirmed preferences.',
          properties: {
            kind: { type: 'string', enum: [...preferenceKinds] },
            label: { type: 'string', description: 'Visible category title, at most 32 characters, such as Activities, Food & dining, or Lodging. Not a generic Preferences label.' },
            mode: { type: 'string', enum: ['ask', 'proposal', 'permission'] },
            text: { type: 'string', description: 'One short question, at most 400 characters, naming the preference category and the relevant missing details.' },
            inputPlaceholder: { type: 'string', nullable: true, description: 'For typed answers: a short contextual example, at most 32 characters, shown in the empty inline field. Null for Yes/No cards. Never an actual answer.' },
            app: { type: 'string', enum: [...demoAppIds], nullable: true, description: 'Required for Bank/Maps permission questions and app-based proposals. Bank is budget-only; Maps is activities, food, or lodging. Null for Calendar and general questions.' },
            suggestion: { type: 'string', nullable: true, description: 'Concrete proposed preference value for review, at most 240 characters, not yet confirmed. Required for Bank/Maps proposals.' },
            selection: dateRange('Required for date proposals after reading the permitted demo Calendar. Otherwise null.'),
          },
          required: ['kind', 'label', 'mode', 'text'],
        },
        preferences: {
          type: 'array', maxItems: 8,
          description: 'The complete current list of confirmed preferences, not only the latest change.',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: [...preferenceKinds] },
              label: { type: 'string', description: 'Visible category title, at most 32 characters.' },
              value: { type: 'string', description: 'The confirmed answer, at most 240 characters.' },
              source: { type: 'string', enum: ['user', 'siri'] },
            },
            required: ['kind', 'label', 'value', 'source'],
          },
        },
        trip: {
          type: 'object', nullable: true,
          description: 'Required for completed trip plans, including revisions, and only when question=null. Null while gathering preferences or for non-travel answers.',
          properties: {
            destination: { type: 'string', description: 'The actual destination city/region and country when helpful. Never a booking URL.' },
            origin: { type: 'string', nullable: true, description: 'Departure city or airport, ONLY if explicitly supplied by the user. Otherwise null; demo offers show departure TBD.' },
            dates: dateRange('Confirmed trip start and end, inclusive. End is the return/check-out date. Null for explicitly flexible dates.'),
            summary: { type: 'string', description: 'Brief personalized introduction, at most two short sentences and 400 characters.' },
            itinerary: {
              type: 'array', minItems: 1, maxItems: 60,
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'A meaningful day title, or a clearly identified group of days for a long trip.' },
                  date: { type: 'string', nullable: true, description: 'Actual ISO day within the trip dates, chronological and without duplicates. Null for flexible dates.' },
                  activities: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' }, description: 'Useful personalized morning, afternoon, evening, meal, or transit suggestions. Nothing is represented as booked.' },
                },
                required: ['title', 'activities'],
              },
            },
          },
          required: ['destination', 'summary', 'itinerary'],
        },
      },
      required: ['question', 'preferences'],
    },
  },
  {
    name: DEMO_CALENDAR_TOOL_NAME,
    description: 'Read only the synthetic events in the demo Calendar after the user explicitly allows access. Never reads real calendars or accounts. Returns conflict-free date ranges.',
    parameters: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 21, description: 'Desired consecutive full days. Use 3 for an initial proposal if the user has not specified a duration.' } },
      required: ['days'],
    },
  },
  {
    name: DEMO_APP_TOOL_NAME,
    description: 'Read synthetic Bank budget context or the relevant category of fictional Maps saved places after per-app permission. Never accesses real accounts, location, or external apps.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', enum: [...demoAppIds] },
        preference: { type: 'string', enum: ['budget', 'activities', 'food', 'lodging'] },
      },
      required: ['app', 'preference'],
    },
  },
  {
    name: DEMO_TRAVEL_TOOL_NAME,
    description: 'Read three synthetic flight fares and three synthetic hotel offers for a completed trip. Fictional demo inventory only, not live availability. Cannot book, charge, access accounts, or collect payment details.',
    parameters: {
      type: 'object',
      properties: {
        destination: { type: 'string' },
        origin: { type: 'string', nullable: true, description: 'Departure city only if the user supplied it; otherwise null.' },
        dates: dateRange('The chosen inclusive trip start/end, or null for flexible dates. Never choose new dates here.'),
      },
      required: ['destination'],
    },
  },
];
