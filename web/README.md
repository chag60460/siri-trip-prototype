# Siri Trip web preview

A user-led Copilot conversation inside a SwiftUI-inspired browser prototype.
Home and Today are recreated screens; the native Xcode app is unchanged.

## Run locally

Requires Node.js 22.18 or newer and an authenticated GitHub Copilot account.
The SDK uses existing Copilot authentication; no credentials are sent to the
browser. If needed, sign in with the Copilot CLI's `/login` command first.

```sh
cd web
npm ci
npm run dev
```

Open the local URL printed by Vite. The preview starts on Home. Pages are ordered
**Siri | Today | Home**, left to right. Swipe or drag right twice to reach Siri;
swipe left to return. Horizontal trackpad gestures also work. The screen buttons,
or Left/Right arrow keys while the phone is focused, provide keyboard navigation.

The conversation and unsent text stay intact when changing pages. `?screen=siri`
opens the assistant directly; `?screen=today` opens Today.

## User-led, open-ended chat

The conversation starts completely blank. Nothing is generated until the user
sends a message. Ask about any goal: an event, a learning schedule, a project,
meals, travel, or another kind of plan. Copilot generates and streams the reply;
there is no trip state machine, canned questionnaire, or scripted fallback.
Follow-ups use the same model session.

Trip planning gathers preferences before producing an itinerary: dates, budget,
activities, food, and lodging. A destination-only request starts with a short
date question, not a sample plan. The model asks one question at a time and uses
answers already provided, including answers to multiple preferences in one message.
Flexible or skipped preferences are accepted. A fully specified request goes
straight to a plan, as does an explicit request to skip questions and make
assumptions. Other planning topics use their own relevant questions.

Enter sends a message; Shift+Enter adds a line. **Stop reply** cancels generation.
**New chat** clears the conversation and disconnects the previous model session.
Errors are shown explicitly, and unsent or failed text is not replaced by a
fictional AI answer.

Dates are optional: open **+ > Add dates**, choose a range in the current-month
calendar, then send a message. Selection alone never contacts the model. Tap a
date twice for a single day. No date range is preselected.

## High-Fi preference controls

Preference questions follow the supplied High-Fi designs: bottom-aligned
conversation bubbles, blue action rows inside the reply, and compact confirmation
bubbles for the user's choices. The model supplies the question and preference
data; the browser does not infer stages from keywords or replay a scripted trip.
Each card shows exactly two actions suited to what the agent is gathering.
It also displays the category above a focused question: food asks about cuisines
and dietary needs, activities about interests and pace, lodging about stay type
and location, and budget about the amount and currency. Questions and short input
examples are model-generated and adapt to what the user has already supplied.
If an input example is omitted, the field uses a category-specific hint instead.

| Card                                                  | Available actions                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Dates                                                 | Yes opens Calendar for manual selection; No asks Siri to choose, starting with permission |
| Budget, other preferences                             | Inline answer or Choose for me                                                            |
| Activities, food, lodging                             | Inline answer or No to let Siri choose                                                    |
| Suggested dates, budget, activities, food, or lodging | Yes accepts; No requests a different suggestion                                           |

The editable field inside each question card shows a relevant example, not a
preselected answer. Click it to type, then press Enter or its send arrow to submit
without using the bottom message box. Typing alone sends nothing. Inline drafts
survive screen changes, and inline answers leave the separate composer draft and
attached dates untouched. The composer remains available for free-form messages. Confirming
dates from a question's calendar sends those dates as the answer; opening the
calendar from **+ > Add dates** still only attaches them to a draft.

Siri proposes delegated preferences for approval rather than silently setting
them. Approved activities, food, and lodging are marked **Siri's picks**, with the
concrete selection retained for planning, and the conversation continues to the next missing preference. Only the latest
completed question has active controls; stopped or superseded replies cannot
create new confirmations.

## Completed trip plans

A finished trip is a compact High-Fi plan card, not only a long paragraph.
The model supplies the destination, actual selected dates, a short summary,
and a personalized itinerary after gathering preferences. The card offers
**Book flight**, **Book hotel**, and **View itinerary**.

Before completing a trip, the agent calls **read_demo_travel_offers** to fetch
three fictional flight fares and three fictional hotel offers. They use the
trip's actual destination, supplied departure city, and dates. The server
attaches only a current matching inventory result; the model cannot substitute
its own prices. These are synthetic demo offers, not live availability.

Flight cards show airline, sample schedule, baggage, stops, and a sample
round-trip USD fare per adult. Hotel cards show the property, room, policy,
nightly USD rate, and stay total when dates are known. Missing origin remains
**Departure city TBD**, flexible dates stay flexible, and a same-day trip
does not invent an overnight stay or total.

