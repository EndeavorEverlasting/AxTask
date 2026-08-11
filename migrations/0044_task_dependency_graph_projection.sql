-- PG16-safe relational projection for task dependency graph queries.
-- PostgreSQL 19 can expose these views through CREATE PROPERTY GRAPH without
-- changing the durable tasks table or duplicating graph state.

CREATE OR REPLACE VIEW public.task_graph_vertices AS
SELECT
  id,
  user_id,
  activity,
  status,
  priority,
  classification,
  start_date,
  end_date,
  deadline_type,
  created_at,
  updated_at
FROM public.tasks
WHERE deleted_at IS NULL;

COMMENT ON VIEW public.task_graph_vertices IS
  'Live task vertices used by AxTask relational graph queries and the optional PostgreSQL 19 property graph.';

CREATE OR REPLACE VIEW public.task_graph_edges AS
SELECT DISTINCT
  source.id AS source_task_id,
  target.id AS target_task_id,
  source.user_id,
  'depends_on'::text AS relation
FROM public.tasks AS source
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(source.depends_on) = 'array' THEN source.depends_on
    ELSE '[]'::jsonb
  END
) AS dependency(target_task_id)
JOIN public.tasks AS target
  ON target.id = dependency.target_task_id
 AND target.user_id IS NOT DISTINCT FROM source.user_id
WHERE source.deleted_at IS NULL
  AND target.deleted_at IS NULL;

COMMENT ON VIEW public.task_graph_edges IS
  'Directed task dependency edges: source_task_id depends on target_task_id; cross-user edges are excluded.';
