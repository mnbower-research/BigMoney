import { describe, expect, it } from "vitest";
import type { DailyDebtRecord, Debt, EarningEntry, RolloverAllocation } from "../types";
import {
  applyDebtPayment,
  canAllocateRolloverAmount,
  calculateDebtProjection,
  calculateFutureReliefSummary,
  calculateRolloverUsageForDate,
  calculateDebtSummary,
  calculateTodayDebtState,
  createDailyDebtRecord,
  refreshDailyDebtRecord,
  rolloverConsumedByAllocation,
  rolloverUnusedAmount,
} from "./debtCalculations";
import { addCalendarDays } from "./dates";
import { validateImportedData } from "./storage";

const today = "2026-08-24";

function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: overrides.id ?? "debt-1",
    name: overrides.name ?? "Apple Card",
    currentBalance: overrides.currentBalance ?? 1000,
    apr: overrides.apr ?? 0,
    targetPayoffDate: overrides.targetPayoffDate ?? "2026-09-02",
    minimumMonthlyPayment: overrides.minimumMonthlyPayment ?? null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    amountPaid: overrides.amountPaid ?? 0,
    status: overrides.status ?? "active",
  };
}

function earning(date: string, amount: number): EarningEntry {
  return {
    id: `${date}-${amount}`,
    date,
    amount,
    note: "",
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
}

function rollover(overrides: Partial<RolloverAllocation> = {}): RolloverAllocation {
  return {
    id: overrides.id ?? "rollover-1",
    sourceDate: overrides.sourceDate ?? today,
    amount: overrides.amount ?? 10,
    createdAt: overrides.createdAt ?? "2026-08-24T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-08-24T12:00:00.000Z",
  };
}

function recordForDate({
  date,
  amountEarned = 0,
  allocations = [],
  priorRecords = [],
  debts = [debt()],
  reservedFromExtra = 0,
}: {
  date: string;
  amountEarned?: number;
  allocations?: RolloverAllocation[];
  priorRecords?: DailyDebtRecord[];
  debts?: Debt[];
  reservedFromExtra?: number;
}): DailyDebtRecord {
  const summary = calculateDebtSummary(debts, date);
  return createDailyDebtRecord(
    date,
    summary,
    amountEarned > 0 ? [earning(date, amountEarned)] : [],
    [],
    debts,
    0,
    calculateRolloverUsageForDate(allocations, priorRecords, date, summary.todaysRequiredAmount),
    reservedFromExtra,
  );
}

describe("debt projections", () => {
  it("reduces 0% APR debt to balance divided by available days", () => {
    const projection = calculateDebtProjection(debt(), today);

    expect(projection.remainingDays).toBe(10);
    expect(projection.requiredDailyContribution).toBe(100);
    expect(projection.projectedFutureInterest).toBe(0);
  });

  it("uses APR to require more than principal divided by days", () => {
    const projection = calculateDebtProjection(debt({ apr: 29.99 }), today);

    expect(projection.estimatedDailyInterest).toBeCloseTo(0.82, 2);
    expect(projection.requiredDailyContribution).toBeGreaterThan(100);
    expect(projection.projectedFutureInterest).toBeGreaterThan(0);
  });

  it("combines multiple active debts", () => {
    const summary = calculateDebtSummary(
      [
        debt({ id: "a", name: "Apple", currentBalance: 1000 }),
        debt({ id: "b", name: "Dental", currentBalance: 500, targetPayoffDate: "2026-09-12" }),
      ],
      today,
    );

    expect(summary.todaysRequiredAmount).toBe(125);
    expect(summary.debtDaysLeft).toBe(20);
    expect(summary.furthestPayoffDate).toBe("2026-09-12");
    expect(summary.breakdown).toHaveLength(2);
  });

  it("responds to editing APR and payoff date", () => {
    const slowerNoInterest = calculateDebtProjection(
      debt({ apr: 0, targetPayoffDate: "2026-09-12" }),
      today,
    );
    const fasterWithInterest = calculateDebtProjection(
      debt({ apr: 19.99, targetPayoffDate: "2026-08-28" }),
      today,
    );

    expect(fasterWithInterest.requiredDailyContribution).toBeGreaterThan(
      slowerNoInterest.requiredDailyContribution,
    );
  });

  it("excludes archived debts from daily requirements", () => {
    const summary = calculateDebtSummary([debt({ status: "archived" })], today);

    expect(summary.todaysRequiredAmount).toBe(0);
    expect(summary.debtDaysLeft).toBe(0);
    expect(summary.furthestPayoffDate).toBeNull();
    expect(summary.projections).toHaveLength(0);
  });
});

describe("payments and completion", () => {
  it("applies an extra payment and reduces balance", () => {
    const result = applyDebtPayment([debt()], "debt-1", 250);

    expect(result.appliedAmount).toBe(250);
    expect(result.debts[0].currentBalance).toBe(750);
    expect(result.debts[0].amountPaid).toBe(250);
  });

  it("marks debt paid at exactly zero", () => {
    const result = applyDebtPayment([debt({ currentBalance: 100 })], "debt-1", 100);

    expect(result.debts[0].currentBalance).toBe(0);
    expect(result.debts[0].status).toBe("paid");
  });

  it("caps a payment larger than the remaining debt", () => {
    const result = applyDebtPayment([debt({ currentBalance: 100 })], "debt-1", 500);

    expect(result.appliedAmount).toBe(100);
    expect(result.debts[0].currentBalance).toBe(0);
  });

  it("records daily completion and extra earnings", () => {
    const summary = calculateDebtSummary([debt()], today);
    const record = createDailyDebtRecord(today, summary, [earning(today, 125)], [], [debt()]);

    expect(record.completed).toBe(true);
    expect(record.completedAmount).toBe(100);
    expect(record.extraAvailable).toBe(25);
  });

  it("calculates current-day meter progress from today's earnings", () => {
    const summary = calculateDebtSummary([debt()], today);
    const record = createDailyDebtRecord(today, summary, [earning(today, 40)], [], [debt()]);
    const state = calculateTodayDebtState([record], today);

    expect(state?.progressPercent).toBe(40);
    expect(state?.remainingToday).toBe(60);
  });

  it("resets the meter for a new calendar day", () => {
    const summary = calculateDebtSummary([debt()], today);
    const tomorrow = "2026-08-25";
    const tomorrowRecord = createDailyDebtRecord(tomorrow, summary, [], [], [debt()]);

    expect(tomorrowRecord.date).toBe(tomorrow);
    expect(tomorrowRecord.completedAmount).toBe(0);
    expect(tomorrowRecord.completed).toBe(false);
  });

  it("keeps a completed historical snapshot stable after later debt changes", () => {
    const record: DailyDebtRecord = createDailyDebtRecord(
      today,
      calculateDebtSummary([debt()], today),
      [earning(today, 100)],
      [],
      [debt()],
    );
    const laterDebt = debt({ currentBalance: 250, apr: 29.99 });

    expect(record.completed).toBe(true);
    expect(record.requiredDebtAmount).toBe(100);
    expect(calculateDebtSummary([laterDebt], "2026-08-25").todaysRequiredAmount).not.toBe(
      record.requiredDebtAmount,
    );
  });

  it("refreshes today's record from earnings and the current debt summary", () => {
    const record = createDailyDebtRecord(
      today,
      calculateDebtSummary([debt()], today),
      [earning(today, 20)],
      [],
      [debt()],
    );
    const updatedDebts = [
      debt(),
      debt({ id: "debt-2", name: "Dental", currentBalance: 500 }),
    ];
    const refreshed = refreshDailyDebtRecord(
      record,
      calculateDebtSummary(updatedDebts, today),
      [earning(today, 120)],
      [],
      updatedDebts,
    );

    expect(refreshed.requiredDebtAmount).toBe(150);
    expect(refreshed.debtContributions).toHaveLength(2);
    expect(refreshed.completed).toBe(false);
    expect(refreshed.extraAvailable).toBe(0);
  });
});

describe("debt rollover", () => {
  it("applies a partial rollover to tomorrow", () => {
    const debts = [debt({ currentBalance: 300 })];
    const allocation = rollover({ amount: 10 });
    const tomorrow = "2026-08-25";
    const record = recordForDate({ date: tomorrow, allocations: [allocation], debts });
    const state = calculateTodayDebtState([record], tomorrow);

    expect(record.rolloverApplied).toBe(10);
    expect(record.earningsAppliedToDebt).toBe(0);
    expect(record.completed).toBe(false);
    expect(record.completionSource).toBe("partial");
    expect(state?.remainingToday).toBeCloseTo(23.33, 2);
  });

  it("uses rollover to fully cover tomorrow", () => {
    const debts = [debt({ currentBalance: 50, targetPayoffDate: "2026-08-25" })];
    const allocation = rollover({ amount: 75 });
    const tomorrow = "2026-08-25";
    const record = recordForDate({ date: tomorrow, allocations: [allocation], debts });

    expect(record.rolloverApplied).toBe(50);
    expect(record.completed).toBe(true);
    expect(record.completionSource).toBe("rollover");
    expect(rolloverUnusedAmount(allocation, [record])).toBe(25);
  });

  it("spans rollover across multiple future days in chronological order", () => {
    const debts = [debt({ currentBalance: 60, targetPayoffDate: "2026-08-27" })];
    const allocation = rollover({ amount: 75 });
    const firstDay = recordForDate({ date: "2026-08-25", allocations: [allocation], debts });
    const secondDay = recordForDate({
      date: "2026-08-26",
      allocations: [allocation],
      priorRecords: [firstDay],
      debts,
    });
    const thirdDay = recordForDate({
      date: "2026-08-27",
      allocations: [allocation],
      priorRecords: [firstDay, secondDay],
      debts,
    });

    expect(firstDay.rolloverApplied).toBe(20);
    expect(secondDay.rolloverApplied).toBe(30);
    expect(thirdDay.rolloverApplied).toBe(25);
    expect(thirdDay.completed).toBe(false);
    expect(rolloverUnusedAmount(allocation, [firstDay, secondDay, thirdDay])).toBe(0);
  });

  it("supports cents in rollover amounts", () => {
    const debts = [debt({ currentBalance: 30, targetPayoffDate: "2026-08-25" })];
    const allocation = rollover({ amount: 12.35 });
    const record = recordForDate({ date: "2026-08-25", allocations: [allocation], debts });

    expect(record.rolloverApplied).toBe(12.35);
    expect(record.completedAmount).toBe(12.35);
  });

  it("validates that rollover cannot exceed available extra", () => {
    expect(canAllocateRolloverAmount(18.4, 18.4)).toBe(true);
    expect(canAllocateRolloverAmount(18.41, 18.4)).toBe(false);
    expect(canAllocateRolloverAmount(0, 18.4)).toBe(false);
  });

  it("reduces available extra when money is reserved", () => {
    const debts = [debt({ currentBalance: 300 })];
    const record = recordForDate({ date: today, amountEarned: 48, debts, reservedFromExtra: 10 });

    expect(record.completed).toBe(true);
    expect(record.extraAvailable).toBe(8);
  });

  it("does not double count rollover and new earnings", () => {
    const debts = [debt({ currentBalance: 300 })];
    const allocation = rollover({ amount: 10 });
    const record = recordForDate({
      date: "2026-08-25",
      amountEarned: 5,
      allocations: [allocation],
      debts,
    });

    expect(record.completedAmount).toBe(15);
    expect(record.earningsAppliedToDebt).toBe(5);
    expect(record.extraAvailable).toBe(0);
  });

  it("carries unused rollover forward when a future target gets smaller", () => {
    const allocation = rollover({ amount: 30 });
    const smallerFutureDebt = [debt({ currentBalance: 25, targetPayoffDate: "2026-08-25" })];
    const record = recordForDate({ date: "2026-08-25", allocations: [allocation], debts: smallerFutureDebt });

    expect(record.rolloverApplied).toBe(25);
    expect(rolloverUnusedAmount(allocation, [record])).toBe(5);
  });

  it("allows editing unused rollover but not already-consumed rollover", () => {
    const allocation = rollover({ amount: 30 });
    const record = recordForDate({
      date: "2026-08-25",
      allocations: [allocation],
      debts: [debt({ currentBalance: 25, targetPayoffDate: "2026-08-25" })],
    });
    const consumed = rolloverConsumedByAllocation([record], allocation.id);

    expect(consumed).toBe(25);
    expect(30).toBeGreaterThanOrEqual(consumed);
    expect(24.99).toBeLessThan(consumed);
  });

  it("keeps historical completed days as snapshots", () => {
    const allocation = rollover({ amount: 50 });
    const originalDebt = [debt({ currentBalance: 50, targetPayoffDate: "2026-08-25" })];
    const record = recordForDate({ date: "2026-08-25", allocations: [allocation], debts: originalDebt });
    const changedSummary = calculateDebtSummary(
      [debt({ currentBalance: 25, targetPayoffDate: "2026-08-25" })],
      "2026-08-25",
    );

    expect(record.requiredDebtAmount).toBe(50);
    expect(record.completed).toBe(true);
    expect(changedSummary.todaysRequiredAmount).toBe(25);
  });

  it("counts a fully pre-funded day as complete", () => {
    const allocation = rollover({ amount: 30 });
    const record = recordForDate({
      date: "2026-08-25",
      allocations: [allocation],
      debts: [debt({ currentBalance: 30, targetPayoffDate: "2026-08-25" })],
    });
    const state = calculateTodayDebtState([record], "2026-08-25");

    expect(state?.completedDays).toBe(1);
    expect(state?.currentStreak).toBe(1);
  });

  it("preserves unused rollover when there are no future debt obligations", () => {
    const allocation = rollover({ amount: 20 });
    const usage = calculateRolloverUsageForDate([allocation], [], "2026-08-25", 0);

    expect(usage.rolloverApplied).toBe(0);
    expect(rolloverUnusedAmount(allocation, [])).toBe(20);
  });

  it("handles local-calendar day advancement across month and year boundaries", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("future relief summary", () => {
  it("reports no funded future days without rollover", () => {
    const result = calculateFutureReliefSummary([], [], [debt()], today);

    expect(result.totalReservedAmount).toBe(0);
    expect(result.fullyFundedDays).toBe(0);
    expect(result.nextDayFundedPercent).toBe(0);
  });

  it("reports partially funded tomorrow", () => {
    const result = calculateFutureReliefSummary([rollover({ amount: 10 })], [], [debt()], today);

    expect(result.totalReservedAmount).toBe(10);
    expect(result.fullyFundedDays).toBe(0);
    expect(result.nextFundedDate).toBe("2026-08-25");
    expect(result.nextDayFundedPercent).toBeCloseTo(9, 2);
  });

  it("reports exactly one funded future day", () => {
    const debts = [debt({ currentBalance: 50, targetPayoffDate: "2026-08-25" })];
    const result = calculateFutureReliefSummary([rollover({ amount: 50 })], [], debts, today);

    expect(result.fullyFundedDays).toBe(1);
    expect(result.fundedDates).toEqual(["2026-08-25"]);
    expect(result.nextFundedDate).toBeNull();
  });

  it("reports multiple fully funded future days", () => {
    const debts = [debt({ currentBalance: 90, targetPayoffDate: "2026-08-26" })];
    const result = calculateFutureReliefSummary([rollover({ amount: 135 })], [], debts, today);

    expect(result.fullyFundedDays).toBe(2);
    expect(result.nextFundedDate).toBeNull();
  });

  it("reports a partially funded day after multiple complete days", () => {
    const debts = [debt({ currentBalance: 120, targetPayoffDate: "2026-08-27" })];
    const result = calculateFutureReliefSummary([rollover({ amount: 110 })], [], debts, today);

    expect(result.fullyFundedDays).toBe(2);
    expect(result.nextFundedDate).toBe("2026-08-27");
    expect(result.nextDayFundedAmount).toBe(10);
  });

  it("uses varying future daily requirements instead of today's requirement", () => {
    const debts = [
      debt({ id: "a", currentBalance: 48, targetPayoffDate: "2026-08-25" }),
      debt({ id: "b", currentBalance: 75, targetPayoffDate: "2026-08-27" }),
    ];
    const result = calculateFutureReliefSummary([rollover({ amount: 80 })], [], debts, today);

    expect(result.fullyFundedDays).toBe(1);
    expect(result.nextFundedDate).toBe("2026-08-26");
    expect(result.nextDayFundedAmount).toBe(7);
    expect(result.nextDayRequirement).toBe(37.5);
  });

  it("preserves remaining rollover after smaller future requirements", () => {
    const debts = [debt({ currentBalance: 25, targetPayoffDate: "2026-08-25" })];
    const result = calculateFutureReliefSummary([rollover({ amount: 30 })], [], debts, today);

    expect(result.fullyFundedDays).toBe(1);
    expect(result.remainingAfterProjectedDebt).toBe(5);
  });

  it("preserves rollover when there is no active debt", () => {
    const result = calculateFutureReliefSummary([rollover({ amount: 30 })], [], [], today);

    expect(result.totalReservedAmount).toBe(30);
    expect(result.fullyFundedDays).toBe(0);
    expect(result.remainingAfterProjectedDebt).toBe(30);
  });
});

describe("storage migration", () => {
  it("migrates existing v1 app data into v2 debt-capable data", () => {
    const result = validateImportedData({
      version: 1,
      goal: null,
      earnings: [],
      theme: "system",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.version).toBe(3);
    expect(result.data?.debts).toEqual([]);
    expect(result.data?.dailyDebtRecords).toEqual([]);
    expect(result.data?.rolloverAllocations).toEqual([]);
  });

  it("migrates v2 debt records into v3 rollover-capable records", () => {
    const result = validateImportedData({
      version: 2,
      goal: null,
      earnings: [],
      debts: [],
      debtPayments: [],
      dailyDebtRecords: [
        {
          date: today,
          requiredDebtAmount: 30,
          completedAmount: 30,
          completed: true,
          earnings: 48,
          extraAvailable: 18,
          debtContributions: [],
          additionalPayments: [],
          relevantGoalProgress: 0,
          createdAt: "2026-08-24T00:00:00.000Z",
          updatedAt: "2026-08-24T00:00:00.000Z",
        },
      ],
      theme: "system",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.version).toBe(3);
    expect(result.data?.dailyDebtRecords[0].rolloverApplied).toBe(0);
    expect(result.data?.dailyDebtRecords[0].earningsAppliedToDebt).toBe(30);
    expect(result.data?.dailyDebtRecords[0].completionSource).toBe("earnings");
    expect(result.data?.rolloverAllocations).toEqual([]);
  });
});
