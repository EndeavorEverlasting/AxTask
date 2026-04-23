# Task List Interaction Contract

This document is a hard UX contract for `/tasks` and any page using
`TaskListHost`.

## Required behavior

- Column headers are interactive and support:
  - click-to-sort cycles (`none -> asc -> desc -> none`) for sortable columns
  - per-column filter controls where configured
- Header interactions (sort/filter) emit `/api/tasks/filter-intent` signals and
  may award capped engagement rewards:
  - immediate `task_header_interaction_reward` coin grants
  - internal-only organization aptitude signal points by archetype bucket
- `/tasks` must show a subtle reward affordance (`header-reward-affordance`)
  when a header interaction reward is granted.
- Top-bar filters (search/priority/status) remain available and are
  complementary to header filters.
- Effective visibility pipeline is:
  - variant prefilter
  - top filters
  - route filter
  - header filters
  - optional sort
- Rendering remains on `PretextImperativeList` (no row-by-row React render loop
  reintroduced).

## Regression tests that must stay green

- `client/src/components/task-list-host.render.test.tsx`
- `client/src/components/task-list-host-contract.test.ts`
- `server/use-case-engagement.contract.test.ts`
- `server/organization-rewards.unit.test.ts`

If a refactor modifies header behavior, update these tests in the same PR and
document rationale.
