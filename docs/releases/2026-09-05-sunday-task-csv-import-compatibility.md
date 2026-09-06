# Sunday task CSV import compatibility — 2026-09-05

## Scope

This release evidence closes a repository-proof gap for the existing CSV task importer. It does not import any user task data and does not change production behavior.

## Contract proved

The importer accepts the publish-only task-population shape:

`date,activity,notes,urgency,impact,effort,prerequisites,status`

The focused contract verifies:

- ISO `YYYY-MM-DD` dates are preserved.
- activity and notes are mapped without losing quoted commas.
- urgency, impact, and effort values in the 1–5 range remain numeric task ratings.
- prerequisites are preserved, including an empty value.
- `pending` and `completed` status values map to the corresponding task status.

## Privacy boundary

The repository test uses generic sample rows. The operator's real Sunday task titles, notes, and prerequisites remain outside Git and are supplied through the external task-population artifact at runtime.

## Runtime boundary

Repository and CI success proves importer compatibility only. It does not prove task CRUD against the operator's account, restart persistence, an actual CSV import, production deployment, Google login, or real production task data.

The production recovery runbook remains authoritative for Render/Neon recovery. No production mutation is authorized by this compatibility proof.
