-- Installed Postgres extensions (Neon / any Postgres). Read-only.
-- Useful before enabling pgvector or other RAG-related extensions.

SELECT extname, extversion
FROM pg_extension
ORDER BY extname;
