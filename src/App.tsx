import { useEffect, useMemo, useRef, useState } from "react";
import { DailyPlan } from "./components/DailyPlan";
import { DebtDashboard } from "./components/DebtDashboard";
import { EarningsForm } from "./components/EarningsForm";
import { EarningsHistory } from "./components/EarningsHistory";
import { GoalForm } from "./components/GoalForm";
import { SummaryDashboard } from "./components/SummaryDashboard";
import { usePersistentAppData } from "./hooks/usePersistentAppData";
import { useTheme } from "./hooks/useTheme";
import type { Debt, EarningEntry, Goal } from "./types";
import { calculateGoalStats } from "./utils/calculations";
import {
  applyDebtPayment,
  calculateDebtSummary,
  createDailyDebtRecord,
  refreshDailyDebtRecord,
} from "./utils/debtCalculations";
import { todayString } from "./utils/dates";

export default function App() {
  const [data, setData] = usePersistentAppData();
  const [editingGoal, setEditingGoal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EarningEntry | null>(null);
  const earningsFormRef = useRef<HTMLDivElement | null>(null);
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
    const summary = calculateDebtSummary(data.debts, today);
    const existingRecord = data.dailyDebtRecords.find((record) => record.date === today);

    if (!existingRecord && summary.todaysRequiredAmount <= 0) {
      return;
    }

    const nextRecord = existingRecord
      ? refreshDailyDebtRecord(
          existingRecord,
          summary,
          data.earnings,
          data.debtPayments,
          data.debts,
          goalDailyTarget,
        )
      : createDailyDebtRecord(
          today,
          summary,
          data.earnings,
          data.debtPayments,
          data.debts,
          goalDailyTarget,
        );

    if (JSON.stringify(existingRecord) === JSON.stringify(nextRecord)) {
      return;
    }

    setData((current) => ({
      ...current,
      dailyDebtRecords: existingRecord
        ? current.dailyDebtRecords.map((record) => (record.date === today ? nextRecord : record))
        : [...current.dailyDebtRecords, nextRecord],
    }));
  }, [
    data.debtPayments,
    data.debts,
    data.dailyDebtRecords,
    data.earnings,
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

  function cycleTheme() {
    setData((current) => ({
      ...current,
      theme: resolvedTheme === "dark" ? "light" : "dark",
    }));
  }

  function jumpToAddEarnings() {
    setEditingEntry(null);
    window.setTimeout(() => {
      earningsFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const amountInput = earningsFormRef.current?.querySelector<HTMLInputElement>(
        'input[placeholder="0.00"]',
      );
      amountInput?.focus({ preventScroll: true });
      amountInput?.select();
    }, 0);
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
            onAddEarnings={jumpToAddEarnings}
          />
          <div ref={earningsFormRef} className="earnings-anchor">
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
