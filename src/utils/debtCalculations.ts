import type {
  CalendarDateString,
  DailyDebtBreakdown,
  DailyDebtRecord,
  Debt,
  DebtPayment,
  EarningEntry,
  RolloverAllocation,
  RolloverConsumption,
} from "../types";
import { normalizeMoney } from "./currency";
import { compareCalendarDates, daysBetweenInclusive, isAfter, maxDate } from "./dates";

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
  debtDaysLeft: number;
  furthestPayoffDate: CalendarDateString | null;
  breakdown: DailyDebtBreakdown[];
}

export interface TodayDebtState {
  record: DailyDebtRecord;
  earnedToday: number;
  progressPercent: number;
  remainingToday: number;
  extraAvailable: number;
  rolloverApplied: number;
  earningsAppliedToDebt: number;
  completedDays: number;
  currentStreak: number;
}

export interface RolloverUsage {
  rolloverApplied: number;
  rolloverConsumption: RolloverConsumption[];
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
  const furthestPayoffDate = projections.reduce<CalendarDateString | null>((furthest, projection) => {
    if (!projection.projectedPayoffDate) {
      return furthest;
    }

    return furthest ? maxDate(furthest, projection.projectedPayoffDate) : projection.projectedPayoffDate;
  }, null);

  return {
    projections,
    activePrincipal: sumMoney(projections.map((item) => item.balance)),
    estimatedDailyInterest: sumMoney(projections.map((item) => item.estimatedDailyInterest)),
    projectedFutureInterest: sumMoney(projections.map((item) => item.projectedFutureInterest)),
    projectedTotalPayoff: sumMoney(projections.map((item) => item.projectedTotalPayoff)),
    todaysRequiredAmount: sumMoney(breakdown.map((item) => item.requiredAmount)),
    debtDaysLeft: Math.max(0, ...projections.map((item) => item.remainingDays)),
    furthestPayoffDate,
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
  rolloverUsage: RolloverUsage = { rolloverApplied: 0, rolloverConsumption: [] },
  rolloverReservedFromExtra = 0,
): DailyDebtRecord {
  const earnedToday = earningsForDate(earnings, date);
  const required = summary.todaysRequiredAmount;
  const rolloverApplied = normalizeMoney(Math.min(rolloverUsage.rolloverApplied, required));
  const earningsAppliedToDebt = normalizeMoney(
    Math.min(earnedToday, Math.max(required - rolloverApplied, 0)),
  );
  const completedAmount = normalizeMoney(Math.min(rolloverApplied + earningsAppliedToDebt, required));
  const extraAvailable = normalizeMoney(
    Math.max(earnedToday - earningsAppliedToDebt - relevantGoalProgress - rolloverReservedFromExtra, 0),
  );
  const now = new Date().toISOString();

  return {
    date,
    requiredDebtAmount: required,
    rolloverApplied,
    rolloverConsumption: rolloverUsage.rolloverConsumption,
    earningsAppliedToDebt,
    completedAmount,
    completed: required > 0 && completedAmount >= required,
    completionSource: getCompletionSource(required, completedAmount, rolloverApplied, earningsAppliedToDebt),
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
  summary: DebtSummary,
  earnings: EarningEntry[],
  payments: DebtPayment[],
  debts: Debt[],
  relevantGoalProgress = record.relevantGoalProgress,
  rolloverUsage: RolloverUsage = {
    rolloverApplied: record.rolloverApplied,
    rolloverConsumption: record.rolloverConsumption,
  },
  rolloverReservedFromExtra = 0,
): DailyDebtRecord {
  const earnedToday = earningsForDate(earnings, record.date);
  const requiredDebtAmount = summary.todaysRequiredAmount;
  const rolloverApplied = normalizeMoney(Math.min(rolloverUsage.rolloverApplied, requiredDebtAmount));
  const earningsAppliedToDebt = normalizeMoney(
    Math.min(earnedToday, Math.max(requiredDebtAmount - rolloverApplied, 0)),
  );
  const completedAmount = normalizeMoney(Math.min(rolloverApplied + earningsAppliedToDebt, requiredDebtAmount));
  const extraAvailable = normalizeMoney(
    Math.max(earnedToday - earningsAppliedToDebt - relevantGoalProgress - rolloverReservedFromExtra, 0),
  );
  const additionalPayments = paymentsForDate(payments, debts, record.date);
  const completed = requiredDebtAmount > 0 && completedAmount >= requiredDebtAmount;
  const completionSource = getCompletionSource(
    requiredDebtAmount,
    completedAmount,
    rolloverApplied,
    earningsAppliedToDebt,
  );

  if (
    record.requiredDebtAmount === requiredDebtAmount &&
    record.rolloverApplied === rolloverApplied &&
    JSON.stringify(record.rolloverConsumption) === JSON.stringify(rolloverUsage.rolloverConsumption) &&
    JSON.stringify(record.debtContributions) === JSON.stringify(summary.breakdown) &&
    record.earnings === earnedToday &&
    record.earningsAppliedToDebt === earningsAppliedToDebt &&
    record.completedAmount === completedAmount &&
    record.completed === completed &&
    record.extraAvailable === extraAvailable &&
    record.completionSource === completionSource &&
    record.relevantGoalProgress === relevantGoalProgress &&
    JSON.stringify(record.additionalPayments) === JSON.stringify(additionalPayments)
  ) {
    return record;
  }

  return {
    ...record,
    requiredDebtAmount,
    rolloverApplied,
    rolloverConsumption: rolloverUsage.rolloverConsumption,
    debtContributions: summary.breakdown,
    earnings: earnedToday,
    earningsAppliedToDebt,
    completedAmount,
    completed,
    extraAvailable,
    completionSource,
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
    rolloverApplied: record.rolloverApplied,
    earningsAppliedToDebt: record.earningsAppliedToDebt,
    completedDays: records.filter((item) => item.completed).length,
    currentStreak: calculateCurrentStreak(records, today),
  };
}

export function calculateRolloverUsageForDate(
  allocations: RolloverAllocation[],
  records: DailyDebtRecord[],
  date: CalendarDateString,
  normalRequirement: number,
): RolloverUsage {
  let remainingRequirement = normalRequirement;
  const rolloverConsumption: RolloverConsumption[] = [];

  const orderedAllocations = [...allocations]
    .filter((allocation) => compareCalendarDates(allocation.sourceDate, date) < 0)
    .sort((a, b) => {
      const dateOrder = compareCalendarDates(a.sourceDate, b.sourceDate);
      return dateOrder === 0 ? a.createdAt.localeCompare(b.createdAt) : dateOrder;
    });

  for (const allocation of orderedAllocations) {
    if (remainingRequirement <= 0) {
      break;
    }

    const consumedBeforeDate = rolloverConsumedByAllocation(records, allocation.id, date);
    const available = normalizeMoney(Math.max(allocation.amount - consumedBeforeDate, 0));
    const amount = normalizeMoney(Math.min(available, remainingRequirement));

    if (amount > 0) {
      rolloverConsumption.push({ allocationId: allocation.id, amount });
      remainingRequirement = normalizeMoney(remainingRequirement - amount);
    }
  }

  return {
    rolloverApplied: sumMoney(rolloverConsumption.map((item) => item.amount)),
    rolloverConsumption,
  };
}

export function rolloverAllocatedFromDate(
  allocations: RolloverAllocation[],
  sourceDate: CalendarDateString,
): number {
  return sumMoney(
    allocations
      .filter((allocation) => allocation.sourceDate === sourceDate)
      .map((allocation) => allocation.amount),
  );
}

export function rolloverConsumedByAllocation(
  records: DailyDebtRecord[],
  allocationId: string,
  beforeDate?: CalendarDateString,
): number {
  return sumMoney(
    records
      .filter((record) => !beforeDate || compareCalendarDates(record.date, beforeDate) < 0)
      .flatMap((record) => record.rolloverConsumption)
      .filter((usage) => usage.allocationId === allocationId)
      .map((usage) => usage.amount),
  );
}

export function rolloverUnusedAmount(
  allocation: RolloverAllocation,
  records: DailyDebtRecord[],
): number {
  return normalizeMoney(Math.max(allocation.amount - rolloverConsumedByAllocation(records, allocation.id), 0));
}

export function canAllocateRolloverAmount(amount: number, availableExtra: number): boolean {
  return (
    Number.isFinite(amount) &&
    Number.isFinite(availableExtra) &&
    amount > 0 &&
    amount <= normalizeMoney(availableExtra)
  );
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

function getCompletionSource(
  requiredAmount: number,
  completedAmount: number,
  rolloverApplied: number,
  earningsAppliedToDebt: number,
): DailyDebtRecord["completionSource"] {
  if (requiredAmount <= 0 || completedAmount <= 0) {
    return "none";
  }

  if (completedAmount < requiredAmount) {
    return "partial";
  }

  if (rolloverApplied >= requiredAmount && earningsAppliedToDebt === 0) {
    return "rollover";
  }

  if (rolloverApplied > 0 && earningsAppliedToDebt > 0) {
    return "mixed";
  }

  return "earnings";
}

function sumMoney(values: number[]): number {
  return normalizeMoney(values.reduce((sum, value) => sum + Math.max(value, 0), 0));
}
