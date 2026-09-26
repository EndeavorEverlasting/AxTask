# Shared Task Tracker — Apps Script Install Checklist

**Purpose:** make the existing `Task Board` Quick Entry Submit checkbox actually append canonical tasks.

**Proof state before you start:** Tracker V2 is validated as a provider-owned prototype, but the workbook currently reports **NOT INSTALLED IN BOUND APPS SCRIPT PROJECT**.

This is a **bound spreadsheet script**, not a web app.

---

## Copy-ready install map

### SOURCE — copy this

**Workbook:** 2026 Shared Task Tracker
**Tab:** `Scripts`
**Cell:** `B2`
**Label:** `Tracker V2 — canonical automation prototype`

**Action:** select B2 and copy the **entire cell value**.

Do not copy B3/B4 as code. Those cells are validation/deployment-status notes.

### DESTINATION — paste here

**Google Sheets:** 2026 Shared Task Tracker
**Open:** `Extensions → Apps Script`
**File type:** Script
**Recommended file name:** `TrackerV2` → appears as **`TrackerV2.gs`**

Paste the entire `Scripts!B2` value into that one file.

**No additional HTML file.**
**No `appsscript.json` change required by the current prototype.**
**No public web-app deployment.**
**No manually installed trigger required.**

---

## Before paste — collision check

Search the existing Apps Script project for:

```javascript
function onOpen(
function onEdit(
```

If another tracker automation already owns either function, **stop**. Do not leave two project-global copies.

Reconcile the existing tracker file with Tracker V2 rather than adding a duplicate.

---

## Install

- [ ] Open the exact 2026 Shared Task Tracker.
- [ ] Open `Scripts!B2` and confirm A2 labels it Tracker V2.
- [ ] Click `Extensions → Apps Script`.
- [ ] Check for existing `onOpen` / `onEdit` collisions.
- [ ] Click `+ → Script`.
- [ ] Name the new file `TrackerV2`.
- [ ] Delete placeholder code.
- [ ] Copy all of `Scripts!B2`.
- [ ] Paste into `TrackerV2.gs`.
- [ ] Save.
- [ ] Refresh the spreadsheet.

---

## First proof — menu

After refresh:

- [ ] **Task Automation** appears in the spreadsheet menu.

The validated code's `onOpen` creates that menu.

If the menu is absent, do not continue to production use of Submit.

---

## Second proof — one disposable Quick Entry

On `Task Board`, row 4:

- [ ] leave Date blank for today, or enter a valid date;
- [ ] Activity: enter a clearly labeled test task;
- [ ] Notes: optionally state that this is the S0 top-entry smoke test;
- [ ] leave optional scoring/classification fields blank unless you want to exercise them;
- [ ] check **Submit** once.

Expected:

- [ ] `Task Board!B5` reports **Created**;
- [ ] `Task Board!D5` contains a new TaskID;
- [ ] A4:I4 clear;
- [ ] J4 returns to unchecked.

---

## Third proof — canonical record

Open `Daily Planner 2026`.

Use **Ctrl+F** and search for the TaskID shown in `Task Board!D5`.

Verify:

- [ ] Date is a durable date value;
- [ ] Result is unchecked / false;
- [ ] Activity matches;
- [ ] Notes match;
- [ ] TaskID in column T matches exactly;
- [ ] Priority column B remains formula-owned;
- [ ] Score column K remains formula-owned.

Do not insert or delete planner rows to perform this test.

---

## Failure-path proof

Exercise one safely invalid input.

Expected:

- [ ] no bad canonical task is silently appended;
- [ ] row 5 reports an error;
- [ ] staging inputs remain available for correction;
- [ ] Submit returns to unchecked.

Correct the input and retry.

---

## Close the smoke task

After proof:

- [ ] find the test task in `Daily Planner 2026`;
- [ ] check column C `Result` to mark it complete.

Prefer completion over deleting/inserting rows so the proof record does not disturb planner geometry.

---

## Do not do these

- [ ] do **not** deploy Tracker V2 as a public Apps Script web app;
- [ ] do **not** recreate the old arbitrary-cell `doGet` / `doPost` endpoint;
- [ ] do **not** add a second `onEdit` or `onOpen` owner;
- [ ] do **not** physically insert new planner rows at the top;
- [ ] do **not** type static values into formula-owned Priority / Score columns;
- [ ] do **not** point AxTask's legacy `/api/google-sheets/sync` endpoint at this tracker.

---

## Success gate

Call S0 installed/proven only after live provider readback establishes:

1. one valid Quick Entry submission appended exactly one canonical planner record;
2. the new source TaskID is stable and findable;
3. success clears staging only after commit;
4. invalid submission does not lose the staging input;
5. Priority / Score formula owners remain intact;
6. validation / filter / formatting geometry remains intact;
7. the active region still ends before the preserved legacy boundary at row 24997.

Repository documentation alone does not prove this gate.
