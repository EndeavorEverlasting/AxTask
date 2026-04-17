# AxTask Objective-to-Code Push Checklist

Reusable pre-push guide: map each core AxTask objective to code locations, **automated contract tests**, and remaining human checks. Use before each push to a release branch (for example `release-2026-04-15-schema-and-reclassify` or your successor).

## Automated regression gate (run this first)

**CI:** Pull requests run `npm run check` and `npm test` (see [`.github/workflows/test-and-attest.yml`](../.github/workflows/test-and-attest.yml)). Anything that fails there blocks merge.

**Local (match CI):**

```bash
npm run check
```

```bash
npm test
```

**Faster local subset** (objective-related contracts only; does not replace full `npm test`):

```bash
npm run test:objective-contracts
```

Block push on any red test in these paths when your change touches rewards, classification, feedback, coins, or p-score UX.

## Objective → automated test mapping

Most **wiring and API-shape** requirements below are enforced by Vitest. Use this table to see which tests back which objective.

| # | Objective theme | Primary tests (run via `npm run test:objective-contracts` or full `npm test`) |
|---|-----------------|--------------------------------------------------------------------------------|
| 1 | Completion + classification accrual | [`server/use-case-engagement.contract.test.ts`](../server/use-case-engagement.contract.test.ts) (routes + `classification-confirm` wiring) |
| 2 | Reward loops + caps | [`server/use-case-engagement.contract.test.ts`](../server/use-case-engagement.contract.test.ts) (`engagement-rewards` exports); [`server/release-2026-routes-contract.test.ts`](../server/release-2026-routes-contract.test.ts) |
| 3 | Multi-category + confidence | [`server/use-case-engagement.contract.test.ts`](../server/use-case-engagement.contract.test.ts) (badge + `classificationAssociations`) |
| 4 | Coin UX + wallet surfaces | Partially covered via route/wallet strings in [`server/use-case-engagement.contract.test.ts`](../server/use-case-engagement.contract.test.ts); **layout and “front-and-center” remain manual** |
| 5 | Feedback nudges | [`client/src/lib/feedback-nudge.test.ts`](../client/src/lib/feedback-nudge.test.ts) |
| 6 | Install suppression | [`client/src/lib/install-device-state.test.ts`](../client/src/lib/install-device-state.test.ts) |
| 7 | P-score / economy copy | [`server/use-case-engagement.contract.test.ts`](../server/use-case-engagement.contract.test.ts) (`economy-diagnostics`); **wording clarity remains manual** |
| 8 | Privacy + public DTOs | [`shared/public-client-dtos.test.ts`](../shared/public-client-dtos.test.ts) (in `test:objective-contracts`); [`server/client-visible-privacy.contract.test.ts`](../server/client-visible-privacy.contract.test.ts) (**full `npm test` only**) |

**Note:** [`server/client-visible-privacy.contract.test.ts`](../server/client-visible-privacy.contract.test.ts) is not in the `test:objective-contracts` file list (see [package.json](../package.json)); run full `npm test` to include it. Notification and CSP contracts **are** in the fast subset.

## What stays manual

Short human review is still appropriate for:

- Visual prominence of coins, submenu flows, and whether copy “feels” clear.
- P-score explanatory text versus engine semantics (avoid misleading scales).
- Feedback prompt copy coverage across product contexts.
- Exploratory UI passes after larger UX changes.

## Extending automated coverage

When you introduce a **new falsifiable invariant** for an objective (for example, a serializer that must be used in `routes.ts`, or a reward reason string that must exist):

1. Add or extend a **contract test** beside existing patterns—typically [`server/use-case-engagement.contract.test.ts`](../server/use-case-engagement.contract.test.ts) or [`server/client-visible-privacy.contract.test.ts`](../server/client-visible-privacy.contract.test.ts) (read `routes.ts` / `index.ts` and assert substrings).
2. Avoid brittle tests for **layout** or **subjective copy** unless you explicitly accept snapshot maintenance cost.
3. Run `npm run test:objective-contracts` and full `npm test` before pushing.

## How to use this document

- For **engineering gates**, rely on `npm run check`, `npm run test:objective-contracts`, and full `npm test`.
- For **release discipline**, mark each objective section pass/fail with short evidence (commit SHA, test output, or UI spot-check) when your change touches that area.
- If any item fails, block push until fixed or explicitly deferred.

## Objective mapping (code surfaces and human checks)

### 1) Completion + classification accrual reliability

- **Code surfaces**
  - [server/routes.ts](../server/routes.ts)
  - [server/classification-confirm.ts](../server/classification-confirm.ts)
  - [client/src/components/task-list.tsx](../client/src/components/task-list.tsx)
  - [client/src/components/classification-confirm.tsx](../client/src/components/classification-confirm.tsx)
- **Automated coverage:** [`server/use-case-engagement.contract.test.ts`](../server/use-case-engagement.contract.test.ts)
- **Must confirm (manual / spot-check)**
  - Completion response includes reward and authoritative balance fields.
  - Classification confirmation updates wallet immediately and shows new balance.
  - No-double-award/skip behavior remains intact.
