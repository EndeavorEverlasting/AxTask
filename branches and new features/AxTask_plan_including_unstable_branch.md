# AxTask plan including today's unstable branch

Prepared from live inspection of the current AxTask public branches, with special attention to the newest integration lane: `experimental/unstable-2026-04-27`.

---

## Core judgment

Today’s unstable branch should be in the plan as the **working daytime integration base**.

Not because “latest” is magically correct.  
Because in this case it is both:

- the **latest**
- and the **freshest technically relevant branch** for the reminder/location vision

Compared against `main`, `experimental/unstable-2026-04-27` is:

- **ahead by 4 commits**
- **behind by 0 commits**

That means it is not stale. It is the active forward lane.

---

## 1. What today’s unstable branch actually is

The branch includes an explicit branch note:

- `docs/EXPERIMENTAL_UNSTABLE_2026-04-27.md`

Its stated purpose is:

- `main` = morning-stable integration point
- `experimental/unstable-2026-04-27` = daytime integration lane for work that must be stable by end of day

It also explicitly says it has already folded in:

- `feature/ai-location-reminders-foundation`

That matters a lot.

### Translation
This is not a random junk branch.
It is the **current staging lane** for exactly the kind of cross-cutting reminder/location work we care about.

---

## 2. What the unstable branch already contains

Observed diffs versus `main` include:

- `server/routes/locations.ts`
- `server/routes/reminders.ts`
- `server/location-reminders.storage.test.ts`
- updates to `server/routes.ts`
- updates to `server/storage.ts`
- route inventory snapshot/test updates
- migration verify updates
- branch note doc

### Meaning
This branch has already started doing the real integration move:

- extracting route registrars
- wiring location endpoints
- wiring reminder endpoints
- carrying forward the location-reminder foundation

That is exactly the right direction.

---

## 3. What that means for the vision

Your vision has several moving parts:

1. typed/natural command understanding
2. durable reminders
3. home/work/custom locations
4. location events
5. offset-triggered reminders
6. AI interpretation and planning

The unstable branch already helps with **3, 4, and 5** in live-forward form.

So the plan should treat it as:

> the active integration chassis for reminder/location architecture

not just another branch to inspect and ignore.

---

## 4. Recommended role of each key branch now

## A. `experimental/unstable-2026-04-27`
### Role
**Primary daytime integration branch**

### Why
- 4 ahead / 0 behind `main`
- already folded in location-reminder foundation
- already adds route registrar files for locations and reminders
- already updates route inventory/tests
- explicitly intended as the risky daytime lane

### Use it for
- integrating fresh cross-cutting work
- proving route/storage wiring
- landing reminder/location changes before promotion to `main`

---

## B. `feature/ai-location-reminders-foundation`
### Role
**Source branch for reminder/location architecture**

### Why
It contributes:
- place alias resolution
- home/work/custom semantics
- location event creation
- offset scheduling
- AI interaction logging
- reminder storage helpers

### Use it for
- porting logic into unstable
- tests
- reference implementation for place/reminder storage concerns

### Important
Do not treat it as the final integration target anymore.
The unstable branch has already moved past it operationally.

---

## C. `feature/2026-04-25-command-parser-tests`
### Role
**Source branch for command understanding**

### Why
It provides:
- `shared/intent/*`
- parser
- time parsing
- recurrence parsing
- command foundation doctrine

### Use it for
- porting parser foundation into unstable next

### Important
It is behind `main`, so port selectively.

---

## D. `feature/2026-04-25-command-ui-dispatcher`
### Role
**Source branch for typed command UX + dispatcher glue**

### Why
It provides:
- command palette
- parse preview
- dispatcher integration
- voice pathway alignment

### Use it for
- porting command entry and dispatcher integration into unstable after parser landing

### Important
Also stale relative to `main`, so port carefully.

---

## E. `feature/2026-04-25-durable-reminders`
### Role
**Source branch for persistence model ideas**

### Why
It introduces:
- durable reminder storage
- migration for reminder rows

### Use it for
- comparing/merging reminder persistence concepts into the unstable/location model

### Important
This branch’s reminder model is still too time-centric by itself.
Do not let it override the more expressive trigger architecture.

---

## 5. The new plan

## Phase 0: accept unstable as the real staging base
Do this first.

### Working assumption
- `main` remains stability line
- `experimental/unstable-2026-04-27` becomes the active merge-and-prove lane for this vision

### Immediate branch strategy
Do new synthesis work either:
- directly on `experimental/unstable-2026-04-27` if you are keeping that pattern
- or on short-lived child branches based on it, then merge back into unstable

