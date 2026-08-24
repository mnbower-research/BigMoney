import type { Goal } from "../types";
import { StatCard } from "./StatCard";
import { formatCurrency, formatPercent } from "../utils/currency";
import { formatDisplayDate } from "../utils/dates";
import type { GoalStats } from "../utils/calculations";

interface SummaryDashboardProps {
  goal: Goal;
  stats: GoalStats;
  onEditGoal: () => void;
  onResetProgress: () => void;
  onDeleteGoal: () => void;
}

export function SummaryDashboard({
  goal,
  stats,
  onEditGoal,
  onResetProgress,
  onDeleteGoal,
}: SummaryDashboardProps) {
  const progressWidth = `${Math.min(stats.progressPercent, 100)}%`;
  const goalStateClass =
    stats.progressPercent >= 100 ? "goal-complete" : stats.progressPercent >= 85 ? "goal-near" : "";

  return (
    <section className={`dashboard-hero money-goal-hero ${goalStateClass}`} aria-labelledby="dashboard-title">
      <div className="hero-copy">
        <p className="eyebrow">{goal.name || "Money goal"}</p>
        <h1 id="dashboard-title">You need to make {formatCurrency(stats.currentDailyTarget)} per day</h1>
        <p>
          {formatCurrency(stats.totalEarned)} earned of {formatCurrency(stats.totalGoal)} by{" "}
          {formatDisplayDate(goal.targetDate)}.
        </p>
        {stats.progressPercent >= 85 && stats.progressPercent < 100 && (
          <p className="near-goal-text">So close - {formatCurrency(stats.amountRemaining)} left.</p>
        )}
        {stats.overage > 0 && <p className="success-text">Goal exceeded by {formatCurrency(stats.overage)}.</p>}
        {stats.shortfall > 0 && <p className="warning-text">Shortfall: {formatCurrency(stats.shortfall)}.</p>}
      </div>

      <div className="hero-actions">
        <button type="button" className="secondary" onClick={onEditGoal}>
          Edit goal
        </button>
        <button type="button" className="secondary" onClick={onResetProgress}>
          Reset progress
        </button>
        <button type="button" className="danger" onClick={onDeleteGoal}>
          Delete goal
        </button>
      </div>

      <div className="progress-wrap" aria-label={`Progress ${formatPercent(stats.progressPercent)}`}>
        <div className="progress-bar money-meter">
          <span style={{ width: progressWidth }} />
        </div>
        <div className="progress-meta">
          <strong>{stats.overage > 0 ? "Goal exceeded" : formatPercent(stats.progressPercent)}</strong>
          <span>{stats.statusMessage}</span>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Goal amount" value={formatCurrency(stats.totalGoal)} />
        <StatCard label="Total earned" value={formatCurrency(stats.totalEarned)} tone="positive" />
        <StatCard label="Amount remaining" value={formatCurrency(stats.amountRemaining)} />
        <StatCard label="Days remaining" value={String(stats.remainingDays)} />
        <StatCard label="Original daily target" value={formatCurrency(stats.originalDailyTarget)} />
        <StatCard label="Progress" value={formatPercent(stats.progressPercent)} />
      </div>
    </section>
  );
}
