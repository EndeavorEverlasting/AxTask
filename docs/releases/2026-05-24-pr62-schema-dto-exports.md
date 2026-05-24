# PR #62: shared schema DTO export repair

Date: 2026-05-24

## Summary

- Restores shared DTO exports required by client/server consumers.
- Keeps anonymous community comments render-safe when `comment.userId` is absent.
- Aligns classification badge tests with the current multi-select category picker.
- Preserves deploy/startup guard expectations from PR #57.

## Database

No database shape changes. `migrations/0023_shared_schema_dto_exports_noop.sql` records that the shared schema TypeScript export repair does not require SQL changes.

## Validation

- `npm run check`
- Targeted tests for classification badge, deploy schema workflow, Docker stages, and Docker workflow
- `npm run build`
- GitHub Actions full test suite passed before release guardrail evidence update