### Good child branch examples
- `feature/unstable-parser-port`
- `feature/unstable-command-palette-port`
- `feature/unstable-location-phrase-parser`
- `feature/unstable-report-planner-foundation`

---

## Phase 1: stabilize what unstable already has
Before adding more ambition, make sure the unstable branch’s current location/reminder path is solid.

### Verify:
- `server/routes/locations.ts`
- `server/routes/reminders.ts`
- route registration in `server/routes.ts`
- route inventory tests
- storage compatibility
- schema compatibility
- migration verification

### Goal
Prove that:
- places can be listed/saved
- location events can be created
- offset scheduling fires through the storage layer
- reminders can be created/updated/disabled cleanly

This phase is about hardening the current win.

---

## Phase 2: port the command parser into unstable
Source:
- `feature/2026-04-25-command-parser-tests`

Port into unstable:
- `shared/intent/intent-types.ts`
- `shared/intent/time-parser.ts`
- `shared/intent/recurrence-parser.ts`
- `shared/intent/parse-natural-command.ts`
- `shared/intent/map-to-dispatcher.ts`
- relevant tests

### Goal
Make unstable the branch that has both:
- reminder/location plumbing
- and the command interpretation substrate

Without this, the reminder engine remains headless.

---

## Phase 3: port command palette + dispatcher into unstable
Source:
- `feature/2026-04-25-command-ui-dispatcher`

Port into unstable:
- command palette UI
- hotkey wiring
- dispatcher integration
- voice glue changes

### Goal
Give the reminder/location system a user-facing nervous system.

You want:
- typed natural commands
- parse preview
- confirmation-first execution

This gets AxTask closer to the lived experience of:
> “Hey AxTask…”

without needing full LLM dependence yet.

---

## Phase 4: reconcile durable reminders with trigger-driven reminders
Source:
- `feature/2026-04-25-durable-reminders`
- `feature/ai-location-reminders-foundation`
- current unstable branch

### Key design decision
Do **not** collapse everything into one oversimplified reminder row.

Use:
- durable reminder definition
- separate trigger semantics

That gives you room for:
- datetime reminders
- recurring reminders
- location arrival
- location departure
- arrival offset reminders

### Goal
End up with one reminder architecture, not three competing ones.

---

## Phase 5: teach parser/location-aware phrases
Once unstable has:
- parser
- reminder routes
- location plumbing
- durable reminder storage

then add phrase support for:

- `after I get home`
- `when I leave work`
- `when I arrive at the gym`
- `five minutes after I get home`
- `remind me when I get to work`
- `check my oil five minutes after I get home every day`

### Goal
Bridge command understanding with place semantics.

This is the real “assistant” leap.

---

## Phase 6: add AI-assisted planning on top of the same substrate
Only after the command/reminder foundation is coherent.

### Build on unstable:
- `/api/ai/interpret`
- `/api/ai/execute`
- AI interaction logging
- retrieval-backed `report_plan`

### Why last
Because otherwise you build an intelligent mouth on top of weak bones.

---

## 6. Exact immediate action list

### Right now
1. treat `experimental/unstable-2026-04-27` as the active staging base
2. verify its current reminder/location route wiring
3. port parser foundation into it
4. port command palette/dispatcher into it
5. reconcile durable reminder model with location-trigger model
6. only then begin richer AI interpretation

---

## 7. Practical branch flow from today

### Option A: work directly in unstable
Fastest, but riskier.

### Option B: safer
Create child branches from unstable for each focused port.

Recommended:

```bash
git fetch origin
git checkout experimental/unstable-2026-04-27
git pull
git checkout -b feature/unstable-parser-port
```

Then after parser work is clean:

```bash
git checkout experimental/unstable-2026-04-27
git checkout -b feature/unstable-command-ui-port
```

Then:

```bash
git checkout experimental/unstable-2026-04-27
git checkout -b feature/unstable-trigger-reconciliation
```

This is the cleaner move.

---

## 8. What not to do

### Do not
- ignore unstable just because it says “unstable”
- start a brand new synthesis branch from `main` and leave unstable stranded
- merge the stale parser/UI branches wholesale without selective porting
- let durable reminders become a time-only dead end
- bolt LLM behavior on before command/reminder architecture is unified

---

## 9. Best summary

Today’s unstable branch should be treated as:

> **the live staging lane for the AxTask command + reminder + location synthesis**

And the plan from here is:

1. harden unstable’s current location/reminder integration
2. port parser into unstable
3. port command UI/dispatcher into unstable
4. reconcile reminder persistence with trigger-driven architecture
5. add location-aware phrase support
6. then add AI/report-planning layers

That is the sharp route.