Each offer has its own **Book** button. One click opens that selected offer in
a separate, prefilled **demo checkout tab**, rather than another search form.
The original plan remains open and unchanged. Checkout shows the exact chosen
fare or room and its date/price details, clearly labels everything as demo,
collects no payment or traveler data, and never creates a reservation.

The itinerary view shows the model-generated days and activities, with the
selected dates rather than a fixed July week. Visitors can switch between the
three plan views, close the plan, and
continue chatting or swiping. Revised plans get their own card; prior cards
remain available, and **New chat** clears them.

Checkout links open only after an explicit click and include just the selected
demo offer in the same-origin URL. They do not send conversation history,
budget, sample bank data, session identifiers, or app permissions. No third-party
booking API, live price feed, purchase, or reservation is connected. These demo
URLs and client-visible prices must never be used as authority for a real
payment; a future live booking integration would require server-side offers
and provider checkout. Non-travel plans continue to use normal conversation.

## Demo Calendar and permission

The Home screen's Calendar icon and the Today calendar widget open the same
Apple-style demo Calendar that Siri uses. It has functional month navigation,
sample Work and Personal events, and date-range selection. These events are
synthetic, anchored to the current week, and explicitly labeled as demo data.
No real Apple Calendar, bank account, or spending history is connected.

When the user wants Siri to choose dates:

1. Siri asks permission before reading the demo Calendar.
2. **Allow** opens Calendar visibly; **Don't Allow** keeps the agent out and offers manual dates.
3. A permission-gated tool reads the actual sample events and computes open date ranges. Siri highlights its proposed range in Calendar.
4. The user can adjust the range and press **Use** to confirm it. The agent cannot silently commit its proposal.

Automatic selections must start on or after today, stay inside the demo's eight-week coverage,
and contain no days with sample events. The demo uses whole-day availability for
travel. User-selected dates are not assumed free; the calendar shows any sample
conflicts or missing coverage. Returning to Siri while the agent is choosing stops
the request, and late results cannot reopen the calendar.

Permission is scoped to the current chat and resets with **New chat**. The
permission prompt is part of the browser demo, not an operating-system permission
request. Choosing **Demo Calendar permission** from the conversation actions lets
the user change that decision. Real calendar data, financial history, flight
prices, and hotel availability are never inferred from the demo.

## Relevant apps after delegation

**Choose for me**, **No**, or a typed **No preference** asks Siri to choose,
not to access data without permission. Delegation is per category: approving a
budget still leads to an activity question, not automatic access to another app.
The available demo sources are:

| Preference                | Relevant app | Data available after permission                                    |
| ------------------------- | ------------ | ------------------------------------------------------------------ |
| Dates                     | Calendar     | Synthetic events and open date ranges                              |
| Budget                    | Bank         | Sample balance, reserved funds, trip fund, and recent transactions |
| Activities, food, lodging | Maps         | Only the relevant category of fictional saved-place styles         |

Siri asks permission for the named app before reading it. **Allow** opens the
same app that can be opened from Home; a real application tool reads its sample
data, and the view shows the proposed preference and its demo-data basis.
**Use suggestion** confirms the choice and returns to Siri. Nothing is booked,
spent, or silently confirmed. Closing an app during generation stops that request,
and late results cannot reopen it.

Bank, Maps, and Calendar permissions are independent. A grant lasts for the chat;
Maps can be reused for food or lodging without asking again, but the reader must
load that category rather than reuse unrelated records. **Don't Allow** blocks
the reader and repeated permission requests; Siri can offer a clearly labeled
general suggestion or accept a typed answer instead.

Home's **Bank** and **Maps** icons work without giving Siri access. **Conversation
actions > Demo app permissions** allows Bank/Maps grants to be changed or revoked
without reading data. Revocation clears the permitted snapshot; **New chat** clears
all permissions. There are no real bank accounts, balances, location histories,
saved places, map tiles, transfers, prices, or bookings connected. The Bank data
is illustrative, not a statement about the user's financial situation, and the
Maps places are fictional styles rather than actual venues in the destination.

## Copilot model

The default model is `gpt-5.4-mini`. To choose another model available to your
Copilot account:

```sh
COPILOT_CHAT_MODEL=gpt-5.4-mini npm run dev
```

Messages count toward the connected account's Copilot usage allowance.

## Boundaries and storage

The backend uses the Copilot SDK in `empty` mode with four allowlisted tools:
`present_preferences` renders validated cards, `read_demo_calendar` reads
synthetic events, `read_demo_app` reads synthetic Bank or Maps context, and
`read_demo_travel_offers` reads public fictional travel inventory. Calendar,
Bank, and Maps require a client-recorded grant for that app. Travel inventory
requires no private-app access and cannot place bookings. Consent, relevant
categories, and review-before-confirmation are enforced in code rather than
trusting a model claim that permission was granted.
An invalid preference card can be corrected once within the original 90-second
response deadline. A validation failure never changes permissions or produces
an invented successful result; unrecoverable errors remain visible.
The general permission handler still rejects host and external access. File access, terminal commands,
all built-in and MCP tools, skills, file hooks, repository
instructions, cross-session retrieval, and remote session export are disabled.
Local session storage uses a separate in-memory filesystem for each chat.
Idle chats expire after 30 minutes; refreshing the page starts a new blank chat.

