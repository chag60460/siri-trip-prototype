import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { CopilotPlanner } from './copilot-planner.ts';
import type { ChatEvent } from '../src/chat-protocol.ts';
import type { PreferenceKind } from '../src/preferences.ts';
import { isDemoRangeAvailable } from '../src/demo-calendar.ts';
import type { CalendarConsent, DemoCalendarData } from '../src/demo-calendar.ts';
import { formatRange, parseDateSelection } from '../src/dates.ts';
import type { AppPreferenceKind, DemoAppConsents, DemoAppId, DemoAppRead } from '../src/demo-apps.ts';
import { isTripPlanData } from '../src/trip-plan.ts';
import { isDemoTravelOffers, offersMatchTrip } from '../src/demo-travel.ts';

const live = { skip: process.env.COPILOT_LIVE_TESTS !== '1', timeout: 240_000 };
const year = new Date().getUTCFullYear() + 1;
type Reply = Extract<ChatEvent, { type: 'done' }> & { calendarRead?: DemoCalendarData; appRead?: DemoAppRead };
type Send = (message: string, consent?: CalendarConsent, apps?: DemoAppConsents) => Promise<Reply>;

async function withChat(context: TestContext, run: (send: Send) => Promise<void>) {
  const planner = new CopilotPlanner();
  let sessionId: string | null = null;
  let calendarConsent: CalendarConsent | undefined;
  let appConsents: DemoAppConsents = {};
  try {
    await run(async (message, consent, apps) => {
      if (consent) calendarConsent = consent;
      if (apps) appConsents = { ...appConsents, ...apps };
      const answers: Reply[] = [];
      const reads: DemoCalendarData[] = [];
      const appReads: DemoAppRead[] = [];
      await planner.stream({
        message, sessionId, localDate: new Date().toISOString().slice(0, 10), timeZone: 'UTC',
        ...(calendarConsent ? { calendarConsent } : {}),
        ...(Object.keys(appConsents).length ? { appConsents } : {}),
      }, event => {
        if (event.type === 'session') sessionId = event.sessionId;
        if (event.type === 'done') answers.push(event);
        if (event.type === 'calendar') reads.push(event.calendar);
        if (event.type === 'app') appReads.push(event.read);
      }, AbortSignal.timeout(90_000));
      const answer = answers.at(-1);
      assert.ok(answer, 'The model must return a completed reply.');
      assert.ok(answer.text.trim(), 'The completed reply must not be empty.');
      context.diagnostic(JSON.stringify({ user: message, assistant: answer, calendarReads: reads.length, appReads: appReads.map(read => ({ app: read.data.app, kind: read.kind })) }));
      return { ...answer, calendarRead: reads.at(-1), appRead: appReads.at(-1) };
    });
  } finally {
    await planner.close();
  }
}

function preferenceQuestion(answer: Reply, topic: RegExp, kind?: PreferenceKind) {
  assert.match(answer.text, topic);
  assert.equal((answer.text.match(/\?/g) ?? []).length, 1, 'Intake should ask one question.');
  assert.ok(answer.text.trim().split(/\s+/).length <= 40, 'Intake should stay within 40 words.');
  assert.doesNotMatch(answer.text, /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s)/m, 'Intake should not include an itinerary or list.');
  assert.equal(answer.presentation?.question?.text, answer.text, 'A preference question must include working UI controls.');
  if (kind) assert.equal(answer.presentation?.question?.kind, kind);
}

function completeTripPreferences(answer: Reply) {
  assert.deepEqual(
    answer.presentation?.preferences.filter(value => value.kind !== 'other').map(value => value.kind).sort(),
    ['activities', 'budget', 'dates', 'food', 'lodging'],
    'The five trip preferences must be present; additional user constraints are allowed.',
  );
}

