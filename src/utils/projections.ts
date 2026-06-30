import type { CalendarDateString } from "../types";
import { fromCents, toCents } from "./currency";
import { enumerateDates } from "./dates";

export interface DailyProjection {
  date: CalendarDateString;
  amount: number;
}

export function buildDailyProjection(
  startDate: CalendarDateString | null,
  targetDate: CalendarDateString,
  amountRemaining: number,
): DailyProjection[] {
  if (!startDate || amountRemaining <= 0) {
    return [];
  }

  const dates = enumerateDates(startDate, targetDate);
  if (dates.length === 0) {
    return [];
  }

  const totalCents = toCents(amountRemaining);
  const baseCents = Math.floor(totalCents / dates.length);
  const displayed = dates.map((date) => ({ date, amount: fromCents(baseCents) }));
  const subtotal = baseCents * dates.length;
  const remainder = totalCents - subtotal;
  const final = displayed[displayed.length - 1];
  displayed[displayed.length - 1] = {
    ...final,
    amount: fromCents(baseCents + remainder),
  };

  return displayed;
}
