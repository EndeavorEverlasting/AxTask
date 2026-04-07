import { log } from "../vite";
import { recomputePlaystyleCohortRollups } from "./gamification/playstyle-cohorts";

/**
 * Periodic anonymous cohort rollup (how the population “plays” the product).
 * Disabled unless PLAYSTYLE_COHORT_INTERVAL_MS is set to a positive number.
 */
export function startPlaystyleCohortScheduler(): void {
  const raw = (process.env.PLAYSTYLE_COHORT_INTERVAL_MS || "").trim();
  if (!raw) return;

  const intervalMs = Math.max(300_000, parseInt(raw, 10) || 0);

  log(`Playstyle cohort rollup every ${intervalMs}ms`, "playstyle-cohorts");

  void recomputePlaystyleCohortRollups().catch((e) => {
    console.error("[playstyle-cohorts] initial recompute failed:", e);
  });

  setInterval(() => {
    void recomputePlaystyleCohortRollups().catch((e) => {
      console.error("[playstyle-cohorts] scheduled recompute failed:", e);
    });
  }, intervalMs);
}
