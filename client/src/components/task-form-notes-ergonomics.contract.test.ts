import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TASK_FORM_SOURCE = readFileSync(
  resolve(process.cwd(), "client/src/components/task-form.tsx"),
  "utf8",
);

function notesFieldSource(): string {
  const match = TASK_FORM_SOURCE.match(/name="notes"[\s\S]*?name="urgency"/);
  if (!match) throw new Error("Could not isolate the TaskForm Notes field");
  return match[0];
}

describe("TaskForm Notes ergonomics contract", () => {
  it("reserves the task form for editing instead of rendering a redundant preview", () => {
    const source = notesFieldSource();

    expect(source).not.toContain("<SafeMarkdown");
    expect(source).not.toMatch(/>\s*Preview\s*</);
    expect(source).not.toContain("max-h-48");
  });

  it("provides a larger persistent editor and a visible character budget", () => {
    const source = notesFieldSource();

    expect(TASK_FORM_SOURCE).toContain("const TASK_NOTES_EDITOR_HEIGHT = 240;");
    expect(source).toContain('data-testid="task-notes-editor"');
    expect(source).toContain("height: Math.max(notesHeight, TASK_NOTES_EDITOR_HEIGHT)");
    expect(source).toContain("minHeight: TASK_NOTES_EDITOR_HEIGHT");
    expect(source).toContain('data-testid="task-notes-character-count"');
    expect(source).toContain("TASK_NOTES_MAX_CHARS.toLocaleString()");
  });

  it("routes attachment feedback back to the Notes editor", () => {
    expect(TASK_FORM_SOURCE).toContain("Image pasted and inserted into Notes.");
    expect(TASK_FORM_SOURCE).toContain("setHighlightNotesEditor(true)");
    expect(TASK_FORM_SOURCE).not.toContain("Preview updated below.");
    expect(TASK_FORM_SOURCE).not.toContain("highlightNotesPreview");
  });
});
