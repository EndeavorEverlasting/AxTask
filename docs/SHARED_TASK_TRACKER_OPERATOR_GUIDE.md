# 2026 Shared Task Tracker — Operator Guide

**Audience:** the person who actually uses the 2026 Shared Task Tracker day to day.

**Current provider state:** the workbook already has the new `Task Board` top-entry UI, but its `Submit` automation is **not yet installed in the bound Apps Script project**. The workbook currently reports `WAITING — install bound Apps Script to enable Submit`.

This guide deliberately separates:

- **what you used to do** in `Daily Planner 2026`;
- **what is safest today before the one-time Apps Script install**;
- **the easiest intended workflow after that install**;
- **what AxTask migration work is planned but not live yet**.

Do not use AxTask's legacy bidirectional Google Sheets sync for this workbook. That path is being retired before controlled ingestion.

---

## The 30-second answer

### What you used to do

You worked directly in **`Daily Planner 2026`**:

1. find the next usable task row;
2. enter the task date / activity / notes;
3. optionally fill urgency, impact, effort, domain, tags, or an override;
4. complete the task with the `Result` checkbox.

That still describes the canonical record table, but it is awkward because new work is stored down in the active record region rather than at the top of the sheet.

### What the new system is trying to make easy

After the one-time Apps Script install:

1. open **`Task Board`** — it is the first tab;
2. use **row 4**, directly under **Quick Entry**;
3. type **Activity**;
4. optionally type **Notes**;
5. choose the task date explicitly in **Date** — for now, choose today's date if the task is for today;
6. optionally fill the other scoring/classification fields;
7. check **Submit** once;
8. wait for row 5 to say **Created** and show the new `TaskID`.

The script appends the canonical task safely into `Daily Planner 2026`, preserves formula-owned columns, assigns the durable `TaskID`, calculates script priority, then clears the staging fields.

You stay at the top. The record still lives in the planner.

---

# Part 1 — Old way versus new way

| Concern | Old / direct planner workflow | New top-entry workflow after install |
| --- | --- | --- |
| Where you type a new task | `Daily Planner 2026` | `Task Board` row 4 |
| Need to find the next row | Yes | No |
| Minimum useful input | Activity, usually Date/Notes | Date + Activity while the date-only seam is being proved |
| Where the canonical record ends up | `Daily Planner 2026` | `Daily Planner 2026` |
| Priority / Score system columns | Easy to edit accidentally | Script avoids writing them |
| TaskID handling | Easy to break manually | Script allocates it |
| Physical row insertion at top | Tempting but unsafe | Not used |
| Today / Tomorrow view | Planner filtering / scrolling | Task Board projection |
| Completion/edit after creation | `Daily Planner 2026` | Still `Daily Planner 2026` during this transition |

## Why the new system appends instead of inserting a row at the top

A literal "insert newest task at row 2" prototype was rejected because it moved or endangered:

- the spill-owned Priority formula in column B;
- the spill-owned Score formula in column K;
- validation / filtering geometry;
- stable task identity assumptions;
- the preserved legacy boundary beginning at row **24997**.

The accepted design is therefore:

```text
Task Board row 4 staging
        ↓
validate
        ↓
append to the canonical active planner region
        ↓
assign TaskID + script priority
        ↓
clear staging row after success
```

This gives you a top-of-workbook entry experience without physically moving the planner table.

---

# Part 2 — What works today, before Apps Script installation

The `Task Board` dashboard/projections are live now. The **Submit automation is not**.

## Today, use this rule

If `Task Board!B5` still says:

`WAITING — install bound Apps Script to enable Submit`

then **do not rely on the Submit checkbox to create a task**.

### Safe fallback: your familiar Daily Planner 2026 workflow

Use the active region of `Daily Planner 2026` — rows **2 through 24996**. The legacy block beginning at row 24997 is intentionally preserved.

The most important columns are:

| Column | Field | What you should do |
| --- | --- | --- |
| A | Date | task calendar date; durable value |
| B | Priority | **do not use as primary input**; formula-owned |
| C | Result | checkbox; check when complete |
| D | Activity | task title; nonblank means this is a task |
| E | Notes | task details / links |
| F | Urgency | optional 0–5 |
| G | Impact | optional 0–5 |
| H | Effort | optional 0–5 |
| I | Domain | optional classification |
| J | Tags | optional free-text tags |
| K | Score | **do not edit**; formula-owned |
| M | Manual Override | optional human priority override |
| T | TaskID | durable identity; do not invent or reuse an ID |

### Minimal old-style entry

For a basic task, concentrate on:

- **A — Date**
- **D — Activity**
- **E — Notes**
- **C — Result** later, when complete

Optional classification/scoring goes in F:J and M.

Do **not** type into B or K. Those are system outputs.

Until Tracker V2 is installed, a direct manual row should not be assumed to have automatic TaskID allocation. Agent-assisted writes that preserve Date + TaskID are safer for canonical creation. A row without a TaskID is incomplete identity state and should be repaired/backfilled after the validated automation is installed.

