# Spreadsheet template UX (roadmap)

This document describes a **future** layout for AxTask’s Google Sheets integration beyond today’s **single header row + data from row 2** model (`createTaskSpreadsheet` / `exportTasks` in `server/google-sheets-api.ts`).

## Top-fixed entry zone

- Reserve the **top rows** (e.g. rows 1–8) as a **fixed “today” workspace** so users always add or edit the active task at the top while **history grows downward**.
- Use **frozen panes** so headers and the entry zone stay visible when scrolling.
- Keep **one canonical row** (or a small block) for “current draft” that syncs to AxTask on submit or on a timed sync.

## Embedded metadata

- **Dates**: Store ISO `YYYY-MM-DD` in dedicated columns; avoid locale-dependent serial-only cells without a parallel ISO column for imports.
- **Task IDs**: When a row is linked to an AxTask task, write the **server task UUID** in a hidden or narrow column so updates and dedupe round-trips stay stable.
- **Validation**: Use **data validation** (dropdowns) for status, priority, and classification where the catalog is finite; keep allowed values aligned with the app’s enums.

## Automation without separate Apps Script projects

- Prefer **named ranges** + **simple formulas** (e.g. `=FILTER(...)`) for views; optional **bounded** Apps Script should live **inside the template** as one file, not a separate project users must clone.
- Document which ranges the AxTask API or future sync job reads/writes so power users can extend safely.

## Compatibility

- Today’s export/import remains the **baseline**; this layout is an **evolution** path, not a breaking change until explicitly versioned in the API and docs.
