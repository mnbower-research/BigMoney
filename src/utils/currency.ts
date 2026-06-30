export const DEFAULT_CURRENCY = "USD";

export function formatCurrency(
  amount: number,
  locale = navigator.language,
  currency = DEFAULT_CURRENCY,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalizeMoney(amount));
}

export function formatPercent(value: number, locale = navigator.language): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

export function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

export function toCents(value: number): number {
  return Math.round(normalizeMoney(value) * 100);
}

export function fromCents(value: number): number {
  return value / 100;
}
