import type { CalendarDateString } from "../types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isCalendarDateString(value: unknown): value is CalendarDateString {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function toCalendarDateString(date: Date): CalendarDateString {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayString(now = new Date()): CalendarDateString {
  return toCalendarDateString(now);
}

export function parseCalendarDate(value: CalendarDateString): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDisplayDate(value: CalendarDateString, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parseCalendarDate(value));
}

export function addCalendarDays(value: CalendarDateString, days: number): CalendarDateString {
  const date = parseCalendarDate(value);
  date.setDate(date.getDate() + days);
  return toCalendarDateString(date);
}

export function addCalendarYears(value: CalendarDateString, years: number): CalendarDateString {
  const date = parseCalendarDate(value);
  date.setFullYear(date.getFullYear() + years);
  return toCalendarDateString(date);
}

export function compareCalendarDates(a: CalendarDateString, b: CalendarDateString): number {
  return calendarDayNumber(a) - calendarDayNumber(b);
}

export function isBefore(a: CalendarDateString, b: CalendarDateString): boolean {
  return compareCalendarDates(a, b) < 0;
}

export function isAfter(a: CalendarDateString, b: CalendarDateString): boolean {
  return compareCalendarDates(a, b) > 0;
}

export function maxDate(a: CalendarDateString, b: CalendarDateString): CalendarDateString {
  return isAfter(a, b) ? a : b;
}

export function minDate(a: CalendarDateString, b: CalendarDateString): CalendarDateString {
  return isBefore(a, b) ? a : b;
}

export function daysBetweenInclusive(
  start: CalendarDateString,
  end: CalendarDateString,
): number {
  const diff = calendarDayNumber(end) - calendarDayNumber(start);
  return diff < 0 ? 0 : diff + 1;
}

export function enumerateDates(
  start: CalendarDateString,
  end: CalendarDateString,
): CalendarDateString[] {
  const count = daysBetweenInclusive(start, end);
  return Array.from({ length: count }, (_, index) => addCalendarDays(start, index));
}

function calendarDayNumber(value: CalendarDateString): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}
