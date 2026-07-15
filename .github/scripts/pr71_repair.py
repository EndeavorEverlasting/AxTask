from pathlib import Path


def replace_once(path: Path, old: str, new: str, missing_message: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(missing_message)
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


env_doc = Path("docs/ENVIRONMENT_VARIABLES.md")
env_old = '''## 9. Adherence and background jobs

| Variable | Purpose |
|----------|---------|
| `ADHERENCE_INTERVENTIONS_ENABLED` | `"true"` to enable. |
| `VAPID_*` | Required for real push delivery (see section 4). |
| `DISABLE_ARCHETYPE_ROLLUP`, `ARCHETYPE_ROLLUP_INTERVAL_MS` | Rollup worker. |
| `DISABLE_RETENTION_PRUNE`, `RETENTION_PRUNE_INTERVAL_MS`, `RETENTION_PRUNE_INITIAL_DELAY_MS` | Retention job. |
| `AXTASK_ARCHETYPE_POLL_SCHEDULER` | Set `0` to disable poll auto-schedule. |
'''
env_new = '''## 9. Adherence and background jobs

Full matrix: [SCHEDULED_RESOURCE_CONTROLS.md](SCHEDULED_RESOURCE_CONTROLS.md).

| Variable | Purpose |
|----------|---------|
| `ADHERENCE_INTERVENTIONS_ENABLED` | `"true"` to enable adherence cron. |
| `VAPID_*` | Required for real push delivery (see section 4). |
| `DISABLE_REMINDER_DISPATCH` | `"true"` disables 60s reminder dispatch ticker. |
| `REMINDER_DISPATCH_INTERVAL_MS`, `REMINDER_DISPATCH_MAX_PER_TICK` | Reminder dispatch tuning (defaults 60s / 100). |
| `DISABLE_ARCHETYPE_ROLLUP`, `ARCHETYPE_ROLLUP_INTERVAL_MS` | Archetype rollup worker (default interval 1h). |
| `DISABLE_RETENTION_PRUNE`, `RETENTION_PRUNE_INTERVAL_MS`, `RETENTION_PRUNE_INITIAL_DELAY_MS` | In-process retention prune (default 24h, 2m boot delay). |
| `DISABLE_DB_SIZE_SNAPSHOT` | `"true"` skips daily `db_size_snapshots` write; retention prune still runs. |
| `DISABLE_OPS_SNAPSHOT` | `"true"` blocks admin usage capture and (after PR #68) ops stdout snapshot ticker. |
| `OPS_SNAPSHOT_INTERVAL_MS`, `OPS_SNAPSHOT_INITIAL_DELAY_MS` | Ops stdout snapshot cadence (PR #68). |
| `DISABLE_DB_RETENTION_CRON` | `"true"` skips Render/manual `scripts/db-retention.mjs` run (exit 0). |
| `BACKUP_SCHEDULER_ENABLED`, `BACKUP_SCHEDULER_INTERVAL_MS`, `BACKUP_SCHEDULER_BATCH_SIZE`, `BACKUP_SCHEDULER_CONCURRENCY` | Opt-in tick scheduler — see [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md). |
| `BACKUP_QUEUE_WORKER_ENABLED`, `BACKUP_QUEUE_WORKER_POLL_MS`, `BACKUP_QUEUE_WORKER_CONCURRENCY` | Opt-in PG queue worker. |
| `BACKUP_BULLMQ_ENABLED`, `BACKUP_BULLMQ_CONCURRENCY` | Opt-in Redis BullMQ worker. |
| `AXTASK_ARCHETYPE_POLL_SCHEDULER` | Set `0` to disable poll auto-schedule. |
'''
replace_once(env_doc, env_old, env_new, "Expected environment-variable section not found")

routes = Path("server/routes.ts")
routes_old = '''  app.post("/api/admin/usage/capture", requireAdmin, requireAdminStepUp, async (req, res) => {
    try {'''
routes_new = '''  app.post("/api/admin/usage/capture", requireAdmin, requireAdminStepUp, async (req, res) => {
    if (process.env.DISABLE_OPS_SNAPSHOT === "true") {
      return res.status(503).json({
        message: "Usage snapshot capture disabled (DISABLE_OPS_SNAPSHOT=true)",
      });
    }
    try {'''
replace_once(routes, routes_old, routes_new, "Expected admin usage route marker not found")

inventory = Path("server/routes-inventory.contract.test.ts")
inventory_marker = "  /** Phase-1 hardening: location/reminder registrars must keep these paths (regardless of snapshot drift). */\n"
inventory_addition = '''  /**
   * Admin usage capture is gated when DISABLE_OPS_SNAPSHOT is set (scheduled
   * resource controls). The route stays registered; semantics live in
   * server/scheduled-resource-controls.contract.test.ts.
   */
  it("keeps admin usage capture registered and gated by DISABLE_OPS_SNAPSHOT", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('app.post("/api/admin/usage/capture"');
    expect(routes).toContain("DISABLE_OPS_SNAPSHOT");
  });

'''
inventory_text = inventory.read_text(encoding="utf-8")
if "keeps admin usage capture registered and gated by DISABLE_OPS_SNAPSHOT" not in inventory_text:
    if inventory_marker not in inventory_text:
        raise SystemExit("Expected route inventory marker not found")
    inventory.write_text(
        inventory_text.replace(inventory_marker, inventory_addition + inventory_marker, 1),
        encoding="utf-8",
    )
