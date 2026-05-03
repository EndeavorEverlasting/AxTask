-- Template: nearest-neighbor style query once you have a vector column (pgvector).
-- Requires: CREATE EXTENSION vector; and a column like embedding vector(1536)
-- Replace dimensions, table, and :query_vector binding for your client.

-- Example shape (do not run until table exists):
--
-- SELECT id, content, embedding <=> :query_vector AS distance
-- FROM rag_document_chunks
-- WHERE user_id = :user_id
-- ORDER BY embedding <=> :query_vector
-- LIMIT 20;

-- For raw SQL editor testing, you can use a literal array cast, e.g.:
-- WHERE embedding IS NOT NULL
-- ORDER BY embedding <=> '[0.01,0.02,...]'::vector
-- LIMIT 5;
