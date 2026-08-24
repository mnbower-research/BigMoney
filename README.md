# BigMoney

BigMoney is a local money-goal and debt-day tracker. Set a target amount and deadline, record daily earnings, and the app recalculates how much you need to earn per remaining day. You can also add multiple debts and turn payoff plans into a daily debt obligation.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

## Test and Build

```bash
npm test
npm run build
```

## Daily Target Calculation

Dates are stored as `YYYY-MM-DD` calendar strings and counted as local calendar days, so daylight-saving changes do not affect day counts. The selected target date counts as an earning day.

BigMoney calculates:

```text
amountRemaining = max(goalAmount - totalEarned, 0)
currentDailyTarget = amountRemaining / remaining earning days
```

If an earning has already been recorded for today, the daily plan starts tomorrow. If the deadline has passed, the app shows the shortfall without dividing by zero.

## Debt Days

Each active debt can include a balance, APR, optional payoff date, and optional minimum monthly payment. BigMoney estimates the required daily contribution for each active debt and sums those values into Today's Debt.

For interest-bearing debt, BigMoney uses:

```text
dailyRate = APR / 100 / 365
balanceNextDay = balance * (1 + dailyRate) - dailyPayment
```

A binary-search solver finds the daily payment that brings the simulated balance close to zero by the payoff date. Interest is labeled as estimated because lenders can use different posting and compounding rules.

Today's Debt is a daily accomplishment meter. Earnings recorded today fill the meter, but they do not automatically become creditor payments. To reduce a debt balance, explicitly record a payment or choose Put Extra Toward Debt after today's obligation is complete.

Daily debt records are stored as snapshots, so previous completed days stay completed even if debt balances, APRs, or payoff dates change later.

## Data Storage

All data is stored in the browser with localStorage under:

```text
bigmoney-app-data-v1
```

Use Export JSON for backups, Import JSON to restore a validated backup, and Export CSV for earnings history.

Existing version 1 BigMoney data is migrated in place to version 2 by adding empty debt, payment, and daily debt history collections.
