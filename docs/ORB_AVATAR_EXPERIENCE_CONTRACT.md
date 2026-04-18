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