function tripContent(answer: Reply): string {
  const trip = answer.presentation?.trip;
  assert.ok(trip && isTripPlanData(trip), 'A completed trip must include working booking and itinerary controls.');
  assert.equal(answer.presentation?.question, null);
  assert.equal(answer.text, trip.summary, 'The chat summary must not repeat the full itinerary.');
  assert.ok(trip.offers && isDemoTravelOffers(trip.offers), 'The trip must include actually fetched demo flight and hotel offers.');
  assert.equal(offersMatchTrip(trip.offers, trip), true);
  assert.equal(trip.offers.flights.length, 3);
  assert.equal(trip.offers.hotels.length, 3);
  return [trip.summary, ...trip.itinerary.flatMap(day => [day.title, ...day.activities])].join('\n');
}

function appProposal(answer: Reply, app: DemoAppId, kind: AppPreferenceKind): string {
  preferenceQuestion(answer, /demo|sample/i, kind);
  assert.equal(answer.presentation?.question?.mode, 'proposal');
  assert.equal(answer.presentation?.question?.app, app);
  assert.equal(answer.appRead?.data.app, app);
  assert.equal(answer.appRead?.kind, kind);
  assert.equal(answer.presentation?.preferences.some(value => value.kind === kind), false, 'The app suggestion is not confirmed yet.');
  const suggestion = answer.presentation?.question?.suggestion;
  assert.ok(typeof suggestion === 'string' && suggestion.trim().length > 0);
  if (answer.appRead?.data.app === 'maps') assert.ok(answer.appRead.data.places.every(place => place.kind === kind));
  return suggestion;
}

test('live: a broad Chicago request gathers missing preferences before planning', live, async context => {
  await withChat(context, async send => {
    preferenceQuestion(await send('I want to plan a trip to Chicago'), /dates?|when|time of year|month/i);
    const next = await send(`May 8-10, ${year}. It is just me. My budget is $1,200 USD total excluding flights, and I want a quiet hotel near downtown.`);
    const food = /food|eat|dining|diet|cuisine|restaurant/i;
    const activities = /activit|interest|enjoy|explor|see|do\b|spend|experience/i;
    preferenceQuestion(next, /food|eat|dining|diet|cuisine|restaurant|activit|interest|enjoy|explor|see|do\b|spend|experience/i);
    const nextKind = next.presentation?.question?.kind;
    assert.ok(nextKind === 'food' || nextKind === 'activities', 'Only food and activity preferences remain unanswered.');
    const asksFood = nextKind === 'food';
    const foodPreference = 'I am vegetarian and prefer small local restaurants.';
    const activityPreference = 'I enjoy art museums and live jazz.';
    preferenceQuestion(await send(asksFood ? foodPreference : activityPreference), asksFood ? activities : food, asksFood ? 'activities' : 'food');
    const plan = await send(asksFood ? activityPreference : foodPreference);
    const content = tripContent(plan);
    assert.match(content, /vegetarian/i);
    assert.match(content, /jazz/i);
    assert.match(content, /itinerary|plan|day|morning|evening|May/i);
    assert.equal(plan.presentation?.question, null);
    completeTripPreferences(plan);
  });
});

test('live: a fully specified trip does not repeat preference questions', live, async context => {
  await withChat(context, async send => {
    const plan = await send(`Plan a Chicago trip from Seattle for just me, May 8-10, ${year}. My budget is $1,200 USD total excluding flights. I want a quiet downtown hotel, vegetarian food at local restaurants, art museums, and live jazz. Keep the itinerary under 180 words.`);
    const content = tripContent(plan);
    assert.match(content, /vegetarian/i);
    assert.match(content, /jazz/i);
    assert.doesNotMatch(plan.text, /\?/);
    assert.match(plan.presentation?.trip?.origin ?? '', /Seattle|SEA/i);
    assert.deepEqual(plan.presentation?.trip?.dates, { start: `${year}-05-08`, end: `${year}-05-10` });
    assert.deepEqual(plan.presentation?.trip?.itinerary.map(day => day.date), [`${year}-05-08`, `${year}-05-09`, `${year}-05-10`]);
  });
});

