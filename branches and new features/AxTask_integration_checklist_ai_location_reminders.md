# AxTask integration checklist for AI + location reminders

This checklist is written against the current observed AxTask shape:

- `shared/schema/{core,tasks,gamification,ops}.ts`
- `server/storage.ts` as the current storage monolith
- `server/routes.ts` as the current route monolith
- existing notification/push/adherence infrastructure
- existing `userLocationPlaces` foothold in `shared/schema/ops.ts`

This is a **merge plan**, not a fantasy rewrite.

---

## 1. Objective

Integrate the starter-pack concepts into the **current AxTask repo** without:

- deepening the monolith unnecessarily
- breaking existing notification behavior
- conflating AI interpretation with reminder execution
- treating location reminders as hand-wavy UI fluff

---

## 2. Ground rules before you touch code

### 2.1 Create a branch
Use a feature branch, not `main`.

Suggested branch name:

```bash
feature/ai-location-reminders-foundation
```

---

### 2.2 Do not do all of this in one PR
Split into at least these slices:

1. schema + storage
2. routes + tests
3. scheduler/dispatch logic
4. AI interpret/execute endpoints
5. report-planning retrieval

If you try to land it all in one slab, review quality dies.

---

### 2.3 Keep behavior deterministic
For now:

- LLM interprets
- AxTask validates
- AxTask executes

The model must not become the data layer.

---

## 3. File-by-file merge plan

# 3.1 `shared/schema/ops.ts`

This is the first real landing zone.

The repo already contains:

- `userAlarmSnapshots`
- `userLocationPlaces`

So this file is the natural place for the location/reminder additions.

---

### Step 3.1.1: do **not** delete `userLocationPlaces` immediately
You have two sane options:

## Option A: evolve the existing table
Modify `userLocationPlaces` in place to add:

- `slug`
- `placeType`
- `label`
- `notes`
- `isDefault`
- `isActive`
- `source`
- `geocodeAccuracyMeters`
- `lastVerifiedAt`
- `lastEnteredAt`
- `lastExitedAt`

This is best if you want a clean steady-state model quickly.

## Option B: add `userLocationPlacesV2`
Keep the old table temporarily and migrate later.

This is better if:
- the current table may already be in use
- you want safer phased rollout
- you want a migration path with back-compat

### My recommendation
Use **Option A** unless you already suspect live dependency on the current minimal shape.

---

### Step 3.1.2: add enums/constants
In `shared/schema/ops.ts`, add constants for:

- `LOCATION_PLACE_TYPES`
- `LOCATION_PLACE_SOURCES`
- `LOCATION_EVENT_TYPES`
- `LOCATION_EVENT_SOURCES`
- `REMINDER_KINDS`
- `REMINDER_TRIGGER_TYPES`

This keeps route/storage validation sane.

---

### Step 3.1.3: add `userLocationEvents`
Add a new table for enter/exit events.

Why it belongs here:
- it is operational/device/stateful
- it is not task CRUD
- it supports reminder trigger evaluation

Fields to add:

- `id`
- `userId`
- `placeId`
- `eventType`
- `source`
- `confidence`
- `metadataJson`
- `occurredAt`
- `createdAt`

Add indexes on:
- `(userId, occurredAt)`
- `(placeId, occurredAt)`

---

### Step 3.1.4: add `userReminders`
Add a reminder definition table.

Fields:
- `id`
- `userId`
- `kind`
- `title`
- `body`
- `enabled`
- `createdBy`
- `createdAt`
- `updatedAt`

`createdBy` helps distinguish:
- manual
- AI
- system-generated

---

### Step 3.1.5: add `userReminderTriggers`
Do not stuff trigger semantics into the reminder row itself.

Fields:
- `id`
- `reminderId`
- `triggerType`
- `payloadJson`
- `nextRunAt`
- `lastTriggeredAt`
- `cooldownSeconds`
- `isActive`
- `createdAt`
- `updatedAt`

This separation is important because one reminder may later support:
- more than one trigger
- evolving next-run state
- retry/cooldown logic

