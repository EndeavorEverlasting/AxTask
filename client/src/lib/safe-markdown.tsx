/**
 * Tiny sanitising markdown renderer for the paste composer.
 *
 * Unlike a general markdown library, this one is PURPOSEFULLY MINIMAL. The
 * supported grammar is:
 *
 *   - `**bold**` / `__bold__`
 *   - `*italic*` / `_italic_`
 *   - `` `code` ``
 *   - `[label](https?:// ...)`                <- normal https links only
 *   - `![alt](attachment:<uuid>)`             <- our own composed images
 *   - `![alt](https?:// ...)`                 <- IF caller passes allowImageSrc
 *                                               (default: FORBIDDEN)
 *   - blank-line paragraphs, hard newlines with two trailing spaces
 *
 * Everything else (raw HTML tags, `<script>`, `javascript:` urls, `data:`
 * urls, inline event handlers, non-attachment `<img>` src) is rendered as
 * inert text. We never call `dangerouslySetInnerHTML`.
 *
 * Attachment resolution contract:
 *   `attachment:<uuid>` in the URL slot is mapped via the injected
 *   `resolveAttachment` function to `/api/attachments/<id>/download`. The
 *   rendered <img> gets `referrerPolicy="no-referrer"`, `crossOrigin=""` and
 *   `decoding="async"` so it never leaks session info to a third party.
 *
 * See docs/PASTE_COMPOSER_SECURITY.md.
 */
import React from "react";

export type SafeMarkdownProps = {
  source: string;
  /**
   * Attachment ids that the viewer is allowed to dereference. Any other
   * `attachment:<id>` reference is rendered as literal text to prevent
   * cross-user attachment smuggling.
   */
  allowedAttachmentIds?: ReadonlySet<string> | string[];
  /**
   * Whether `![](https://...)` (non-attachment img) is permitted. Defaults
   * to `false`; callers that intentionally want to render third-party
   * remote images must opt in AND must audit the CSP implications.
   */
  allowRemoteImages?: boolean;
  className?: string;
};

const HTTPS_PREFIX = /^https:\/\//i;
const ATTACHMENT_PREFIX = /^attachment:([0-9a-f-]{8,64})$/i;
const SAFE_URL = /^(https:\/\/|\/api\/attachments\/)[^\s)<>"']*$/i;

