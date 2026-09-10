# AI Capability Matrix (Baseline)

This baseline maps current AI capabilities to concrete code paths so modernization work can be tracked as code lands.

## Status Legend
- `Implemented`: live in runtime and user-accessible
- `Partial`: some implementation exists but lacks modern production controls
- `Missing`: not implemented as a first-class capability yet

## 1) AI APIs
- `Implemented`:
  - `POST /api/classification/classify` in `server/routes.ts`
  - `POST /api/classification/suggestions` in `server/routes.ts`
  - `POST /api/planner/ask` in `server/routes.ts`
  - `POST /api/voice/process` in `server/routes.ts`
  - `POST /api/tasks/review` and `POST /api/tasks/review/apply` in `server/routes.ts`
- `Partial`:
  - Fallback logic exists in `server/services/classification/universal-classifier.ts`, but endpoint metadata/telemetry is inconsistent across AI routes.
- `Missing`:
  - Unified per-request AI runtime metadata contract across all AI endpoints.

## 2) Prompt Design / PromptOps
- `Implemented`:
  - Prompt-like phrasing exists in planner/voice/review flows.
- `Partial`:
  - Prompt strings are mostly inline and not centrally versioned.
- `Missing`:
  - Prompt registry with versioning, changelog metadata, and deterministic regression fixtures.

## 3) RAG Pipelines
- `Implemented`:
  - Design docs and SQL templates in `docs/RAG_CLASSIFICATION_BLUEPRINT.md` and `sql/rag/*`.
- `Partial`:
  - Retrieval-like behavior is heuristic and task-filter based (planner/voice), not a proper retrieval pipeline with citations.
- `Missing`:
  - Runtime retrieval service, chunking/indexing pipeline, and retrieval quality telemetry.

## 4) Agent / Tool Orchestration
- `Implemented`:
  - Voice intent routing in `server/engines/dispatcher.ts`.
  - Planner query processing in `server/engines/planner-engine.ts`.
  - Bulk action extraction in `server/engines/review-engine.ts`.
- `Partial`:
  - Behaviors are split across engines with differing response contracts.
- `Missing`:
  - Shared assistant runtime contract with standardized metadata and safe action gates.

## 5) Evaluation Frameworks
- `Implemented`:
  - Unit/contract tests for classifier fallback and route wiring.
  - Offline AI intent eval pack (`evals/ai-intent/`) with versioned fixtures/rubric/baseline.
  - Deterministic scorers + fixture LLM provider (`server/ai-eval/`).
  - Fail-closed runner + baseline compare (`npm run test:ai-eval`, validator `ai-intent-eval`).
  - CI gate in `.github/workflows/test-and-attest.yml`.
- `Partial`:
  - Live-model cases exist only behind `AXTASK_AI_EVAL_LIVE=1` (not CI-gated).
  - Planner/voice/classifier heuristic engines are not yet full case packs.
- `Missing`:
  - Sanitized `ai_interactions` export → fixture import pipeline.

## 6) Fine-Tuning
- `Implemented`:
  - None.
- `Partial`:
  - Retrieval-first strategy is documented.
- `Missing`:
  - Fine-tuning decision gate based on measured eval deltas versus prompt/retrieval baselines.

## Prioritized Modernization Order
1. API runtime governance + metadata standardization.
2. PromptOps centralization + regression tests.
3. RAG runtime with grounding/citations.
4. Shared assistant runtime + safe action thresholds.
5. Offline eval harness + CI quality gates (intent pack shipped; expand engines + live lane).
6. Fine-tuning decision framework (only if evidence supports it).
