/**
 * Server-style static HTML for task notes in the imperative task list.
 * Uses the same SafeMarkdown pipeline as React surfaces so preview matches
 * list rendering without duplicating grammar rules.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SafeMarkdown } from "./safe-markdown";

/** Keep list rows cheap — notes can be up to TASK_NOTES_MAX_CHARS. */
const LIST_NOTES_PREVIEW_CHARS = 900;

export function renderTaskNotesPreviewHtml(
  notes: string,
  attachmentIds: readonly string[],
): string {
  const trimmed = notes.trim();
  if (!trimmed) return "";
  const source =
    trimmed.length > LIST_NOTES_PREVIEW_CHARS
      ? `${trimmed.slice(0, LIST_NOTES_PREVIEW_CHARS)}…`
      : trimmed;
  return renderToStaticMarkup(
    <SafeMarkdown
      source={source}
      allowedAttachmentIds={[...attachmentIds]}
      className="axtask-notes-md-preview text-xs text-gray-500 dark:text-gray-400 [&_p]:m-0 [&_img]:max-h-12 [&_img]:inline-block [&_img]:rounded"
    />,
  );
}
