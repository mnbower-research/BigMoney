import { useEffect, useMemo, useState } from "react";
import { DailyPlan } from "./components/DailyPlan";
import { DebtDashboard } from "./components/DebtDashboard";
import { EarningsForm } from "./components/EarningsForm";
import { EarningsHistory } from "./components/EarningsHistory";
import { GoalForm } from "./components/GoalForm";
import { SummaryDashboard } from "./components/SummaryDashboard";
import { usePersistentAppData } from "./hooks/usePersistentAppData";
import { useTheme } from "./hooks/useTheme";
import type { DailyDebtRecord, Debt, DebtPayment, EarningEntry, Goal, RolloverAllocation } from "./types";
import { calculateGoalStats } from "./utils/calculations";
import {
  applyDebtPayment,
  calculateDebtSummary,
  calculateRolloverUsageForDate,
  canAllocateRolloverAmount,
  createDailyDebtRecord,
  refreshDailyDebtRecord,
  rolloverAllocatedFromDate,
  rolloverConsumedByAllocation,
} from "./utils/debtCalculations";
import { addCalendarDays, compareCalendarDates, todayString } from "./utils/dates";
import { normalizeMoney } from "./utils/currency";

export default function App() {
  const [data, setData] = usePersistentAppData();
  const [editingGoal, setEditingGoal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EarningEntry | null>(null);
  const today = todayString();
  const resolvedTheme = useTheme(data.theme);

  const stats = useMemo(() => {
    if (!data.goal) {
      return null;
    }

    return calculateGoalStats(data.goal, data.earnings, today);
  }, [data.earnings, data.goal, today]);
  const goalDailyTarget = stats?.currentDailyTarget ?? 0;

  useEffect(() => {
    const nextRecords = reconcileDailyDebtRecords({
      records: data.dailyDebtRecords,
      debts: data.debts,
      debtPayments: data.debtPayments,
      earnings: data.earnings,
      rolloverAllocations: data.rolloverAllocations,
      goalDailyTarget,
      today,
    });

    if (JSON.stringify(data.dailyDebtRecords) === JSON.stringify(nextRecords)) {
      return;
    }

    setData((current) => ({
      ...current,
      dailyDebtRecords: nextRecords,
    }));
  }, [
    data.debtPayments,
    data.debts,
    data.dailyDebtRecords,
    data.earnings,
    data.rolloverAllocations,
    goalDailyTarget,
    setData,
    today,
  ]);

  function saveGoal(goal: Goal) {
    setData((current) => ({
      ...current,
      goal,
      earnings: current.earnings.filter((entry) => entry.date >= goal.startDate),
    }));
    setEditingGoal(false);
  }

  function saveEntry(entry: EarningEntry) {
    setData((current) => {
      const exists = current.earnings.some((item) => item.id === entry.id);
      return {
        ...current,
        earnings: exists
          ? current.earnings.map((item) => (item.id === entry.id ? entry : item))
          : [...current.earnings, entry],
      };
    });
    setEditingEntry(null);
  }

  function deleteEntry(entryId: string) {
    if (!window.confirm("Delete this earnings entry?")) {
      return;
    }

    setData((current) => ({
      ...current,
      earnings: current.earnings.filter((entry) => entry.id !== entryId),
    }));

    if (editingEntry?.id === entryId) {
      setEditingEntry(null);
    }
  }

  function resetProgress() {
    if (!window.confirm("Reset all recorded earnings for this goal?")) {
      return;
    }

    setData((current) => ({ ...current, earnings: [] }));
    setEditingEntry(null);
  }

  function deleteGoal() {
    if (!window.confirm("Delete this goal and all earnings history?")) {
      return;
    }

    setData((current) => ({ ...current, goal: null, earnings: [] }));
    setEditingGoal(false);
    setEditingEntry(null);
  }

  function saveDebt(debt: Debt) {
    setData((current) => {
      const exists = current.debts.some((item) => item.id === debt.id);
      return {
        ...current,
        debts: exists
          ? current.debts.map((item) => (item.id === debt.id ? debt : item))
          : [...current.debts, debt],
      };
    });
  }

  function removeDebt(debtId: string) {
    if (!window.confirm("Remove this debt from active planning? History and payments will be preserved.")) {
      return;
    }

    setData((current) => ({
      ...current,
      debts: current.debts.map((debt) =>
        debt.id === debtId
          ? {
              ...debt,
              status: "archived",
              updatedAt: new Date().toISOString(),
            }
          : debt,
      ),
    }));
  }

  function addDebtPayment(debtId: string, amount: number, note: string) {
    setData((current) => {
      const result = applyDebtPayment(current.debts, debtId, amount);
      if (result.appliedAmount <= 0) {
        return current;
      }

      return {
        ...current,
        debts: result.debts,
        debtPayments: [
          ...current.debtPayments,
          {
            id: crypto.randomUUID(),
            debtId,
            date: today,
            amount: result.appliedAmount,
            note: note.trim(),
            createdAt: new Date().toISOString(),
          },
        ],
      };
    });
  }

  function addRolloverAllocation(amount: number) {
    setData((current) => {
      const todayRecord = current.dailyDebtRecords.find((record) => record.date === today);
      const available = todayRecord?.extraAvailable ?? 0;
      const allocationAmount = normalizeMoney(amount);

      if (!canAllocateRolloverAmount(allocationAmount, available)) {
        return current;
      }

      const now = new Date().toISOString();
      return {
        ...current,
        rolloverAllocations: [
          ...current.rolloverAllocations,
          {
            id: crypto.randomUUID(),
            sourceDate: today,
            amount: allocationAmount,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
    });
  }

  function updateRolloverAllocation(allocationId: string, amount: number) {
    setData((current) => {
      const allocation = current.rolloverAllocations.find((item) => item.id === allocationId);
      if (!allocation) {
        return current;
      }

      const consumed = rolloverConsumedByAllocation(current.dailyDebtRecords, allocationId);
      const nextAmount = normalizeMoney(amount);
      if (nextAmount < consumed) {
        return current;
      }

      return {
        ...current,
        rolloverAllocations: current.rolloverAllocations.map((item) =>
          item.id === allocationId
            ? {
                ...item,
                amount: nextAmount,
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      };
    });
  }

  function cycleTheme() {
    setData((current) => ({
      ...current,
      theme: resolvedTheme === "dark" ? "light" : "dark",
    }));
  }

  if (editingGoal) {
    return (
      <main className="app-shell">
        <TopBar
          resolvedTheme={resolvedTheme}
          onCycleTheme={cycleTheme}
        />
        <GoalForm
          initialGoal={editingGoal ? data.goal : null}
          today={today}
          onSave={saveGoal}
          onCancel={editingGoal ? () => setEditingGoal(false) : undefined}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <TopBar
        resolvedTheme={resolvedTheme}
        onCycleTheme={cycleTheme}
        onAddGoal={data.goal ? undefined : () => setEditingGoal(true)}
      />

      {data.goal && (
        <SummaryDashboard
          goal={data.goal}
          stats={stats!}
          onEditGoal={() => setEditingGoal(true)}
          onResetProgress={resetProgress}
          onDeleteGoal={deleteGoal}
        />
      )}

      <div className={`content-grid ${data.goal ? "" : "debt-only-grid"}`}>
        <div className="stack">
          <DebtDashboard
            debts={data.debts}
            debtPayments={data.debtPayments}
            dailyDebtRecords={data.dailyDebtRecords}
            earnings={data.earnings}
            today={today}
            goalDailyTarget={goalDailyTarget}
            onSaveDebt={saveDebt}
            onRemoveDebt={removeDebt}
            onAddPayment={addDebtPayment}
            onSaveEarnings={saveEntry}
            rolloverAllocations={data.rolloverAllocations}
            onAddRollover={addRolloverAllocation}
            onUpdateRollover={updateRolloverAllocation}
          />
          <div className="earnings-anchor">
            <EarningsForm
              key={editingEntry?.id ?? "new-entry"}
              goal={data.goal}
              today={today}
              editingEntry={editingEntry}
              onCancelEdit={() => setEditingEntry(null)}
              onSave={saveEntry}
            />
          </div>
          <EarningsHistory
            entries={data.earnings}
            targetDate={data.goal?.targetDate}
            onEdit={setEditingEntry}
            onDelete={deleteEntry}
          />
        </div>
        {data.goal && <DailyPlan stats={stats!} targetDate={data.goal.targetDate} />}
      </div>
    </main>
  );
}

interface TopBarProps {
  resolvedTheme: "light" | "dark";
  onCycleTheme: () => void;
  onAddGoal?: () => void;
}

function TopBar({
  resolvedTheme,
  onCycleTheme,
  onAddGoal,
}: TopBarProps) {
  const nextThemeLabel = resolvedTheme === "dark" ? "Light mode" : "Dark mode";

  return (
    <header className="top-bar">
      <a className="brand" href="/" aria-label="BigMoney home">
        <span aria-hidden="true">$</span>
        BigMoney
      </a>
      <div className="top-actions">
        {onAddGoal && (
          <button type="button" className="secondary compact-action" onClick={onAddGoal}>
            Add goal
          </button>
        )}
        <button
          type="button"
          className="secondary compact-action theme-toggle"
          onClick={onCycleTheme}
          aria-label={`Switch to ${nextThemeLabel}`}
        >
          {nextThemeLabel}
        </button>
      </div>
    </header>
  );
}

function reconcileDailyDebtRecords({
  records,
  debts,
  debtPayments,
  earnings,
  rolloverAllocations,
  goalDailyTarget,
  today,
}: {
  records: DailyDebtRecord[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  earnings: EarningEntry[];
  rolloverAllocations: RolloverAllocation[];
  goalDailyTarget: number;
  today: string;
}): DailyDebtRecord[] {
  let nextRecords = [...records].sort((a, b) => compareCalendarDates(a.date, b.date));
  const latestRecordDate = nextRecords.at(-1)?.date;
  let cursor = latestRecordDate && compareCalendarDates(latestRecordDate, today) < 0
    ? addCalendarDays(latestRecordDate, 1)
    : today;

  while (compareCalendarDates(cursor, today) <= 0) {
    nextRecords = upsertDebtRecordForDate({
      records: nextRecords,
      debts,
      debtPayments,
      earnings,
      rolloverAllocations,
      goalDailyTarget,
      date: cursor,
      allowRefreshExisting: cursor === today,
    });
    cursor = addCalendarDays(cursor, 1);
  }

  return nextRecords.sort((a, b) => compareCalendarDates(a.date, b.date));
}

function upsertDebtRecordForDate({
  records,
  debts,
  debtPayments,
  earnings,
  rolloverAllocations,
  goalDailyTarget,
  date,
  allowRefreshExisting,
}: {
  records: DailyDebtRecord[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  earnings: EarningEntry[];
  rolloverAllocations: RolloverAllocation[];
  goalDailyTarget: number;
  date: string;
  allowRefreshExisting: boolean;
}): DailyDebtRecord[] {
  const existingRecord = records.find((record) => record.date === date);
  if (existingRecord && !allowRefreshExisting) {
    return records;
  }

  const priorRecords = records.filter((record) => compareCalendarDates(record.date, date) < 0);
  const summary = calculateDebtSummary(debts, date);
  const rolloverUsage = calculateRolloverUsageForDate(
    rolloverAllocations,
    priorRecords,
    date,
    summary.todaysRequiredAmount,
  );

  if (!existingRecord && summary.todaysRequiredAmount <= 0 && rolloverUsage.rolloverApplied <= 0) {
    return records;
  }

  const reservedFromExtra = rolloverAllocatedFromDate(rolloverAllocations, date);
  const nextRecord = existingRecord
    ? refreshDailyDebtRecord(
        existingRecord,
        summary,
        earnings,
        debtPayments,
        debts,
        goalDailyTarget,
        rolloverUsage,
        reservedFromExtra,
      )
    : createDailyDebtRecord(
        date,
        summary,
        earnings,
        debtPayments,
        debts,
        goalDailyTarget,
        rolloverUsage,
        reservedFromExtra,
      );

  return existingRecord
    ? records.map((record) => (record.date === date ? nextRecord : record))
    : [...records, nextRecord];
}