---

### Step 3.1.6: add `aiInteractions`
This should also live in `ops.ts`.

Fields:
- `id`
- `userId`
- `sessionId`
- `rawMessage`
- `intentKind`
- `structuredOutputJson`
- `provider`
- `model`
- `latencyMs`
- `accepted`
- `rejectedReason`
- `createdAt`

Why now:
Because once you start AI interpretation, you will want observability immediately.

---

### Step 3.1.7: add Zod schemas in `ops.ts`
Add:

- `createLocationPlaceSchema`
- `createLocationEventSchema`
- `createReminderSchema`
- `reminderTriggerSchema`
- `recurrenceRuleSchema`

Do not leave routes validating raw JSON ad hoc.

---

## 4. Migration notes for schema changes

Because AxTask already uses Drizzle and has migration/startup discipline, your next steps should be:

1. update `shared/schema/ops.ts`
2. run typecheck
3. generate/apply migration according to your existing repo practice
4. run migration verification checks
5. run targeted tests

### Commands you will likely use
Based on the repo tooling:

```bash
npm run check
node scripts/apply-migrations.mjs
npm run db:push
npm run migration:verify-schema
npm run test
```

Do not run them blindly in the wrong order if your local flow differs.  
But that is the rough path.

---

## 5. `server/storage.ts` merge plan

Right now storage is still monolithic.

You have two options:

## Option A: integrate directly into `server/storage.ts`
Fastest for landing.

## Option B: add `server/storage/{locations,reminders,ai}.ts` and re-export later
Cleaner long term, but a bit more setup.

### My recommendation
For first landing, do this:

- create `server/storage/locations.ts`
- create `server/storage/reminders.ts`
- create `server/storage/ai.ts`
- then either:
  - import directly from those modules in new routes, or
  - re-export selected functions from `server/storage.ts`

That gives you cleaner boundaries without forcing the full storage split right now.

---

### Step 5.1: create `server/storage/locations.ts`
Add functions:

- `listUserLocationPlaces(userId)`
- `getUserDefaultHome(userId)`
- `getUserDefaultWork(userId)`
- `resolvePlaceAlias(userId, alias)`
- `createUserLocationPlace(input)`
- `updateUserLocationPlace(id, userId, patch)`
- `deleteUserLocationPlace(id, userId)`
- `recordLocationEvent(input)`
- `markPlaceEntered(...)`
- `markPlaceExited(...)`

### Important rule
`resolvePlaceAlias` must handle:
- `home`
- `work`
- custom slug
- maybe later label lookup

Do not do fuzzy label magic yet.

---

### Step 5.2: create `server/storage/reminders.ts`
Add functions:

- `createReminderWithTrigger(...)`
- `listUserReminders(userId)`
- `getReminderById(id, userId)`
- `updateReminder(...)`
- `disableReminder(...)`
- `listDueReminderTriggers(now)`
- `markReminderTriggered(triggerId, when)`
- `scheduleLocationOffsetTriggersFromEvent(event)`

That last one matters for:
- “5 minutes after I get home”

---

### Step 5.3: create `server/storage/ai.ts`
Add functions:

- `logAiInteraction(...)`
- `markAiInteractionAccepted(...)`
- `markAiInteractionRejected(...)`

Keep it narrow first.

---

## 6. `server/routes.ts` merge plan

Do **not** immediately inject hundreds of lines into the giant monolith unless you have to.

Better move:

- create registrar files
- call them from the main register function when ready

Add:

- `server/routes/locations.ts`
- `server/routes/reminders.ts`
- `server/routes/ai.ts`

---

### Step 6.1: `server/routes/locations.ts`
Register routes:

- `GET /api/locations`
- `POST /api/locations`
- `PATCH /api/locations/:id`
- `DELETE /api/locations/:id`
- `POST /api/location-events`

### Important
`POST /api/location-events` is likely internal/device-driven later, but for now you can keep it authenticated and simple.

---

### Step 6.2: `server/routes/reminders.ts`
Register routes:

