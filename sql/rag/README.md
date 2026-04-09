# RAG / vector SQL (templates)

AxTask’s app schema does not define RAG tables yet. Use these as **starting points** when you add:

- `pgvector` (or hosted vector type) on Neon  
- document / chunk tables with embeddings and metadata  

**Suggested workflow**

1. Enable `vector` on Neon if you use pgvector (`CREATE EXTENSION IF NOT EXISTS vector;` when supported).
2. Add a proper **Drizzle migration** under [`migrations/`](../migrations/) for any new tables.
3. Copy or adapt templates here into **`sql/rag/`** playbooks your team runs for health checks and debugging.

Files in this folder are intentionally generic; rename tables/columns to match your migration.
