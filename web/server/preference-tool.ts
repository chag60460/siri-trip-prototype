import { defineTool } from '@github/copilot-sdk';
import { isPreferencePresentation, preferenceKinds } from '../src/preferences.ts';
import type { PreferencePresentation } from '../src/preferences.ts';
import { demoAppIds } from '../src/demo-apps.ts';

export const PREFERENCE_TOOL_NAME = 'present_preferences';

export const PREFERENCE_TOOL_INSTRUCTIONS = `Use present_preferences whenever you ask for a planning preference, propose a choice, or acknowledge changed preferences. This is a display-only tool: it renders a labeled question with inline input or choice buttons and compact confirmation bubbles. It cannot access accounts, files, banks, real calendars, or external services. The separate read_demo_calendar and read_demo_app tools read synthetic sample data only, after explicit permission for that specific app. The read_demo_travel_offers tool reads public synthetic travel inventory after preference gathering; it never accesses private apps or places a booking.
Make one successful call per reply with the complete current list of confirmed preferences, not only the latest change. If validation fails, correct the payload and retry the same question, without advancing to another preference. Preserve previous answers. Clear the list when the user switches to an unrelated goal. Never mark a proposal confirmed until the user accepts it. The preference currently being asked or proposed must not appear in preferences unless it is an unchanged, previously confirmed value being edited. A qualifier such as excluding flights is not a confirmed budget amount.
Every card has exactly two context-appropriate actions. For an unanswered preference, supply question.mode="ask" and a short, natural question. Start a broad trip request by asking WHETHER the user has preferred dates, not by requesting Calendar permission. Missing dates in the initial request are not permission to choose for them. The dates card shows only Yes (opens Calendar for the user to select) and No (asks you to choose), so its question must make sense with Yes and No. Budget cards show an inline answer field and Choose for me. Activities, food, and lodging cards show an inline answer field and No. Use kind="other" with a meaningful label for non-travel preferences.
Make each question specific to one preference category. Name the category in the question itself, not just in question.label. Never ask a standalone "Any preferences?" or "What do you prefer?" Use a distinct, meaningful label such as Activities, Food & dining, or Lodging; the UI displays that label above the question.
For budget, ask about the amount and currency, clarifying total versus per-person or daily spending only when missing. For activities, ask about interests or pace with relevant examples such as museums, outdoor walks, or live music. For food, ask about favorite cuisines and dietary needs, such as vegetarian meals or allergies. For lodging, ask about accommodation type and location, such as a hotel versus a rental or a preferred neighborhood. Keep these categories separate and never re-ask details already supplied.
Keep dining preferences in the food question rather than mixing generic "food spots" into activity examples. Date questions still need Yes/No wording, such as "Do you already have preferred travel dates?", not "What dates are you thinking?"
Examples of focused questions: "What total trip budget and currency should I plan around?"; "Any activity preferences, such as museums, outdoors, or live music?"; "Any food preferences or dietary needs, such as favorite cuisines or vegetarian meals?"; "Any lodging preferences, such as a hotel or rental in a particular neighborhood?" These illustrate specificity, not a script: adapt the wording and examples to the user's goal and existing answers, and still ask only one short question.
For typed questions, also supply question.inputPlaceholder: a short example of a relevant answer, at most 32 characters, such as "e.g., Thai, vegetarian" for food or "e.g., a quiet hotel" for lodging. Tailor it to the current question, including known constraints; do not repeat the generic "Type your preference". This is only an empty-field hint, never a selected or confirmed answer. Omit it or use null for dates, permission, and Yes/No proposals, which do not have inline fields. Other topics need their own specific labels and examples, not travel examples.
No on the initial dates card explicitly means "choose dates for me", NOT "skip dates". Do NOT advance to budget or suggest arbitrary dates. If demo Calendar permission is not requested, first use a dates question with mode="permission" to ask whether you may open the demo Calendar and check sample availability. The UI shows a clearly labeled demo permission prompt. Stop and wait. Never ask for real account permissions or credentials.
If permission is granted, call read_demo_calendar (3 consecutive days is a reasonable initial proposal if duration is unspecified). This visibly opens the same Calendar app as the Home screen icon and returns sample events plus availableRanges. Choose a conflict-free range within that coverage. Then call present_preferences with a dates question, mode="proposal", and selection={start:"YYYY-MM-DD",end:"YYYY-MM-DD"}. Explain briefly that the range avoids demo events. The Calendar highlights those dates for review; do not confirm them yet.
If permission is denied, do not read the Calendar, invent availability, or ask for permission again. Ask whether the user wants to pick dates manually (dates mode="ask"). Yes opens Calendar for the user only. If the user says No again, leave dates flexible and continue gathering other preferences. Never treat denying access as permission to inspect anything.
Choose for me, No, or No preference delegates the current preference, not access to an app. For budget, the relevant demo app is Bank (app="bank"), with sample balances, reserved funds, and a trip fund. For activities, food, or lodging, the relevant app is Maps (app="maps"), with fictional saved-place styles. Use only the relevant app and category; do not ask about accounts for unrelated goals or when the user supplies an answer or explicitly requests assumptions without apps.
Delegation is per category. After a budget is approved, ask the user's activity preferences with mode="ask"; do not immediately request Maps permission or read it. Likewise ask about food and lodging separately. Only request permission or read an app after the user delegates that specific question. Approval of one suggestion never delegates another preference.
If that app's permission is not requested, ask first using the current preference kind, mode="permission", and app="bank" or app="maps". Explain which sample information would help and that it is demo-only. Do not confirm the preference, open/read the app, or move to the next question. The UI shows a per-app Allow/Don't Allow prompt. Stop and wait for the user's decision.
If permission is granted, do not ask again. Call read_demo_app with the app and preference kind. Only the named app is allowed; Calendar, Bank, and Maps permissions are independent. A granted app may be reused for a later relevant preference, but read that category's data instead of assuming a previous category covers it. The same app opens visibly from Siri and Home.
After the read, use mode="proposal", the same kind, app, and a concrete question.suggestion (the proposed budget or preference value, at most 240 characters). Explicitly say demo or sample, briefly explain how that data informed the choice, and ask for approval. Do not mark it confirmed yet or put sample balances/bookmarks into confirmed preferences. Bank budgets should stay within the sample trip fund, not spend reserved funds; never claim actual affordability, financial history, or real bank access. Maps suggests interests/styles, not real venues, current location, allergies, live prices, or bookings. User-supplied constraints always override sample data.
If permission is denied, do not read the app or repeatedly request access. Offer a clearly labeled general suggestion without app data (mode="proposal", suggestion set, app omitted or null), or let the user type. The user can change permissions in Conversation actions > Demo app permissions. Never treat denial as permission.
Confirmation cards show only Yes and No: Yes or Use suggestion accepts; No rejects and requests a different suggestion. Record an approved app-assisted suggestion with source="siri" and its concrete value, then continue to the next missing preference. Do not treat this as permission to skip all other preferences or produce the whole plan early. Date proposals still need a valid selection matching permitted demo Calendar availability; a manually supplied date needs no Calendar access. A different answer can always be typed in the composer.
Other planning topics show an inline answer field and Choose for me; adapt suggestions to the actual topic rather than asking travel questions.
Typed answers are first-class: extract every supplied preference, including attached dates, record source="user", and do not repeat those questions. The card contains an editable inline field: the user types there and submits with Enter or its send arrow, without moving to the bottom composer. Typing or focusing the field alone sends nothing. The separate composer remains available for free-form messages.
Always set planType="trip" for trip planning and planType="other" for other topics, including while asking preferences. This distinguishes a completed trip from a non-travel answer.
When question is non-null, its text is the exact question displayed to the user. After the tool succeeds, reply with that same brief text, without another question or extra paragraphs. When all trip preferences are answered or explicitly left flexible, call the tool with question=null, planType="trip", the full confirmed preference list, and a complete trip object. Do not end a completed trip with only a prose paragraph.
The trip object creates a High-Fi plan card with Book flight, Book hotel, and View itinerary actions. Supply the actual destination, a short summary, confirmed ISO dates (or null when flexible), origin only if the user explicitly supplied it, and a personalized itinerary. Never infer a departure city from the browser time zone, sample Maps data, or currency. For known dates, give each day its actual date and useful activity/food suggestions; dates must be chronological and within the trip range. Prefer concrete, well-known places and sensible geographic grouping when you know them, without inventing venues or presenting fictional demo Maps places as real destinations. For flexible dates use Day 1, Day 2, etc. without inventing dates. Cover the whole requested trip; very long journeys may group consecutive days clearly in the title, with at most 60 entries.
Before presenting a completed trip or revision, call read_demo_travel_offers with the destination, user-supplied origin (or null), and chosen dates (or null). This fetches three fictional flight fares and three fictional hotel offers. Use the exact destination, origin, and dates from its returned criteria in trip. The server attaches the fetched offers; do not include offer arrays, invent prices, or change offer details yourself. Do not fetch final offers while a preference proposal is still waiting for approval.
The flight and hotel views show individual demo offers, each with a Book button opening that selected offer's prefilled DEMO checkout in a separate browser tab. They are not generic search forms and do not open a real purchase flow. Providers, fares, room rates, and policies in this inventory are fictional. No payment or personal traveler details are collected, and no reservation is created. Never say a flight or hotel is booked. A missing departure city remains explicitly TBD rather than being inferred, and flexible dates stay unset. Treat budgets as targets; demo prices are not real availability or verified affordability. The itinerary is a suggested schedule, not reserved activities or checked opening hours. After this tool succeeds, reply only with trip.summary; do not duplicate the itinerary as a long chat paragraph. Later trip revisions require a new matching inventory read while preserving unchanged choices. Non-travel plans use planType="other", omit trip, and can be ordinary prose. For ordinary conversation without preference changes, questions, or a requested trip plan, respond normally without this tool.`;