Prompts still go through the Copilot service and its data-handling policies.
No microphone, personal calendar, live pricing, or booking API is connected.
Trip Book controls open a separate same-origin demo checkout tab only after user action.
Other Home/Today apps and widgets remain illustrative. Markdown cannot execute HTML
or automatically load remote images.

## Build and preview

```sh
npm run build
npm run preview
```

The Vite development and preview servers both provide the local AI API, backed by
your own Copilot login. Publishing `dist/` alone will not provide AI replies.

`npm start` runs the production server in `server/serve.ts`, which serves `dist/`
and the same `/api` endpoints. It accepts a non-loopback host only when
`GEMINI_API_KEY` is set, so a personal Copilot account can never be exposed as an
unauthenticated public proxy. Cross-origin requests are always rejected, and the
hosted path adds a per-visitor rate limit on top of the shared one.

## Portfolio embedding

The sibling `grace-portfolio` project's Siri case study embeds this same live
app, following its existing Magdalene prototype pattern. It loads only after
**Launch prototype** is clicked, with `?screen=siri&embed=1`. The embedded layout
keeps the phone, Home/Today/Siri controls, and New chat visible within the frame.
The app sends only a `siri-prototype:ready` message to the parent; no conversation,
session ID, app data, or credentials are included.

On localhost or a locally opened HTML file, the case study connects to the
existing preview at `http://127.0.0.1:5173/`. On a public site, its
`data-prototype-url` must name an actual hosted HTTPS app. Without that setting,
the page explicitly says that the live app is not public yet, rather than
requesting a visitor's localhost or fabricating AI replies.

Embedding does not deploy the backend, bypass its local-only API, or authorize
sharing a Copilot account. The portfolio host and the AI backend remain separate.

## Public website access

Visitors would open your website on a phone or computer, swipe or click into
Siri, and chat in the browser. No Xcode project or native app installation is
needed. The current AI connection is local to the developer's Mac, so uploading
the frontend alone does not make that connection available to visitors.

For a general-audience site, the deployed build uses a hosted model provider with
a server-side API key. Visitors do not need Copilot or any account; the site owner
holds the key and its usage limits. Set `GEMINI_API_KEY` in the host's secret
settings, never in the repository or browser bundle. `render.yaml` describes a
free Render web service that builds `web/` and runs `npm start`.

The provider is selected at startup: with `GEMINI_API_KEY` present the planner uses
`GeminiBackend`, and without it the planner keeps using your local Copilot login.
Both paths share the same tools, permission gates, validators, and UI, so local
development behavior is unchanged.

A Copilot-backed public site would instead have to authenticate each eligible
visitor and scope model sessions to that visitor's GitHub/Copilot credentials,
rather than sharing the developer's logged-in session. See the SDK's
[multi-user deployment guidance](https://github.com/github/copilot-sdk/blob/main/docs/setup/multi-tenancy.md).

## Development commands

```sh
npm test
npm run test:ui
```

Browser scenarios use installed Google Chrome, a dedicated server on port 4187,
and mocked AI responses so routine runs do not consume Copilot usage. They cover
blank startup, user initiation, follow-ups, High-Fi choices, typed answers,
confirmation bubbles, demo app entry points, independent and reused permissions,
visible app-based suggestions, completed trip cards, selected-offer checkout,
itinerary views, draft preservation, dates, cancellation, errors, rendering, and swipe navigation.
Screenshots and failure traces go to `test-results/`.

Model-behavior scenarios are opt-in because they send real prompts and consume
Copilot usage. They cover structured preference cards, proposals, delegated
choices, supplied preferences, skipped questions, and non-travel requests:

```sh
COPILOT_LIVE_TESTS=1 node --test server/copilot-planner.live.test.ts
```

Ordinary `npm test` runs skip these live scenarios.

The full served-browser Bank/Maps-to-trip walkthrough is also opt-in. It uses
real model replies and synthetic inventory, but never makes purchases:

```sh
COPILOT_BROWSER_LIVE_TESTS=1 npm run test:ui -- tests/trip-plan.live.spec.ts --project=desktop
```

Set `LIVE_PREVIEW_URL=http://127.0.0.1:5173` to exercise an already running local
preview instead of the test server. The scenario releases its model session
afterward. Ordinary browser runs skip it.
