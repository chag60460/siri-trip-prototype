import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Icon } from './Icons.tsx';
import { DAY, dayCount, formatRange, monthDays, validRange } from './dates.ts';
import type { DateRange } from './dates.ts';
import { isDemoRangeAvailable } from './demo-calendar.ts';
import type { DemoCalendarData, DemoCalendarEvent } from './demo-calendar.ts';
import './demo-calendar.css';

export interface DemoCalendarViewProps {
  calendar: DemoCalendarData;
  mode: 'browse' | 'select' | 'agent';
  initialRange: DateRange | null;
  suggestedRange: DateRange | null;
  busy: boolean;
  activity: 'idle' | 'reading' | 'proposed';
  proposalText?: string;
  error?: string;
  returnLabel: string;
  onUse: (range: DateRange) => void;
  onClose: () => void;
}

const fullDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});
const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
const agendaDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function DemoCalendarView({
  calendar, mode, initialRange, suggestedRange, busy, activity, proposalText, error,
  returnLabel, onUse, onClose,
}: DemoCalendarViewProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingDayFocus = useRef<number | null>(null);
  const pendingProposalScroll = useRef<number | null>(null);
  const planning = mode !== 'browse';
  const suggestedStart = suggestedRange?.start ?? null;
  const suggestedEnd = suggestedRange?.end ?? null;
  const validSuggestion = mode === 'agent' && suggestedRange !== null
    && validRange(suggestedRange) && suggestedRange.start >= calendar.today;
  const preset = planning
    ? validSuggestion ? suggestedRange
      : initialRange && validRange(initialRange) && initialRange.start >= calendar.today ? initialRange : null
    : null;
  const [selection, setSelection] = useState<{ start: number | null; end: number | null }>(() => ({
    start: preset?.start ?? null, end: preset?.end ?? null,
  }));
  const [inspectedDay, setInspectedDay] = useState(preset?.start ?? calendar.today);

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]',
      )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled')
        && element.getClientRects().length > 0);
      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
      } else if (!targets.some(element => element === active)
        || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  useEffect(() => {
    if (mode !== 'agent' || suggestedStart === null || suggestedEnd === null) return;
    const proposal = { start: suggestedStart, end: suggestedEnd };
    if (!validRange(proposal) || proposal.start < calendar.today) return;
    pendingProposalScroll.current = proposal.start;
    setSelection(proposal);
    setInspectedDay(proposal.start);
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    // Depend on dates, not the proposal object's identity, to preserve manual edits.
  }, [mode, suggestedStart, suggestedEnd, calendar.today]);

  useEffect(() => {
    const day = pendingDayFocus.current;
    if (day === null) return;
    dialogRef.current?.querySelector<HTMLButtonElement>(`[data-demo-day="${day}"]`)?.focus();
    pendingDayFocus.current = null;
  }, [inspectedDay]);

  useEffect(() => {
    const day = pendingProposalScroll.current;
    if (day === null || day !== inspectedDay) return;
    dialogRef.current?.querySelector<HTMLButtonElement>(`[data-demo-day="${day}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    pendingProposalScroll.current = null;
  }, [inspectedDay, selection.start, selection.end, suggestedStart, suggestedEnd]);

  const eventsByDay = useMemo(() => {
    const result = new Map<number, DemoCalendarEvent[]>();
    for (const event of calendar.events) {
      const events = result.get(event.date) ?? [];
      events.push(event);
      result.set(event.date, events);
    }
    return result;
  }, [calendar.events]);
  const date = new Date(inspectedDay);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const days = monthDays(year, month);
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => days[week * 7 + day] ?? null));
  const coverage = { start: calendar.start, end: calendar.end };
  const monthOutsideCoverage = Date.UTC(year, month, 1) < calendar.start
    || Date.UTC(year, month + 1, 0) > calendar.end;
  const dayCovered = inspectedDay >= calendar.start && inspectedDay <= calendar.end;
  const dayEvents = eventsByDay.get(inspectedDay) ?? [];
  const highlightedRange = planning && selection.start !== null
    ? { start: selection.start, end: selection.end ?? selection.start } : null;
  const selectedRange = highlightedRange && selection.end !== null
    && validRange(highlightedRange) && highlightedRange.start >= calendar.today ? highlightedRange : null;
  const outsideCoverage = highlightedRange !== null
    && (highlightedRange.start < calendar.start || highlightedRange.end > calendar.end);
  const overlappingEvents = highlightedRange
    ? calendar.events.filter(event => event.date >= highlightedRange.start && event.date <= highlightedRange.end)
    : [];
  const sampleClear = selectedRange !== null && !outsideCoverage && isDemoRangeAvailable(calendar, selectedRange);
  const matchesSuggestion = validSuggestion && selectedRange !== null
    && selectedRange.start === suggestedStart && selectedRange.end === suggestedEnd;
  const reading = mode === 'agent' && busy && activity === 'reading';
  const reviewEvents = reading
    ? calendar.events.filter(event => event.date >= calendar.today).sort((one, two) => one.date - two.date).slice(0, 2)
    : [];
  const displayedError = error || (mode === 'agent' && suggestedRange !== null && !validSuggestion
    ? 'The demo proposal is not a valid future date range. Choose dates manually or return to Siri.' : '');
  const rangeWarning = [
    overlappingEvents.length > 0
      ? `Overlaps ${overlappingEvents.length} sample event${overlappingEvents.length === 1 ? '' : 's'}.` : '',
    outsideCoverage ? 'Sample availability is not provided for all of these dates.' : '',
  ].filter(Boolean).join(' ');
  const rangeStatus = rangeWarning || (sampleClear ? 'No sample events on these dates. Demo only.' : '');
  const guidance = busy
    ? mode === 'agent' ? 'Wait for Siri, or use the back button to return.' : 'Please wait before selecting dates.'
    : selection.start !== null && selection.start < calendar.today ? 'Choose dates on or after today.'
      : selectedRange ? `${dayCount(selectedRange)} day${dayCount(selectedRange) === 1 ? '' : 's'} - Tap a date to start again.`
        : selection.start === null ? 'Choose a start date, then an end date.'
          : `Start: ${formatRange({ start: selection.start, end: selection.start }, true)}. Tap an end date, or the start again for one day.`;
  const useLabel = selectedRange ? `Use ${formatRange(selectedRange, true)}`
    : busy ? 'Waiting for dates...'
      : selection.start !== null && selection.start < calendar.today ? 'Choose future dates'
        : selection.start === null ? 'Choose a start date' : 'Choose an end date';
  const activityTitle = busy ? reading ? 'Reading sample availability' : 'Waiting for Siri'
    : validSuggestion ? matchesSuggestion ? "Review Siri's suggestion" : 'Adjust your trip dates'
      : 'Choose your trip dates';
  const activityDetail = busy
    ? reading ? `${calendar.events.length} synthetic events - ${formatRange(coverage)}`
      : 'Waiting for a demo date proposal. No real calendar is connected.'
    : matchesSuggestion && selectedRange
      ? `${formatRange(selectedRange, true)} - Demo suggestion only. Nothing is confirmed.`
      : 'Choose dates below. Nothing is confirmed until you press Use.';

  function inspectDay(day: number, moveFocus = false) {
    if (day === inspectedDay) return;
    if (moveFocus) pendingDayFocus.current = day;
    setInspectedDay(day);
  }

  function navigateMonth(offset: number, moveFocus = false) {
    const dates = monthDays(year, month + offset).filter((day): day is number => day !== null);
    const target = dates[Math.min(date.getUTCDate(), dates.length) - 1];
    if (target !== undefined) inspectDay(planning ? Math.max(calendar.today, target) : target, moveFocus);
  }

  function chooseDay(day: number) {
    if (planning && (busy || day < calendar.today)) return;
    inspectDay(day);
    if (!planning) return;
    setSelection(previous => previous.start === null || previous.end !== null || previous.start < calendar.today
      ? { start: day, end: null }
      : { start: Math.min(previous.start, day), end: Math.max(previous.start, day) });
  }

  function handleDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || (planning && busy)) return;
    const weekday = new Date(day).getUTCDay();
    const offsets: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday,
    };
    const offset = offsets[event.key];
    if (offset === undefined && event.key !== 'PageUp' && event.key !== 'PageDown') return;
    event.preventDefault();
    event.stopPropagation();
    if (offset !== undefined) {
      const target = day + offset * DAY;
      inspectDay(planning ? Math.max(calendar.today, target) : target, true);
    } else {
      navigateMonth((event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1), true);
    }
  }

  return <div ref={dialogRef} className={`demo-calendar demo-calendar--${mode}`}
    role="dialog" aria-modal="true" aria-label="Demo Calendar"
    aria-describedby={`${id}-disclaimer`} tabIndex={-1}>
    <header className="demo-calendar__header">
      <div className="demo-calendar__navigation">
        <button type="button" className="demo-calendar__back" aria-label={returnLabel} onClick={onClose}>
          <Icon name="chevron-left" />
          <span>{returnLabel}</span>
        </button>
        <button type="button" className="demo-calendar__today" onClick={() => {
          inspectDay(calendar.today);
          contentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
        }}>Today</button>
      </div>
      <div className="demo-calendar__title">
        <h1>Calendar</h1>
        <span className="demo-calendar__badge">Demo</span>
      </div>
      <p id={`${id}-disclaimer`} className="demo-calendar__disclaimer">
        Synthetic sample events. No real calendar access.
      </p>
    </header>

    {displayedError && <div className="demo-calendar__error" role="alert" tabIndex={0}>
      {displayedError}
    </div>}

    <div ref={contentRef} className="demo-calendar__content" tabIndex={0}
      role="region" aria-label="Calendar months and sample agenda">
      {mode === 'agent' && <section className={`demo-calendar__activity${busy ? ' demo-calendar__activity--busy' : ''}`}
        aria-label="Siri demo calendar activity">
        <div className="demo-calendar__activity-heading" role="status" aria-live="polite" aria-atomic="true">
          <span className="demo-calendar__activity-icon"><Icon name="sparkles" /></span>
          <div>
            <h2>{activityTitle}</h2>
            <p>{activityDetail}</p>
          </div>
        </div>
        {reviewEvents.length > 0 && <ul className="demo-calendar__review" aria-label="Examples of sample events being considered">
          {reviewEvents.map(event => <li key={event.id}>
            <span className={`demo-calendar__event-dot demo-calendar__event-dot--${event.calendar.toLowerCase()}`} aria-hidden="true" />
            <div>
              <strong>{event.title}</strong>
              <span>{formatRange({ start: event.date, end: event.date }, true)} - {event.calendar} - Sample</span>
            </div>
          </li>)}
        </ul>}
        {proposalText && <div className="demo-calendar__proposal" tabIndex={0}
          role="region" aria-label={matchesSuggestion ? "Siri's demo suggestion" : "Siri's original demo suggestion"}>
          <span>{matchesSuggestion ? "Siri's demo suggestion" : "Siri's original demo suggestion"}</span>
          <p>{proposalText}</p>
        </div>}
      </section>}

      <section className="demo-calendar__month" aria-labelledby={`${id}-month`}>
        <div className="demo-calendar__month-heading">
          <h2 id={`${id}-month`} aria-live="polite" aria-atomic="true">
            {monthName.format(inspectedDay)} <span>{year}</span>
          </h2>
          <div className="demo-calendar__month-actions">
            <button type="button" className="demo-calendar__month-button" aria-label="Previous month"
              disabled={planning && Date.UTC(year, month, 1) <= calendar.today}
              onClick={() => navigateMonth(-1)}><Icon name="chevron-left" /></button>
            <button type="button" className="demo-calendar__month-button" aria-label="Next month"
              onClick={() => navigateMonth(1)}><Icon name="chevron-right" /></button>
          </div>
        </div>
        <p id={`${id}-keyboard`} className="demo-calendar__sr-only">
          Use arrow keys to explore days, Page Up or Page Down to change months, and Enter or Space to
          {planning ? ' choose a start and end date. Choose the same day twice for one day.' : " show a day's sample events."}
        </p>
        <table className="demo-calendar__grid" role="grid" aria-labelledby={`${id}-month`}
          aria-describedby={`${id}-keyboard ${id}-coverage`} aria-multiselectable={planning}
          aria-busy={planning && busy}>
          <thead><tr>{weekdays.map(weekday => <th key={weekday} scope="col" aria-label={weekday}>
            {weekday.slice(0, 3)}
          </th>)}</tr></thead>
          <tbody>{weeks.map((week, weekIndex) => <tr key={weekIndex}>
            {week.map((day, dayIndex) => {
              if (day === null) return <td key={`empty-${dayIndex}`} role="gridcell" aria-hidden="true" />;
              const events = eventsByDay.get(day) ?? [];
              const covered = day >= calendar.start && day <= calendar.end;
              const selected = highlightedRange !== null && day >= highlightedRange.start && day <= highlightedRange.end;
              const start = selected && day === highlightedRange?.start;
              const end = selected && day === highlightedRange?.end;
              const inspected = day === inspectedDay;
              const description = [
                fullDate.format(day),
                day === calendar.today ? 'Today' : '',
                covered ? `${events.length} sample event${events.length === 1 ? '' : 's'}` : 'Outside sample coverage',
                selected ? selection.end === null ? 'Start date. Choose an end date'
                  : start && end ? 'Selected single day' : start ? 'Selected start date' : end ? 'Selected end date' : 'In selected range' : '',
                planning && day < calendar.today ? 'Past date. Cannot select for a trip' : '',
              ].filter(Boolean).join('. ');
              const className = [
                'demo-calendar__day',
                inspected ? 'demo-calendar__day--inspected' : '',
                selected ? 'demo-calendar__day--selected' : '',
                start ? 'demo-calendar__day--start' : '',
                end ? 'demo-calendar__day--end' : '',
                !covered ? 'demo-calendar__day--uncovered' : '',
              ].filter(Boolean).join(' ');
              return <td key={day} role="gridcell" aria-selected={planning ? selected : inspected}>
                <button type="button" className={className} data-demo-day={day}
                  aria-label={description} aria-current={day === calendar.today ? 'date' : undefined}
                  aria-pressed={planning ? selected : inspected}
                  tabIndex={inspected ? 0 : -1} disabled={planning && (busy || day < calendar.today)}
                  onClick={() => chooseDay(day)} onKeyDown={event => handleDayKeyDown(event, day)}>
                  <span className="demo-calendar__day-number">{new Date(day).getUTCDate()}</span>
                  <span className="demo-calendar__day-dots" aria-hidden="true">
                    {events.some(event => event.calendar === 'Work') && <i className="demo-calendar__event-dot demo-calendar__event-dot--work" />}
                    {events.some(event => event.calendar === 'Personal') && <i className="demo-calendar__event-dot demo-calendar__event-dot--personal" />}
                    {!covered && <i className="demo-calendar__uncovered-mark" />}
                  </span>
                </button>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
        <p id={`${id}-coverage`} className="demo-calendar__coverage">
          Sample coverage: {formatRange(coverage)}.
          {monthOutsideCoverage && ' A dash marks dates without sample availability.'}
        </p>
      </section>

      <section className="demo-calendar__agenda" aria-labelledby={`${id}-agenda`}>
        <div className="demo-calendar__agenda-heading">
          <div>
            <span className="demo-calendar__eyebrow">Sample agenda</span>
            <h2 id={`${id}-agenda`}>{inspectedDay === calendar.today ? 'Today' : "Day's events"}</h2>
          </div>
          <div className="demo-calendar__legend" aria-label="Sample calendars">
            <span><i className="demo-calendar__event-dot demo-calendar__event-dot--work" aria-hidden="true" />Work</span>
            <span><i className="demo-calendar__event-dot demo-calendar__event-dot--personal" aria-hidden="true" />Personal</span>
          </div>
        </div>
        <p className="demo-calendar__agenda-date">
          <time dateTime={new Date(inspectedDay).toISOString().slice(0, 10)}>{agendaDate.format(inspectedDay)}</time>
        </p>
        {!dayCovered && <p className="demo-calendar__day-notice">
          Sample availability is not provided for this date.
        </p>}
        {dayEvents.length > 0 ? <ul className="demo-calendar__events">
          {dayEvents.map(event => <li key={event.id} className={`demo-calendar__event demo-calendar__event--${event.calendar.toLowerCase()}`}>
            <div className="demo-calendar__event-time">
              <span>{event.allDay ? 'All day' : event.startTime}</span>
              {!event.allDay && event.endTime && <span><span className="demo-calendar__sr-only">to </span>{event.endTime}</span>}
            </div>
            <div className="demo-calendar__event-detail">
              <h3>{event.title}</h3>
              <p>{event.calendar} - Sample event</p>
            </div>
          </li>)}
        </ul> : <div className="demo-calendar__empty">
          <Icon name="calendar" />
          <div>
            <strong>{dayCovered ? 'No sample events' : 'Outside demo coverage'}</strong>
            <p>{dayCovered ? 'This demo does not reflect your real availability.' : 'A blank day here does not mean it is free.'}</p>
          </div>
        </div>}
      </section>
    </div>

    {planning && <footer className="demo-calendar__footer">
      <div className="demo-calendar__selection-summary">
        <div role="status" aria-live="polite" aria-atomic="true">
          <p id={`${id}-guidance`} className="demo-calendar__guidance">{guidance}</p>
          {rangeStatus && <p id={`${id}-range-status`}
            className={`demo-calendar__range-status${rangeWarning ? ' demo-calendar__range-status--warning' : ''}`}>{rangeStatus}</p>}
        </div>
        {selection.start !== null && <button type="button" className="demo-calendar__clear"
          disabled={busy} aria-label="Clear selected dates"
          onClick={() => {
            setSelection({ start: null, end: null });
            dialogRef.current?.querySelector<HTMLButtonElement>(`[data-demo-day="${inspectedDay}"]`)?.focus();
          }}>Clear</button>}
      </div>
      <button type="button" className="demo-calendar__use" disabled={busy || selectedRange === null}
        aria-describedby={`${id}-guidance${rangeStatus ? ` ${id}-range-status` : ''}`}
        onClick={() => { if (!busy && selectedRange) onUse(selectedRange); }}>{useLabel}</button>
    </footer>}
  </div>;
}
