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

export type DebtStatus = "active" | "paid" | "archived";

export interface Debt {
  id: string;
  name: string;
  currentBalance: number;
  apr: number;
  targetPayoffDate: CalendarDateString | null;
  minimumMonthlyPayment: number | null;
  createdAt: string;
  updatedAt: string;
  amountPaid: number;
  status: DebtStatus;
}

export interface DebtPayment {
  id: string;
  debtId: string;
  date: CalendarDateString;
  amount: number;
  note: string;
  createdAt: string;
}

export interface DailyDebtBreakdown {
  debtId: string;
  debtName: string;
  requiredAmount: number;
}

export interface DailyDebtRecord {
  date: CalendarDateString;
  requiredDebtAmount: number;
  completedAmount: number;
  completed: boolean;
  earnings: number;
  extraAvailable: number;
  debtContributions: DailyDebtBreakdown[];
  additionalPayments: Array<{
    debtId: string;
    debtName: string;
    amount: number;
  }>;
  relevantGoalProgress: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppData {
  version: 2;
  goal: Goal | null;
  earnings: EarningEntry[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  dailyDebtRecords: DailyDebtRecord[];
  theme: ThemePreference;
}

export interface ImportValidationResult {
  ok: boolean;
  data?: AppData;
  errors: string[];
}
