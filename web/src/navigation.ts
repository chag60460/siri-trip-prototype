export const screens = ['siri', 'today', 'home'] as const;
export type Screen = typeof screens[number];

export const screenNames: Record<Screen, string> = {
  siri: 'Siri', today: 'Today', home: 'Home',
};

export function swipeAxis(x: number, y: number): 'horizontal' | 'vertical' | null {
  if (Math.max(Math.abs(x), Math.abs(y)) <= 8) return null;
  return Math.abs(x) > Math.abs(y) * 1.15 ? 'horizontal' : 'vertical';
}

export function screenAfterSwipe(screen: Screen, distance: number, velocity: number, width: number): Screen {
  if (![distance, velocity, width].every(Number.isFinite) || width <= 0) {
    throw new RangeError('Swipe measurements must be finite, with a positive page width.');
  }
  const farEnough = Math.abs(distance) >= width * 0.22;
  const flick = Math.abs(distance) >= 40 && Math.abs(velocity) >= 0.5
    && Math.sign(distance) === Math.sign(velocity);
  if (!farEnough && !flick) return screen;
  return screens[screens.indexOf(screen) - Math.sign(distance)] ?? screen;
}
