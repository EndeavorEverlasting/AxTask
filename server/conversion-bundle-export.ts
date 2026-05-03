import PDFDocument from "pdfkit";
import type { ConversionArtifact, Task } from "@shared/schema";

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function buildConversionBundleMarkdown(artifact: ConversionArtifact, tasks: Task[]): string {
  const lines: string[] = [
    `# ${artifact.title}`,
    "",
    `**Type:** ${artifact.conversionType}`,
    "",
    "## Original prompt",
    "",
    artifact.originalActivity?.trim() || "(empty)",
    "",
    artifact.originalNotes?.trim() ? artifact.originalNotes.trim() : "",
    "",
    "## Tasks",
    "",
    "| Status | Activity | Notes | Start | End |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const t of tasks) {
    lines.push(
      `| ${t.status} | ${escapeMd(t.activity)} | ${escapeMd((t.notes ?? "").trim())} | ${t.startDate ?? t.date} | ${t.endDate ?? ""} |`,
    );
  }
  return lines.filter((l, i) => !(i > 0 && l === "" && lines[i - 1] === "")).join("\n");
}

export function buildConversionBundleCsv(tasks: Task[]): string {
  const header = ["status", "activity", "notes", "start", "end", "classification"];
  const rows = tasks.map((t) =>
    [
      t.status,
      JSON.stringify(t.activity),
      JSON.stringify((t.notes ?? "").trim()),
      JSON.stringify(t.startDate ?? t.date),
      JSON.stringify(t.endDate ?? ""),
      JSON.stringify(t.classification),
    ].join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function generateConversionBundlePdf(
  artifact: ConversionArtifact,
  tasks: Task[],
): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({ margin: 50 });
  doc.fontSize(18).text(artifact.title, { underline: true });
  doc.moveDown();
  doc.fontSize(11).text(`Type: ${artifact.conversionType}`);
  doc.moveDown();
  doc.fontSize(12).text("Original prompt", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(artifact.originalActivity?.trim() || "(empty)", { align: "left" });
  if ((artifact.originalNotes ?? "").trim()) {
    doc.moveDown();
    doc.fontSize(10).text(artifact.originalNotes!.trim(), { align: "left" });
  }
  doc.moveDown();
  doc.fontSize(12).text("Tasks", { underline: true });
  doc.moveDown(0.5);
  for (const t of tasks) {
    doc.fontSize(10).text(`• [${t.status}] ${t.activity}`);
    if ((t.notes ?? "").trim()) {
      doc.fontSize(9).fillColor("#555").text(`  ${(t.notes ?? "").trim()}`, { indent: 10 });
      doc.fillColor("#000");
    }
    doc.moveDown(0.25);
  }
  return doc;
}
