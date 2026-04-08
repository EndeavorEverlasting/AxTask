/**
 * Consistent AxTask branding on generated artifacts (CSV, spreadsheets, PDF metadata).
 */
export const AXTASK_BRAND = "AxTask";
export const AXTASK_TAGLINE = "Priority engine task management";

/** First line of CSV exports; round-trip safe when stripped by parseTasksFromCSV. */
export function formatAxTaskCsvAttribution(): string {
  return `# ${AXTASK_BRAND} — ${AXTASK_TAGLINE} — exported ${new Date().toISOString()}`;
}

/** Rows for the optional "About AxTask" sheet in new Google spreadsheets. */
export function axTaskAboutSheetRows(): string[][] {
  const when = new Date().toISOString();
  return [
    [`${AXTASK_BRAND} · ${AXTASK_TAGLINE}`],
    [`This file was created from ${AXTASK_BRAND}.`],
    [`Sync and manage tasks in the app for the best experience.`],
    [""],
    [`Generated: ${when}`],
  ];
}
