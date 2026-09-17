import assert from 'node:assert/strict';
import test from 'node:test';
import { isChatEvent } from './chat-protocol.ts';
import { acceptedPreferenceProposal, changedPreferences, hasUnconfirmedAnswer, isPreferencePresentation, preferenceChoices, preferenceInputPlaceholder, preferenceKinds, preferenceSummary, preservePreferenceSources } from './preferences.ts';
import type { PreferencePresentation, PreferenceQuestion, PreferenceValue } from './preferences.ts';

const dates: PreferenceValue = { kind: 'dates', label: 'Dates', value: 'Oct 2 - 4, 2026', source: 'user' };
const budget: PreferenceValue = { kind: 'budget', label: 'Budget', value: '$900 USD', source: 'user' };
const question: PreferenceQuestion = { kind: 'dates', label: 'Dates', mode: 'ask', text: 'Do you have preferred dates?' };
const presentation: PreferencePresentation = { question, preferences: [] };

test('High-Fi controls distinguish choosing dates, typing, delegating, and confirming proposals', () => {
  assert.deepEqual(preferenceChoices(question).map(choice => [choice.action, choice.label]), [
    ['calendar', 'Yes'], ['delegate', 'No'],
  ]);
  assert.deepEqual(preferenceChoices({ ...question, kind: 'budget' }).map(choice => choice.label),
    ['Type your preference', 'Choose for me']);
  for (const kind of ['activities', 'food', 'lodging'] as const) {
    assert.deepEqual(preferenceChoices({ ...question, kind }).map(choice => choice.label),
      ['Type your preference', 'No']);
  }
  assert.deepEqual(preferenceChoices({ ...question, kind: 'other' }).map(choice => choice.label),
    ['Type your preference', 'Choose for me']);
  assert.deepEqual(preferenceChoices({ ...question, mode: 'proposal' }).map(choice => choice.action),
    ['accept', 'decline']);
  assert.deepEqual(preferenceChoices({ ...question, kind: 'budget', mode: 'proposal' }).map(choice => choice.action),
    ['accept', 'decline']);
});

test('every preference card uses exactly one context-appropriate pair of actions', () => {
  const pairs = ['Yes|No', 'Type your preference|No', 'Type your preference|Choose for me'];
  for (const kind of preferenceKinds) {
    for (const mode of ['ask', 'proposal'] as const) {
      const choices = preferenceChoices({ ...question, kind, mode });
      assert.equal(choices.length, 2);
      assert.ok(pairs.includes(choices.map(choice => choice.label).join('|')));
    }
  }
});

test('inline examples distinguish categories and allow question-specific hints without setting answers', () => {
  const examples: [PreferenceQuestion['kind'], string][] = [
    ['budget', 'e.g., $1,500 USD'],
    ['activities', 'e.g., museums, hiking'],
    ['food', 'e.g., Thai, vegetarian'],
    ['lodging', 'e.g., a downtown hotel'],
  ];
  for (const [kind, expected] of examples) {
    assert.equal(preferenceInputPlaceholder({ ...question, kind }), expected);
    assert.equal(preferenceInputPlaceholder({ ...question, kind, inputPlaceholder: null }), expected);
  }
  const duration: PreferenceQuestion = { ...question, kind: 'other', label: 'Duration' };
  assert.equal(preferenceInputPlaceholder(duration), 'Your duration');
  assert.equal(preferenceInputPlaceholder({ ...duration, inputPlaceholder: 'e.g., 20 minutes' }), 'e.g., 20 minutes');
  const food = { ...question, kind: 'food', inputPlaceholder: 'e.g., Thai or Mexican' } as const;
  assert.equal(preferenceInputPlaceholder(food), food.inputPlaceholder);
  assert.equal(isChatEvent({ type: 'done', text: food.text, presentation: { question: food, preferences: [] } }), true);
  assert.deepEqual(presentation.preferences, []);
});

