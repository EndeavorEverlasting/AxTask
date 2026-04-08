#!/bin/bash
set -e
npm install
if [ "${AXTASK_POST_MERGE_DB_PUSH:-}" = "1" ]; then
  echo "[post-merge] AXTASK_POST_MERGE_DB_PUSH=1 — running npm run db:push"
  npm run db:push
else
  echo "[post-merge] Skipping db:push (set AXTASK_POST_MERGE_DB_PUSH=1 in Replit Secrets to enable after merge)"
fi
