# PR #72: gate api_request security-event telemetry

Date: 2026-06-25

## Summary

- Stops storing one `api_request` row in `security_events` for every normal `/api/*` response. That per-request write (a chained-hash SELECT+INSERT round trip) was unbounded low-value telemetry and a primary contributor to the Render/Node boot-time heap OOM.
- The `api_request` event is now gated behind `SECURITY_API_REQUEST_LOGGING` (default off). It is opt-in only, for temporary route-attribution diagnostics.
- Meaningful security audit events are preserved and always-on: auth (login/OAuth/TOTP), admin actions, bans, password resets, archetype signals, and the 5xx `api_error` fallback with `notifyAdminsOfApiError`.

## Operator notes

- `SECURITY_API_REQUEST_LOGGING=false` by default. Set `true` only for short, deliberate route-attribution diagnostics, then unset.
- Do not enable in production unless explicitly authorized for temporary diagnostics.
- Pairs with the already-applied DB containment migration `migrations/9999_disable_api_request_security_events.sql`, which suppresses the same noise at the database trigger boundary and deletes `api_request` rows older than one day. Logical deletes only; physical shrink still requires `scripts/db-reclaim.mjs` in a maintenance window.

## Database

No schema shape changes in this PR. Containment migration `9999_disable_api_request_security_events.sql` already exists on `main`.

## Validation

- `npx vitest run server/api-request-logging.contract.test.ts`
- `npx vitest run server/routes-inventory.contract.test.ts`
- `npm run check`

## Post-deploy verification

```sql
SELECT event_type, count(*) FROM security_events GROUP BY event_type ORDER BY count(*) DESC;
SELECT count(*) FROM security_events WHERE event_type = 'api_request';
```

The `api_request` count should stop growing once this PR plus migration `9999` are deployed; 5xx requests should still produce `api_error` rows.
