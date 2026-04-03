# Per-Time Activity Association Test Plan

## Purpose

Ensure per-time premium-affinity math only evaluates users who are actually active in the selected time window.

This document defines:

- activity gate metrics
- per-time formulas
- deterministic test vectors
- acceptance thresholds

## Time Window Definitions

- `W7`: last 7 full days
- `W30`: last 30 full days

All metrics below are computed per window (`W`).

## Activity Gate Metrics

For each user and window `W`:

- `activeDaysW`: number of distinct dates with at least one request or one task update
- `requestsW`: total API requests in window
- `taskUpdatesW`: total task create/update/complete events
- `coinEarningDaysW`: distinct dates where coin earnings (`amount > 0`) occurred

Derived activity ratios:

- `activeDayRatioW = activeDaysW / daysInWindow`
- `coinDayRatioW = coinEarningDaysW / daysInWindow`

## Active User Gate

A user is considered active for window `W` only when:

```
isActiveW =
  (activeDayRatioW >= 0.20)
  AND (requestsW >= daysInWindow)
  AND (taskUpdatesW >= ceil(daysInWindow * 0.25))
```

This prevents stale or one-off sessions from influencing premium-affinity scoring.

## Per-Time Association Functions

Only if `isActiveW = true`, compute:

```
CoinVelocityW = coinsEarnedW / daysInWindow
AffordabilityW = walletBalance / avgPremiumCost
ErrorRateW = errorsW / max(requestsW, 1)
```

Premium affinity score:

```
PremiumAffinityW = sigmoid(
    0.9 * ln(1 + CoinVelocityW)
  + 0.7 * AffordabilityW
  + 0.6 * ln(1 + requestsW)
  + 0.5 * ln(1 + taskCountW)
  - 0.4 * (ErrorRateW * 100)
  - 0.3 * (p95MsW / 1000)
)
```

If `isActiveW = false`, force:

```
PremiumAffinityW = 0
```

## Test Fixtures

Use `avgPremiumCost = 185` for current seeded catalog.

### Fixture A: Active, high engagement

- Window: `W30`
- `activeDaysW = 14`
- `requestsW = 260`
- `taskUpdatesW = 52`
- `coinsEarnedW = 900`
- `walletBalance = 220`
- `taskCountW = 120`
- `errorsW = 3`
- `p95MsW = 180`

Expected:

- `isActiveW = true`
- `CoinVelocityW = 30.0`
- `AffordabilityW = 1.1892`
- `PremiumAffinityW > 0.95`

### Fixture B: Passive user (must be gated off)

- Window: `W30`
- `activeDaysW = 2`
- `requestsW = 7`
- `taskUpdatesW = 1`
- `coinsEarnedW = 75`
- `walletBalance = 900`
- `taskCountW = 10`
- `errorsW = 0`
- `p95MsW = 90`

Expected:

- `isActiveW = false`
- `PremiumAffinityW = 0`

### Fixture C: Borderline active threshold

- Window: `W30`
- `activeDaysW = 6` (exactly 20 percent)
- `requestsW = 30` (exactly daysInWindow)
- `taskUpdatesW = 8` (ceil(7.5) = 8)
- `coinsEarnedW = 120`
- `walletBalance = 120`
- `taskCountW = 44`
- `errorsW = 1`
- `p95MsW = 200`

Expected:

- `isActiveW = true`
- `PremiumAffinityW` computed and greater than `0`

### Fixture D: Looks rich, but inactive

- Window: `W7`
- `activeDaysW = 1`
- `requestsW = 3`
- `taskUpdatesW = 1`
- `coinsEarnedW = 350`
- `walletBalance = 800`
- `taskCountW = 20`
- `errorsW = 0`
- `p95MsW = 140`

Expected:

- `isActiveW = false`
- `PremiumAffinityW = 0`

## Assertions Checklist

- gate must reject users with low active-day coverage
- gate must reject users below minimum request volume
- gate must reject users below minimum task update volume
- all accepted users produce deterministic non-zero affinity
- inactive users always return affinity of zero

## Suggested Automation

1. Implement a pure function:
   - `computeActivityGate(windowMetrics) -> boolean`
2. Implement a pure function:
   - `computePremiumAffinity(windowMetrics, walletBalance, avgPremiumCost) -> number`
3. Add unit tests for fixtures A-D.
4. Add a regression test ensuring gate logic executes before affinity calculation.

## Rollout Guardrails

- log each gate decision with window id and rejected criteria
- monitor `% gated` users over time; abrupt spikes indicate telemetry drift
- freeze thresholds for one release cycle before tuning
