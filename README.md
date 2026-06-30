# BigMoney

BigMoney is a local money-goal tracker. Set a target amount and deadline, record daily earnings, and the app recalculates how much you need to earn per remaining day.

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

## Data Storage

All data is stored in the browser with localStorage under:

```text
bigmoney-app-data-v1
```

Use Export JSON for backups, Import JSON to restore a validated backup, and Export CSV for earnings history.
