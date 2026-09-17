import assert from 'node:assert/strict';
import test from 'node:test';
import { screenAfterSwipe, screens, swipeAxis } from './navigation.ts';

test('Today and Home sit to the right of Siri', () => {
  assert.deepEqual(screens, ['siri', 'today', 'home']);
});

test('rightward drags enter Today and Siri; leftward drags return home', () => {
  assert.equal(screenAfterSwipe('home', 150, 0, 402), 'today');
  assert.equal(screenAfterSwipe('today', 150, 0, 402), 'siri');
  assert.equal(screenAfterSwipe('siri', -150, 0, 402), 'today');
  assert.equal(screenAfterSwipe('today', -150, 0, 402), 'home');
});

test('swipes move only one page and never wrap around the boundaries', () => {
  assert.equal(screenAfterSwipe('home', 1000, 4, 402), 'today');
  assert.equal(screenAfterSwipe('home', -300, -4, 402), 'home');
  assert.equal(screenAfterSwipe('siri', 300, 4, 402), 'siri');
});

test('small drags snap back, while deliberate flicks can change pages', () => {
  assert.equal(screenAfterSwipe('home', 20, 2, 402), 'home');
  assert.equal(screenAfterSwipe('home', 60, 0.1, 402), 'home');
  assert.equal(screenAfterSwipe('home', 60, 0.8, 402), 'today');
  assert.equal(screenAfterSwipe('home', 60, -0.8, 402), 'home');
});

test('vertical scrolling and taps do not lock a horizontal swipe', () => {
  assert.equal(swipeAxis(4, 5), null);
  assert.equal(swipeAxis(18, 2), 'horizontal');
  assert.equal(swipeAxis(3, -22), 'vertical');
  assert.equal(swipeAxis(11, 11), 'vertical');
});

test('invalid swipe measurements are rejected', () => {
  assert.throws(() => screenAfterSwipe('home', 50, 1, 0), RangeError);
  assert.throws(() => screenAfterSwipe('home', Number.NaN, 1, 402), RangeError);
});
