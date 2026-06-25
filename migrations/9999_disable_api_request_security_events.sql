-- Emergency containment: stop low-value per-request telemetry from filling security_events.
--
-- Context:
-- - server/routes.ts currently writes event_type='api_request' for every /api/* response.
-- - That row class is not user-critical audit data and has already been identified as
--   unbounded telemetry pressure in the scheduled resource hardening PR.
-- - This trigger suppresses new api_request rows at the database boundary so production
--   can recover even before the route middleware is refactored.
--
-- Follow-up code fix still required:
-- - Gate or remove the appendSecurityEvent({ eventType: 'api_request', ... }) middleware
--   so the app also stops doing the per-request DB round trip.

CREATE OR REPLACE FUNCTION suppress_api_request_security_events()
RETURNS trigger AS $$
BEGIN
  IF NEW.event_type = 'api_request' THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suppress_api_request_security_events ON security_events;

CREATE TRIGGER trg_suppress_api_request_security_events
BEFORE INSERT ON security_events
FOR EACH ROW
EXECUTE FUNCTION suppress_api_request_security_events();

-- Keep a short recent tail for emergency attribution, but remove the old noise.
-- Important: DELETE reclaims logical rows. Run scripts/db-reclaim.mjs during a maintenance
-- window if physical disk/page shrink is required.
DELETE FROM security_events
WHERE event_type = 'api_request'
  AND created_at < now() - interval '1 day';
