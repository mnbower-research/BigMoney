import type { EarningEntry } from "../types";
import { sortEntriesNewestFirst } from "./calculations";

export function earningsToCsv(entries: EarningEntry[]): string {
  const header = ["Date", "Amount", "Note", "Created At", "Updated At"];
  const rows = sortEntriesNewestFirst(entries).map((entry) => [
    entry.date,
    entry.amount.toFixed(2),
    entry.note,
    entry.createdAt,
    entry.updatedAt,
  ]);

  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}
