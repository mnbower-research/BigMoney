import { FormEvent, useMemo, useState } from "react";
import type { EarningEntry, Goal } from "../types";
import { isAfter, isBefore, isCalendarDateString } from "../utils/dates";

interface EarningsFormProps {
  goal: Goal | null;
  today: string;
  editingEntry: EarningEntry | null;
  onCancelEdit: () => void;
  onSave: (entry: EarningEntry) => void;
}

export function EarningsForm({
  goal,
  today,
  editingEntry,
  onCancelEdit,
  onSave,
}: EarningsFormProps) {
  const [date, setDate] = useState(editingEntry?.date ?? today);
  const [amount, setAmount] = useState(editingEntry ? String(editingEntry.amount) : "");
  const [note, setNote] = useState(editingEntry?.note ?? "");

  const errors = useMemo(() => {
    const next: string[] = [];
    const parsedAmount = Number(amount);

    if (!isCalendarDateString(date)) {
      next.push("Choose a valid earning date.");
    } else if (goal && isBefore(date, goal.startDate)) {
      next.push("Earnings cannot be dated before the goal start date.");
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      next.push("Amount must be zero or greater.");
    }

    return next;
  }, [amount, date, goal]);

  const afterDeadline = goal && isCalendarDateString(date) && isAfter(date, goal.targetDate);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (errors.length > 0) {
      return;
    }

    const now = new Date().toISOString();
    onSave({
      id: editingEntry?.id ?? crypto.randomUUID(),
      date,
      amount: Number(amount),
      note: note.trim(),
      createdAt: editingEntry?.createdAt ?? now,
      updatedAt: now,
    });

    if (!editingEntry) {
      setDate(today);
      setAmount("");
      setNote("");
    }
  }

  return (
    <section className="panel" aria-labelledby="earnings-form-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Earnings</p>
          <h2 id="earnings-form-title">{editingEntry ? "Edit earnings" : "Add earnings"}</h2>
        </div>
      </div>

      <form className="earning-form" onSubmit={handleSubmit} noValidate>
        <label>
          Date
          <input
            type="date"
            value={date}
            min={goal?.startDate}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>

        <label>
          Amount
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            required
          />
        </label>

        <label className="wide">
          Note <span className="muted">(optional)</span>
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Client payment, marketplace sale, side gig"
          />
        </label>

        {afterDeadline && (
          <p className="inline-note">This entry is after the target date and still counts toward total earned.</p>
        )}

        {errors.length > 0 && (
          <div className="validation wide" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}

        <div className="actions wide">
          {editingEntry && (
            <button type="button" className="secondary" onClick={onCancelEdit}>
              Cancel edit
            </button>
          )}
          <button type="submit" disabled={errors.length > 0}>
            {editingEntry ? "Update earnings" : "Save earnings"}
          </button>
        </div>
      </form>
    </section>
  );
}
