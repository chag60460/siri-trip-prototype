import { defineTool } from '@github/copilot-sdk';
import { availableDemoRanges, createDemoCalendar, isDemoRangeAvailable } from '../src/demo-calendar.ts';
import type { CalendarConsent, DemoCalendarData } from '../src/demo-calendar.ts';
import { dateSelection, parseDateSelection } from '../src/dates.ts';
import type { DateSelection } from '../src/dates.ts';

export const DEMO_CALENDAR_TOOL_NAME = 'read_demo_calendar';

export class DemoCalendarAccessError extends Error {}

export class DemoCalendarAccess {
  private decision: CalendarConsent | null = null;
  private snapshot: DemoCalendarData | null = null;

  get consent(): CalendarConsent | null { return this.decision; }

  setConsent(decision: CalendarConsent) {
    this.decision = decision;
    if (decision === 'denied') this.snapshot = null;
  }

  read(today: number): DemoCalendarData {
    if (this.decision !== 'granted') {
      throw new DemoCalendarAccessError(this.decision === 'denied'
        ? 'The user denied demo Calendar access. Do not read it or ask again. Offer manual dates or flexible dates instead.'
        : 'Ask permission to open the demo Calendar first. Use present_preferences with a dates permission question; wait for the user to allow access.');
    }
    this.snapshot = createDemoCalendar(today);
    return this.snapshot;
  }

  validateSelection(selection: DateSelection | null | undefined, today: number): void {
    const range = parseDateSelection(selection);
    if (this.decision !== 'granted' || !this.snapshot) {
      throw new DemoCalendarAccessError('Before choosing dates, obtain demo Calendar permission and call read_demo_calendar. Do not invent availability.');
    }
    if (!range || range.start < today || !isDemoRangeAvailable(this.snapshot, range)) {
      throw new DemoCalendarAccessError('Choose an ordered future range inside the demo calendar coverage, with no sample events on any selected day. Use an availableRanges result from read_demo_calendar.');
    }
  }
}

export function runDemoCalendarTool(value: unknown, read: () => DemoCalendarData): string {
  if (typeof value !== 'object' || value === null || !('days' in value)
    || typeof value.days !== 'number' || !Number.isInteger(value.days) || value.days < 1 || value.days > 21) {
    throw new TypeError('Specify between 1 and 21 consecutive days.');
  }
  const calendar = read();
  return JSON.stringify({
    source: 'demo calendar - synthetic events only, never personal availability',
    coverage: dateSelection({ start: calendar.today, end: calendar.end }),
    days: value.days,
    events: calendar.events.filter(event => event.date >= calendar.today).map(event => ({
      date: dateSelection({ start: event.date, end: event.date }).start,
      title: event.title, startTime: event.startTime, endTime: event.endTime, allDay: event.allDay,
    })),
    availableRanges: availableDemoRanges(calendar, value.days),
    rule: 'A travel day is available only when it has no demo events. Choose a returned range, explain the choice, and call present_preferences with a dates proposal and selection={start,end}. Do not confirm dates until the user approves. If no range fits, ask about changing the duration.',
  });
}

export function createDemoCalendarTool(read: () => DemoCalendarData) {
  return defineTool(DEMO_CALENDAR_TOOL_NAME, {
    description: 'Read only the synthetic events in the demo Calendar after the user explicitly allows access. Never reads real calendars or accounts. Returns conflict-free date ranges.',
    skipPermission: true,
    defer: 'never',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 21, description: 'Desired consecutive full days. Use 3 for an initial proposal if the user has not specified a duration.' },
      },
      required: ['days'],
    },
    handler: value => ({ resultType: 'success', textResultForLlm: runDemoCalendarTool(value, read) }),
  });
}
