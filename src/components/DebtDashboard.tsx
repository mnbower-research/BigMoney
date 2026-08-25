import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { CalendarDateString, DailyDebtRecord, Debt, DebtPayment, EarningEntry, RolloverAllocation } from "../types";
import {
  calculateDebtSummary,
  calculateFutureReliefSummary,
  calculateRolloverUsageForDate,
  canAllocateRolloverAmount,
  calculateTodayDebtState,
  createDailyDebtRecord,
  refreshDailyDebtRecord,
  rolloverAllocatedFromDate,
  rolloverConsumedByAllocation,
  rolloverUnusedAmount,
  type DebtSummary,
  type DebtProjection,
  type FutureReliefSummary as FutureReliefData,
  type TodayDebtState,
} from "../utils/debtCalculations";
import { formatCurrency, formatPercent } from "../utils/currency";
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
  onSaveEarnings: (entry: EarningEntry) => void;
  rolloverAllocations: RolloverAllocation[];
  onAddRollover: (amount: number) => void;
  onUpdateRollover: (allocationId: string, amount: number) => void;
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
  onSaveEarnings,
  rolloverAllocations,
  onAddRollover,
  onUpdateRollover,
}: DebtDashboardProps) {
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [paymentDebtId, setPaymentDebtId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [showQuickEarnings, setShowQuickEarnings] = useState(false);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [showRolloverForm, setShowRolloverForm] = useState(false);
  const [rolloverAmount, setRolloverAmount] = useState("");
  const [editingRolloverId, setEditingRolloverId] = useState("");
  const [editingRolloverAmount, setEditingRolloverAmount] = useState("");
  const quickAmountRef = useRef<HTMLInputElement | null>(null);
  const quickAmountValue = Number(quickAmount);
  const quickAmountIsValid = Number.isFinite(quickAmountValue) && quickAmountValue > 0;
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
        calculateRolloverUsageForDate(
          rolloverAllocations,
          dailyDebtRecords.filter((record) => compareCalendarDates(record.date, today) < 0),
          today,
          summary.todaysRequiredAmount,
        ),
        rolloverAllocatedFromDate(rolloverAllocations, today),
      );

      return dailyDebtRecords.map((record) => (record.date === today ? liveRecord : record));
    }

    const rolloverUsage = calculateRolloverUsageForDate(
      rolloverAllocations,
      dailyDebtRecords.filter((record) => compareCalendarDates(record.date, today) < 0),
      today,
      summary.todaysRequiredAmount,
    );

    if (summary.todaysRequiredAmount <= 0 && rolloverUsage.rolloverApplied <= 0) {
      return dailyDebtRecords;
    }

    return [
      ...dailyDebtRecords,
      createDailyDebtRecord(
        today,
        summary,
        earnings,
        debtPayments,
        debts,
        goalDailyTarget,
        rolloverUsage,
        rolloverAllocatedFromDate(rolloverAllocations, today),
      ),
    ];
  }, [dailyDebtRecords, debtPayments, debts, earnings, goalDailyTarget, rolloverAllocations, summary, today]);
  const todayState = calculateTodayDebtState(liveDailyDebtRecords, today);
  const todayRecord = todayState?.record;
  const futureRelief = useMemo(
    () => calculateFutureReliefSummary(rolloverAllocations, liveDailyDebtRecords, debts, today),
    [debts, liveDailyDebtRecords, rolloverAllocations, today],
  );
  const progressPercent = todayState?.progressPercent ?? 0;
  const isComplete = Boolean(todayState?.record.completed);
  const isPaidInAdvance = todayRecord?.completionSource === "rollover";
  const isNearGoal = !isComplete && progressPercent >= 75;
  const goalMoodClass = isComplete ? "complete" : isNearGoal ? "near-goal" : "";
  const [showCelebration, setShowCelebration] = useState(false);
  const wasCompleteRef = useRef(isComplete);
  const paidDebts = debts.filter((debt) => debt.status === "paid" || debt.status === "archived");
  const activeDebts = debts.filter((debt) => debt.status === "active");
  const availableExtra = todayState?.extraAvailable ?? 0;
  const rolloverAmountValue = Number(rolloverAmount);
  const rolloverAmountIsValid = canAllocateRolloverAmount(rolloverAmountValue, availableExtra);
  const rolloverDetails = rolloverAllocations
    .map((allocation) => {
      const consumed = rolloverConsumedByAllocation(liveDailyDebtRecords, allocation.id);
      const unused = rolloverUnusedAmount(allocation, liveDailyDebtRecords);
      return { allocation, consumed, unused };
    })
    .filter((item) => item.unused > 0 || item.consumed > 0)
    .sort((a, b) => compareCalendarDates(a.allocation.sourceDate, b.allocation.sourceDate));
  const totalReservedForFuture = futureRelief.totalReservedAmount;

  useEffect(() => {
    if (isComplete && !wasCompleteRef.current) {
      setShowCelebration(true);
      wasCompleteRef.current = isComplete;

      const timer = window.setTimeout(() => setShowCelebration(false), 3600);
      return () => window.clearTimeout(timer);
    }

    wasCompleteRef.current = isComplete;
    return undefined;
  }, [isComplete]);

  useEffect(() => {
    if (showQuickEarnings) {
      window.setTimeout(() => {
        quickAmountRef.current?.focus();
        quickAmountRef.current?.select();
      }, 0);
    }
  }, [showQuickEarnings]);

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

  function submitQuickEarnings(event: FormEvent) {
    event.preventDefault();

    if (!quickAmountIsValid) {
      return;
    }

    const now = new Date().toISOString();
    onSaveEarnings({
      id: crypto.randomUUID(),
      date: today,
      amount: quickAmountValue,
      note: quickNote.trim(),
      createdAt: now,
      updatedAt: now,
    });
    setQuickAmount("");
    setQuickNote("");
    setShowQuickEarnings(false);
  }

  function submitRollover(event: FormEvent) {
    event.preventDefault();
    if (!rolloverAmountIsValid) {
      return;
    }

    onAddRollover(rolloverAmountValue);
    setRolloverAmount("");
    setShowRolloverForm(false);
  }

  function useAllExtraForRollover() {
    if (availableExtra <= 0) {
      return;
    }

    onAddRollover(availableExtra);
    setRolloverAmount("");
    setShowRolloverForm(false);
  }

  function startEditRollover(allocation: RolloverAllocation) {
    setEditingRolloverId(allocation.id);
    setEditingRolloverAmount(String(allocation.amount));
  }

  function submitRolloverEdit(event: FormEvent, allocation: RolloverAllocation, consumed: number) {
    event.preventDefault();
    const nextAmount = Number(editingRolloverAmount);

    if (!Number.isFinite(nextAmount) || nextAmount < consumed) {
      return;
    }

    onUpdateRollover(allocation.id, nextAmount);
    setEditingRolloverId("");
    setEditingRolloverAmount("");
  }

  return (
    <div className="stack debt-stack">
      <section className={`today-command ${goalMoodClass}`}>
        {showCelebration && <CompletionBurst />}
        <div className="today-primary">
          <TodayDebtHero
            todayState={todayState}
            summary={summary}
            progressPercent={progressPercent}
            isComplete={isComplete}
            isPaidInAdvance={isPaidInAdvance}
          />

          <div className="action-center" aria-label="Today debt actions">
            <div className="quick-earnings-shell">
              <button
                type="button"
                className={`debt-quick-action ${isComplete ? "secondary" : ""}`}
                onClick={() => setShowQuickEarnings((value) => !value)}
                aria-expanded={showQuickEarnings}
                aria-controls="quick-earnings-menu"
              >
                {showQuickEarnings ? "Close" : "Add earnings"}
              </button>
              {showQuickEarnings && (
                <form
                  id="quick-earnings-menu"
                  className="quick-earnings-menu"
                  onSubmit={submitQuickEarnings}
                  noValidate
                >
                  <label>
                    Amount
                    <input
                      ref={quickAmountRef}
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      value={quickAmount}
                      onChange={(event) => setQuickAmount(event.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </label>
                  <label>
                    Note <span className="muted">(optional)</span>
                    <input
                      type="text"
                      value={quickNote}
                      onChange={(event) => setQuickNote(event.target.value)}
                      placeholder="Side gig, sale, cash"
                    />
                  </label>
                  <div className="quick-earnings-actions">
                    <button type="button" className="secondary small" onClick={() => setShowQuickEarnings(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="small" disabled={!quickAmountIsValid}>
                      Save
                    </button>
                  </div>
                </form>
              )}
            </div>

            {availableExtra > 0 && (
              <>
                <button type="button" className={isComplete ? "" : "secondary"} onClick={useAllExtraForRollover}>
                  Fund Tomorrow
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setShowRolloverForm((value) => !value);
                    setRolloverAmount("");
                  }}
                >
                  Choose Amount
                </button>
              </>
            )}
            {activeDebts.length > 0 && (
              <button
                type="button"
                className="secondary"
                onClick={() => startPayment(activeDebts[0].id, availableExtra > 0 ? String(availableExtra) : "")}
              >
                Record Payment
              </button>
            )}
          </div>

          {showRolloverForm && availableExtra > 0 && (
            <form className="rollover-form compact-rollover-form" onSubmit={submitRollover} noValidate>
              <label>
                Reserve amount
                <input
                  type="number"
                  min="0.01"
                  max={availableExtra}
                  step="0.01"
                  value={rolloverAmount}
                  onChange={(event) => setRolloverAmount(event.target.value)}
                  placeholder="0.00"
                  required
                />
              </label>
              <div className="actions">
                <button type="button" className="secondary" onClick={() => setShowRolloverForm(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={!rolloverAmountIsValid}>
                  Reserve
                </button>
              </div>
            </form>
          )}
        </div>

        <aside className="today-side">
          <FutureReliefSummary summary={futureRelief} />
          <CompactDebtStats
            completedDays={todayState?.completedDays ?? 0}
            streak={todayState?.currentStreak ?? 0}
            daysLeft={summary.debtDaysLeft}
            fundedDays={futureRelief.fullyFundedDays + futureRelief.nextDayFundedPercent / 100}
          />
        </aside>
      </section>

      {paymentDebtId && (
        <section className="panel active-form-panel">
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

      <DashboardAccordion title="Today details" defaultOpen={Boolean(todayRecord?.rolloverApplied)}>
        <div className="detail-grid">
          <DebtStat label="Earnings today" value={formatCurrency(todayRecord?.earnings ?? 0)} />
          <DebtStat label="Normal target" value={formatCurrency(todayRecord?.requiredDebtAmount ?? 0)} />
          <DebtStat label="Pre-funded today" value={formatCurrency(todayRecord?.rolloverApplied ?? 0)} />
          <DebtStat label="Earnings applied" value={formatCurrency(todayRecord?.earningsAppliedToDebt ?? 0)} />
          <DebtStat label="Extra available" value={formatCurrency(availableExtra)} />
          <DebtStat label="Completion source" value={formatCompletionSource(todayRecord)} />
        </div>
      </DashboardAccordion>

      <DashboardAccordion title="Future funding" defaultOpen={totalReservedForFuture > 0}>
        <FutureFundingDetails
          futureRelief={futureRelief}
          rolloverDetails={rolloverDetails}
          editingRolloverId={editingRolloverId}
          editingRolloverAmount={editingRolloverAmount}
          setEditingRolloverAmount={setEditingRolloverAmount}
          startEditRollover={startEditRollover}
          submitRolloverEdit={submitRolloverEdit}
          onUpdateRollover={onUpdateRollover}
        />
      </DashboardAccordion>

      <DashboardAccordion title="Debt breakdown">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">Debt plan</p>
            <h2>Actual debt stays here</h2>
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
          <DebtStat label="Today's target" value={formatCurrency(summary.todaysRequiredAmount)} />
          <DebtStat
            label="Furthest payoff"
            value={summary.furthestPayoffDate ? formatDisplayDate(summary.furthestPayoffDate) : "Not set"}
          />
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

        {paidDebts.length > 0 && (
          <div className="daily-summary">
            {paidDebts.map((debt) => (
              <div className="summary-row" key={debt.id}>
                <span>{debt.name}</span>
                <strong>Paid</strong>
                <small>{formatCurrency(debt.amountPaid)} paid</small>
              </div>
            ))}
          </div>
        )}
      </DashboardAccordion>

      <DashboardAccordion title="History">
        <DebtHistory records={liveDailyDebtRecords} />
      </DashboardAccordion>
    </div>
  );
}

function TodayDebtHero({
  todayState,
  summary,
  progressPercent,
  isComplete,
  isPaidInAdvance,
}: {
  todayState: TodayDebtState | null;
  summary: DebtSummary;
  progressPercent: number;
  isComplete: boolean;
  isPaidInAdvance: boolean;
}) {
  const record = todayState?.record;
  const hasDailyTarget = (record?.requiredDebtAmount ?? summary.todaysRequiredAmount) > 0;
  const remainingToday = todayState?.remainingToday ?? 0;
  const title = !hasDailyTarget
    ? "No debt scheduled"
    : isComplete
      ? isPaidInAdvance
        ? "Paid in advance"
        : "Clear for today"
      : `${formatCurrency(remainingToday)} left today`;

  return (
    <div className="today-hero-copy">
      <p className="eyebrow">Today's debt</p>
      <div className="today-title-row">
        <h1>{title}</h1>
        {isComplete && <span className="completion-badge">Done</span>}
      </div>
      <p className="today-tally">
        {formatCurrency(record?.completedAmount ?? 0)} of {formatCurrency(record?.requiredDebtAmount ?? 0)}
      </p>
      {record && record.rolloverApplied > 0 && (
        <div className="prefund-summary" aria-label="Prefunded debt details">
          <span>Normal {formatCurrency(record.requiredDebtAmount)}</span>
          <span>Pre-funded -{formatCurrency(record.rolloverApplied)}</span>
          <span>Earned today {formatCurrency(record.earningsAppliedToDebt)}</span>
        </div>
      )}
      <DailyProgress
        progressPercent={progressPercent}
        isComplete={isComplete}
        hasDailyTarget={hasDailyTarget}
      />
      {isComplete && (
        <p className="success-text dopamine-text">
              {isPaidInAdvance ? "Today was already funded." : "Today's obligation is finished."}
        </p>
      )}
      {!isComplete && progressPercent >= 75 && (
        <p className="near-goal-text">Almost there - {formatCurrency(remainingToday)} left.</p>
      )}
      {todayState && todayState.extraAvailable > 0 && (
        <p className="success-text">You have {formatCurrency(todayState.extraAvailable)} available.</p>
      )}
    </div>
  );
}

function DailyProgress({
  progressPercent,
  isComplete,
  hasDailyTarget,
}: {
  progressPercent: number;
  isComplete: boolean;
  hasDailyTarget: boolean;
}) {
  const percent = Math.round(progressPercent);

  return (
    <div className="daily-progress" aria-label={`Daily progress ${percent}%`}>
      <div className="progress-bar debt-meter">
        <span style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="progress-meta">
        <strong>{isComplete ? "100% complete" : `${Math.max(0, 100 - percent)}% remaining`}</strong>
        <span>
          {isComplete
            ? "You can stop here or make tomorrow lighter."
            : hasDailyTarget
              ? "Earnings and pre-funded money fill this meter."
              : "Add debts with payoff dates to create a daily target."}
        </span>
      </div>
    </div>
  );
}

function FutureReliefSummary({ summary }: { summary: FutureReliefData }) {
  const headline = getFutureReliefHeadline(summary);

  return (
    <section className="future-relief-strip" aria-labelledby="future-relief-title">
      <p className="eyebrow" id="future-relief-title">Future relief</p>
      <strong>{headline}</strong>
      <span>{formatCurrency(summary.totalReservedAmount)} reserved</span>
      {summary.nextFundedDate && (
        <div className="mini-meter" aria-label={`${formatPercent(summary.nextDayFundedPercent)} funded`}>
          <span style={{ width: `${summary.nextDayFundedPercent}%` }} />
        </div>
      )}
      {summary.remainingAfterProjectedDebt > 0 && (
        <small>{formatCurrency(summary.remainingAfterProjectedDebt)} left after projected debt days.</small>
      )}
    </section>
  );
}

function CompactDebtStats({
  completedDays,
  streak,
  daysLeft,
  fundedDays,
}: {
  completedDays: number;
  streak: number;
  daysLeft: number;
  fundedDays: number;
}) {
  return (
    <div className="compact-stats" aria-label="Debt progress stats">
      <CompactStat label="Completed" value={String(completedDays)} />
      <CompactStat label="Streak" value={`${streak}d`} />
      <CompactStat label="Days left" value={String(daysLeft)} />
      <CompactStat label="Funded" value={formatFundedDays(fundedDays)} />
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DashboardAccordion({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="dashboard-accordion panel" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <span aria-hidden="true">+</span>
      </summary>
      <div className="accordion-content">{children}</div>
    </details>
  );
}

function FutureFundingDetails({
  futureRelief,
  rolloverDetails,
  editingRolloverId,
  editingRolloverAmount,
  setEditingRolloverAmount,
  startEditRollover,
  submitRolloverEdit,
  onUpdateRollover,
}: {
  futureRelief: FutureReliefData;
  rolloverDetails: Array<{ allocation: RolloverAllocation; consumed: number; unused: number }>;
  editingRolloverId: string;
  editingRolloverAmount: string;
  setEditingRolloverAmount: (value: string) => void;
  startEditRollover: (allocation: RolloverAllocation) => void;
  submitRolloverEdit: (event: FormEvent, allocation: RolloverAllocation, consumed: number) => void;
  onUpdateRollover: (allocationId: string, amount: number) => void;
}) {
  if (rolloverDetails.length === 0) {
    return <p className="empty-state">No future days funded yet.</p>;
  }

  return (
    <div className="stack">
      <div className="detail-grid">
        <DebtStat label="Reserved" value={formatCurrency(futureRelief.totalReservedAmount)} />
        <DebtStat label="Fully funded days" value={String(futureRelief.fullyFundedDays)} />
        <DebtStat
          label="Next funded day"
          value={futureRelief.nextFundedDate ? formatDisplayDate(futureRelief.nextFundedDate) : "None"}
        />
        <DebtStat label="Next day funded" value={formatPercent(futureRelief.nextDayFundedPercent)} />
      </div>
      <div className="daily-summary">
        {rolloverDetails.map(({ allocation, consumed, unused }) => (
          <div className="summary-row rollover-row" key={allocation.id}>
            <span>
              From {formatDisplayDate(allocation.sourceDate)}
              <small>
                {formatCurrency(unused)} unused
                {consumed > 0 && ` / ${formatCurrency(consumed)} already used`}
              </small>
            </span>
            {editingRolloverId === allocation.id ? (
              <form
                className="inline-edit-form"
                onSubmit={(event) => submitRolloverEdit(event, allocation, consumed)}
              >
                <input
                  type="number"
                  min={consumed}
                  step="0.01"
                  value={editingRolloverAmount}
                  onChange={(event) => setEditingRolloverAmount(event.target.value)}
                />
                <button
                  type="submit"
                  className="small"
                  disabled={Number(editingRolloverAmount) < consumed}
                >
                  Save
                </button>
              </form>
            ) : (
              <strong>{formatCurrency(allocation.amount)}</strong>
            )}
            <div className="row-actions">
              <button type="button" className="secondary small" onClick={() => startEditRollover(allocation)}>
                Edit
              </button>
              {unused > 0 && (
                <button
                  type="button"
                  className="secondary small"
                  onClick={() => onUpdateRollover(allocation.id, consumed)}
                >
                  Return unused
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getFutureReliefHeadline(summary: FutureReliefData): string {
  if (summary.totalReservedAmount <= 0) {
    return "No future days funded yet";
  }

  if (summary.fullyFundedDays > 0 && summary.nextFundedDate) {
    return `${summary.fullyFundedDays} covered, next day ${Math.round(summary.nextDayFundedPercent)}% funded`;
  }

  if (summary.fullyFundedDays > 0) {
    return `${summary.fullyFundedDays} ${summary.fullyFundedDays === 1 ? "day is" : "days are"} already covered`;
  }

  if (summary.nextFundedDate) {
    return `Tomorrow is ${Math.round(summary.nextDayFundedPercent)}% funded`;
  }

  return "Future money is reserved";
}

function formatFundedDays(fullyFundedDays: number): string {
  if (fullyFundedDays <= 0) {
    return "0";
  }

  return Number.isInteger(fullyFundedDays) ? `${fullyFundedDays}d` : `${fullyFundedDays.toFixed(1)}d`;
}

function formatCompletionSource(record: DailyDebtRecord | undefined): string {
  if (!record) {
    return "None";
  }

  switch (record.completionSource) {
    case "earnings":
      return "Earnings";
    case "rollover":
      return "Pre-funded";
    case "mixed":
      return "Mixed";
    case "partial":
      return "In progress";
    case "none":
      return "None";
  }
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
          <small>
            {record.rolloverApplied > 0
              ? `Pre-funded ${formatCurrency(record.rolloverApplied)}`
              : `Extra ${formatCurrency(record.extraAvailable)}`}
          </small>
        </div>
      ))}
    </div>
  );
}

const celebrationBursts = Array.from({ length: 8 }, (_, index) => index);

function CompletionBurst() {
  return (
    <div className="completion-burst" aria-hidden="true">
      {celebrationBursts.map((item) => (
        <span key={item} />
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
