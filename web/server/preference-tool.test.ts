import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreferenceTool, PREFERENCE_TOOL_INSTRUCTIONS } from './preference-tool.ts';
import type { PreferencePresentation } from '../src/preferences.ts';

test('the display-only tool validates model data before presenting a preference card', () => {
  const shown: PreferencePresentation[] = [];
  const tool = createPreferenceTool(value => shown.push(value));
  assert.ok(tool.handler);
  assert.equal(tool.skipPermission, true);
  assert.equal(tool.defer, 'never');
  const value: PreferencePresentation = {
    question: {
      kind: 'budget', label: 'Budget', mode: 'ask', text: 'What total trip budget and currency do you have in mind?',
      inputPlaceholder: 'e.g., $1,200 USD',
    },
    preferences: [],
  };
  const invocation = { sessionId: 'test', toolCallId: 'test-call', toolName: tool.name, arguments: value };
  tool.handler(value, invocation);
  assert.deepEqual(shown, [value]);
  const handler = tool.handler;
  assert.throws(() => handler({ ...value, question: { kind: 'read_file' } }, invocation), TypeError);
  assert.throws(() => handler({ ...value, question: { ...value.question, inputPlaceholder: 42 } }, invocation), TypeError);
  assert.equal(shown.length, 1);
});

test('question guidance distinguishes categories while keeping inline answers user-led', () => {
  assert.match(PREFERENCE_TOOL_INSTRUCTIONS, /Name the category in the question itself/);
  assert.match(PREFERENCE_TOOL_INSTRUCTIONS, /For activities, ask about interests or pace/);
  assert.match(PREFERENCE_TOOL_INSTRUCTIONS, /For food, ask about favorite cuisines and dietary needs/);
  assert.match(PREFERENCE_TOOL_INSTRUCTIONS, /For lodging, ask about accommodation type and location/);
  assert.match(PREFERENCE_TOOL_INSTRUCTIONS, /For budget, ask about the amount and currency/);
  assert.match(PREFERENCE_TOOL_INSTRUCTIONS, /Tailor it to the current question, including known constraints/);
  assert.match(PREFERENCE_TOOL_INSTRUCTIONS, /editable inline field/);
  assert.doesNotMatch(PREFERENCE_TOOL_INSTRUCTIONS, /only focuses the composer/);
});

test('completed trip output supplies booking actions and itinerary metadata without reserving anything', () => {
  const shown: PreferencePresentation[] = [];
  const failures: string[] = [];
  const tool = createPreferenceTool(value => shown.push(value), reason => failures.push(reason));
  assert.ok(tool.handler);
  const value: PreferencePresentation = {
    question: null, planType: 'trip', preferences: [],
    trip: {
      destination: 'Portland', summary: 'A relaxed flexible weekend.',
      itinerary: [{ title: 'Day 1', activities: ['Explore gardens and a local cafe.'] }],
    },
  };
  const invocation = { sessionId: 'test', toolCallId: 'trip-call', toolName: tool.name, arguments: value };
  const result = tool.handler(value, invocation);
  assert.deepEqual(shown, [value]);
  assert.deepEqual(result, {
    resultType: 'success',
    textResultForLlm: 'The trip card, demo offer options, and itinerary are ready. Nothing is booked. Reply only with this summary: A relaxed flexible weekend.',
  });
  const handler = tool.handler;
  assert.throws(() => handler({ ...value, trip: undefined }, invocation), TypeError);
  assert.throws(() => handler({ ...value, trip: { ...value.trip, itinerary: [] } }, invocation), TypeError);
  assert.equal(failures.length, 2);
  assert.equal(shown.length, 1);
  assert.match(PREFERENCE_TOOL_INSTRUCTIONS, /Book flight, Book hotel, and View itinerary/);
  assert.match(PREFERENCE_TOOL_INSTRUCTIONS, /Never infer a departure city/);
  assert.match(PREFERENCE_TOOL_INSTRUCTIONS, /no reservation is created/i);
});
