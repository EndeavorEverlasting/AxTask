# Billing Bridge — Parallel Sprint Contract

> Without this handshake each repo improvises and the circus returns.

This contract defines the **minimal artifact shape** that every Billing Bridge implementation must agree on, regardless of repo (AxTask, WebExcel, Foundry, NodeWeaver).

---

## Directory Layout

```text
billing_runs/
  YYYY-MM/
    inputs/
    normalized/
    workbook/
    validation/
    llm_packet/
    run_manifest.json
```

| Directory | Purpose |
|---|---|
| `inputs/` | Raw source files (PDFs, XLSX, CSV, DOCX) dropped by ingestion. |
| `normalized/` | Machine-readable outputs after parsing / classification / normalization. |
| `workbook/` | Excel / CSV workbooks produced by the bridge (allocation, reconciliation). |
| `validation/` | Exception logs, dry-run diffs, human-review queues. |
| `llm_packet/` | Structured packets sent to / received from any LLM-assisted step. |
| `run_manifest.json` | Single source of truth for the run. |

---

## Core Manifest Schema

```json
{
  "run_id": "billing-2026-04-001",
  "month": "2026-04",
  "source_files": [],
  "normalized_outputs": [],
  "workbook_outputs": [],
  "validation_outputs": [],
  "exceptions": [],
  "status": "draft | review | websafe | submitted"
}
```

### Field Semantics

| Field | Type | Description |
|---|---|---|
| `run_id` | string | Unique run identifier: `billing-{YYYY-MM}-{seq}` |
| `month` | string | Billing month in `YYYY-MM` format |
| `source_files` | `FileEntry[]` | Every file that entered `inputs/` |
| `normalized_outputs` | `FileEntry[]` | Every artifact written to `normalized/` |
| `workbook_outputs` | `FileEntry[]` | Every workbook written to `workbook/` |
| `validation_outputs` | `FileEntry[]` | Logs / diffs written to `validation/` |
| `exceptions` | `ExceptionEntry[]` | Human-review items, parse failures, low-confidence classifications |
| `status` | enum | `draft` → `review` → `websafe` → `submitted` |

### FileEntry

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
  "notes": [],
  "relative_path": "inputs/AAA_Disposal_Logistics_Invoice_2026-04-12_PO176759.docx"
}
```

### ExceptionEntry

```json
{
  "file_id": "uuid",
  "issue_type": "low_confidence | parse_error | manual_review | deprecated_candidate",
  "severity": "warning | blocking",
  "message": "Classifier confidence 0.33 for 'aaa_logistics_invoice'",
  "resolution": null
}
```

---

## Lifecycle Rules

1. **Ingestion** writes files to `inputs/` and appends to `source_files`.
2. **Classification** runs NodeWeaver-style naming; results append to `normalized_outputs`.
3. **Bridge** writes workbooks to `workbook/` and updates `workbook_outputs`.
4. **Validation** writes logs to `validation/` and appends exceptions.
5. **Status transitions**:
   - `draft`   → ingestion / normalization in progress.
   - `review`  → workbooks generated, awaiting human sign-off.
   - `websafe` → review complete, files staged for download.
   - `submitted` → finalized and archived.

---

## Cross-Repo Requirements

| Repo | Responsibility |
|---|---|
| **AxTask** | Task creation, human review UI, status transitions |
| **WebExcel** | Excel ingestion, workbook generation, websafe export |
| **Foundry** | Branch policy, PR cleanup, dry-run reports |
| **NodeWeaver** | Classification, taxonomy, risk-tagging, LLM packet assembly |

---

## Definition of Done

- [x] `docs/billing_bridge/PARALLEL_SPRINT_CONTRACT.md` exists and is agreed upon.
- [x] Manifest schema is versioned and frozen for the sprint.
- [x] Each repo can read and write the `run_manifest.json` shape without loss.
- [x] No repo invents a private directory structure outside this contract.

**Status:** `CLOSED` — archived on 2026-05-01.