---

# Part 3 — The easiest new workflow after installation

## Quick Entry lives here

Open the first tab: **`Task Board`**.

The Quick Entry headers are on row 3 and the input cells are on **row 4**.

| Cell / column | Quick Entry field | Required? | Meaning |
| --- | --- | --- | --- |
| A4 | Date | **For now, yes** | choose an explicit valid date; blank-date fallback is not yet accepted as date-only-safe |
| B4 | Activity | **Yes** | what needs to be done |
| C4 | Notes | No | detail, context, links |
| D4 | Urgency | No | 0–5 |
| E4 | Impact | No | 0–5 |
| F4 | Effort | No | 0–5 |
| G4 | Domain | No | Work / Personal or current vocabulary |
| H4 | Tags | No | free-text tags |
| I4 | Manual Override | No | Highest → Lowest |
| J4 | Submit | **Action** | check once to create |

## Fastest possible entry

For a task you want **today**:

1. click `Task Board!A4` and choose **today's date** with the date picker;
2. click `B4` and type the Activity;
3. optionally type Notes in `C4`;
4. check `J4 — Submit`.

That is the shortest currently documented safe path.

You do not need to rate urgency / impact / effort every time.

### Why Date is explicit for now

The current provider-owned Tracker V2 code falls back to JavaScript `new Date()` when Quick Entry Date is blank. That value can include a time-of-day component. The Task Board Today/Tomorrow projections compare planner dates to `TODAY()` using exact equality.

The workbook's existing prototype tests prove staging → append and preserve the planner geometry, but they do **not** yet prove that a blank Quick Entry Date is normalized to a date-only value that appears in the Today projection.

Therefore:

- **current operator rule:** enter an explicit date in A4;
- **S0 proof/repair gate:** prove or repair date-only normalization before documenting “blank Date means today” as supported behavior;
- repository documentation must not promote the blank-Date shortcut from planned convenience to proven behavior.

## What success looks like

After a successful submit:

- `Task Board!B5` becomes **Created**;
- `Task Board!D5` shows the newly created `TaskID`;
- A4:I4 clear;
- J4 returns to unchecked;
- the canonical record exists in `Daily Planner 2026`;
- Priority / Score owners remain untouched.

## Where do I edit or complete the task afterward?

During the spreadsheet transition, **Daily Planner 2026 is still the canonical record table**.

To find the task:

1. open `Daily Planner 2026`;
2. use **Ctrl+F**;
3. search for the new `TaskID` from `Task Board!D5`, or search the Activity text;
4. edit the user-owned fields;
5. check column **C — Result** when complete.

The Today/Tomorrow tables on `Task Board` are read-only projections. They are for seeing the day, not for owning task edits.

---

# Part 4 — One-time Apps Script installation

For the short checklist, use [SHARED_TASK_TRACKER_APPS_SCRIPT_INSTALL_CHECKLIST.md](./SHARED_TASK_TRACKER_APPS_SCRIPT_INSTALL_CHECKLIST.md).

## Current canonical source

The validated provider-owned script is stored **inside the workbook**:

- tab: **`Scripts`**
- source cell: **`B2`**
- label in A2: **Tracker V2 — canonical automation prototype**

The source cell currently contains one complete Apps Script program. It defines project-global `onOpen` and `onEdit` handlers plus the append / TaskID / priority maintenance functions.

**Do not reconstruct the code from chat or from this document. Copy the entire current `Scripts!B2` value from the workbook.**

## Recommended Apps Script file name

Use one script file:

**`TrackerV2.gs`**

There are no required HTML files and no web-app deployment for this spreadsheet automation.

### Important collision check

Apps Script treats functions across all `.gs` files as one project-global namespace.

Before adding `TrackerV2.gs`, inspect the existing bound project for:

- `function onOpen(`
- `function onEdit(`

If another current tracker file already owns those functions, **do not create a second copy**. Reconcile/replace the old tracker automation instead of leaving duplicate global handlers.

The provider state proves the Tracker V2 payload is not yet installed, but this repository does not have direct visibility into every existing Apps Script file, so the collision check is mandatory.

## Install path

1. Open **2026 Shared Task Tracker** in Google Sheets.
2. Click **Extensions → Apps Script**.
3. In the Apps Script editor, inspect the existing script files for duplicate `onOpen` / `onEdit` owners.
4. If no conflicting Tracker V2 owner exists, click **+ → Script**.
5. Name the file **`TrackerV2`**. Google shows it as `TrackerV2.gs`.
6. Return to the spreadsheet.
7. Open the **`Scripts`** tab.
8. Select **cell B2**.
9. Copy the entire cell.
10. Return to Apps Script.
11. Open `TrackerV2.gs`.
12. Remove the default placeholder code.
13. Paste the entire copied `Scripts!B2` payload.
14. Save the project.
15. Return to the spreadsheet and refresh the browser tab.

## Do I need to create a trigger?

**No additional trigger is part of the current validated prototype.**

The script currently uses the simple trigger names:

- `onOpen`
- `onEdit`

