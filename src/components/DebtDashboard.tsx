import { FormEvent, useMemo, useState } from "react";
import type { CalendarDateString, DailyDebtRecord, Debt, DebtPayment, EarningEntry } from "../types";
import {
  calculateDebtSummary,
  calculateTodayDebtState,
  createDailyDebtRecord,
  refreshDailyDebtRecord,
  type DebtProjection,
} from "../utils/debtCalculations";
import { formatCurrency } from "../utils/currency";
import { compareCalendarDates, formatDisplayDate, isBefore } from "../utils/dates";

interface DebtDashboardProps {
  debts: Debt[];
  debtPayments: DebtPayment[];
  dailyDebtRecords: DailyDebtRecord[];
  earnings: EarningEntry[];
  today: CalendarDateString;
  goalDailyTarget: number;
  onSaveDebt: (debt: Debt) => void;
  onRemoveDebt: (debtId: string) => void;
  onAddPayment: (debtId: string, amount: number, note: string) => void;
  onAddEarnings: () => void;
}

export function DebtDashboard({
  debts,
  debtPayments,
  dailyDebtRecords,
  earnings,
  today,
  goalDailyTarget,
  onSaveDebt,
  onRemoveDebt,
  onAddPayment,
  onAddEarnings,
}: DebtDashboardProps) {
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [paymentDebtId, setPaymentDebtId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const summary = useMemo(() => calculateDebtSummary(debts, today), [debts, today]);
  const liveDailyDebtRecords = useMemo(() => {
    const existingRecord = dailyDebtRecords.find((record) => record.date === today);

    if (existingRecord) {
      const liveRecord = refreshDailyDebtRecord(
        existingRecord,
        summary,
        earnings,
        debtPayments,
        debts,
        goalDailyTarget,
      );

      return dailyDebtRecords.map((record) => (record.date === today ? liveRecord : record));
    }

    if (summary.todaysRequiredAmount <= 0) {
      return dailyDebtRecords;
    }

    return [
      ...dailyDebtRecords,
      createDailyDebtRecord(today, summary, earnings, debtPayments, debts, goalDailyTarget),
    ];
  }, [dailyDebtRecords, debtPayments, debts, earnings, goalDailyTarget, summary, today]);
  const todayState = calculateTodayDebtState(liveDailyDebtRecords, today);
  const paidDebts = debts.filter((debt) => debt.status === "paid" || debt.status === "archived");
  const activeDebts = debts.filter((debt) => debt.status === "active");

  function startPayment(debtId: string, amount = "") {
    setPaymentDebtId(debtId);
    setPaymentAmount(amount);
    setPaymentNote("");
  }

  function submitPayment(event: FormEvent) {
    event.preventDefault();
    const amount = Number(paymentAmount);
    if (!paymentDebtId || !Number.isFinite(amount) || amount <= 0) {
      return;
    }

    onAddPayment(paymentDebtId, amount, paymentNote);
    setPaymentDebtId("");
    setPaymentAmount("");
    setPaymentNote("");
  }

  return (
    <div className="stack debt-stack">
      <section className={`dashboard-hero debt-hero ${todayState?.record.completed ? "complete" : ""}`}>
        <div className="hero-copy">
          <p className="eyebrow">Today's debt</p>
          <h1>
            {todayState?.record.completed
              ? "Debt paid for today"
              : `${formatCurrency(todayState?.remainingToday ?? 0)} remaining today`}
          </h1>
          <p>
            {formatCurrency(todayState?.earnedToday ?? 0)} /{" "}
            {formatCurrency(todayState?.record.requiredDebtAmount ?? 0)}
          </p>
          <button type="button" className="debt-quick-action" onClick={onAddEarnings}>
            Add earnings
          </button>
          {todayState?.record.completed && <p className="success-text">Debt paid for today ✓</p>}
          {todayState && todayState.extraAvailable > 0 && (
            <p className="success-text">Extra available: {formatCurrency(todayState.extraAvailable)}</p>
          )}
        </div>

        <div className="debt-accomplishments">
          <strong>{todayState?.completedDays ?? 0}</strong>
          <span>Debt days completed</span>
          <strong>{todayState?.currentStreak ?? 0}</strong>
          <span>Current streak</span>
        </div>

        <div className="progress-wrap">
          <div className="progress-bar debt-meter">
            <span style={{ width: `${todayState?.progressPercent ?? 0}%` }} />
          </div>
          <div className="progress-meta">
            <strong>{Math.round(todayState?.progressPercent ?? 0)}%</strong>
            <span>
              Today's earnings fill this meter. Actual creditor payments are recorded separately.
            </span>
          </div>
        </div>

        <div className="debt-breakdown">
          {todayState?.record.debtContributions.length ? (
            todayState.record.debtContributions.map((item) => (
              <div key={item.debtId} className="projection-row">
                <span>{item.debtName}</span>
                <strong>{formatCurrency(item.requiredAmount)}</strong>
              </div>
            ))
          ) : (
            <p className="empty-state">Add debts with payoff dates to create today's debt target.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Debt plan</p>
            <h2>Total debt</h2>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEditingDebt(null);
              setShowDebtForm((value) => !value);
            }}
          >
            {showDebtForm ? "Close" : "Add debt"}
          </button>
        </div>

        <div className="stats-grid debt-stats">
          <DebtStat label="Principal" value={formatCurrency(summary.activePrincipal)} />
          <DebtStat label="Est. daily interest" value={`~${formatCurrency(summary.estimatedDailyInterest)}`} />
          <DebtStat label="Est. future interest" value={`~${formatCurrency(summary.projectedFutureInterest)}`} />
          <DebtStat label="Projected total payoff" value={`~${formatCurrency(summary.projectedTotalPayoff)}`} />
          <DebtStat label="Today's required amount" value={formatCurrency(summary.todaysRequiredAmount)} />
          <DebtStat label="Other daily goal" value={formatCurrency(goalDailyTarget)} />
        </div>

        {(showDebtForm || editingDebt) && (
          <DebtForm
            today={today}
            initialDebt={editingDebt}
            onCancel={() => {
              setEditingDebt(null);
              setShowDebtForm(false);
            }}
            onSave={(debt) => {
              onSaveDebt(debt);
              setEditingDebt(null);
              setShowDebtForm(false);
            }}
          />
        )}
      </section>

      {todayState && todayState.extraAvailable > 0 && activeDebts.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Extra money</p>
              <h2>Put extra toward debt</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => startPayment(activeDebts[0].id, String(todayState.extraAvailable))}
          >
            Put Extra Toward Debt
          </button>
        </section>
      )}

      {paymentDebtId && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Creditor payment</p>
              <h2>Record a payment</h2>
            </div>
          </div>
          <form className="earning-form" onSubmit={submitPayment}>
            <label>
              Debt
              <select value={paymentDebtId} onChange={(event) => setPaymentDebtId(event.target.value)}>
                {activeDebts.map((debt) => (
                  <option key={debt.id} value={debt.id}>
                    {debt.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                required
              />
            </label>
            <label className="wide">
              Note
              <input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} />
            </label>
            <div className="actions wide">
              <button type="button" className="secondary" onClick={() => setPaymentDebtId("")}>
                Cancel
              </button>
              <button type="submit">Apply payment</button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Debts</p>
            <h2>Active debts</h2>
          </div>
        </div>
        <div className="debt-card-grid">
          {summary.projections.length === 0 ? (
            <p className="empty-state">No active debts yet.</p>
          ) : (
            summary.projections.map((projection) => (
              <DebtCard
                key={projection.debt.id}
                projection={projection}
                onEdit={() => setEditingDebt(projection.debt)}
                onPayment={() => startPayment(projection.debt.id)}
                onRemove={() => onRemoveDebt(projection.debt.id)}
              />
            ))
          )}
        </div>
      </section>

      {paidDebts.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Archive</p>
              <h2>Paid-off debts</h2>
            </div>
          </div>
          <div className="daily-summary">
            {paidDebts.map((debt) => (
              <div className="summary-row" key={debt.id}>
                <span>{debt.name}</span>
                <strong>Paid</strong>
                <small>{formatCurrency(debt.amountPaid)} paid</small>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">History</p>
            <h2>Debt days</h2>
          </div>
        </div>
        <DebtHistory records={liveDailyDebtRecords} />
      </section>
    </div>
  );
}

function DebtForm({
  today,
  initialDebt,
  onCancel,
  onSave,
}: {
  today: CalendarDateString;
  initialDebt: Debt | null;
  onCancel: () => void;
  onSave: (debt: Debt) => void;
}) {
  const [name, setName] = useState(initialDebt?.name ?? "");
  const [currentBalance, setCurrentBalance] = useState(
    initialDebt ? String(initialDebt.currentBalance) : "",
  );
  const [apr, setApr] = useState(initialDebt ? String(initialDebt.apr) : "0");
  const [targetPayoffDate, setTargetPayoffDate] = useState(initialDebt?.targetPayoffDate ?? "");
  const [minimumMonthlyPayment, setMinimumMonthlyPayment] = useState(
    initialDebt?.minimumMonthlyPayment ? String(initialDebt.minimumMonthlyPayment) : "",
  );

  const balance = Number(currentBalance);
  const parsedApr = Number(apr);
  const minimum = minimumMonthlyPayment === "" ? null : Number(minimumMonthlyPayment);
  const errors = [
    !name.trim() ? "Enter a debt name." : "",
    !Number.isFinite(balance) || balance < 0 ? "Balance must be zero or greater." : "",
    !Number.isFinite(parsedApr) || parsedApr < 0 || parsedApr > 200
      ? "APR must be between 0% and 200%."
      : "",
    targetPayoffDate && isBefore(targetPayoffDate, today)
      ? "Target payoff date cannot be before today."
      : "",
    minimum !== null && (!Number.isFinite(minimum) || minimum < 0)
      ? "Minimum payment must be zero or greater."
      : "",
  ].filter(Boolean);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (errors.length > 0) {
      return;
    }

    const now = new Date().toISOString();
    onSave({
      id: initialDebt?.id ?? crypto.randomUUID(),
      name: name.trim(),
      currentBalance: balance,
      apr: parsedApr,
      targetPayoffDate: targetPayoffDate || null,
      minimumMonthlyPayment: minimum,
      createdAt: initialDebt?.createdAt ?? now,
      updatedAt: now,
      amountPaid: initialDebt?.amountPaid ?? 0,
      status: balance <= 0 ? "paid" : "active",
    });
  }

  return (
    <form className="form-grid nested-form" onSubmit={submit} noValidate>
      <label>
        Debt name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Apple Card" />
      </label>
      <label>
        Current balance
        <input
          type="number"
          min="0"
          step="0.01"
          value={currentBalance}
          onChange={(event) => setCurrentBalance(event.target.value)}
        />
      </label>
      <label>
        APR
        <input type="number" min="0" max="200" step="0.01" value={apr} onChange={(event) => setApr(event.target.value)} />
      </label>
      <label>
        Target payoff date
        <input
          type="date"
          min={today}
          value={targetPayoffDate}
          onChange={(event) => setTargetPayoffDate(event.target.value)}
        />
      </label>
      <label>
        Minimum monthly payment
        <input
          type="number"
          min="0"
          step="0.01"
          value={minimumMonthlyPayment}
          onChange={(event) => setMinimumMonthlyPayment(event.target.value)}
        />
      </label>
      {errors.length > 0 && (
        <div className="validation">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={errors.length > 0}>
          Save debt
        </button>
      </div>
    </form>
  );
}

function DebtCard({
  projection,
  onEdit,
  onPayment,
  onRemove,
}: {
  projection: DebtProjection;
  onEdit: () => void;
  onPayment: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="debt-card">
      <div>
        <h3>{projection.debt.name}</h3>
        <span className="tag">{projection.debt.apr.toFixed(2)}% APR</span>
      </div>
      <dl>
        <div>
          <dt>Balance</dt>
          <dd>{formatCurrency(projection.balance)}</dd>
        </div>
        <div>
          <dt>Daily Interest</dt>
          <dd>~{formatCurrency(projection.estimatedDailyInterest)}</dd>
        </div>
        <div>
          <dt>Today's Goal</dt>
          <dd>{formatCurrency(projection.requiredDailyContribution)}</dd>
        </div>
        <div>
          <dt>Projected Payoff</dt>
          <dd>
            {projection.projectedPayoffDate
              ? formatDisplayDate(projection.projectedPayoffDate)
              : "Set a target"}
          </dd>
        </div>
      </dl>
      <p className="inline-note">
        Estimated future interest: ~{formatCurrency(projection.projectedFutureInterest)}
      </p>
      <div className="row-actions">
        <button type="button" className="secondary small" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="secondary small" onClick={onPayment}>
          Add Payment
        </button>
        <button type="button" className="danger small" onClick={onRemove}>
          Remove
        </button>
      </div>
    </article>
  );
}

function DebtHistory({ records }: { records: DailyDebtRecord[] }) {
  const sorted = [...records].sort((a, b) => compareCalendarDates(b.date, a.date));

  if (sorted.length === 0) {
    return <p className="empty-state">Daily debt records will appear here as you use BigMoney.</p>;
  }

  return (
    <div className="daily-summary">
      {sorted.slice(0, 21).map((record) => (
        <div className="summary-row" key={record.date}>
          <span>{formatDisplayDate(record.date)}</span>
          <strong>
            {record.completed ? "✓ " : ""}
            {formatCurrency(record.completedAmount)} / {formatCurrency(record.requiredDebtAmount)}
          </strong>
          <small>Extra {formatCurrency(record.extraAvailable)}</small>
        </div>
      ))}
    </div>
  );
}

function DebtStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