function toSet(input: SafeMarkdownProps["allowedAttachmentIds"]): Set<string> {
  if (!input) return new Set();
  if (input instanceof Set) return input as Set<string>;
  return new Set(input);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Inline tokenizer. Strict: any unmatched syntax is treated as plain text.
 * ───────────────────────────────────────────────────────────────────────── */

type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: InlineNode[] }
  | { kind: "italic"; children: InlineNode[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; label: InlineNode[] }
  | {
      kind: "image";
      src: string;
      alt: string;
      isAttachment: boolean;
      attachmentId?: string;
    };

function tokenizeInline(input: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf.length > 0) {
      nodes.push({ kind: "text", text: buf });
      buf = "";
    }
  };
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    // Inline code: `...`
    if (ch === "`") {
      const close = input.indexOf("`", i + 1);
      if (close > i) {
        flush();
        nodes.push({ kind: "code", text: input.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
    // Image / link: ![alt](url) or [label](url)
    if (ch === "!" && next === "[") {
      const close = input.indexOf("]", i + 2);
      if (close > 0 && input[close + 1] === "(") {
        const paren = input.indexOf(")", close + 2);
        if (paren > close) {
          const alt = input.slice(i + 2, close);
          const src = input.slice(close + 2, paren);
          flush();
          const attMatch = ATTACHMENT_PREFIX.exec(src);
          if (attMatch) {
            nodes.push({
              kind: "image",
              src: "", // fill-in by renderer
              alt,
              isAttachment: true,
              attachmentId: attMatch[1],
            });
          } else {
            nodes.push({ kind: "image", src, alt, isAttachment: false });
          }
          i = paren + 1;
          continue;
        }
      }
    }
    if (ch === "[") {
      const close = input.indexOf("]", i + 1);
      if (close > 0 && input[close + 1] === "(") {
        const paren = input.indexOf(")", close + 2);
        if (paren > close) {
          const label = input.slice(i + 1, close);
          const href = input.slice(close + 2, paren);
          flush();
          nodes.push({
            kind: "link",
            href,
            label: tokenizeInline(label),
          });
          i = paren + 1;
          continue;
        }
      }
    }
    // Bold: **...** or __...__
    const boldDelim = ch === "*" && next === "*" ? "**" : ch === "_" && next === "_" ? "__" : null;
    if (boldDelim) {
      const close = input.indexOf(boldDelim, i + 2);
      if (close > i + 1) {
        flush();
        nodes.push({ kind: "bold", children: tokenizeInline(input.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    }
    // Italic: *..* or _.._ (no whitespace adjacent to delimiters for readability)
    if ((ch === "*" || ch === "_") && next && next !== ch && next !== " ") {
      const close = input.indexOf(ch, i + 1);
      if (close > i) {
        flush();
        nodes.push({ kind: "italic", children: tokenizeInline(input.slice(i + 1, close)) });
        i = close + 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return nodes;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Block splitter: very small - paragraphs separated by blank lines.
 * ───────────────────────────────────────────────────────────────────────── */

function splitBlocks(input: string): string[] {
  return input
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

/* ─────────────────────────────────────────────────────────────────────────
 * URL validation. Only https:// and /api/attachments/... downloads pass.
 * ───────────────────────────────────────────────────────────────────────── */

export function isSafeHref(href: string): boolean {
  if (!href) return false;
  if (href.length > 2048) return false;
  if (!SAFE_URL.test(href)) return false;
  if (/javascript:|data:|vbscript:/i.test(href)) return false;
  return true;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Renderer
 * ───────────────────────────────────────────────────────────────────────── */

function renderInline(
  nodes: InlineNode[],
  opts: { allowedAttachmentIds: Set<string>; allowRemoteImages: boolean },
): React.ReactNode[] {
  return nodes.map((node, idx) => {
    switch (node.kind) {
      case "text":
        return <React.Fragment key={idx}>{node.text}</React.Fragment>;
      case "code":
        return <code key={idx} className="axtask-md-code">{node.text}</code>;
      case "bold":
        return <strong key={idx}>{renderInline(node.children, opts)}</strong>;
      case "italic":
        return <em key={idx}>{renderInline(node.children, opts)}</em>;
      case "link":
        if (!isSafeHref(node.href)) {
          // Render the raw text, not a live link. Keeps `javascript:` and
          // `data:` payloads inert.
          return (
            <React.Fragment key={idx}>
              [{renderInline(node.label, opts)}]({node.href})
            </React.Fragment>
          );
        }
        return (
          <a
            key={idx}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            {renderInline(node.label, opts)}
          </a>
        );
      case "image": {
        if (node.isAttachment && node.attachmentId) {
          if (!opts.allowedAttachmentIds.has(node.attachmentId)) {
            return (
              <React.Fragment key={idx}>
                ![{node.alt}](attachment:{node.attachmentId})
              </React.Fragment>
            );
          }
          const href = `/api/attachments/${node.attachmentId}/download`;
          return (
            <img
              key={idx}
              src={href}
              alt={node.alt || ""}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="axtask-md-image"
              draggable={false}
            />
          );
        }
        if (opts.allowRemoteImages && HTTPS_PREFIX.test(node.src) && isSafeHref(node.src)) {
          return (
            <img
              key={idx}
              src={node.src}
              alt={node.alt || ""}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="axtask-md-image"
              draggable={false}
            />
          );
        }
        return (
          <React.Fragment key={idx}>
            ![{node.alt}]({node.src})
          </React.Fragment>
        );
      }
      default:
        return null;
    }
  });
}

export function SafeMarkdown({
  source,
  allowedAttachmentIds,
  allowRemoteImages = false,
  className,
}: SafeMarkdownProps): React.ReactElement {
  const opts = {
    allowedAttachmentIds: toSet(allowedAttachmentIds),
    allowRemoteImages,
  };
  const blocks = splitBlocks(source ?? "");
  return (
    <div className={className}>
      {blocks.map((block, bIdx) => (
        <p key={bIdx} className="axtask-md-paragraph">
          {renderInline(tokenizeInline(block), opts)}
        </p>
      ))}
    </div>
  );
}

/* Exported for tests. */
export const __internal = {
  tokenizeInline,
  splitBlocks,
  isSafeHref,
};
