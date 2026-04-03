import Tesseract from "tesseract.js";
import type { Task } from "@shared/schema";

interface OCRResult {
  matchedTasks: {
    taskId: string;
    activity: string;
    wasChecked: boolean;
    confidence: number;
  }[];
  unmatchedLines: string[];
  rawText: string;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);

  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const intersection = new Set(Array.from(wordsA).filter(w => wordsB.has(w)));

  if (intersection.size === 0) return 0;

  const union = new Set([...Array.from(wordsA), ...Array.from(wordsB)]);
  return intersection.size / union.size;
}

function isCheckedLine(line: string): boolean {
  const checkedPatterns = [
    /^\s*\[x\]/i,
    /^\s*\[✓\]/,
    /^\s*\[✔\]/,
    /^\s*✓/,
    /^\s*✔/,
    /^\s*☑/,
    /^\s*\(x\)/i,
    /^\s*x\s/i,
    /^\s*done\s*[-:]/i,
    /^\s*completed?\s*[-:]/i,
    /^\s*✅/,
  ];

  return checkedPatterns.some(p => p.test(line));
}

function isUncheckedLine(line: string): boolean {
  const uncheckedPatterns = [
    /^\s*\[\s*\]/,
    /^\s*☐/,
    /^\s*□/,
    /^\s*\(\s*\)/,
    /^\s*○/,
    /^\s*⬜/,
  ];

  return uncheckedPatterns.some(p => p.test(line));
}

function extractTaskText(line: string): string {
  return line
    .replace(/^\s*\[.?\]\s*/, "")
    .replace(/^\s*[✓✔☑☐□○⬜✅]\s*/, "")
    .replace(/^\s*\(.?\)\s*/, "")
    .replace(/^\s*\d+\.\s*/, "")
    .replace(/^\s*[-•]\s*/, "")
    .trim();
}

export async function processChecklistImage(
  imageBuffer: Buffer,
  tasks: Task[]
): Promise<OCRResult> {
  const { data } = await Tesseract.recognize(imageBuffer, "eng", {
    logger: () => {},
  });

  const rawText = data.text;
  const lines = rawText.split("\n").filter(l => l.trim().length > 3);

  const matchedTasks: OCRResult["matchedTasks"] = [];
  const unmatchedLines: string[] = [];
  const matchedTaskIds = new Set<string>();

  for (const line of lines) {
    const taskText = extractTaskText(line);
    if (!taskText || taskText.length < 3) continue;

    const isChecked = isCheckedLine(line);
    const isUnchecked = isUncheckedLine(line);
    const hasCheckboxSignal = isChecked || isUnchecked;

    let bestMatch: Task | null = null;
    let bestScore = 0;

    for (const task of tasks) {
      if (matchedTaskIds.has(task.id)) continue;

      const score = similarity(taskText, task.activity);
      if (score > bestScore && score > 0.35) {
        bestScore = score;
        bestMatch = task;
      }
    }

    if (bestMatch) {
      matchedTaskIds.add(bestMatch.id);
      matchedTasks.push({
        taskId: bestMatch.id,
        activity: bestMatch.activity,
        wasChecked: hasCheckboxSignal ? isChecked : false,
        confidence: Math.round(bestScore * 100),
      });
    } else if (taskText.length > 5) {
      unmatchedLines.push(taskText);
    }
  }

  return { matchedTasks, unmatchedLines, rawText };
}
