import { DAY, dateSelection, validRange } from './dates.ts';
import type { DateRange, DateSelection } from './dates.ts';

export type CalendarConsent = 'granted' | 'denied';

export interface DemoCalendarEvent {
  id: string;
  date: number;
  title: string;
  startTime: string;
  endTime: string;
  calendar: 'Work' | 'Personal';
  allDay: boolean;
}

export interface DemoCalendarData {
  source: 'demo';
  today: number;
  start: number;
  end: number;
  events: DemoCalendarEvent[];
}

export function createDemoCalendar(today: number): DemoCalendarData {
  if (!validRange({ start: today, end: today })) throw new RangeError('A valid current calendar day is required.');
  const start = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
  const events: DemoCalendarEvent[] = [];
  for (let week = 0; week < 8; week += 1) {
    const monday = start + week * 7 * DAY;
    events.push(
      { id: `workshop-${week}`, date: monday + 2 * DAY, title: 'Team workshop', startTime: '10:00 AM', endTime: '11:30 AM', calendar: 'Work', allDay: false },
      { id: `review-${week}`, date: monday + 4 * DAY, title: 'Project review', startTime: '2:00 PM', endTime: '3:00 PM', calendar: 'Work', allDay: false },
    );
    if (week % 3 === 0) {
      events.push({ id: `family-${week}`, date: monday + 5 * DAY, title: 'Family visit', startTime: 'All day', endTime: '', calendar: 'Personal', allDay: true });
    }
    if (week % 3 === 1) {
      events.push({ id: `appointment-${week}`, date: monday + DAY, title: 'Personal appointment', startTime: '9:00 AM', endTime: '10:00 AM', calendar: 'Personal', allDay: false });
    }
  }
  return { source: 'demo', today, start, end: start + 55 * DAY, events: events.sort((one, two) => one.date - two.date) };
}

export function isDemoRangeAvailable(calendar: DemoCalendarData, range: DateRange): boolean {
  return validRange(range) && range.start >= calendar.today && range.end <= calendar.end
    && !calendar.events.some(event => event.date >= range.start && event.date <= range.end);
}

export function availableDemoRanges(calendar: DemoCalendarData, days: number): DateSelection[] {
  if (!Number.isInteger(days) || days < 1 || days > 21) throw new RangeError('Choose between 1 and 21 whole days.');
  const ranges: DateSelection[] = [];
  for (let start = calendar.today; start + (days - 1) * DAY <= calendar.end; start += DAY) {
    const range = { start, end: start + (days - 1) * DAY };
    if (isDemoRangeAvailable(calendar, range)) ranges.push(dateSelection(range));
  }
  return ranges.slice(0, 12);
}

export function isDemoCalendarData(value: unknown): value is DemoCalendarData {
  if (typeof value !== 'object' || value === null || !('source' in value) || value.source !== 'demo'
    || !('today' in value) || typeof value.today !== 'number'
    || !('start' in value) || typeof value.start !== 'number'
    || !('end' in value) || typeof value.end !== 'number'
    || !validRange({ start: value.start, end: value.end })
    || !validRange({ start: value.today, end: value.today })
    || value.today < value.start || value.today > value.end || value.end - value.start > 90 * DAY
    || !('events' in value) || !Array.isArray(value.events) || value.events.length > 100) return false;
  return value.events.every((event: unknown) => typeof event === 'object' && event !== null
    && 'id' in event && typeof event.id === 'string' && event.id.length <= 60
    && 'date' in event && typeof event.date === 'number' && validRange({ start: event.date, end: event.date })
    && 'title' in event && typeof event.title === 'string' && event.title.length <= 100
    && 'startTime' in event && typeof event.startTime === 'string' && event.startTime.length <= 20
    && 'endTime' in event && typeof event.endTime === 'string' && event.endTime.length <= 20
    && 'calendar' in event && (event.calendar === 'Work' || event.calendar === 'Personal')
    && 'allDay' in event && typeof event.allDay === 'boolean');
}
