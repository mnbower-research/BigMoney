import type {
  AppData,
  DailyDebtRecord,
  Debt,
  DebtPayment,
  EarningEntry,
  Goal,
  ImportValidationResult,
  ThemePreference,
} from "../types";
import { isCalendarDateString, isAfter } from "./dates";

export const STORAGE_KEY = "bigmoney-app-data-v1";

export const emptyAppData: AppData = {
  version: 2,
  goal: null,
  earnings: [],
  debts: [],
  debtPayments: [],
  dailyDebtRecords: [],
  theme: "system",
};

export function loadAppData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return emptyAppData;
  }

  try {
    const parsed = JSON.parse(raw);
    const result = validateImportedData(parsed);
    return result.ok && result.data ? result.data : emptyAppData;
  } catch {
    return emptyAppData;
  }
}

export function saveAppData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function validateImportedData(value: unknown): ImportValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(value)) {
    return { ok: false, errors: ["Import must be a JSON object."] };
  }

  if (value.version !== 1 && value.version !== 2) {
    errors.push("Unsupported or missing app data version.");
  }

  const theme = value.theme;
  const parsedTheme = isThemePreference(theme) ? theme : null;
  if (!isThemePreference(theme)) {
    errors.push("Theme must be system, light, or dark.");
  }

  const goal = value.goal;
  const parsedGoal: Goal | null | undefined = goal === null ? null : isGoal(goal) ? goal : undefined;
  if (goal !== null && !isGoal(goal)) {
    errors.push("Goal settings are missing required fields or contain invalid values.");
  }

  const earnings = value.earnings;
  const parsedEarnings: EarningEntry[] | undefined =
    Array.isArray(earnings) && earnings.every(isEarningEntry) ? earnings : undefined;
  if (!Array.isArray(earnings)) {
    errors.push("Earnings must be an array.");
  } else if (!earnings.every(isEarningEntry)) {
    errors.push("One or more earnings entries are invalid.");
  }

  if (parsedGoal && parsedEarnings) {
    for (const entry of parsedEarnings) {
      if (isAfter(parsedGoal.startDate, entry.date)) {
        errors.push("An earnings entry occurs before the goal start date.");
        break;
      }
    }
  }

  const debts = value.version === 1 ? [] : value.debts;
  const parsedDebts: Debt[] | undefined =
    Array.isArray(debts) && debts.every(isDebt) ? debts : undefined;
  if (value.version === 2 && !Array.isArray(debts)) {
    errors.push("Debts must be an array.");
  } else if (value.version === 2 && Array.isArray(debts) && !debts.every(isDebt)) {
    errors.push("One or more debts are invalid.");
  }

  const debtPayments = value.version === 1 ? [] : value.debtPayments;
  const parsedDebtPayments: DebtPayment[] | undefined =
    Array.isArray(debtPayments) && debtPayments.every(isDebtPayment) ? debtPayments : undefined;
  if (value.version === 2 && !Array.isArray(debtPayments)) {
    errors.push("Debt payments must be an array.");
  } else if (
    value.version === 2 &&
    Array.isArray(debtPayments) &&
    !debtPayments.every(isDebtPayment)
  ) {
    errors.push("One or more debt payments are invalid.");
  }

  const dailyDebtRecords = value.version === 1 ? [] : value.dailyDebtRecords;
  const parsedDailyDebtRecords: DailyDebtRecord[] | undefined =
    Array.isArray(dailyDebtRecords) && dailyDebtRecords.every(isDailyDebtRecord)
      ? dailyDebtRecords
      : undefined;
  if (value.version === 2 && !Array.isArray(dailyDebtRecords)) {
    errors.push("Daily debt records must be an array.");
  } else if (
    value.version === 2 &&
    Array.isArray(dailyDebtRecords) &&
    !dailyDebtRecords.every(isDailyDebtRecord)
  ) {
    errors.push("One or more daily debt records are invalid.");
  }

  if (
    errors.length > 0 ||
    parsedGoal === undefined ||
    !parsedEarnings ||
    !parsedTheme ||
    !parsedDebts ||
    !parsedDebtPayments ||
    !parsedDailyDebtRecords
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    data: {
      version: 2,
      goal: parsedGoal,
      earnings: parsedEarnings,
      debts: parsedDebts,
      debtPayments: parsedDebtPayments,
      dailyDebtRecords: parsedDailyDebtRecords,
      theme: parsedTheme,
    },
  };
}

function isGoal(value: unknown): value is Goal {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.targetAmount === "number" &&
    Number.isFinite(value.targetAmount) &&
    value.targetAmount > 0 &&
    isCalendarDateString(value.targetDate) &&
    isCalendarDateString(value.startDate) &&
    !isAfter(value.startDate, value.targetDate) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isEarningEntry(value: unknown): value is EarningEntry {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    isCalendarDateString(value.date) &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    value.amount >= 0 &&
    typeof value.note === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isDebt(value: unknown): value is Debt {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.currentBalance === "number" &&
    Number.isFinite(value.currentBalance) &&
    value.currentBalance >= 0 &&
    typeof value.apr === "number" &&
    Number.isFinite(value.apr) &&
    value.apr >= 0 &&
    value.apr <= 200 &&
    (value.targetPayoffDate === null || isCalendarDateString(value.targetPayoffDate)) &&
    (value.minimumMonthlyPayment === null ||
      (typeof value.minimumMonthlyPayment === "number" &&
        Number.isFinite(value.minimumMonthlyPayment) &&
        value.minimumMonthlyPayment >= 0)) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.amountPaid === "number" &&
    Number.isFinite(value.amountPaid) &&
    value.amountPaid >= 0 &&
    (value.status === "active" || value.status === "paid" || value.status === "archived")
  );
}

function isDebtPayment(value: unknown): value is DebtPayment {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.debtId === "string" &&
    isCalendarDateString(value.date) &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    value.amount >= 0 &&
    typeof value.note === "string" &&
    typeof value.createdAt === "string"
  );
}

function isDailyDebtRecord(value: unknown): value is DailyDebtRecord {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    isCalendarDateString(value.date) &&
    typeof value.requiredDebtAmount === "number" &&
    Number.isFinite(value.requiredDebtAmount) &&
    value.requiredDebtAmount >= 0 &&
    typeof value.completedAmount === "number" &&
    Number.isFinite(value.completedAmount) &&
    value.completedAmount >= 0 &&
    typeof value.completed === "boolean" &&
    typeof value.earnings === "number" &&
    Number.isFinite(value.earnings) &&
    value.earnings >= 0 &&
    typeof value.extraAvailable === "number" &&
    Number.isFinite(value.extraAvailable) &&
    value.extraAvailable >= 0 &&
    Array.isArray(value.debtContributions) &&
    value.debtContributions.every(isDailyDebtBreakdown) &&
    Array.isArray(value.additionalPayments) &&
    value.additionalPayments.every(isDailyDebtPaymentSnapshot) &&
    typeof value.relevantGoalProgress === "number" &&
    Number.isFinite(value.relevantGoalProgress) &&
    value.relevantGoalProgress >= 0 &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isDailyDebtBreakdown(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    typeof value.debtId === "string" &&
    typeof value.debtName === "string" &&
    typeof value.requiredAmount === "number" &&
    Number.isFinite(value.requiredAmount) &&
    value.requiredAmount >= 0
  );
}

function isDailyDebtPaymentSnapshot(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    typeof value.debtId === "string" &&
    typeof value.debtName === "string" &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    value.amount >= 0
  );
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
