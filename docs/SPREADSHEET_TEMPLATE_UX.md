# Spreadsheet template UX: top entry zone + embedded automation

This document captures the product direction for **AxTask-generated** spreadsheets (Google Sheets and, later, downloadable `.xlsx`), aligned with workflows that used to rely on **Google Apps Script** and a personal task tracker.

## Goals

1. **Embed automation in the file** so users are not manually filling **dates**, **task IDs**, **scores**, or other derived fields when that logic already exists in AxTask.
2. **Keep the “interface” at the top** of the sheet: a fixed **entry / control band** (frozen rows) where people add and edit current work. **Historical rows accumulate downward** so daily use does not require scrolling deeper into the sheet over time.
3. **Reduce dependence on separate Apps Script projects** by preferring **sheet-native behavior** (formulas, data validation, named ranges, optional bounded script) that travels with the file.

## Layout model (target)

| Region | Rows (example) | Purpose |
|--------|----------------|---------|
| **Entry / UI band** | 1–K (frozen) | Short instructions, optional filters, **staging row(s)** for new tasks, buttons (Sheets) or clear “add here” cells. User focus stays at **row 1**. |
| **Header row** | K+1 | Column labels aligned with AxTask import (`Date`, `Activity`, `Notes`, …). |
| **Log / history** | K+2 downward | Committed tasks; **oldest toward the bottom** or sort policy documented; sync/import reads this band only. |

**Freeze panes** at the bottom of the entry band so scrolling only moves the log.

Today’s implementation in [`server/google-sheets-api.ts`](../server/google-sheets-api.ts) uses **row 1 = headers** and **row 2+ = data** (`exportTasks` / `importTasks`). Moving to the entry-band model requires a **versioned template** (e.g. sheet name `Tasks` vs `Tasks_v2`) and coordinated changes to `importTasks`, `exportTasks`, and `syncTasks` ranges—see [Implementation phases](#implementation-phases).

## Automation: what to embed (in order of preference)

### 1. Formulas (portable, no Apps Script)

- **Stable task row id (within sheet):** e.g. a column `RowKey` with `=IF(ActivityCell<>"", TEXT(ROW(),"00000") & "-" & LEFT(TEXT(NOW(),"yyyymmddhhmmss"),12), "")` or a simpler `=IF(..., ROW(), "")` depending on uniqueness needs. True **AxTask `id`** still comes from the app after sync.
- **Default date:** `=IF(Activity<>"", TODAY(), "")` or `NOW()` where appropriate; user can override.
- **Data validation:** dropdowns for `Priority`, `Status`, `Classification` matching app enums.
- **Conditional formatting:** highlight overdue rows, completed rows, etc.

Formulas work in **Google Sheets** and can be mirrored in **Excel** where functions overlap.

### 2. Google Sheets features (no custom code)

- **Named ranges** for the log table (e.g. `TaskLog`) so ARRAYFORMULA / QUERY stay maintainable.
- **Protected ranges** locking formula columns while leaving entry columns editable.
- **Slicer / filter views** on the log only, leaving the top band unfiltered.

### 3. Apps Script (optional, advanced)

If something cannot be expressed as formulas (e.g. “on edit, POST to AxTask”), **bundle script with the spreadsheet** via [clasp](https://github.com/google/clasp) or a one-time Apps Script project bound to the template. This does **not** travel through the Sheets API `create` call automatically—document the **manual or CI attach** step for maintainers.

**Policy:** Prefer formulas + validation first; add script only for gaps.

## Sync semantics (conceptual)

- **Import:** Read only the **log** range (below the header), ignore the frozen entry band or treat staging rows as “draft until committed.”
- **Export:** Write merged tasks into the **log**; optionally refresh a **summary** block in the entry band via formulas that reference `TaskLog`.
- **Task ID column:** If present in the sheet, AxTask should **preserve** IDs on round-trip sync (today’s import uses synthetic `sheet-${index}`—improving this is part of template v2).

## Implementation phases

| Phase | Work |
|-------|------|
| **A (done)** | This doc + links from [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md) and [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md). |
| **B** | New `createTaskSpreadsheet` variant (or template flag): reserved rows, freeze, formula columns, validation; **new import range** constants. |
| **C** | `.xlsx` export ([`client/src/lib/csv-utils.ts`](../client/src/lib/csv-utils.ts)) generates the same structure and formulas where Excel supports them. |
| **D** | Optional: sample Apps Script file in `tools/` or `docs/samples/` for power users. |

## Relation to your legacy tracker

If you still have **Apps Script** tied to an old workbook, treat it as **reference logic** to re-express as:

1. Column-level formulas and validation in the generated template, and/or  
2. Server-side rules in AxTask (priority engine) that remain the **source of truth** after sync.

That way **clients** get a self-contained spreadsheet that “feels” like the old script-driven sheet without maintaining duplicate script projects per user.