export function runPreferenceTool(
  value: unknown, present: (value: PreferencePresentation) => void, reportInvalid?: (reason: string) => void,
): string {
  if (!isPreferencePresentation(value)) {
    const reason = 'Provide valid display data matching the schema: known question kind/mode, label and inputPlaceholder at most 32 characters, question text at most 400, and unique confirmed preferences. The app field is only bank or maps; OMIT it for Calendar. Only a completed trip (question=null, planType="trip") requires a trip object. Never include trip while asking a preference. Check itinerary dates against the trip range.';
    reportInvalid?.(reason);
    throw new TypeError(reason);
  }
  present(value);
  return value.question
    ? `The card is ready. Reply only with this question: ${value.question.text}`
    : value.trip ? `The trip card, demo offer options, and itinerary are ready. Nothing is booked. Reply only with this summary: ${value.trip.summary}`
    : 'The confirmed preferences are displayed. Now provide the requested plan or answer.';
}

export function createPreferenceTool(present: (value: PreferencePresentation) => void, reportInvalid?: (reason: string) => void) {
  return defineTool(PREFERENCE_TOOL_NAME, {
    description: 'Display High-Fi preference controls or a completed trip with booking-search options and a personalized itinerary. Display only; no external access, reservations, or purchases.',
    skipPermission: true,
    defer: 'never',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        planType: {
          type: 'string', enum: ['trip', 'other'],
          description: 'Always identify the current goal. A completed trip (question=null) must include trip. Use other for non-travel goals.',
        },
        question: {
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', enum: [...preferenceKinds] },
                label: {
                  type: 'string', minLength: 1, maxLength: 32,
                  description: 'Visible category title, such as Activities, Food & dining, Lodging, or a specific non-travel constraint. Not a generic Preferences label.',
                },
                mode: { type: 'string', enum: ['ask', 'proposal', 'permission'] },
                text: {
                  type: 'string', minLength: 1, maxLength: 400,
                  description: 'One short question naming the preference category and the relevant missing details. Include useful examples without combining unrelated categories.',
                },
                inputPlaceholder: {
                  anyOf: [{ type: 'string', minLength: 1, maxLength: 32 }, { type: 'null' }],
                  description: 'For typed answers: a short, contextual example shown in the empty inline field. Omit or use null for Yes/No cards. Never an actual answer.',
                },
                app: {
                  anyOf: [{ type: 'string', enum: [...demoAppIds] }, { type: 'null' }],
                  description: 'Required for Bank/Maps permission questions and app-based proposals. Bank is budget-only; Maps is activities, food, or lodging. Omit for Calendar, ordinary questions, or general suggestions without app data.',
                },
                suggestion: {
                  anyOf: [{ type: 'string', minLength: 1, maxLength: 240 }, { type: 'null' }],
                  description: 'Concrete proposed preference value for review, not yet confirmed. Required for Bank/Maps proposals, and useful for general proposals after access is denied.',
                },
                selection: {
                  anyOf: [
                    {
                      type: 'object', additionalProperties: false,
                      properties: { start: { type: 'string', format: 'date' }, end: { type: 'string', format: 'date' } },
                      required: ['start', 'end'],
                    },
                    { type: 'null' },
                  ],
                  description: 'Required for date proposals after reading the permitted demo Calendar. ISO start and end dates, inclusive. Otherwise omit or use null.',
                },
              },
              required: ['kind', 'label', 'mode', 'text'],
            },
            { type: 'null' },
          ],
        },
        preferences: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: [...preferenceKinds] },
              label: { type: 'string', minLength: 1, maxLength: 32 },
              value: { type: 'string', minLength: 1, maxLength: 240 },
              source: { type: 'string', enum: ['user', 'siri'] },
            },
            required: ['kind', 'label', 'value', 'source'],
          },
        },
        trip: {
          anyOf: [
            {
              type: 'object', additionalProperties: false,
              properties: {
                destination: { type: 'string', minLength: 1, maxLength: 120, description: 'The actual destination city/region and country when helpful. Never a booking URL.' },
                origin: {
                  anyOf: [{ type: 'string', minLength: 1, maxLength: 120 }, { type: 'null' }],
                  description: 'Departure city or airport, ONLY if explicitly supplied by the user. Otherwise omit or null; demo offers explicitly show departure TBD.',
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
                  description: 'Confirmed trip start and end, inclusive, in ISO format. End is return/check-out date. Omit or null for explicitly flexible dates.',
                },
                summary: {
                  type: 'string', minLength: 1, maxLength: 400,
                  description: 'Brief personalized introduction, at most two short sentences. The separate card contains booking options and the full itinerary.',
                },
                itinerary: {
                  type: 'array', minItems: 1, maxItems: 60,
                  items: {
                    type: 'object', additionalProperties: false,
                    properties: {
                      title: { type: 'string', minLength: 1, maxLength: 120, description: 'A meaningful day title, or a clearly identified group of days for a long trip.' },
                      date: {
                        anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }],
                        description: 'Actual ISO day within the trip dates, in chronological order without duplicates. Omit or null for flexible dates.',
                      },
                      activities: {
                        type: 'array', minItems: 1, maxItems: 8,
                        items: { type: 'string', minLength: 1, maxLength: 360 },
                        description: 'Useful personalized morning, afternoon, evening, meal, or transit suggestions. Plain text; nothing is represented as booked.',
                      },
                    },
                    required: ['title', 'activities'],
                  },
                },
              },
              required: ['destination', 'summary', 'itinerary'],
            },
            { type: 'null' },
          ],
          description: 'Required for completed trip plans, including revisions. Only when question=null. Omit while gathering preferences or for non-travel answers.',
        },
      },
      required: ['question', 'preferences'],
    },
    handler: value => ({ resultType: 'success', textResultForLlm: runPreferenceTool(value, present, reportInvalid) }),
  });
}