test('live: users can explicitly skip intake and request a rough plan', live, async context => {
  await withChat(context, async send => {
    const plan = await send('I want a rough Chicago trip plan now. Dates are flexible and everything else is undecided. Skip questions, make reasonable assumptions, label them, and give a short draft.');
    assert.match(tripContent(plan), /assum/i);
    assert.match(plan.presentation?.trip?.destination ?? '', /Chicago/i);
    assert.ok(!plan.presentation?.trip?.dates);
    assert.doesNotMatch(plan.text, /\?/);
  });
});

test('live: a specified non-travel request does not trigger trip intake', live, async context => {
  await withChat(context, async send => {
    const plan = await send('Plan a 20-minute beginner watercolor practice using only blue and yellow. I already have all materials. Give three brief steps now.');
    assert.match(plan.text, /blue/i);
    assert.match(plan.text, /yellow/i);
    assert.doesNotMatch(plan.text, /\?|lodging|hotel|travel budget/i);
    assert.ok(!plan.presentation?.trip);
  });
});

test('live: delegated preferences request relevant app permission and review each sample-based suggestion', live, async context => {
  await withChat(context, async send => {
    const budget = await send(`Plan Chicago for just me from May 8-10, ${year}. Do not include flights.`);
    preferenceQuestion(budget, /budget|spend/i, 'budget');
    assert.match(budget.text, /currency|amount|total|per person|per day|USD|\$/i);
    const bankPermission = await send('Choose for me');
    assert.equal(bankPermission.presentation?.question?.mode, 'permission');
    assert.equal(bankPermission.presentation?.question?.app, 'bank');
    assert.equal(bankPermission.appRead, undefined);
    const proposal = await send('Allow demo Bank access. Please read its sample data and suggest budget for my review.', undefined, { bank: 'granted' });
    const budgetSuggestion = appProposal(proposal, 'bank', 'budget');
    assert.ok(proposal.appRead?.data.app === 'bank');
    assert.equal(proposal.appRead.data.travelFund, 1250);
    assert.doesNotMatch(proposal.text, /you usually spend|your spending history|I (?:checked|reviewed) your bank/i);
    const accepted = await send(`Use budget: ${budgetSuggestion}`);
    preferenceQuestion(accepted, /activit|interest/i, 'activities');
    assert.match(accepted.text, /museum|art|outdoor|walk|music|jazz|architect|sightsee|relax|tour|culture|sport|shopping|adventur|nightlife|pace/i);
    assert.ok(accepted.presentation?.preferences.some(value => value.kind === 'budget'));
    const mapsPermission = await send('No');
    assert.equal(mapsPermission.presentation?.question?.mode, 'permission');
    assert.equal(mapsPermission.presentation?.question?.app, 'maps');
    assert.equal(mapsPermission.appRead, undefined);
    const activitiesProposal = await send('Allow demo Maps access. Please read its sample data and suggest activities for my review.', undefined, { maps: 'granted' });
    const activitiesSuggestion = appProposal(activitiesProposal, 'maps', 'activities');
    const food = await send(`Use activities: ${activitiesSuggestion}`);
    preferenceQuestion(food, /food|eat|dining|diet|cuisine/i, 'food');
    assert.match(food.text, /cuisine|diet|vegetarian|vegan|allerg|restriction|local|restaurant/i);
    assert.equal(food.presentation?.preferences.find(value => value.kind === 'activities')?.source, 'siri');
    const foodProposal = await send('No preference');
    const foodSuggestion = appProposal(foodProposal, 'maps', 'food');
    const lodging = await send(`Use food: ${foodSuggestion}`);
    preferenceQuestion(lodging, /lodging|stay|hotel|accommodation/i, 'lodging');
    assert.match(lodging.text, /hotel|rental|hostel|neighbou?rhood|area|location|downtown|accommodation type/i);
    assert.equal(lodging.presentation?.preferences.find(value => value.kind === 'food')?.source, 'siri');
    const hints = [budget, accepted, food, lodging].map(reply => reply.presentation?.question?.inputPlaceholder);
    for (const hint of hints) {
      assert.ok(typeof hint === 'string' && hint.trim().length > 0 && hint.length <= 32, 'Typed questions need a short contextual example.');
    }
    assert.equal(new Set(hints).size, 4, 'Different preference categories must not reuse a generic field hint.');
    const lodgingProposal = await send('No');
    const lodgingSuggestion = appProposal(lodgingProposal, 'maps', 'lodging');
    const plan = await send(`Use lodging: ${lodgingSuggestion}`);
    assert.equal(plan.presentation?.question, null);
    tripContent(plan);
    completeTripPreferences(plan);
    assert.equal(plan.presentation?.preferences.find(value => value.kind === 'lodging')?.source, 'siri');
  });
});

