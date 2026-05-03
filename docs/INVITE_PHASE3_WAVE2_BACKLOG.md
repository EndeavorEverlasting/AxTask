# Invite UX — Phase 3 Wave 2 backlog

Planned follow-ons after Wave 1 (autocomplete, recent chips, row intro animation) ships and is validated in real usage.

- **Self-invite early guard**: detect current session handle vs input before preview/invite; playful inline copy.
- **Undo collaborator removal**: short-lived undo affordance after remove (toast or inline) with idempotent restore.
- **Invite readiness indicator**: compact stepped indicator (format → found → role → send).
- **Nearby handle suggestions on miss**: when exact preview misses, suggest prefix-close handles (same privacy rules as suggestions API).
- **Privacy-safe invite funnel analytics**: aggregate-only events (`preview_hit`, `preview_miss`, `invite_success`) with no raw handle logging in access logs.

Implement in small PRs; each item should re-run contract tests touching `server/routes.ts` and `client/src/components/share-dialog.tsx`.
