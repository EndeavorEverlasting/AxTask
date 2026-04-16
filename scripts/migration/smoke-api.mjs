/**
 * HTTP smoke checks for a running AxTask instance (after deploy or local start).
 * Usage: BASE_URL=https://your-app.onrender.com node scripts/migration/smoke-api.mjs
 * Default BASE_URL=http://localhost:5000
 */
const base = (process.env.BASE_URL || "http://localhost:5000").replace(/\/$/, "");

const paths = ["/health", "/ready"];

async function fetchOk(path) {
  const url = `${base}${path}`;
  const res = await fetch(url, { redirect: "manual" });
  return { path, ok: res.ok, status: res.status };
}

async function main() {
  const results = await Promise.all(paths.map((p) => fetchOk(p)));
  const bad = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`migration:smoke-api: ${r.path} -> ${r.status} ${r.ok ? "OK" : "FAIL"}`);
  }
  if (bad.length > 0) {
    console.error("migration:smoke-api: failed — is the server running? BASE_URL=", base);
    process.exit(1);
  }
  console.log("migration:smoke-api: OK");
  process.exit(0);
}

main().catch((e) => {
  const msg = e.cause?.code === "ECONNREFUSED" || /fetch failed/i.test(String(e.message))
    ? "cannot reach server (start app with npm run dev or set BASE_URL to your Render URL)"
    : e.message || e;
  console.error("migration:smoke-api:", msg);
  process.exit(1);
});