- `GET /api/reminders`
- `POST /api/reminders`
- `PATCH /api/reminders/:id`
- `POST /api/reminders/:id/disable`

Do not overcomplicate with a dozen special endpoints first.

---

### Step 6.3: `server/routes/ai.ts`
Register routes:

- `POST /api/ai/interpret`
- `POST /api/ai/execute`

### Split of responsibility

#### `/api/ai/interpret`
Returns structured intent only.

#### `/api/ai/execute`
Interprets then executes through deterministic tools.

That split is worth keeping.

---

### Step 6.4: register the new route files from the main router
Inside the current `registerRoutes(app)` flow, add:

```ts
registerLocationRoutes(app, requireAuth);
registerReminderRoutes(app, requireAuth);
registerAiRoutes(app, requireAuth);
```

Put them in a sane order near related account/preferences/notification routes.

---

## 7. AI module merge plan

Create a new subtree:

```text
server/ai/
  contracts/
  providers/
  schemas/
  orchestration/
  tools/
```

Do not mix this into `server/services` initially unless you want the concept to dissolve into mush.

---

### Step 7.1: add `server/ai/contracts/llm-provider.ts`
This is your provider abstraction seam.

Why it matters:
- hosted provider first
- local provider later
- no route rewrite later

---

### Step 7.2: add `server/ai/schemas/intent-result.ts`
This should define:

- `IntentResult`
- `ReminderTrigger`
- `RecurrenceRule`

This is the contract the model must satisfy.

---

### Step 7.3: add `server/ai/orchestration/ai-orchestrator.ts`
This should:
- call the provider
- parse the user request
- return a typed intent
- optionally execute through tools

Keep it boring.

---

### Step 7.4: add `server/ai/tools/create-reminder.ts`
This tool should:
1. resolve `home/work/custom`
2. validate existence
3. create reminder rows
4. return action result or clarification

This is the key bridge from language to state.

---

## 8. Existing repo pieces to reuse instead of reinventing

# 8.1 Existing notification infrastructure
Reuse:
- push preferences
- subscription handling
- delivery channel concepts
- intensity profiles

Do **not** rebuild push delivery.

But also do **not** pretend notification preference rows are reminder definitions.  
They are not the same thing.

---

# 8.2 Existing adherence/intervention machinery
This may later help with:
- nudges
- missed reminder follow-up
- escalation

But do not tightly couple that on day one.

---

# 8.3 Existing RAG/classification doctrine
Use the repo’s existing blueprint ideas for:
- query normalization
- retrieval
- reranking
- clarification on low confidence

This should inform `report_plan` behavior later.

---

## 9. How to handle home, work, and custom locations correctly

This is the part that must not be sloppy.

### Home
- exactly one active default home per user
- alias resolution for `home`
- location-arrival reminders should prefer this

### Work
- exactly one active default work per user
- alias resolution for `work`

### Custom
- any number
- require unique `slug` per user
- examples:
  - `gym`
  - `warehouse`
  - `mom-house`
  - `plainview-hq`

### Best practice
Use:
- `placeType` for meaning
- `slug` for machine resolution
- `label` for user-facing display

Do not rely on `name` alone forever.

---

## 10. Natural-language support map

These are the first phrases AxTask should support after integration.

### 10.1 Oil reminder
Input:
> Set a reminder to check my oil five minutes after I get home every day.

Should become:
- `create_reminder`
- `location_arrival_offset`
- `placeSlug=home`
- `offsetMinutes=5`
- recurrence daily

### 10.2 Laundry
Input:
> Make a task to do my laundry every Saturday morning.

Should become:
- `create_task`
- weekly recurrence
- normalized morning time

### 10.3 Groceries
Input:
> Remind me to get groceries every now and again.

Should become:
- clarification

Not a guessed schedule.

### 10.4 Josh report
Input:
> Help me plan my report for Josh on the April billing hours.

Should become:
- `report_plan`
- retrieval-backed context assembly
- draft outline

---

## 11. Suggested client-side landing path

