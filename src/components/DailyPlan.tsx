import { useMemo, useState } from "react";
import type { GoalStats } from "../utils/calculations";
import { formatCurrency } from "../utils/currency";
import { formatDisplayDate } from "../utils/dates";
import { buildDailyProjection } from "../utils/projections";

interface DailyPlanProps {
  stats: GoalStats;
  targetDate: string;
}

export function DailyPlan({ stats, targetDate }: DailyPlanProps) {
  const [expanded, setExpanded] = useState(false);
  const projection = useMemo(
    () => buildDailyProjection(stats.projectionStartDate, targetDate, stats.amountRemaining),
    [stats.amountRemaining, stats.projectionStartDate, targetDate],
  );
  const visibleProjection = expanded ? projection : projection.slice(0, 30);

  return (
    <section className="panel" aria-labelledby="daily-plan-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Plan</p>
          <h2 id="daily-plan-title">Daily projection</h2>
        </div>
        {projection.length > 30 && (
          <button type="button" className="secondary" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show 30 days" : "Show all days"}
          </button>
        )}
      </div>

      {projection.length === 0 ? (
        <p className="empty-state">
          {stats.amountRemaining === 0
            ? "The goal is fully funded."
            : "There are no remaining earning days in the current deadline."}
        </p>
      ) : (
        <div className="projection-list">
          {visibleProjection.map((day) => (
            <div className="projection-row" key={day.date}>
              <span>{formatDisplayDate(day.date)}</span>
              <strong>{formatCurrency(day.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
