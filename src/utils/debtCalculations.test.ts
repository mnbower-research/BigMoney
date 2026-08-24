import { describe, expect, it } from "vitest";
import type { DailyDebtRecord, Debt, EarningEntry } from "../types";
import {
  applyDebtPayment,
  calculateDebtProjection,
  calculateDebtSummary,
  createDailyDebtRecord,
  refreshDailyDebtRecord,
} from "./debtCalculations";
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
        debt({ id: "b", name: "Dental", currentBalance: 500 }),
      ],
      today,
    );

    expect(summary.todaysRequiredAmount).toBe(150);
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

describe("storage migration", () => {
  it("migrates existing v1 app data into v2 debt-capable data", () => {
    const result = validateImportedData({
      version: 1,
      goal: null,
      earnings: [],
      theme: "system",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.version).toBe(2);
    expect(result.data?.debts).toEqual([]);
    expect(result.data?.dailyDebtRecords).toEqual([]);
  });
});
