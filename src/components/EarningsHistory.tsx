import type { EarningEntry } from "../types";
import { groupEntriesByDate, sortEntriesNewestFirst } from "../utils/calculations";
import { formatCurrency } from "../utils/currency";
import { formatDisplayDate, isAfter } from "../utils/dates";

interface EarningsHistoryProps {
  entries: EarningEntry[];
  targetDate: string;
  onEdit: (entry: EarningEntry) => void;
  onDelete: (entryId: string) => void;
}

export function EarningsHistory({ entries, targetDate, onEdit, onDelete }: EarningsHistoryProps) {
  const dailySummary = groupEntriesByDate(entries);
  const sortedEntries = sortEntriesNewestFirst(entries);

  return (
    <section className="panel history-panel" aria-labelledby="history-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">History</p>
          <h2 id="history-title">Earnings history</h2>
        </div>
      </div>

      <div className="daily-summary" aria-label="Daily summary">
        {dailySummary.length === 0 ? (
          <p className="empty-state">No earnings recorded yet.</p>
        ) : (
          dailySummary.map((day) => (
            <div key={day.date} className="summary-row">
              <span>{formatDisplayDate(day.date)}</span>
              <strong>{formatCurrency(day.total)}</strong>
              <small>
                {day.count} {day.count === 1 ? "entry" : "entries"}
              </small>
            </div>
          ))
        )}
      </div>

      <div className="entry-list" aria-label="Earnings entries">
        {sortedEntries.map((entry) => (
          <article className="entry-row" key={entry.id}>
            <div>
              <strong>{formatDisplayDate(entry.date)}</strong>
              {isAfter(entry.date, targetDate) && <span className="tag">After deadline</span>}
              <p>{entry.note || "No note"}</p>
            </div>
            <span className="entry-amount">{formatCurrency(entry.amount)}</span>
            <div className="row-actions">
              <button type="button" className="secondary small" onClick={() => onEdit(entry)}>
                Edit
              </button>
              <button type="button" className="danger small" onClick={() => onDelete(entry.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
