# RAG and Classification Blueprint

## Purpose

Define the retrieval and classification architecture used to power high-trust report generation and task-completion assistance.

## Retrieval Pipeline

1. Query normalization and decomposition.
2. Candidate retrieval from indexed sources.
3. Reranking with task/report context.
4. Evidence filtering for freshness and relevance.
5. Citation-ready context packaging for generation.

## Voice Personalization Retrieval Pipeline (RAG)

Use retrieval to personalize speech understanding without immediately retraining base ASR weights:

1. Capture ASR hypothesis and runtime context (`locale`, active flow, device class).
2. Query user memory index for prior correction and phrasing patterns.
3. If sparse, fall back to cohort index (`locale` + `region` + dialect bucket).
4. Return ranked hints (`bias_terms`, correction priors, ambiguity clusters).
5. Apply hints in ASR bias/rescoring, post-ASR correction, and NLU disambiguation.
6. Log outcomes for continuous evaluation and memory refresh.

## Classification Responsibilities

- Route user intent to the correct engine mode.
- Determine report class and template profile.
- Trigger ambiguity gating when confidence is low.
- Provide confidence metadata for downstream policy.

## Generation Contract

- Reports should be grounded in retrieved evidence whenever possible.
- Unsupported claims require explicit uncertainty labeling.
- Output must include assumptions when evidence is incomplete.

## Data Quality Standards

- Prefer recent and authoritative sources.
- Avoid stale, duplicate, or low-signal retrieval chunks.
- Track source provenance for auditability.

## Voice Memory Data Contract (Correction Events)

Each correction-memory document should be auditable and minimal:

- `memory_id`: stable UUID for updates/deletes.
- `user_id_hash`: irreversible user key for partitioning and retrieval.
- `locale`: BCP-47 style language/locale key.
- `region`: region or market segment.
- `session_context`: active route/feature context only (no private note bodies).
- `asr_text`: transcript before correction.
- `corrected_text`: accepted correction.
- `token_or_phrase_deltas`: normalized changed spans.
- `confidence_before`: base ASR confidence.
- `confidence_after`: confidence after correction or acceptance.
- `source`: `manual_correction` or `accepted_suggestion`.
- `created_at` and `expires_at`: timestamps for retention enforcement.
- `redaction_state`: tracks PII scrub status before indexing.

PII and retention constraints:

- Scrub direct identifiers before embedding/index write.
- Enforce TTL expiration via `expires_at`.
- Support user-scoped delete and export pathways.
- Never include private task notes in retrieval memory.

## Inference Integration Interfaces

Define explicit handoffs so each engine consumes retrieval context consistently:

- `ASRBiasContext`: `bias_terms[]`, `pronunciation_variants[]`, `term_weights`.
- `PostASRCorrectionContext`: `top_corrections[]`, `ambiguity_pairs[]`, confidence thresholds.
- `NLUDisambiguationContext`: `preferred_entities[]`, `intent_priors`, dialect-specific synonym map.

All contexts must include provenance metadata (`memory_id`, score, fallback_tier).

## Operational Fallbacks

- Low classification confidence -> clarification protocol.
- Sparse retrieval evidence -> targeted follow-up questions.
- Missing high-quality sources -> constrained draft with explicit caveats.

## Evaluation and Rollout Guardrails

Track quality and risk before full rollout:

- Offline: WER/CER deltas, phrase-level correction recall, false-correction rate.
- Online: correction acceptance rate, p95 latency overhead, user satisfaction signals.
- Fairness: compare relative gains/losses by locale/dialect cohorts.
- Safety: block rollout if any cohort degrades beyond threshold.

Operational controls:

- Feature flag with gradual percentage rollout.
- Explicit user opt-in/opt-out for personalization memory.
- Global kill switch for retrieval injection path.
- Backfill and cleanup jobs for TTL and policy migrations.
