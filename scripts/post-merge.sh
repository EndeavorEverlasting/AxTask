#!/bin/bash
set -e
npm install
AIRLOCK_BOOTSTRAP_ALLOWED=true npm run db:push
