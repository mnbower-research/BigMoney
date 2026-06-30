import { FormEvent, useMemo, useState } from "react";
import type { Goal } from "../types";
import {
  addCalendarYears,
  compareCalendarDates,
  isAfter,
  isBefore,
  isCalendarDateString,
} from "../utils/dates";

interface GoalFormProps {
  initialGoal: Goal | null;
  today: string;
  onCancel?: () => void;
  onSave: (goal: Goal) => void;
}

export function GoalForm({ initialGoal, today, onCancel, onSave }: GoalFormProps) {
  const [name, setName] = useState(initialGoal?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(
    initialGoal ? String(initialGoal.targetAmount) : "",
  );
  const [targetDate, setTargetDate] = useState(initialGoal?.targetDate ?? today);
  const [startDate, setStartDate] = useState(initialGoal?.startDate ?? today);
  const maxTargetDate = addCalendarYears(today, 5);

  const errors = useMemo(() => {
    const next: string[] = [];
    const amount = Number(targetAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      next.push("Enter a target amount greater than $0.");
    }

    if (!isCalendarDateString(targetDate)) {
      next.push("Choose a valid target date.");
    } else {
      if (isBefore(targetDate, today)) {
        next.push("Target date cannot be before today.");
      }

      if (isAfter(targetDate, maxTargetDate)) {
        next.push("Target date cannot be more than five years from today.");
      }
    }

    if (!isCalendarDateString(startDate)) {
      next.push("Choose a valid start date.");
    } else if (compareCalendarDates(startDate, targetDate) > 0) {
      next.push("Start date cannot be after the target date.");
    }

    return next;
  }, [maxTargetDate, startDate, targetAmount, targetDate, today]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (errors.length > 0) {
      return;
    }

    const now = new Date().toISOString();
    onSave({
      id: initialGoal?.id ?? crypto.randomUUID(),
      name: name.trim(),
      targetAmount: Number(targetAmount),
      targetDate,
      startDate,
      createdAt: initialGoal?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <section className="setup-panel" aria-labelledby="goal-form-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BigMoney</p>
          <h1 id="goal-form-title">{initialGoal ? "Edit your goal" : "Set your money goal"}</h1>
        </div>
      </div>

      <form className="form-grid" onSubmit={handleSubmit} noValidate>
        <label>
          Goal name <span className="muted">(optional)</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New laptop, safety fund, launch runway"
          />
        </label>

        <label>
          Target amount
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={targetAmount}
            onChange={(event) => setTargetAmount(event.target.value)}
            placeholder="10000.00"
            required
          />
        </label>

        <label>
          Start date
          <input
            type="date"
            value={startDate}
            max={targetDate}
            onChange={(event) => setStartDate(event.target.value)}
            required
          />
        </label>

        <label>
          Target date
          <input
            type="date"
            value={targetDate}
            min={today}
            max={maxTargetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            required
          />
        </label>

        {errors.length > 0 && (
          <div className="validation" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}

        <div className="actions">
          {onCancel && (
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" disabled={errors.length > 0}>
            Save goal
          </button>
        </div>
      </form>
    </section>
  );
}
