# PR #72: gate api_request security-event telemetry

Date: 2026-06-25

## Summary

- Stops the application from attempting one `api_request` write to `security_events` for every normal `/api/*` response unless the application-side gate is explicitly enabled.
- Keeps the emergency database containment migration `migrations/9999_disable_api_request_security_events.sql` authoritative on migrated databases. That trigger still rejects `api_request` rows even if `SECURITY_API_REQUEST_LOGGING=true`.
- Meaningful security audit events remain always-on: auth (login/OAuth/TOTP), admin actions, bans, password resets, archetype signals, and the 5xx `api_error` fallback with `notifyAdminsOfApiError`.

## Operator notes

- Keep `SECURITY_API_REQUEST_LOGGING` false or unset in production.
- The environment variable is an application-side diagnostic gate, not a production re-enable switch. A database that has applied migration `9999` continues rejecting `api_request` rows at the trigger boundary.
- Do not drop or relax the migration `9999` trigger as part of this recovery PR. Retiring that containment boundary requires a separate rollout with explicit rollback protection for older application versions.
- Logical deletes only reclaim rows. Physical shrink still requires `scripts/db-reclaim.mjs` in an authorized maintenance window.

## Rollout

1. Deploy with `SECURITY_API_REQUEST_LOGGING` unset or `false`.
2. Confirm migration `9999_disable_api_request_security_events.sql` is applied or already recorded.
3. Confirm normal traffic no longer advances the `api_request` count.
4. Confirm a controlled 5xx still records `api_error` and preserves the admin notification path.

## Rollback

- Revert the application commit while leaving the migration `9999` trigger installed. The database trigger is the rollback safety boundary if an older application build resumes attempting per-request writes.
- Do not drop `trg_suppress_api_request_security_events` during rollback.
- If physical database reclaim is needed, schedule `scripts/db-reclaim.mjs` separately; it is not part of application rollback.

## Database

No schema shape changes are introduced by this PR. Containment migration `9999_disable_api_request_security_events.sql` already exists on `main` and remains in force.

## Validation

- `npx vitest run server/api-request-logging.contract.test.ts`
- `npx vitest run server/routes-inventory.contract.test.ts`
- `npm run release:check`
- `npm run check`

## Post-deploy verification

```sql
SELECT event_type, count(*)
FROM security_events
GROUP BY event_type
ORDER BY count(*) DESC;

SELECT count(*)
FROM security_events
WHERE event_type = 'api_request';

SELECT max(created_at)
FROM security_events
WHERE event_type = 'api_request';
```

The `api_request` count and maximum timestamp should stop advancing once this PR plus migration `9999` are deployed; 5xx requests should still produce `api_error` rows.
