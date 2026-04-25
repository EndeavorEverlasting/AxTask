/**
 * Run the real `parseNaturalCommand` (via tsx) with a fixed clock for local smoke.
 */
import { parseNaturalCommand } from "../shared/intent/parse-natural-command.ts";

const now = new Date("2026-04-25T12:00:00-04:00");
const todayStr = "2026-04-25";
const context = { now, todayStr };

const samples = [
  "remind me to check oil tomorrow at 7pm",
  "remind me about groceries at 9am",
  "laundry every Saturday morning",
  "do laundry every week",
  "help me plan my report for Josh on April billing hours",
  "show my alarms",
  "open calendar",
  "find billing tasks",
  "mark laundry done",
];

for (const sample of samples) {
  console.log(`\n> ${sample}`);
  console.log(JSON.stringify(parseNaturalCommand(sample, context), null, 2));
}
