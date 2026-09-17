export interface DateRange {
  start: number;
  end: number;
}

export interface DateSelection {
  start: string;
  end: string;
}

export const DAY = 86_400_000;

export function parseDay(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() : null;
}

export function parseDateSelection(value: unknown): DateRange | null {
  if (typeof value !== 'object' || value === null || !('start' in value) || !('end' in value)) return null;
  const start = parseDay(value.start);
  const end = parseDay(value.end);
  return start !== null && end !== null && start <= end ? { start, end } : null;
}

export function dateSelection(range: DateRange): DateSelection {
  if (!validRange(range)) throw new RangeError('A valid date range is required.');
  return { start: new Date(range.start).toISOString().slice(0, 10), end: new Date(range.end).toISOString().slice(0, 10) };
}

export function currentDay(now = new Date()): number {
  if (!Number.isFinite(now.getTime())) throw new RangeError('A valid current date is required.');
  // Store local calendar dates at UTC midnight so DST cannot change the selected days.
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export function validRange(range: DateRange): boolean {
  return [range.start, range.end].every(value =>
    Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15 && value % DAY === 0,
  ) && range.start <= range.end;
}

export function dayCount(range: DateRange): number {
  if (!validRange(range)) throw new RangeError('A valid, ordered date range is required.');
  return (range.end - range.start) / DAY + 1;
}

export function formatRange(range: DateRange, compact = false): string {
  if (!validRange(range)) throw new RangeError('A valid, ordered date range is required.');
  const start = new Date(range.start);
  const end = new Date(range.end);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const full = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  if (range.start === range.end) return (compact ? short : full).format(start);
  if (!sameYear) return `${full.format(start)} - ${full.format(end)}`;
  const endLabel = compact && start.getUTCMonth() === end.getUTCMonth()
    ? String(end.getUTCDate()) : short.format(end);
  return `${short.format(start)} - ${endLabel}${compact ? '' : `, ${end.getUTCFullYear()}`}`;
}

export function monthDays(year: number, month: number): (number | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [
    ...Array<null>(first.getUTCDay()).fill(null),
    ...Array.from({ length }, (_, index) => Date.UTC(year, month, index + 1)),
  ];
}
