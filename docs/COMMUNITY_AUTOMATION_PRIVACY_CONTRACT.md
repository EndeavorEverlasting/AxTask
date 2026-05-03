# Community Automation Privacy Contract

## Purpose

Define how automated avatar community content can be generated from system activity while preserving user privacy and trust.

## Allowed Automation

- Avatar-authored seed posts and conversational prompts.
- Avatar auto-replies to community threads under moderation controls.
- Aggregate pattern narratives that do not identify specific users.

## Prohibited Content

- Direct exposure of private task notes, hidden fields, or private metadata.
- Personal identifiers beyond explicit user-selected public display data.
- Reverse-identifiable combinations of task details that reveal private activity.

## Data Minimization Rules

- Publish only fields explicitly marked as public.
- Redact optional fields unless user consented to share.
- Use aggregate or anonymized phrasing for system-derived insights.

## Moderation and Safety

- All automated text is subject to content moderation policy.
- Avatar automation must respect media and abuse restrictions.
- Safety blocks take precedence over engagement goals.

## Auditability

- Automation pathways should be traceable in code and docs.
- Contract changes require updates to security and architecture documentation.

## Voice Personalization Privacy Addendum (RAG)

This addendum governs retrieval-based speech personalization (accent/dialect adaptation):

- Personalization memory is opt-in and revocable via user controls.
- Store only correction-memory fields required for quality improvement.
- Hash user identifiers before storage and retrieval.
- Private task notes and hidden fields are prohibited from memory indexes.

### Correction Memory Retention

- Every memory record must include `created_at` and `expires_at`.
- TTL expiration is mandatory and enforced with scheduled cleanup jobs.
- Stale or policy-invalid memory entries must be purged from both raw store and vector index.

### User Rights and Controls

- Users can disable future personalization writes at any time.
- Users can request delete/export of personalization memory.
- Deletion must cascade across storage, caches, and derived retrieval indexes.

### Safe Retrieval Boundaries

- Retrieval fallback order is user -> cohort/locale -> no personalization.
- Cohort memory must remain aggregate and non-identifying.
- If confidence is low or safety checks fail, bypass personalization and use baseline ASR/NLU flow.
