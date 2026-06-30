import type { AppData, EarningEntry, Goal, ImportValidationResult, ThemePreference } from "../types";
import { isCalendarDateString, isAfter } from "./dates";

export const STORAGE_KEY = "bigmoney-app-data-v1";

export const emptyAppData: AppData = {
  version: 1,
  goal: null,
  earnings: [],
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

  if (value.version !== 1) {
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

  if (errors.length > 0 || parsedGoal === undefined || !parsedEarnings || !parsedTheme) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    data: {
      version: 1,
      goal: parsedGoal,
      earnings: parsedEarnings,
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

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
