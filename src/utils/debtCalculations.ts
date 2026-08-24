import type {
  CalendarDateString,
  DailyDebtBreakdown,
  DailyDebtRecord,
  Debt,
  DebtPayment,
  EarningEntry,
} from "../types";
import { normalizeMoney } from "./currency";
import { daysBetweenInclusive, isAfter } from "./dates";

const SOLVER_ITERATIONS = 48;

export interface DebtProjection {
  debt: Debt;
  balance: number;
  dailyRate: number;
  estimatedDailyInterest: number;
  requiredDailyContribution: number;
  projectedFutureInterest: number;
  projectedTotalPayoff: number;
  projectedPayoffDate: CalendarDateString | null;
  remainingDays: number;
}

export interface DebtSummary {
  projections: DebtProjection[];
  activePrincipal: number;
  estimatedDailyInterest: number;
  projectedFutureInterest: number;
  projectedTotalPayoff: number;
  todaysRequiredAmount: number;
  breakdown: DailyDebtBreakdown[];
}

export interface TodayDebtState {
  record: DailyDebtRecord;
  earnedToday: number;
  progressPercent: number;
  remainingToday: number;
  extraAvailable: number;
  completedDays: number;
  currentStreak: number;
}

export function calculateDebtProjection(
  debt: Debt,
  today: CalendarDateString,
): DebtProjection {
  const balance = normalizeMoney(Math.max(debt.currentBalance, 0));
  const dailyRate = Math.max(debt.apr, 0) / 100 / 365;
  const estimatedDailyInterest = normalizeMoney(balance * dailyRate);
  const targetDate = debt.targetPayoffDate;
  const remainingDays = targetDate && !isAfter(today, targetDate)
    ? daysBetweenInclusive(today, targetDate)
    : 0;

  if (balance <= 0 || debt.status !== "active") {
    return {
      debt,
      balance: 0,
      dailyRate,
      estimatedDailyInterest: 0,
      requiredDailyContribution: 0,
      projectedFutureInterest: 0,
      projectedTotalPayoff: 0,
      projectedPayoffDate: targetDate,
      remainingDays,
    };
  }

  const requiredDailyContribution = remainingDays > 0
    ? solveDailyPayment(balance, dailyRate, remainingDays)
    : 0;
  const futureInterest = remainingDays > 0
    ? simulatePayoff(balance, dailyRate, requiredDailyContribution, remainingDays).interest
    : 0;

  return {
    debt,
    balance,
    dailyRate,
    estimatedDailyInterest,
    requiredDailyContribution: normalizeMoney(requiredDailyContribution),
    projectedFutureInterest: normalizeMoney(futureInterest),
    projectedTotalPayoff: normalizeMoney(balance + futureInterest),
    projectedPayoffDate: targetDate,
    remainingDays,
  };
}

export function calculateDebtSummary(
  debts: Debt[],
  today: CalendarDateString,
): DebtSummary {
  const projections = debts
    .filter((debt) => debt.status === "active" && debt.currentBalance > 0)
    .map((debt) => calculateDebtProjection(debt, today));
  const breakdown = projections.map((projection) => ({
    debtId: projection.debt.id,
    debtName: projection.debt.name,
    requiredAmount: projection.requiredDailyContribution,
  }));

  return {
    projections,
    activePrincipal: sumMoney(projections.map((item) => item.balance)),
    estimatedDailyInterest: sumMoney(projections.map((item) => item.estimatedDailyInterest)),
    projectedFutureInterest: sumMoney(projections.map((item) => item.projectedFutureInterest)),
    projectedTotalPayoff: sumMoney(projections.map((item) => item.projectedTotalPayoff)),
    todaysRequiredAmount: sumMoney(breakdown.map((item) => item.requiredAmount)),
    breakdown,
  };
}

export function createDailyDebtRecord(
  date: CalendarDateString,
  summary: DebtSummary,
  earnings: EarningEntry[],
  payments: DebtPayment[],
  debts: Debt[],
  relevantGoalProgress = 0,
): DailyDebtRecord {
  const earnedToday = earningsForDate(earnings, date);
  const required = summary.todaysRequiredAmount;
  const completedAmount = normalizeMoney(Math.min(earnedToday, required));
  const extraAvailable = normalizeMoney(Math.max(earnedToday - required - relevantGoalProgress, 0));
  const now = new Date().toISOString();

  return {
    date,
    requiredDebtAmount: required,
    completedAmount,
    completed: required === 0 ? false : earnedToday >= required,
    earnings: earnedToday,
    extraAvailable,
    debtContributions: summary.breakdown,
    additionalPayments: paymentsForDate(payments, debts, date),
    relevantGoalProgress,
    createdAt: now,
    updatedAt: now,
  };
}

