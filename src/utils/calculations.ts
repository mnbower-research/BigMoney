import type { CalendarDateString, EarningEntry, Goal } from "../types";
import {
  addCalendarDays,
  compareCalendarDates,
  daysBetweenInclusive,
  isAfter,
  isBefore,
  maxDate,
  minDate,
} from "./dates";
import { normalizeMoney } from "./currency";

export interface GoalStats {
  totalGoal: number;
  totalEarned: number;
  amountRemaining: number;
  overage: number;
  originalDailyTarget: number;
  currentDailyTarget: number;
  progressPercent: number;
  originalDays: number;
  remainingDays: number;
  projectionStartDate: CalendarDateString | null;
  deadlinePassed: boolean;
  idealEarnedToDate: number;
  pace: "ahead" | "on" | "behind" | "reached" | "deadline-passed";
  statusMessage: string;
  shortfall: number;
}

export function calculateGoalStats(
  goal: Goal,
  earnings: EarningEntry[],
  today: CalendarDateString,
): GoalStats {
  const totalGoal = normalizeMoney(goal.targetAmount);
  const totalEarned = normalizeMoney(
    earnings.reduce((sum, entry) => sum + Math.max(entry.amount, 0), 0),
  );
  const amountRemaining = normalizeMoney(Math.max(totalGoal - totalEarned, 0));
  const overage = normalizeMoney(Math.max(totalEarned - totalGoal, 0));
  const originalDays = daysBetweenInclusive(goal.startDate, goal.targetDate);
  const originalDailyTarget = originalDays > 0 ? totalGoal / originalDays : totalGoal;
  const deadlinePassed = isAfter(today, goal.targetDate);

  const projectionStartDate = getProjectionStartDate(goal, earnings, today);
  const remainingDays = projectionStartDate
    ? daysBetweenInclusive(projectionStartDate, goal.targetDate)
    : 0;

  const currentDailyTarget =
    amountRemaining === 0 ? 0 : remainingDays > 0 ? amountRemaining / remainingDays : amountRemaining;
  const progressPercent = totalGoal > 0 ? (totalEarned / totalGoal) * 100 : 0;
  const idealEarnedToDate = calculateIdealEarnedToDate(goal, today);
  const shortfall = deadlinePassed ? amountRemaining : 0;
  const pace = calculatePace({
    amountRemaining,
    deadlinePassed,
    idealEarnedToDate,
    totalEarned,
  });

  return {
    totalGoal,
    totalEarned,
    amountRemaining,
    overage,
    originalDailyTarget,
    currentDailyTarget,
    progressPercent,
    originalDays,
    remainingDays,
    projectionStartDate,
    deadlinePassed,
    idealEarnedToDate,
    pace,
    statusMessage: paceMessage(pace),
    shortfall,
  };
}

function getProjectionStartDate(
  goal: Goal,
  earnings: EarningEntry[],
  today: CalendarDateString,
): CalendarDateString | null {
  if (isAfter(today, goal.targetDate)) {
    return null;
  }

  const startFromToday = maxDate(today, goal.startDate);
  const hasRecordedToday = earnings.some((entry) => entry.date === today);
  const start = hasRecordedToday ? addCalendarDays(startFromToday, 1) : startFromToday;

  if (isAfter(start, goal.targetDate)) {
    return null;
  }

  return start;
}

function calculateIdealEarnedToDate(goal: Goal, today: CalendarDateString): number {
  const totalDays = daysBetweenInclusive(goal.startDate, goal.targetDate);
  if (totalDays <= 0 || isBefore(today, goal.startDate)) {
    return 0;
  }

  const throughDate = minDate(today, goal.targetDate);
  const elapsedDays = daysBetweenInclusive(goal.startDate, throughDate);
  return normalizeMoney((goal.targetAmount / totalDays) * elapsedDays);
}

function calculatePace(input: {
  amountRemaining: number;
  deadlinePassed: boolean;
  idealEarnedToDate: number;
  totalEarned: number;
}): GoalStats["pace"] {
  if (input.amountRemaining <= 0) {
    return "reached";
  }

  if (input.deadlinePassed) {
    return "deadline-passed";
  }

  const delta = input.totalEarned - input.idealEarnedToDate;
  if (Math.abs(delta) < 0.01) {
    return "on";
  }

  return delta > 0 ? "ahead" : "behind";
}

function paceMessage(pace: GoalStats["pace"]): string {
  switch (pace) {
    case "ahead":
      return "You are ahead of pace.";
    case "on":
      return "You are on pace.";
    case "behind":
      return "You are behind pace.";
    case "reached":
      return "Goal reached.";
    case "deadline-passed":
      return "Deadline passed.";
  }
}

export function sortEntriesNewestFirst(entries: EarningEntry[]): EarningEntry[] {
  return [...entries].sort((a, b) => {
    const dateOrder = compareCalendarDates(b.date, a.date);
    if (dateOrder !== 0) {
      return dateOrder;
    }

    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function groupEntriesByDate(entries: EarningEntry[]): Array<{
  date: CalendarDateString;
  total: number;
  count: number;
}> {
  const grouped = new Map<CalendarDateString, { total: number; count: number }>();

  for (const entry of entries) {
    const current = grouped.get(entry.date) ?? { total: 0, count: 0 };
    grouped.set(entry.date, {
      total: normalizeMoney(current.total + entry.amount),
      count: current.count + 1,
    });
  }

  return Array.from(grouped.entries())
    .map(([date, value]) => ({ date, ...value }))
    .sort((a, b) => compareCalendarDates(b.date, a.date));
}