test('preference metadata is bounded, validated, and unique before reaching the UI', () => {
  assert.equal(isPreferencePresentation(presentation), true);
  assert.equal(isPreferencePresentation({ question: null, preferences: [dates, budget] }), true);
  for (const value of [
    null, {}, { ...presentation, question: undefined },
    { ...presentation, question: { ...question, kind: 'execute_command' } },
    { ...presentation, question: { ...question, text: '' } },
    { ...presentation, question: { ...question, mode: 'execute' } },
    ...[42, '', '   ', 'x'.repeat(33)].map(inputPlaceholder => ({
      ...presentation, question: { ...question, inputPlaceholder },
    })),
    { ...presentation, preferences: [dates, dates] },
    { ...presentation, preferences: [{ ...dates, source: 'bank-account' }] },
    { ...presentation, preferences: [{ ...dates, value: 'x'.repeat(241) }] },
  ]) assert.equal(isPreferencePresentation(value), false);
  assert.equal(isChatEvent({ type: 'done', text: question.text, presentation }), true);
  assert.equal(isChatEvent({ type: 'done', text: 'Invalid card', presentation: { ...presentation, question: {} } }), false);
});

test('Calendar permission is date-only and date proposals require real structured ranges', () => {
  assert.equal(isPreferencePresentation({ ...presentation, question: { ...question, mode: 'permission' } }), true);
  assert.equal(isPreferencePresentation({ ...presentation, question: { ...question, kind: 'budget', mode: 'permission' } }), false);
  assert.equal(isPreferencePresentation({ ...presentation, question: { ...question, mode: 'proposal' } }), false);
  assert.equal(isPreferencePresentation({
    ...presentation,
    question: { ...question, mode: 'proposal', selection: { start: '2026-09-19', end: '2026-09-21' } },
  }), true);
  assert.equal(isPreferencePresentation({
    ...presentation,
    question: { ...question, mode: 'proposal', selection: { start: '2026-09-21', end: '2026-09-19' } },
  }), false);
  assert.deepEqual(preferenceChoices({ ...question, mode: 'permission' }).map(choice => choice.action), ['allow-calendar', 'deny-calendar']);
});

test('Bank and Maps permission cards require the relevant app, and app proposals require a concrete value', () => {
  const bank = { ...question, kind: 'budget', mode: 'permission', app: 'bank' } as const;
  assert.equal(isPreferencePresentation({ question: bank, preferences: [] }), true);
  assert.deepEqual(preferenceChoices(bank).map(choice => choice.action), ['allow-app', 'deny-app']);
  for (const kind of ['activities', 'food', 'lodging'] as const) {
    assert.equal(isPreferencePresentation({ question: { ...bank, kind, app: 'maps' }, preferences: [] }), true);
  }
  for (const invalid of [
    { ...bank, app: 'files' }, { ...bank, app: 'maps' }, { ...bank, kind: 'dates' }, { ...bank, kind: 'other' },
    { ...bank, mode: 'ask' }, { ...bank, mode: 'proposal' },
    { ...bank, mode: 'proposal', suggestion: '' }, { ...bank, mode: 'proposal', suggestion: 'x'.repeat(241) },
  ]) assert.equal(isPreferencePresentation({ question: invalid, preferences: [] }), false);
  const proposed = { ...bank, mode: 'proposal', suggestion: '$900 USD total' } as const;
  assert.equal(isPreferencePresentation({ question: proposed, preferences: [] }), true);
  assert.deepEqual(preferenceChoices(proposed).map(choice => choice.label), ['Yes', 'No']);
  assert.equal(hasUnconfirmedAnswer({
    question: proposed, preferences: [{ kind: 'budget', label: 'Budget', source: 'siri', value: '$900 USD total' }],
  }, []), true);
});

test('confirmation bubbles contain only newly supplied or changed preferences', () => {
  assert.deepEqual(changedPreferences([dates], [dates, budget]), [budget]);
  assert.deepEqual(changedPreferences([dates, budget], [dates, budget]), []);
  const revised = { ...budget, value: '$1,200 USD' };
  assert.deepEqual(changedPreferences([dates, budget], [dates, revised]), [revised]);
  assert.equal(preferenceSummary(dates), 'Set dates Oct 2 - 4, 2026');
  assert.equal(preferenceSummary(budget), 'Set budget as $900 USD');
  assert.equal(preferenceSummary({ kind: 'activities', label: 'Activities', value: 'Delegate', source: 'siri' }), "Activities: Siri's picks");
});

