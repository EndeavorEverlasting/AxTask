-- Inventory public schema tables (drift checks, RAG planning, onboarding). Read-only.

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
