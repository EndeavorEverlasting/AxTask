#!/bin/bash
set -e

echo "═══════════════════════════════════════════════════"
echo "  AxTask Pre-Publish Checks"
echo "═══════════════════════════════════════════════════"
echo ""

FAIL=0

echo "▶ [1/4] TypeScript compilation check..."
if npx tsc --noEmit --pretty 2>&1; then
  echo "  ✓ TypeScript — no type errors"
else
  echo "  ✗ TypeScript — type errors found"
  FAIL=1
fi
echo ""

echo "▶ [2/4] Production build..."
if npm run build 2>&1; then
  echo "  ✓ Build — completed successfully"
else
  echo "  ✗ Build — failed"
  FAIL=1
fi
echo ""

echo "▶ [3/4] Checking build output exists..."
if [ -f "dist/index.js" ]; then
  echo "  ✓ dist/index.js exists ($(wc -c < dist/index.js) bytes)"
else
  echo "  ✗ dist/index.js missing — build output incomplete"
  FAIL=1
fi

if [ -d "dist/public" ]; then
  ASSET_COUNT=$(find dist/public -type f | wc -l)
  echo "  ✓ dist/public exists ($ASSET_COUNT files)"
else
  echo "  ✗ dist/public missing — frontend not built"
  FAIL=1
fi
echo ""

echo "▶ [4/4] Smoke-testing server startup..."
PORT=9876 NODE_ENV=production timeout 10 node dist/index.js &
SERVER_PID=$!
sleep 3

if curl -sf http://localhost:9876/healthz > /dev/null 2>&1; then
  echo "  ✓ Health check — /healthz responds 200"
else
  echo "  ✗ Health check — server did not respond on /healthz"
  FAIL=1
fi

if curl -sf http://localhost:9876/api/auth/config > /dev/null 2>&1; then
  echo "  ✓ API check — /api/auth/config responds"
else
  echo "  ✗ API check — /api/auth/config did not respond"
  FAIL=1
fi

kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
echo ""

echo "═══════════════════════════════════════════════════"
if [ $FAIL -eq 0 ]; then
  echo "  ✓ ALL CHECKS PASSED — safe to publish"
  echo "═══════════════════════════════════════════════════"
  exit 0
else
  echo "  ✗ SOME CHECKS FAILED — do NOT publish"
  echo "═══════════════════════════════════════════════════"
  exit 1
fi