test('questions cannot confirm their own unanswered or proposed preference', () => {
  const askingBudget = { kind: 'budget', label: 'Budget', mode: 'ask', text: 'What is your budget?' } as const;
  assert.equal(hasUnconfirmedAnswer({ question: askingBudget, preferences: [dates] }, []), false);
  assert.equal(hasUnconfirmedAnswer({ question: askingBudget, preferences: [dates, budget] }, [dates]), true);
  assert.equal(hasUnconfirmedAnswer({ question: askingBudget, preferences: [{ ...budget, value: 'Excluding flights' }] }, []), true);
  const proposingBudget = { ...askingBudget, mode: 'proposal' } as const;
  assert.equal(hasUnconfirmedAnswer({ question: proposingBudget, preferences: [budget] }, [budget]), false);
  assert.equal(hasUnconfirmedAnswer({ question: proposingBudget, preferences: [{ ...budget, value: '$1,200' }] }, [budget]), true);
  assert.equal(hasUnconfirmedAnswer({ question: null, preferences: [budget] }, []), false);
});

test('non-travel goals can retain several independently named preferences', () => {
  const values: PreferenceValue[] = [
    { kind: 'other', label: 'Duration', value: '20 minutes', source: 'user' },
    { kind: 'other', label: 'Materials', value: 'Blue and yellow paint', source: 'user' },
  ];
  assert.equal(isPreferencePresentation({ question: null, preferences: values }), true);
  assert.equal(isPreferencePresentation({ question: null, preferences: [...values, { ...values[0], label: 'duration' }] }), false);
});

test('approving a known suggestion preserves its actual value and Siri provenance', () => {
  const proposed: PreferenceQuestion = {
    kind: 'activities', label: 'Activities', mode: 'proposal', app: 'maps',
    text: 'Use these demo-inspired activities?', suggestion: 'Museums and river walks',
  };
  const approved = acceptedPreferenceProposal(proposed, 'Use activities: Museums and river walks');
  assert.deepEqual(approved, { kind: 'activities', label: 'Activities', value: 'Museums and river walks', source: 'siri' });
  assert.deepEqual(acceptedPreferenceProposal(proposed, 'Yes'), approved);
  assert.equal(acceptedPreferenceProposal(proposed, 'Yes, but skip museums'), null);
  assert.equal(acceptedPreferenceProposal(proposed, 'Use activities: Hiking'), null);
  assert.equal(acceptedPreferenceProposal({ ...proposed, mode: 'ask' }, 'Yes'), null);
  const incoming: PreferencePresentation = {
    question: { kind: 'food', label: 'Food', mode: 'ask', text: 'Any food preferences?' },
    preferences: [{ kind: 'activities', label: 'Activities', value: 'Incorrect retelling', source: 'user' }],
  };
  const corrected = preservePreferenceSources(incoming, [], approved);
  assert.deepEqual(corrected.preferences, [approved]);
  assert.equal(incoming.preferences[0]?.value, 'Incorrect retelling');
  const later = preservePreferenceSources({
    question: null, preferences: [{ kind: 'activities', label: 'Activities', value: 'Museums and river walks', source: 'user' }],
  }, corrected.preferences, null);
  assert.equal(later.preferences[0]?.source, 'siri');
  const edited = preservePreferenceSources({
    question: null, preferences: [{ kind: 'activities', label: 'Activities', value: 'Hiking instead', source: 'user' }],
  }, corrected.preferences, null);
  assert.equal(edited.preferences[0]?.source, 'user');
});

test('an unchanged suggested date range is Siri-picked, while a manually edited range is not', () => {
  const proposed: PreferenceQuestion = {
    kind: 'dates', label: 'Dates', mode: 'proposal', text: 'Use these dates?',
    selection: { start: '2027-05-08', end: '2027-05-10' },
  };
  assert.equal(acceptedPreferenceProposal(proposed, 'Dates: May 8 - May 10, 2027')?.source, 'siri');
  assert.equal(acceptedPreferenceProposal(proposed, 'Dates: May 9 - May 11, 2027'), null);
});
