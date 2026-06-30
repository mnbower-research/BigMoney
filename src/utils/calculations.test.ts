import { describe, expect, it } from "vitest";
import type { EarningEntry, Goal } from "../types";
import { calculateGoalStats } from "./calculations";
import { daysBetweenInclusive } from "./dates";
import { buildDailyProjection } from "./projections";
import { validateImportedData } from "./storage";

const baseGoal: Goal = {
  id: "goal-1",
  name: "Test goal",
  targetAmount: 1000,
  startDate: "2026-06-01",
  targetDate: "2026-06-10",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

function entry(date: string, amount: number): EarningEntry {
  return {
    id: `${date}-${amount}`,
    date,
    amount,
    note: "",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

describe("calendar date math", () => {
  it("counts calendar days inclusively", () => {
    expect(daysBetweenInclusive("2026-06-01", "2026-06-03")).toBe(3);
  });

  it("does not drift across daylight-saving boundaries", () => {
    expect(daysBetweenInclusive("2026-03-07", "2026-03-09")).toBe(3);
    expect(daysBetweenInclusive("2026-10-31", "2026-11-02")).toBe(3);
  });
});

describe("goal calculations", () => {
  it("calculates a normal goal", () => {
    const stats = calculateGoalStats(baseGoal, [], "2026-06-01");

    expect(stats.remainingDays).toBe(10);
    expect(stats.originalDailyTarget).toBe(100);
    expect(stats.currentDailyTarget).toBe(100);
    expect(stats.amountRemaining).toBe(1000);
  });

  it("recalculates after earning more than the daily target", () => {
    const stats = calculateGoalStats(baseGoal, [entry("2026-06-01", 200)], "2026-06-01");

    expect(stats.amountRemaining).toBe(800);
    expect(stats.remainingDays).toBe(9);
    expect(stats.currentDailyTarget).toBeCloseTo(88.89, 2);
  });

  it("recalculates after earning nothing", () => {
    const stats = calculateGoalStats(baseGoal, [], "2026-06-02");

    expect(stats.remainingDays).toBe(9);
    expect(stats.currentDailyTarget).toBeCloseTo(111.111, 3);
    expect(stats.pace).toBe("behind");
  });

  it("handles a goal exceeded state", () => {
    const stats = calculateGoalStats(baseGoal, [entry("2026-06-01", 1250)], "2026-06-01");

    expect(stats.amountRemaining).toBe(0);
    expect(stats.currentDailyTarget).toBe(0);
    expect(stats.overage).toBe(250);
    expect(stats.progressPercent).toBe(125);
  });

  it("handles a passed deadline without dividing by zero", () => {
    const stats = calculateGoalStats(baseGoal, [entry("2026-06-05", 250)], "2026-06-11");

    expect(stats.deadlinePassed).toBe(true);
    expect(stats.remainingDays).toBe(0);
    expect(stats.currentDailyTarget).toBe(750);
    expect(stats.shortfall).toBe(750);
  });

  it("handles a same-day deadline", () => {
    const goal = { ...baseGoal, startDate: "2026-06-01", targetDate: "2026-06-01" };
    const stats = calculateGoalStats(goal, [], "2026-06-01");

    expect(stats.remainingDays).toBe(1);
    expect(stats.currentDailyTarget).toBe(1000);
  });
});

describe("daily projections", () => {
  it("rounds displayed daily amounts back to the exact remaining balance", () => {
    const projection = buildDailyProjection("2026-06-01", "2026-06-03", 100);
    const total = projection.reduce((sum, day) => sum + Math.round(day.amount * 100), 0);

    expect(projection.map((day) => day.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(total).toBe(10000);
  });
});

describe("import validation", () => {
  it("rejects invalid imported data", () => {
    const result = validateImportedData({
      version: 1,
      goal: { targetAmount: -10 },
      earnings: [{ date: "not-a-date", amount: -1 }],
      theme: "sparkles",
    });

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