There is no `installTriggers()` function in the validated payload.

Do not invent a separate installable trigger unless a later validated revision explicitly changes that contract.

## Do I deploy it as a web app?

**No.**

The current S0 plan explicitly says **do not publish this tracker automation as a public web app**.

The old arbitrary row/column `doGet` / `doPost` endpoint is retired from this prototype.

---

# Part 5 — Live proof after installation

After saving `TrackerV2.gs`:

1. refresh the spreadsheet;
2. confirm a **Task Automation** menu appears;
3. confirm `Task Board!B5` no longer represents an uninstalled state once the operator updates the provider validation/status surface;
4. create one clearly labeled disposable task from Task Board row 4 and explicitly select its date in A4;
5. check Submit once.

Expected success:

- `B5 = Created`;
- `D5` contains a new TaskID;
- staging inputs clear only after the append succeeds;
- the task exists in `Daily Planner 2026`;
- its Date is stored with date-only semantics and a task dated today appears in the Task Board Today projection;
- column B Priority and column K Score formulas remain owned by their existing formula system;
- the legacy boundary remains at row 24997.

For the smoke task, mark the task complete after proof rather than deleting/inserting planner rows.

## Failure-path test

Also prove one bad input:

- enter a non-0–5 value for Urgency / Impact / Effort, or another invalid input that validation permits you to exercise safely;
- Submit must not silently create a bad record;
- the status should expose an error;
- the staging inputs must remain available for correction.

Repository/static proof cannot substitute for this live Google behavior.

---

# Part 6 — Troubleshooting

## Submit checkbox changes but no task is created

Most likely causes:

- Tracker V2 was not actually pasted/saved;
- the sheet was not refreshed after save;
- another `onEdit` function conflicts in the Apps Script project;
- you copied something other than the full `Scripts!B2` value.

Do not create a web-app deployment to fix this.

## Task Automation menu does not appear

Check:

1. `TrackerV2.gs` exists;
2. it contains `function onOpen()`;
3. the project saved;
4. the spreadsheet was refreshed;
5. no duplicate/broken project-global handler exists.

## B5 shows ERROR after Submit

Read the error, correct row 4, and submit again.

Common input contracts:

- Activity is required.
- Date must be a valid Date or `YYYY-MM-DD`.
- Urgency / Impact / Effort must be blank or between 0 and 5.
- Manual Override must be one of the supported priority labels.

## The task was created but I do not see it in Today/Tomorrow

The Task Board projections show only tasks whose stored dates equal today or tomorrow exactly.

1. find the record by TaskID in `Daily Planner 2026`;
2. inspect the Date value;
3. if this came from a blank Quick Entry Date, treat it as the known date-normalization proof gap rather than assuming the projection is wrong;
4. use an explicit A4 date for current live proof until S0 repairs or proves blank-date normalization.

## I accidentally changed Priority or Score

Columns B and K are formula-owned. Stop and repair the formula owner rather than pasting static values down the column.

---

# Part 7 — Where AxTask fits

The spreadsheet is in a controlled transition toward AxTask, but the cutover is **not complete**.

Current repository plan:

1. **S0** — install/prove Tracker V2 in the bound spreadsheet;
2. **G1** — build a header-aware, TaskID-aware dry-run source adapter;
3. **G2** — map reviewed rows through AxTask's canonical task-action/domain service;
4. **G3** — replace the legacy destructive sync UX with dry-run / review / apply;
5. **G4** — controlled live ingestion acceptance;
6. **G5** — make AxTask canonical and end split-brain task ownership.

Until G5 is proven:

- `Daily Planner 2026` remains the spreadsheet's canonical task record table;
- `Task Board` is the intended easy entry/projection surface;
- the existing AxTask `/api/google-sheets/sync` endpoint must **not** be pointed at this tracker;
- importing is not the same thing as synchronization;
- a later AxTask cutover must preserve source `TaskID` identity and reviewed one-way ingestion semantics.

---

# Quick reference

## I just want to add a task right now

**If B5 says WAITING:** use the familiar `Daily Planner 2026` path or an agent-assisted canonical write.

**After Tracker V2 install:** `Task Board` → A4 explicit Date → B4 Activity → optional C4 Notes → J4 Submit.

## I want to complete something

`Daily Planner 2026` → find the task → check column C `Result`.

## I want to change priority manually

Use `Manual Override` rather than typing into formula-owned Priority.

- Task Board Quick Entry: I4
- Daily Planner 2026: column M

## I want to install the new top-entry automation

Use [SHARED_TASK_TRACKER_APPS_SCRIPT_INSTALL_CHECKLIST.md](./SHARED_TASK_TRACKER_APPS_SCRIPT_INSTALL_CHECKLIST.md).

## I want AxTask to ingest/sync this sheet

Do **not** use the existing legacy sync endpoint. Follow the Phase 3 reviewed-ingestion plan in [ASSISTANT_ACTION_EXECUTION_PLAN.md](./ASSISTANT_ACTION_EXECUTION_PLAN.md).
