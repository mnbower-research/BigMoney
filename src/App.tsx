import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { DailyPlan } from "./components/DailyPlan";
import { DebtDashboard } from "./components/DebtDashboard";
import { EarningsForm } from "./components/EarningsForm";
import { EarningsHistory } from "./components/EarningsHistory";
import { GoalForm } from "./components/GoalForm";
import { SummaryDashboard } from "./components/SummaryDashboard";
import { usePersistentAppData } from "./hooks/usePersistentAppData";
import { useTheme } from "./hooks/useTheme";
import type { AppData, Debt, EarningEntry, Goal, ThemePreference } from "./types";
import { calculateGoalStats } from "./utils/calculations";
import {
  applyDebtPayment,
  calculateDebtSummary,
  createDailyDebtRecord,
  refreshDailyDebtRecord,
} from "./utils/debtCalculations";
import { earningsToCsv } from "./utils/csv";
import { todayString } from "./utils/dates";
import { validateImportedData } from "./utils/storage";

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export default function App() {
  const [data, setData] = usePersistentAppData();
  const [editingGoal, setEditingGoal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EarningEntry | null>(null);
  const [importMessage, setImportMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
    const nextTheme: Record<ThemePreference, ThemePreference> = {
      system: "light",
      light: "dark",
      dark: "system",
    };

    setData((current) => ({ ...current, theme: nextTheme[current.theme] }));
  }

  function exportJson() {
    downloadFile(
      "bigmoney-backup.json",
      JSON.stringify(data, null, 2),
      "application/json;charset=utf-8",
    );
  }

  function exportCsv() {
    downloadFile("bigmoney-earnings.csv", earningsToCsv(data.earnings), "text/csv;charset=utf-8");
  }

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setImportMessage("");

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const result = validateImportedData(parsed);

        if (!result.ok || !result.data) {
          setImportMessage(result.errors.join(" "));
          return;
        }

        const hasCurrentData =
          data.goal !== null ||
          data.earnings.length > 0 ||
          data.debts.length > 0 ||
          data.debtPayments.length > 0;
        if (hasCurrentData && !window.confirm("Importing will replace your current BigMoney data. Continue?")) {
          return;
        }

        setData(result.data);
        setEditingGoal(false);
        setEditingEntry(null);
        setImportMessage("Import complete.");
      } catch {
        setImportMessage("Import failed. Choose a valid BigMoney JSON backup.");
      }
    };
    reader.readAsText(file);
  }

  if (editingGoal) {
    return (
      <main className="app-shell">
        <TopBar
          theme={data.theme}
          resolvedTheme={resolvedTheme}
          onCycleTheme={cycleTheme}
          onExportJson={exportJson}
          onExportCsv={exportCsv}
          onImportClick={() => fileInputRef.current?.click()}
        />
        <GoalForm
          initialGoal={editingGoal ? data.goal : null}
          today={today}
          onSave={saveGoal}
          onCancel={editingGoal ? () => setEditingGoal(false) : undefined}
        />
        <ImportInput refElement={fileInputRef} onImport={handleImport} message={importMessage} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <TopBar
        theme={data.theme}
        resolvedTheme={resolvedTheme}
        onCycleTheme={cycleTheme}
        onExportJson={exportJson}
        onExportCsv={exportCsv}
        onImportClick={() => fileInputRef.current?.click()}
      />

      {data.goal ? (
        <SummaryDashboard
          goal={data.goal}
          stats={stats!}
          onEditGoal={() => setEditingGoal(true)}
          onResetProgress={resetProgress}
          onDeleteGoal={deleteGoal}
        />
      ) : (
        <section className="panel optional-goal-panel">
          <div>
            <p className="eyebrow">Money goal</p>
            <h2>Daily income goal is optional</h2>
            <p className="inline-note">
              BigMoney can track debt days by itself, or you can add a broader money goal too.
            </p>
          </div>
          <button type="button" className="secondary" onClick={() => setEditingGoal(true)}>
            Add money goal
          </button>
        </section>
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
          />
          <EarningsForm
            key={editingEntry?.id ?? "new-entry"}
            goal={data.goal}
            today={today}
            editingEntry={editingEntry}
            onCancelEdit={() => setEditingEntry(null)}
            onSave={saveEntry}
          />
          <EarningsHistory
            entries={data.earnings}
            targetDate={data.goal?.targetDate}
            onEdit={setEditingEntry}
            onDelete={deleteEntry}
          />
        </div>
        {data.goal && <DailyPlan stats={stats!} targetDate={data.goal.targetDate} />}
      </div>

      <ImportInput refElement={fileInputRef} onImport={handleImport} message={importMessage} />
    </main>
  );
}

interface TopBarProps {
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  onCycleTheme: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onImportClick: () => void;
}

function TopBar({
  theme,
  resolvedTheme,
  onCycleTheme,
  onExportJson,
  onExportCsv,
  onImportClick,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <a className="brand" href="/" aria-label="BigMoney home">
        <span aria-hidden="true">$</span>
        BigMoney
      </a>
      <div className="top-actions">
        <button type="button" className="secondary" onClick={onCycleTheme}>
          {THEME_LABELS[theme]} mode
        </button>
        <button type="button" className="secondary" onClick={onExportJson}>
          Export JSON
        </button>
        <button type="button" className="secondary" onClick={onImportClick}>
          Import JSON
        </button>
        <button type="button" className="secondary" onClick={onExportCsv}>
          Export CSV
        </button>
        <span className="sr-only">Resolved theme: {resolvedTheme}</span>
      </div>
    </header>
  );
}

function ImportInput({
  refElement,
  onImport,
  message,
}: {
  refElement: React.RefObject<HTMLInputElement | null>;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  message: string;
}) {
  return (
    <>
      <input
        ref={refElement}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={onImport}
      />
      {message && (
        <p className="import-message" role="status">
          {message}
        </p>
      )}
    </>
  );
}

function downloadFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