- **Evidence**
  - Task completion + confirm flow: UI toasts and wallet query cache.

### 2) Reward loops coverage and anti-abuse caps

- **Code surfaces**
  - [server/engagement-rewards.ts](../server/engagement-rewards.ts)
  - [server/routes.ts](../server/routes.ts)
- **Automated coverage:** [`server/use-case-engagement.contract.test.ts`](../server/use-case-engagement.contract.test.ts); [`server/release-2026-routes-contract.test.ts`](../server/release-2026-routes-contract.test.ts)
- **Must confirm**
  - Reward reasons exist and are capped for: unique task, search success, feedback, classification confirmation/correction consensus, urgency recalc rating.
  - Routes return fields needed for deterministic wallet reconciliation.
- **Evidence**
  - Route responses include expected reward payloads and post-action balance.

### 3) Multi-category + confidence integrity

- **Code surfaces**
  - [client/src/components/classification-badge.tsx](../client/src/components/classification-badge.tsx)
  - [server/routes.ts](../server/routes.ts)
- **Automated coverage:** [`server/use-case-engagement.contract.test.ts`](../server/use-case-engagement.contract.test.ts)
- **Must confirm**
  - `classificationAssociations` remains present through classify/reclassify flows.
  - Multi-label confidence remains rendered, not collapsed to a single label unexpectedly.

### 4) Coin UX front-and-center + quick submenu

- **Code surfaces**
  - [client/src/components/wallet-top-bar.tsx](../client/src/components/wallet-top-bar.tsx)
  - [client/src/pages/rewards.tsx](../client/src/pages/rewards.tsx)
- **Automated coverage:** Partial (wallet-related route wiring in engagement tests); **no substitute for visual QA**
- **Must confirm**
  - Coin surface is persistently visible in primary app flow.
  - Quick actions (shop/history/earn/redeem) work without forced full-screen workflow switches where avoidable.
  - Wallet/transactions/rewards caches update deterministically after quick actions.

### 5) Feedback prompts frequency + guardrails

- **Code surfaces**
  - [client/src/lib/feedback-nudge.ts](../client/src/lib/feedback-nudge.ts)
  - [client/src/components/feedback-nudge-dialog.tsx](../client/src/components/feedback-nudge-dialog.tsx)
  - Trigger call-sites in task/reward/classification/dashboard components.
- **Automated coverage:** [`client/src/lib/feedback-nudge.test.ts`](../client/src/lib/feedback-nudge.test.ts)
- **Must confirm**
  - Trigger sources are broad enough for frequent prompting.
  - Cooldown/source/day/weighted caps still prevent spam.
  - Prompt copy covers active trigger contexts.

### 6) Device-specific install suppression

- **Code surfaces**
  - [client/src/lib/install-device-state.ts](../client/src/lib/install-device-state.ts)
  - [client/src/components/install-cta-banner.tsx](../client/src/components/install-cta-banner.tsx)
  - [client/src/components/install-shortcut-button.tsx](../client/src/components/install-shortcut-button.tsx)
- **Automated coverage:** [`client/src/lib/install-device-state.test.ts`](../client/src/lib/install-device-state.test.ts)
- **Must confirm**
  - Install/dismiss/opt-out state remains local-device scoped.
  - Installed devices are not repeatedly nagged.

### 7) P-score clarity and coherence

- **Code surfaces**
  - [client/src/pages/dashboard.tsx](../client/src/pages/dashboard.tsx)
  - [client/src/pages/rewards.tsx](../client/src/pages/rewards.tsx)
  - [server/routes.ts](../server/routes.ts) (`economy-diagnostics` and related responses)
- **Automated coverage:** [`server/use-case-engagement.contract.test.ts`](../server/use-case-engagement.contract.test.ts) (economy route presence); **scale copy remains manual**
- **Must confirm**
  - Displayed p-score scale text matches actual engine/output semantics.
  - Explanatory text avoids misleading interpretations (for example, “50” vs expected 0–10 style presentation).

### 8) Privacy + client-visible payload safety

- **Code surfaces**
  - [shared/public-client-dtos.ts](../shared/public-client-dtos.ts)
  - [server/routes.ts](../server/routes.ts)
  - [server/index.ts](../server/index.ts)
- **Automated coverage:** [`shared/public-client-dtos.test.ts`](../shared/public-client-dtos.test.ts); [`server/client-visible-privacy.contract.test.ts`](../server/client-visible-privacy.contract.test.ts)
- **Must confirm**
  - Client payloads only expose public DTO fields.
  - No accidental sensitive payload logging in browser-visible/client-accessible surfaces.

See also [CLIENT_VISIBLE_PRIVACY.md](./CLIENT_VISIBLE_PRIVACY.md).

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
| `npm run test:objective-contracts` | |
| Full `npm test` | |
| Commit SHA | |
| Push status | |
| Known deferrals (if any) | |
