-- Task bundles: conversion artifacts + membership join (child tasks).
BEGIN;

CREATE TABLE IF NOT EXISTS "conversion_artifacts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "conversion_type" text NOT NULL,
  "original_activity" text NOT NULL DEFAULT '',
  "original_notes" text NOT NULL DEFAULT '',
  "encrypted" boolean NOT NULL DEFAULT false,
  "encrypted_payload" bytea,
  "encryption_key_ref" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_conversion_artifacts_user" ON "conversion_artifacts" ("user_id");

CREATE TABLE IF NOT EXISTS "conversion_artifact_tasks" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "artifact_id" varchar NOT NULL REFERENCES "conversion_artifacts"("id") ON DELETE CASCADE,
  "task_id" varchar NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "sort_order" integer NOT NULL DEFAULT 0,
  CONSTRAINT "ux_conversion_artifact_tasks_task" UNIQUE ("task_id")
);

CREATE INDEX IF NOT EXISTS "idx_conversion_artifact_tasks_artifact_sort" ON "conversion_artifact_tasks" ("artifact_id", "sort_order");

COMMIT;
