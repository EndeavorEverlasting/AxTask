/**
 * Static HTML for task notes in the imperative Pretext task list.
 * Uses renderSafeMarkdownHtmlString (same parser as SafeMarkdown) so list
 * rows avoid renderToStaticMarkup on every notes update.
 */
import { renderSafeMarkdownHtmlString } from "./safe-markdown";

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
  return renderSafeMarkdownHtmlString(source, {
    allowedAttachmentIds: [...attachmentIds],
    className:
      "axtask-notes-md-preview text-xs text-gray-500 dark:text-gray-400 [&_.axtask-md-paragraph]:m-0 [&_.axtask-md-heading]:my-0 [&_.axtask-md-ul]:my-0 [&_.axtask-md-ol]:my-0 [&_.axtask-md-pre]:my-1 [&_.axtask-md-image]:max-h-12 [&_.axtask-md-image]:inline-block [&_.axtask-md-image]:rounded",
  });
}