test('live: denied Bank access produces a general suggestion without reading or asking again', live, async context => {
  await withChat(context, async send => {
    await send(`Plan Chicago for just me from May 8-10, ${year}. Do not include flights.`);
    const permission = await send('No preference');
    assert.equal(permission.presentation?.question?.app, 'bank');
    assert.equal(permission.presentation?.question?.mode, 'permission');
    assert.equal(permission.appRead, undefined);
    const suggestion = await send('Do not allow demo Bank access. Offer a general budget suggestion without app data instead.', undefined, { bank: 'denied' });
    assert.equal(suggestion.appRead, undefined);
    assert.equal(suggestion.presentation?.question?.mode, 'proposal');
    assert.ok(!suggestion.presentation?.question?.app);
    assert.ok(suggestion.presentation?.question?.suggestion?.trim(), 'The general estimate must provide a concrete value for review.');
    assert.doesNotMatch(suggestion.text, /I (?:checked|read|reviewed) (?:your|the) bank|your (?:balance|spending history)/i);
  });
});

test('live: demo Calendar permission precedes reading and selection, with approval still required', live, async context => {
  await withChat(context, async send => {
    const initial = await send('I want to plan a trip to Chicago');
    preferenceQuestion(initial, /dates|when/i, 'dates');
    assert.equal(initial.presentation?.question?.mode, 'ask');
    assert.equal(initial.calendarRead, undefined);
    const permission = await send('No');
    assert.equal(permission.presentation?.question?.mode, 'permission');
    assert.equal(permission.calendarRead, undefined);
    const proposed = await send('Allow demo Calendar access. Please open it and choose dates using its sample events.', 'granted');
    preferenceQuestion(proposed, /demo|sample|calendar/i, 'dates');
    assert.equal(proposed.presentation?.question?.mode, 'proposal');
    assert.equal(proposed.presentation?.preferences.some(value => value.kind === 'dates'), false);
    assert.ok(proposed.calendarRead);
    const range = parseDateSelection(proposed.presentation?.question?.selection);
    assert.ok(range);
    assert.equal(isDemoRangeAvailable(proposed.calendarRead, range), true);
    const confirmed = await send(`Dates: ${formatRange(range)}`);
    assert.equal(confirmed.presentation?.question?.kind, 'budget');
    assert.ok(confirmed.presentation?.preferences.some(value => value.kind === 'dates'));
  });
});

test('live: denying demo Calendar permission does not read data or ask for access again', live, async context => {
  await withChat(context, async send => {
    await send('I want to plan a trip to Chicago');
    const permission = await send('No');
    assert.equal(permission.presentation?.question?.mode, 'permission');
    const declined = await send('Do not allow demo Calendar access.', 'denied');
    assert.equal(declined.calendarRead, undefined);
    assert.notEqual(declined.presentation?.question?.mode, 'permission');
    assert.notEqual(declined.presentation?.question?.mode, 'proposal');
  });
});
