# AxTask Objective-to-Code Push Checklist

Reusable pre-push checklist: map each core AxTask objective to concrete code locations, verification tests, and release gates. Use before each push to `release-2026-04-15-schema-and-reclassify` (or your successor release branch).

## How to use

- Mark each section pass/fail with short evidence (commit SHA, test output, or endpoint/UI sample).
- If any item fails, block push until fixed or explicitly deferred.

## Objective mapping

### 1) Completion + classification accrual reliability

- **Code surfaces**
  - [server/routes.ts](../server/routes.ts)
  - [server/classification-confirm.ts](../server/classification-confirm.ts)
  - [client/src/components/task-list.tsx](../client/src/components/task-list.tsx)
  - [client/src/components/classification-confirm.tsx](../client/src/components/classification-confirm.tsx)
- **Must confirm**
  - Completion response includes reward and authoritative balance fields.
  - Classification confirmation updates wallet immediately and shows new balance.
  - No-double-award/skip behavior remains intact.
- **Evidence**
  - Task completion + confirm flow: UI toasts and wallet query cache.

### 2) Reward loops coverage and anti-abuse caps

- **Code surfaces**
  - [server/engagement-rewards.ts](../server/engagement-rewards.ts)
  - [server/routes.ts](../server/routes.ts)
- **Must confirm**
  - Reward reasons exist and are capped for: unique task, search success, feedback, classification confirmation/correction consensus, urgency recalc rating.
  - Routes return fields needed for deterministic wallet reconciliation.
- **Evidence**
  - Route responses include expected reward payloads and post-action balance.

### 3) Multi-category + confidence integrity

- **Code surfaces**
  - [client/src/components/classification-badge.tsx](../client/src/components/classification-badge.tsx)
  - [server/routes.ts](../server/routes.ts)
- **Must confirm**
  - `classificationAssociations` remains present through classify/reclassify flows.
  - Multi-label confidence remains rendered, not collapsed to a single label unexpectedly.

### 4) Coin UX front-and-center + quick submenu

- **Code surfaces**
  - [client/src/components/wallet-top-bar.tsx](../client/src/components/wallet-top-bar.tsx)
  - [client/src/pages/rewards.tsx](../client/src/pages/rewards.tsx)
- **Must confirm**
  - Coin surface is persistently visible in primary app flow.
  - Quick actions (shop/history/earn/redeem) work without forced full-screen workflow switches where avoidable.
  - Wallet/transactions/rewards caches update deterministically after quick actions.

### 5) Feedback prompts frequency + guardrails

- **Code surfaces**
  - [client/src/lib/feedback-nudge.ts](../client/src/lib/feedback-nudge.ts)
  - [client/src/components/feedback-nudge-dialog.tsx](../client/src/components/feedback-nudge-dialog.tsx)
  - Trigger call-sites in task/reward/classification/dashboard components.
- **Must confirm**
  - Trigger sources are broad enough for frequent prompting.
  - Cooldown/source/day/weighted caps still prevent spam.
  - Prompt copy covers active trigger contexts.

### 6) Device-specific install suppression

- **Code surfaces**
  - [client/src/lib/install-device-state.ts](../client/src/lib/install-device-state.ts)
  - [client/src/components/install-cta-banner.tsx](../client/src/components/install-cta-banner.tsx)
  - [client/src/components/install-shortcut-button.tsx](../client/src/components/install-shortcut-button.tsx)
- **Must confirm**
  - Install/dismiss/opt-out state remains local-device scoped.
  - Installed devices are not repeatedly nagged.

### 7) P-score clarity and coherence

- **Code surfaces**
  - [client/src/pages/dashboard.tsx](../client/src/pages/dashboard.tsx)
  - [client/src/pages/rewards.tsx](../client/src/pages/rewards.tsx)
  - [server/routes.ts](../server/routes.ts) (`economy-diagnostics` and related responses)
- **Must confirm**
  - Displayed p-score scale text matches actual engine/output semantics.
  - Explanatory text avoids misleading interpretations (for example, “50” vs expected 0–10 style presentation).

### 8) Privacy + client-visible payload safety

- **Code surfaces**
  - [shared/public-client-dtos.ts](../shared/public-client-dtos.ts)
  - [server/routes.ts](../server/routes.ts)
  - [server/index.ts](../server/index.ts)
- **Must confirm**
  - Client payloads only expose public DTO fields.
  - No accidental sensitive payload logging in browser-visible/client-accessible surfaces.

See also [CLIENT_VISIBLE_PRIVACY.md](./CLIENT_VISIBLE_PRIVACY.md).

## Regression test gate

Run and record outputs for:

```bash
npm run check
```

```bash
npm test -- server/use-case-engagement.contract.test.ts server/release-2026-routes-contract.test.ts server/notification-preferences.contract.test.ts server/csp-reporting.contract.test.ts client/src/lib/feedback-nudge.test.ts client/src/lib/install-device-state.test.ts shared/public-client-dtos.test.ts
```

```bash
npm test
```

Block push on any red test in reward/routing/feedback/privacy paths.

## Commit and push gate

- Confirm branch: `release-2026-04-15-schema-and-reclassify` (or intended release branch).
- Confirm working tree only includes intended scope.
- Commit message reflects objective(s) addressed.
- Push only after all gates pass.

See [GIT_BRANCHING_AND_DEPLOYMENT.md](./GIT_BRANCHING_AND_DEPLOYMENT.md) for deploy-tracked branch hygiene.

## Quick audit stamp template

Copy and fill before merge/PR:

| Field | Value |
|--------|--------|
| Branch | |
| Objective areas touched | |
| Key files changed | |
| `npm run check` | |
| Targeted tests | |
| Full `npm test` | |
| Commit SHA | |
| Push status | |
| Known deferrals (if any) | |