Do not try to build perfect chat UI first.

Add these client pieces first:

- `client/src/pages/locations.tsx`
- `client/src/hooks/use-locations.ts`
- `client/src/hooks/use-reminders.ts`
- simple settings UI for:
  - home
  - work
  - custom places

Then later:
- `client/src/hooks/use-ai-assistant.ts`
- assistant entry box

### Why
Because if the user cannot set home/work cleanly, location-aware reminders are fake.

---

## 12. Minimal test plan

You need tests for:

### Schema/validation
- place creation schema
- reminder creation schema
- trigger schema
- vague recurrence clarification behavior at AI layer

### Storage
- create/list/update/delete place
- resolve `home`
- resolve `work`
- create reminder with trigger
- due trigger evaluation

### Routes
- authenticated location CRUD
- authenticated reminder CRUD
- AI interpret returns structured output

### Behavioral
- no home set + “after I get home” -> clarification or actionable error
- vague recurrence phrase -> clarification
- daily arrival offset scheduling works

---

## 13. Recommended PR sequence

# PR 1: schema + storage
Files:
- `shared/schema/ops.ts`
- `server/storage/locations.ts`
- `server/storage/reminders.ts`
- `server/storage/ai.ts`

Goal:
- new tables
- new storage functions
- tests

---

# PR 2: routes
Files:
- `server/routes/locations.ts`
- `server/routes/reminders.ts`
- route registration in `server/routes.ts`

Goal:
- usable CRUD/API surface

---

# PR 3: scheduler/dispatch
Files:
- reminder evaluation service
- location-event follow-on scheduling

Goal:
- reminders actually fire

---

# PR 4: AI interpret/execute
Files:
- `server/ai/*`
- `server/routes/ai.ts`

Goal:
- structured natural-language support

---

# PR 5: report planning retrieval
Files:
- retrieval layer
- report-planning tool
- tests

Goal:
- Josh-report use case becomes real

---

## 14. Pitfalls to avoid

### Pitfall 1
Putting AI code straight into `server/routes.ts`.

Result:
- harder to test
- harder to swap providers
- more sludge

### Pitfall 2
Keeping `userLocationPlaces` semantically underdefined.

Result:
- “home” becomes just a nickname
- reminders become unreliable

### Pitfall 3
Using notification preferences as reminder records.

Result:
- impossible future maintenance

### Pitfall 4
Guessing vague phrases.

Result:
- the assistant feels clever until it burns trust

### Pitfall 5
Trying to build full “agent mode” first.

Result:
- noise, cost, and unstable behavior before fundamentals exist

---

## 15. Exact starting checklist

Use this in order.

### Schema
- [ ] extend or replace `userLocationPlaces`
- [ ] add `userLocationEvents`
- [ ] add `userReminders`
- [ ] add `userReminderTriggers`
- [ ] add `aiInteractions`
- [ ] add Zod schemas

### Storage
- [ ] add `server/storage/locations.ts`
- [ ] add `server/storage/reminders.ts`
- [ ] add `server/storage/ai.ts`

### Routes
- [ ] add `server/routes/locations.ts`
- [ ] add `server/routes/reminders.ts`
- [ ] add `server/routes/ai.ts`
- [ ] register route modules from main router

### Runtime
- [ ] add trigger evaluator
- [ ] add location-event scheduling logic
- [ ] connect reminder delivery to existing push/in-app machinery

### AI
- [ ] add provider contract
- [ ] add orchestrator
- [ ] add create-reminder tool
- [ ] add `/api/ai/interpret`
- [ ] add `/api/ai/execute`

### Client
- [ ] add places UI
- [ ] add reminder UI
- [ ] add assistant entry later

### Tests
- [ ] schema tests
- [ ] storage tests
- [ ] route tests
- [ ] phrase-behavior tests

---

## 16. Final recommendation

If you only do one thing next, do this:

> **Land place semantics + reminder tables before touching serious LLM wiring.**

Because without that, the AI layer has nowhere truthful to put its output.

That is the sharp move.
