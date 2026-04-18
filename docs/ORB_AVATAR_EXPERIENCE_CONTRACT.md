# Orb and Avatar Experience Contract

## Purpose

Codify the orb-first interaction philosophy and avatar behavior system so UX, engine behavior, and community expression stay aligned.

## Related docs

- [FEEDBACK_AVATAR_NUDGES.md](FEEDBACK_AVATAR_NUDGES.md) — how feedback prompts are tied to the five companion personas and made user-tunable.

## Orb UX Principles

- Floating orb motion should feel ambient and alive, not distracting.
- Cursor-elusion should express fleeting-task metaphor while preserving control.
- Visual behavior must remain performant and non-blocking for core interactions.

## Avatar Semantics

- Avatars are engine personas, not user identities.
- Each avatar has a stable voice, intent profile, and response style.
- Avatar dialogue must remain consistent across forum posts and replies.

## Mood Color Mapping

- Mood classes map to stable color families.
- Color tokens must be reused across cards, chips, badges, and orb surfaces.
- Changes to avatar color semantics require documentation updates first.

## Glossy Orb Treatment (visual contract)

- Every companion avatar rendered in product UI MUST use the `AvatarOrb` primitive at `client/src/components/ui/avatar-orb.tsx`. Ad-hoc circular divs with gradients are not a substitute and break the specular-highlight contract.
- `AvatarOrb` variants (`mood`, `archetype`, `productivity`, `social`, `lazy`) map 1:1 to the five companion keys in `shared/feedback-avatar-map.ts`. Do not invent new variants without updating this doc and the map first.
- Orbs are pure CSS: a base `.axtask-orb` class stacks three radial gradients (specular highlight, bottom tuck, hue body) plus two pseudo-elements (`::before` gloss, `::after` rim). No rAF, no JS state, no layout thrash per-frame.
- Dialog headers, page headers, and mission cards use `wobble={true}` (default). Dense rows and table cells MUST pass `wobble={false}` to prevent per-row animation cost.
- Glassy surfaces (`.glass-panel-glossy`) are the intended background for orb placement so the specular highlight reads correctly against the aurora.

## Dense vs Calm surfaces

- The authenticated shell exposes a `data-surface` attribute on `<main>` with values `dense` or `calm` (default `calm`). The CSS tokens in `client/src/index.css` use this attribute to dim ambient orb/chip layers (`.axtask-orb-layer`, `.axtask-chip-layer`) on data-heavy pages.
- Pages MUST call `usePretextSurface("dense")` (from `client/src/hooks/use-pretext-surface.ts`) when:
  - They render tables with more than ~20 rows of real-time data (Analytics, Admin, Import/Export).
  - They render interactive grids, drag-and-drop boards, or video surfaces where background motion would compete with affordances.
- All other pages should rely on the default `calm` surface. The hook restores the previous value on unmount to avoid stuck-dense state after navigation.
- Reduced-motion users always receive the calm treatment regardless of `data-surface`; the CSS respects `prefers-reduced-motion: reduce` globally.

## Dialogue Engine Boundaries

- Avatar engines can initiate public conversational threads.
- Avatar engines can auto-reply within moderation and privacy constraints.
- Avatar engines must avoid exposing user-specific private data in generated content.

## Voice: shopping list and delegation (product surface)

- The **Shopping list** page (`/shopping`) shows tasks that qualify as shopping or errands (classification **Shopping** and/or light keyword heuristics on activity and notes). There is no separate “shopping blob” storage: the interactive list is the normal task list, filtered for this view.
- **Check off purchased** is implemented as **task completion** (`status: completed`). The shopping UI uses purchased-oriented labels; the same completion APIs and sync behavior as the main task list apply.
- **Voice** may add one or many **line items as real tasks** in a single utterance (for example comma- or “and”-separated items directed at a shopping list). Multi-item splitting is best-effort ASR; users can fix rows on **All Tasks** if a line merges oddly.
- Users may speak **delegation-style** phrases (“get the avatar to…”, “ask AxTask to…”). The NLU layer **strips** these prefixes before intent classification so behavior stays predictable; confirmations may use a short **“On it — …”** style prefix **only** when delegation was detected, without changing non-delegation phrasing elsewhere.
- **Avatars remain engine personas**, not users; voice copy must not imply a human is executing errands off-device.
