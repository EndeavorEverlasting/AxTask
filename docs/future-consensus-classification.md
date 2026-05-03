# Future: multi-user classification consensus (“agreement over time”)

This is **not implemented**. AxTask today has per-task classification confirmation and related coin reasons in `server/classification-confirm.ts` and `POST /api/tasks/:id/confirm-classification`; that flow is immediate and scoped to confirmations, not delayed quorum.

If this epic is approved later, a minimal design spine might include:

1. **Model:** Separate “proposed classification” from “canonical” task classification; store votes or confirmations with timestamps and optional confidence.
2. **Consensus rules:** Quorum (e.g. N distinct users), time window, or decay so old signals weigh less.
3. **Abuse:** Rate limits, one vote per user per task per window, audit trail.
4. **Economy:** New `coinTransactions.reason` values (or metadata) for “consensus reached” vs “disputed,” with explicit caps.

Until then, treat any “correction agreed over time” requirement as product/design work outside the current codebase.
