export type CalendarDateString = string;
export type ThemePreference = "system" | "light" | "dark";

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: CalendarDateString;
  startDate: CalendarDateString;
  createdAt: string;
  updatedAt: string;
}

export interface EarningEntry {
  id: string;
  date: CalendarDateString;
  amount: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppData {
  version: 1;
  goal: Goal | null;
  earnings: EarningEntry[];
  theme: ThemePreference;
}

export interface ImportValidationResult {
  ok: boolean;
  data?: AppData;
  errors: string[];
}
