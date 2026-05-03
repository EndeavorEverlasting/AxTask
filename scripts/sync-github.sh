#!/usr/bin/env bash
# scripts/sync-github.sh
#
# One-command sync: push Replit's main branch to GitHub's main.
# Run this from the Replit Shell whenever you want to publish the
# Replit history to GitHub so that sprint-branch PRs work cleanly.
#
# Usage:
#   bash scripts/sync-github.sh
#
# Requirements:
#   - git remote "origin" must point to EndeavorEverlasting/AxTask
#   - GitHub credentials must be configured (the Replit GitHub
#     integration handles this automatically in the Replit Shell)

set -euo pipefail

REMOTE="${1:-origin}"
BRANCH="${2:-main}"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Replit → GitHub sync                           ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Confirm remote
REMOTE_URL=$(git remote get-url "$REMOTE" 2>/dev/null || echo "NOT SET")
echo "  Remote : $REMOTE ($REMOTE_URL)"
echo "  Branch : $BRANCH"
echo "  HEAD   : $(git rev-parse --short HEAD)"
echo ""

# Safety check: make sure we are on the right branch
CURRENT=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT" != "$BRANCH" ]; then
  echo "ERROR: You are on '$CURRENT', not '$BRANCH'."
  echo "       Checkout '$BRANCH' first, then re-run this script."
  exit 1
fi

echo "Pushing $BRANCH → $REMOTE (force) ..."
git push --force "$REMOTE" "$BRANCH"
echo ""

# Clean up any leftover helper branches on GitHub
for STALE in pre-iron-spine-base; do
  if git ls-remote --exit-code "$REMOTE" "refs/heads/$STALE" > /dev/null 2>&1; then
    echo "Removing stale helper branch: $STALE"
    git push "$REMOTE" --delete "$STALE" 2>/dev/null || true
  fi
done

echo ""
echo "✓ GitHub main is now in sync with Replit main."
echo "  Future sprint PRs can target GitHub main directly."
echo ""
