import { useState } from 'react';
import { currentDay, dayCount, formatRange, monthDays, validRange } from './dates';
import type { DateRange } from './dates';
import { Icon } from './Icons';
import { Modal } from './Modal';

export function DatePicker({ initial, onConfirm, onClose, purpose = 'attach' }: {
  initial: DateRange | null; onConfirm: (range: DateRange) => void; onClose: () => void;
  purpose?: 'attach' | 'answer';
}) {
  const today = currentDay();
  const [range, setRange] = useState(initial);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [month, setMonth] = useState(() => new Date(initial?.start ?? today));
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month);
  const todayDate = new Date(today);
  const firstMonth = Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 1);
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const selection = range && !selectingEnd && validRange(range) && range.start >= today ? range : null;
  const chooseDay = (day: number) => {
    if (selectingEnd && range) {
      setRange({ start: Math.min(range.start, day), end: Math.max(range.start, day) });
      setSelectingEnd(false);
    } else {
      setRange({ start: day, end: day });
      setSelectingEnd(true);
    }
  };
  return <Modal title="Choose dates" onClose={onClose} className="calendar-panel">
    <div className="calendar-month">
      <h3>{monthLabel}</h3>
      <div>
        <button type="button" className="calendar-nav" aria-label="Previous month"
          disabled={Date.UTC(year, monthIndex, 1) <= firstMonth}
          onClick={() => setMonth(new Date(Date.UTC(year, monthIndex - 1, 1)))}><Icon name="chevron-left" /></button>
        <button type="button" className="calendar-nav" aria-label="Next month"
          onClick={() => setMonth(new Date(Date.UTC(year, monthIndex + 1, 1)))}><Icon name="chevron-right" /></button>
      </div>
    </div>
    <p className="calendar-instructions" role="status">
      {selectingEnd ? 'Choose your last day. Tap the same date for a single day.'
        : selection ? `${dayCount(selection)} ${dayCount(selection) === 1 ? 'day' : 'days'} selected.`
          : 'Choose your first day. Nothing is selected yet.'}
    </p>
    <div className="calendar-grid">
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span className="weekday" key={`weekday-${index}`} aria-hidden="true">{day}</span>)}
      {monthDays(year, monthIndex).map((day, index) => {
        if (day === null) return <span key={`blank-${index}`} />;
        const date = new Date(day);
        const selected = range !== null && day >= range.start && day <= range.end;
        const start = selected && (day === range?.start || date.getUTCDay() === 0 || date.getUTCDate() === 1);
        const end = selected && (day === range?.end || date.getUTCDay() === 6 || date.getUTCDate() === lastDay);
        const label = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
        return <button key={day} type="button" aria-label={label} aria-pressed={selected}
          aria-current={day === today ? 'date' : undefined} disabled={day < today}
          className={`calendar-day${selected ? ' selected' : ''}${start ? ' range-start' : ''}${end ? ' range-end' : ''}`}
          onClick={() => chooseDay(day)}>{date.getUTCDate()}</button>;
      })}
    </div>
    <button className="date-confirm" type="button" disabled={!selection}
      onClick={selection ? () => onConfirm(selection) : undefined}>
      {selection ? `Use ${formatRange(selection, true)}` : selectingEnd ? 'Choose an end date' : 'Select a date range'}
    </button>
    <button className="calendar-clear" type="button" disabled={!range}
      onClick={() => { setRange(null); setSelectingEnd(false); }}>Clear selection</button>
    <p className="panel-note">{purpose === 'answer'
      ? 'Use sends the selected dates as your reply to Siri.'
      : 'Attach dates to your message. Nothing is sent until you press Send.'}</p>
  </Modal>;
}
