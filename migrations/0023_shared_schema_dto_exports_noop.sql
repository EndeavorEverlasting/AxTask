-- PR #62 changes TypeScript DTO exports under shared/schema without altering the database shape.
-- This no-op migration satisfies the release guardrail that requires numbered SQL evidence
-- whenever shared/schema files change.
SELECT 1;
