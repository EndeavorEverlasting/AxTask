#!/bin/bash
set -e

echo "═══════════════════════════════════════════════════"
echo "  AxTask Pre-Publish Checks"
echo "═══════════════════════════════════════════════════"
echo ""

FAIL=0
WARN=0
TEST_PORT=9876
BASE="http://localhost:$TEST_PORT"

echo "▶ [1/6] TypeScript compilation check..."
if npx tsc --noEmit --pretty 2>&1; then
  echo "  ✓ TypeScript — no type errors"
else
  echo "  ✗ TypeScript — type errors found"
  FAIL=1
fi
echo ""

echo "▶ [2/6] Production build..."
if npm run build 2>&1; then
  echo "  ✓ Build — completed successfully"
else
  echo "  ✗ Build — failed"
  FAIL=1
fi
echo ""

echo "▶ [3/6] Checking build output exists..."
if [ -f "dist/index.js" ]; then
  SIZE=$(wc -c < dist/index.js)
  echo "  ✓ dist/index.js exists ($SIZE bytes)"
  if [ "$SIZE" -lt 1000 ]; then
    echo "  ✗ dist/index.js suspiciously small — likely incomplete"
    FAIL=1
  fi
else
  echo "  ✗ dist/index.js missing — build output incomplete"
  FAIL=1
fi

if [ -d "dist/public" ]; then
  ASSET_COUNT=$(find dist/public -type f | wc -l)
  echo "  ✓ dist/public exists ($ASSET_COUNT files)"
  if [ "$ASSET_COUNT" -lt 2 ]; then
    echo "  ✗ dist/public has too few files — frontend build may be broken"
    FAIL=1
  fi
else
  echo "  ✗ dist/public missing — frontend not built"
  FAIL=1
fi

if [ -f "dist/public/index.html" ]; then
  echo "  ✓ dist/public/index.html exists"
else
  echo "  ✗ dist/public/index.html missing — SPA entry point not built"
  FAIL=1
fi
echo ""

echo "▶ [4/6] Smoke-testing server startup..."
PORT=$TEST_PORT NODE_ENV=production timeout 15 node dist/index.js &
SERVER_PID=$!

for i in 1 2 3 4 5; do
  if curl -sfL "$BASE/healthz" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

if curl -sfL "$BASE/healthz" > /dev/null 2>&1; then
  echo "  ✓ Health check — /healthz responds 200"
else
  echo "  ✗ Health check — server did not respond on /healthz"
  FAIL=1
  kill $SERVER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  ✗ SERVER FAILED TO START — cannot continue"
  echo "═══════════════════════════════════════════════════"
  exit 1
fi
echo ""

echo "▶ [5/6] API endpoint checks..."

AUTH_CONFIG=$(curl -sfL "$BASE/api/auth/config" 2>/dev/null || echo "")
if [ -n "$AUTH_CONFIG" ]; then
  echo "  ✓ /api/auth/config responds"
else
  echo "  ✗ /api/auth/config did not respond"
  FAIL=1
fi

if echo "$AUTH_CONFIG" | grep -qE '"providers"|"primary"'; then
  echo "  ✓ /api/auth/config returns auth configuration"
else
  echo "  ✗ /api/auth/config response missing expected fields"
  FAIL=1
fi

AUTH_ME_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "$BASE/api/auth/me" 2>/dev/null | tail -c 3)
if [ "$AUTH_ME_STATUS" = "401" ] || [ "$AUTH_ME_STATUS" = "403" ]; then
  echo "  ✓ /api/auth/me returns $AUTH_ME_STATUS for unauthenticated (correct)"
elif [ "$AUTH_ME_STATUS" = "200" ]; then
  echo "  ⚠ /api/auth/me returned 200 — may have leaked a session"
  WARN=$((WARN + 1))
else
  echo "  ⚠ /api/auth/me returned $AUTH_ME_STATUS (expected 401)"
  WARN=$((WARN + 1))
fi

LOGIN_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@test.local","password":"wrongpassword123"}' \
  "$BASE/api/auth/login" 2>/dev/null | tail -c 3)
if [ "$LOGIN_STATUS" = "401" ] || [ "$LOGIN_STATUS" = "400" ] || [ "$LOGIN_STATUS" = "403" ]; then
  echo "  ✓ /api/auth/login rejects bad credentials ($LOGIN_STATUS)"
elif [ "$LOGIN_STATUS" = "000" ]; then
  echo "  ⚠ /api/auth/login — could not connect"
  WARN=$((WARN + 1))
else
  echo "  ⚠ /api/auth/login returned $LOGIN_STATUS (expected 401/400/403)"
  WARN=$((WARN + 1))
fi

GOOGLE_LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 "$BASE/api/auth/google/login" 2>/dev/null | tail -c 3)
if [ "$GOOGLE_LOGIN_STATUS" = "302" ]; then
  echo "  ✓ /api/auth/google/login redirects (302) — Google OAuth configured"
elif [ "$GOOGLE_LOGIN_STATUS" = "000" ]; then
  echo "  ⚠ /api/auth/google/login — could not connect"
  WARN=$((WARN + 1))
else
  echo "  ⚠ /api/auth/google/login returned $GOOGLE_LOGIN_STATUS (expected 302)"
  WARN=$((WARN + 1))
fi
echo ""

echo "▶ [6/6] Static asset serving..."
INDEX_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "$BASE/" 2>/dev/null | tail -c 3)
if [ "$INDEX_STATUS" = "200" ]; then
  echo "  ✓ / serves index.html (200)"
else
  echo "  ✗ / did not return 200 (got $INDEX_STATUS)"
  FAIL=1
fi

INDEX_BODY=$(curl -sfL "$BASE/" 2>/dev/null || echo "")
CSS_COUNT=$(echo "$INDEX_BODY" | grep -c '\.css' || true)
JS_COUNT=$(echo "$INDEX_BODY" | grep -c '\.js' || true)
CSS_COUNT=${CSS_COUNT:-0}
JS_COUNT=${JS_COUNT:-0}

if [ "$CSS_COUNT" -gt 0 ] && [ "$JS_COUNT" -gt 0 ]; then
  echo "  ✓ index.html references CSS ($CSS_COUNT) and JS ($JS_COUNT) assets"
else
  echo "  ⚠ index.html may be missing asset references (CSS=$CSS_COUNT, JS=$JS_COUNT)"
  WARN=$((WARN + 1))
fi

kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
echo ""

echo "═══════════════════════════════════════════════════"
if [ $FAIL -eq 0 ] && [ $WARN -eq 0 ]; then
  echo "  ✓ ALL CHECKS PASSED — safe to publish"
elif [ $FAIL -eq 0 ]; then
  echo "  ✓ PASSED with $WARN warning(s) — review before publishing"
else
  echo "  ✗ $FAIL CHECK(S) FAILED — do NOT publish"
fi
echo "═══════════════════════════════════════════════════"
exit $FAIL
