/**
 * Diagnostic script – run with: npx tsx server/services/corporate-extractors/_diagnose.ts
 * Dumps name mismatches and sample time values for alias map / time formatting work.
 */
import { extractTaskTracker } from "./task-tracker-extractor";
import { extractRosterBilling } from "./roster-billing-extractor";
import { extractManagerWorkbook } from "./manager-workbook-extractor";
import path from "path";
import { fileURLToPath } from "url";

const __dirname_esm = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname_esm, "../../../my_corporate_workflow_files");
const tt = extractTaskTracker(path.join(DIR, "CANDIDATE_OR_Task_Tracker_exec_wins_with_geoff_4_8.xlsx"));
const rb = extractRosterBilling(path.join(DIR, "Active_Roster_Log_4_9_2026_Billing.xlsx"));
const mw = extractManagerWorkbook(path.join(DIR, "CANDIDATE_Neuron_Track_hours_with_Field_Insights_2026-04-09.xlsx"));

const ttNames = new Set([...tt.task_evidence_daily.map(r => r.canonical_name), ...tt.task_evidence_event.map(r => r.canonical_name)]);
const rbNames = new Set([...rb.attendance.map(r => r.canonical_name), ...rb.people.map(r => r.canonical_name)]);
const mwNames = new Set(mw.manager_existing_rows.map(r => r.canonical_name));
const activeNames = new Set(rb.people.filter(p => p.active).map(p => p.canonical_name));

console.log("=== Task Tracker names ===");
[...ttNames].sort().forEach(n => console.log("  " + n));

console.log("\n=== Roster/Billing names (active) ===");
[...activeNames].sort().forEach(n => console.log("  " + n));

console.log("\n=== Manager Workbook names ===");
[...mwNames].sort().forEach(n => console.log("  " + n));

console.log("\n=== In TT but NOT in Roster ===");
[...ttNames].sort().filter(n => !rbNames.has(n)).forEach(n => console.log("  " + n));

console.log("\n=== In Roster (active) but NOT in TT ===");
[...activeNames].sort().filter(n => !ttNames.has(n)).forEach(n => console.log("  " + n));

console.log("\n=== Sample attendance clock_in/out (raw) ===");
rb.attendance.slice(0, 10).forEach(a => console.log(`  ${a.canonical_name} | in=${JSON.stringify(a.clock_in)} out=${JSON.stringify(a.clock_out)} hrs=${a.attendance_hours}`));

console.log("\n=== Sample manager clock_in/out (raw) ===");
mw.manager_existing_rows.slice(0, 10).forEach(r => console.log(`  ${r.canonical_name} | in=${JSON.stringify(r.clock_in)} out=${JSON.stringify(r.clock_out)} hrs=${r.hours}`));

console.log("\n=== Validation lists ===");
console.log("  tech_names:", mw.validation_lists.tech_names);
console.log("  assignment_types:", mw.validation_lists.assignment_types);

