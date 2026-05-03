# Billing Bridge — Document Classification Contract

> NodeWeaver names the animal. It does not cook it.

This contract defines how the Billing Bridge classifier layer inspects an uploaded file (filename + optional extracted text) and emits a structured classification.  **No totals are calculated here.  No workbook is written here.**

---

## Supported Document Types

| `detected_type` | Trigger Patterns (filename / text) | Billing Category |
|---|---|---|
| `paylocity_pdf` | `paylocity`, `payroll`, `paystub`, `pay period`, `net pay` | `payroll` |
| `aaa_logistics_invoice` | `aaa`, `disposal`, `logistics`, `invoice`, `po` | `logistics` |
| `new_york_minute_courier_invoice` | `new_york_minute`, `nyminute`, `courier`, `delivery`, `rate` | `courier` |
| `agilant_weekday_logistics_invoice` | `agilant`, `weekday`, `logistics`, `invoice`, `services` | `logistics` |
| `attendance_workbook` | `attendance`, `roster`, `hours`, `clock in`, `clock out` | `time_and_attendance` |
| `billing_summary_workbook` | `billing`, `summary`, `pack`, `total`, `allocated`, `reconcile` | `billing_summary` |
| `deprecated_candidate` | Filename prefix `CANDIDATE_` (hard override) | `deprecated` |
| `unknown_review_required` | Default when confidence < 0.70 | `review_required` |

---

## Output Schema

```json
{
  "file_id": "uuid",
  "filename": "AAA_Disposal_Logistics_Invoice_2026-04-12_PO176759.docx",
  "detected_type": "aaa_logistics_invoice",
  "billing_month": "2026-04",
  "vendor": "AAA",
  "po_number": "176759",
  "confidence": 0.93,
  "review_required": false,
  "notes": ["Pattern match confidence 0.93 for 'aaa_logistics_invoice'."]
}
```

---

## Confidence Rules

1. **Filename tokens** contribute 60 % of the score.
2. **Extracted text tokens** contribute 40 % of the score.
3. **Agreement bonus**: when both filename and text match the same type, +0.15 (capped at 1.0).
4. **Deprecated override**: filenames starting with `CANDIDATE_` are immediately scored ≥ 0.95 for `deprecated_candidate`.
5. **Review threshold**: any result below **0.70** is downgraded to `unknown_review_required`.

---

## NodeWeaver Taxonomy & Risk Tags

The classifier layer lives inside the broader NodeWeaver taxonomy.  Any PR or module that touches taxonomy, training, or classifier internals must be tagged accordingly.

### PR / Change Categories

| Category | Applicable When |
|---|---|
| `classifier_taxonomy` | Files include taxonomy, training, or classifier definitions |
| `training_data` | Files include training examples or fixture data |
| `api_change` | Files include API routes or schemas |
| `ui_change` | Visual or interactive component changes |
| `workflow_automation` | Automation, file ingestion, or pipeline changes |
| `engine_integration` | Integration with execution engines or external APIs |
| `task_planning` | Gantt, dependency graph, task-structure changes |
| `documentation` | Docs-only cleanup or contract updates |
| `bugfix` | Regression or defect fixes |
| `branch_policy` | Branch naming, retirement, or governance rules |
| `github_automation` | PR cleanup, auto-merge, or CI decision engines |

### Risk Tags

| Risk Tag | Applicable When |
|---|---|
| `api_contract` | API routes or schemas are modified |
| `classification_drift` | Changes affect confidence thresholds or classification output |
| `engine_integration` | Engine or external API wiring is touched |
| `external_api` | Third-party API surface changes |
| `state_management` | Client or server state handling is affected |
| `user_workflow` | End-user visible workflow is changed |
| `file_ingestion` | File upload, parsing, or intake logic changes |
| `payroll_adjacent` | Near payroll or billing data paths |
| `merge_automation` | Automated merge or PR cleanup logic |

---

## Minimum Expected Classification Behavior (Fixture PRs)

| Fixture PR | Expected Category | Risk Tags |
|---|---|---|
| AxTask skill tree | `ui_change` or `task_planning` | — |
| AxTask engine integration | `workflow_automation` | `engine_integration` |
| WebExcel docs cleanup | `documentation` | `safe_merge_candidate` |
| WebExcel PDF intake | `workflow_automation` | `file_ingestion`, `payroll_adjacent` |
| Foundry branch policy | `branch_policy` | — |
| Foundry auto-merge | `github_automation` | `merge_automation` |
| NodeWeaver taxonomy | `classifier_taxonomy` | `classification_drift` |
| NodeWeaver API endpoint | `api_change` | `api_contract` |

---

## Definition of Done

- [x] `billing_bridge/schemas.py` defines `DocumentClassification` dataclass.
- [x] `billing_bridge/classifiers/document_type.py` classifies filename + text into supported types.
- [x] `billing_bridge/classifiers/billing_category.py` maps document type to billing category.
- [x] Tests exist with sample filenames and text snippets.
- [x] Low-confidence documents route to `unknown_review_required`.
- [x] No totals are calculated.
- [x] No workbook is written.
- [x] No email is generated.

---

## Branch

`feature/2026-05-01-billing-document-classifier`