export function refreshDailyDebtRecord(
  record: DailyDebtRecord,
  earnings: EarningEntry[],
  payments: DebtPayment[],
  debts: Debt[],
  relevantGoalProgress = record.relevantGoalProgress,
): DailyDebtRecord {
  const earnedToday = earningsForDate(earnings, record.date);
  const completedAmount = normalizeMoney(Math.min(earnedToday, record.requiredDebtAmount));
  const extraAvailable = normalizeMoney(
    Math.max(earnedToday - record.requiredDebtAmount - relevantGoalProgress, 0),
  );
  const additionalPayments = paymentsForDate(payments, debts, record.date);
  const completed = record.requiredDebtAmount > 0 && earnedToday >= record.requiredDebtAmount;

  if (
    record.earnings === earnedToday &&
    record.completedAmount === completedAmount &&
    record.completed === completed &&
    record.extraAvailable === extraAvailable &&
    record.relevantGoalProgress === relevantGoalProgress &&
    JSON.stringify(record.additionalPayments) === JSON.stringify(additionalPayments)
  ) {
    return record;
  }

  return {
    ...record,
    earnings: earnedToday,
    completedAmount,
    completed,
    extraAvailable,
    additionalPayments,
    relevantGoalProgress,
    updatedAt: new Date().toISOString(),
  };
}

export function calculateTodayDebtState(
  records: DailyDebtRecord[],
  today: CalendarDateString,
): TodayDebtState | null {
  const record = records.find((item) => item.date === today);
  if (!record) {
    return null;
  }

  return {
    record,
    earnedToday: record.earnings,
    progressPercent:
      record.requiredDebtAmount > 0
        ? Math.min((record.completedAmount / record.requiredDebtAmount) * 100, 100)
        : 0,
    remainingToday: normalizeMoney(Math.max(record.requiredDebtAmount - record.completedAmount, 0)),
    extraAvailable: record.extraAvailable,
    completedDays: records.filter((item) => item.completed).length,
    currentStreak: calculateCurrentStreak(records, today),
  };
}

export function applyDebtPayment(
  debts: Debt[],
  debtId: string,
  amount: number,
): { debts: Debt[]; appliedAmount: number } {
  const debt = debts.find((item) => item.id === debtId);
  if (!debt || amount <= 0) {
    return { debts, appliedAmount: 0 };
  }

  const appliedAmount = normalizeMoney(Math.min(amount, debt.currentBalance));
  const updatedBalance = normalizeMoney(Math.max(debt.currentBalance - appliedAmount, 0));
  const now = new Date().toISOString();

  return {
    appliedAmount,
    debts: debts.map((item) =>
      item.id === debtId
        ? {
            ...item,
            currentBalance: updatedBalance,
            amountPaid: normalizeMoney(item.amountPaid + appliedAmount),
            status: updatedBalance <= 0 ? "paid" : item.status,
            updatedAt: now,
          }
        : item,
    ),
  };
}

export function solveDailyPayment(balance: number, dailyRate: number, days: number): number {
  if (balance <= 0 || days <= 0) {
    return 0;
  }

  if (dailyRate <= 0) {
    return balance / days;
  }

  let low = 0;
  let high = balance;
  while (simulatePayoff(balance, dailyRate, high, days).balance > 0) {
    high *= 2;
  }

  for (let index = 0; index < SOLVER_ITERATIONS; index += 1) {
    const mid = (low + high) / 2;
    const result = simulatePayoff(balance, dailyRate, mid, days);
    if (result.balance > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return high;
}

export function simulatePayoff(
  balance: number,
  dailyRate: number,
  dailyPayment: number,
  days: number,
): { balance: number; interest: number } {
  let projectedBalance = balance;
  let interest = 0;

  for (let day = 0; day < days && projectedBalance > 0; day += 1) {
    const dailyInterest = projectedBalance * dailyRate;
    interest += dailyInterest;
    projectedBalance = projectedBalance + dailyInterest - dailyPayment;
  }

  return {
    balance: normalizeMoney(Math.max(projectedBalance, 0)),
    interest: normalizeMoney(Math.max(interest, 0)),
  };
}

export function earningsForDate(entries: EarningEntry[], date: CalendarDateString): number {
  return sumMoney(entries.filter((entry) => entry.date === date).map((entry) => entry.amount));
}

function paymentsForDate(
  payments: DebtPayment[],
  debts: Debt[],
  date: CalendarDateString,
): DailyDebtRecord["additionalPayments"] {
  return payments
    .filter((payment) => payment.date === date)
    .map((payment) => ({
      debtId: payment.debtId,
      debtName: debts.find((debt) => debt.id === payment.debtId)?.name ?? "Unknown debt",
      amount: payment.amount,
    }));
}

function calculateCurrentStreak(records: DailyDebtRecord[], today: CalendarDateString): number {
  const byDate = new Map(records.map((record) => [record.date, record]));
  let streak = 0;
  let cursor = today;

  while (byDate.get(cursor)?.completed) {
    streak += 1;
    const date = new Date(`${cursor}T00:00:00`);
    date.setDate(date.getDate() - 1);
    cursor = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  return streak;
}

function sumMoney(values: number[]): number {
  return normalizeMoney(values.reduce((sum, value) => sum + Math.max(value, 0), 0));
}
