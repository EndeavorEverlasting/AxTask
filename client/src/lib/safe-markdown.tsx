/**
 * Sanitising markdown renderer for user-composed bodies (paste composer companion).
 *
 * Supported grammar (closed subset; raw HTML is never interpreted):
 *
 *   Block: ATX headings (#–######), fenced ``` / ~~~ code, ul/ol (single level),
 *          blockquote (lines with >), thematic break (--- / *** / ___ alone),
 *          paragraphs (blank-line separated).
 *   Inline: **bold** / __bold__, *italic* / _italic_, `code`,
 *          [label](https://… or /api/attachments/…),
 *          ![alt](attachment:<uuid>), optional ![alt](https://…) when allowRemoteImages.
 *
 * Attachment tokens resolve only against allowedAttachmentIds. We never call
 * dangerouslySetInnerHTML from this module.
 *
 * See docs/PASTE_COMPOSER_SECURITY.md.
 */
import React from "react";

export type SafeMarkdownProps = {
  source: string;
  allowedAttachmentIds?: ReadonlySet<string> | string[];
  allowRemoteImages?: boolean;
  className?: string;
};

export type SafeMarkdownHtmlOpts = {
  allowedAttachmentIds?: SafeMarkdownProps["allowedAttachmentIds"];
  allowRemoteImages?: boolean;
  className?: string;
};

const HTTPS_PREFIX = /^https:\/\//i;
const ATTACHMENT_PREFIX = /^attachment:([0-9a-f-]{8,64})$/i;
const SAFE_URL = /^(https:\/\/|\/api\/attachments\/)[^\s)<>"']*$/i;
const MAX_BLOCKQUOTE_DEPTH = 6;
const FENCE_INFO_SAFE = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/;

function toSet(input: SafeMarkdownProps["allowedAttachmentIds"]): Set<string> {
  if (!input) return new Set();
  if (input instanceof Set) return input as Set<string>;
  return new Set(input);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Inline AST
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

    if (ch === "`") {
      const close = input.indexOf("`", i + 1);
      if (close > i) {
        flush();
        nodes.push({ kind: "code", text: input.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
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
              src: "",
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
 * Block AST
 * ───────────────────────────────────────────────────────────────────────── */

export type BlockNode =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "codeFence"; body: string; info: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "blockquote"; children: BlockNode[] }
  | { kind: "thematicBreak" };

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

function tryFenceOpen(line: string): { char: "`" | "~"; len: number; info: string } | null {
  const m = line.match(/^(\s{0,3})(`{3,}|~{3,})([^\n]*)$/);
  if (!m) return null;
  const fence = m[2];
  const ch = fence[0] as "`" | "~";
  return { char: ch, len: fence.length, info: m[3].trim() };
}

function isFenceCloseLine(line: string, char: "`" | "~", minLen: number): boolean {
  const m = line.match(/^(\s{0,3})(`{3,}|~{3,})\s*$/);
  if (!m) return false;
  const fence = m[2];
  if (fence[0] !== char) return false;
  return fence.length >= minLen;
}

function isThematicBreakLine(trimmed: string): boolean {
  if (!trimmed || trimmed.startsWith("#")) return false;
  const compact = trimmed.replace(/\s/g, "");
  if (compact.length < 3) return false;
  return /^(?:\*{3,}|-{3,}|_{3,})$/.test(compact);
}

function matchAtxHeading(trimmed: string): { level: number; text: string } | null {
  const m = trimmed.match(/^(#{1,6})(\s+)(.+)$/);
  if (!m) return null;
  let text = m[3].trimEnd();
  text = text.replace(/\s+#+\s*$/, "").trimEnd();
  return { level: m[1].length, text };
}

function matchUlItem(trimmed: string): string | null {
  const m = trimmed.match(/^\s{0,3}[-*+]\s+(.*)$/);
  return m ? m[1] : null;
}

function matchOlItem(trimmed: string): string | null {
  const m = trimmed.match(/^\s{0,3}\d{1,9}\.\s+(.*)$/);
  return m ? m[1] : null;
}

function isBlockStartLine(line: string): boolean {
  const t = line.trim();
  if (t === "") return false;
  if (tryFenceOpen(line)) return true;
  if (isThematicBreakLine(t)) return true;
  if (matchAtxHeading(t)) return true;
  if (/^\s{0,3}>/.test(line)) return true;
  if (matchUlItem(t) !== null) return true;
  if (matchOlItem(t) !== null) return true;
  return false;
}

export function parseDocument(source: string, depth = 0): BlockNode[] {
  const text = normalizeNewlines(source ?? "");
  const lines = text.split("\n");
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim() === "") {
      i += 1;
      continue;
    }
    const line = lines[i];
    const trimmed = line.trim();

    const fenceOpen = tryFenceOpen(line);
    if (fenceOpen) {
      const bodyLines: string[] = [];
      i += 1;
      let closed = false;
      while (i < lines.length) {
        if (isFenceCloseLine(lines[i], fenceOpen.char, fenceOpen.len)) {
          closed = true;
          i += 1;
          break;
        }
        bodyLines.push(lines[i]);
        i += 1;
      }
      if (closed) {
        const info = FENCE_INFO_SAFE.test(fenceOpen.info) ? fenceOpen.info : "";
        blocks.push({ kind: "codeFence", body: bodyLines.join("\n"), info });
      } else {
        const literal = [line, ...bodyLines].join("\n");
        blocks.push({ kind: "paragraph", text: literal });
      }
      continue;
    }

    if (isThematicBreakLine(trimmed)) {
      blocks.push({ kind: "thematicBreak" });
      i += 1;
      continue;
    }

    const h = matchAtxHeading(trimmed);
    if (h) {
      blocks.push({ kind: "heading", level: h.level, text: h.text });
      i += 1;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const innerLines: string[] = [];
      while (i < lines.length) {
        const L = lines[i];
        if (/^\s{0,3}>/.test(L)) {
          innerLines.push(L.replace(/^\s{0,3}>\s?/, ""));
          i += 1;
          continue;
        }
        if (L.trim() === "") {
          innerLines.push("");
          i += 1;
          continue;
        }
        break;
      }
      const inner = innerLines.join("\n").replace(/\n+$/, "");
      if (depth >= MAX_BLOCKQUOTE_DEPTH) {
        blocks.push({
          kind: "paragraph",
          text: innerLines.map((ln) => `> ${ln}`).join("\n"),
        });
      } else {
        const parsed = parseDocument(inner, depth + 1);
        const children = parsed.length > 0 ? parsed : [{ kind: "paragraph" as const, text: "" }];
        blocks.push({ kind: "blockquote", children });
      }
      continue;
    }

    const ul0 = matchUlItem(trimmed);
    const ol0 = matchOlItem(trimmed);
    if (ul0 !== null && ol0 === null) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === "") break;
        const item = matchUlItem(t);
        if (item === null) break;
        items.push(item);
        i += 1;
      }
      blocks.push({ kind: "list", ordered: false, items });
      continue;
    }
    if (ol0 !== null && ul0 === null) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === "") break;
        const item = matchOlItem(t);
        if (item === null) break;
        items.push(item);
        i += 1;
      }
      blocks.push({ kind: "list", ordered: true, items });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const L = lines[i];
      if (L.trim() === "") break;
      if (isBlockStartLine(L)) break;
      paraLines.push(L);
      i += 1;
    }
    const ptext = paraLines.join("\n").trimEnd();
    if (ptext.length > 0) {
      blocks.push({ kind: "paragraph", text: ptext });
    }
  }

  return blocks;
}

/** Legacy paragraph-only split (tests / external introspection). */
function splitBlocks(input: string): string[] {
  return input
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

export function isSafeHref(href: string): boolean {
  if (!href) return false;
  if (href.length > 2048) return false;
  if (!SAFE_URL.test(href)) return false;
  if (/javascript:|data:|vbscript:/i.test(href)) return false;
  return true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type RenderOpts = { allowedAttachmentIds: Set<string>; allowRemoteImages: boolean };

function renderInline(
  nodes: InlineNode[],
  opts: RenderOpts,
): React.ReactNode[] {
  return nodes.map((node, idx) => {
    switch (node.kind) {
      case "text":
        return <React.Fragment key={idx}>{node.text}</React.Fragment>;
      case "code":
        return (
          <code key={idx} className="axtask-md-code">
            {node.text}
          </code>
        );
      case "bold":
        return <strong key={idx}>{renderInline(node.children, opts)}</strong>;
      case "italic":
        return <em key={idx}>{renderInline(node.children, opts)}</em>;
      case "link":
        if (!isSafeHref(node.href)) {
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

function renderInlineHtml(nodes: InlineNode[], opts: RenderOpts): string {
  let out = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        out += escapeHtml(node.text);
        break;
      case "code":
        out += `<code class="axtask-md-code">${escapeHtml(node.text)}</code>`;
        break;
      case "bold":
        out += `<strong>${renderInlineHtml(node.children, opts)}</strong>`;
        break;
      case "italic":
        out += `<em>${renderInlineHtml(node.children, opts)}</em>`;
        break;
      case "link":
        if (!isSafeHref(node.href)) {
          out += `[${renderInlineHtml(node.label, opts)}](${escapeHtml(node.href)})`;
        } else {
          out += `<a href="${escapeHtml(node.href)}" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">${renderInlineHtml(node.label, opts)}</a>`;
        }
        break;
      case "image": {
        if (node.isAttachment && node.attachmentId) {
          if (!opts.allowedAttachmentIds.has(node.attachmentId)) {
            out += `![${escapeHtml(node.alt)}](attachment:${escapeHtml(node.attachmentId)})`;
          } else {
            const href = `/api/attachments/${node.attachmentId}/download`;
            out += `<img src="${escapeHtml(href)}" alt="${escapeHtml(node.alt || "")}" loading="lazy" decoding="async" referrerPolicy="no-referrer" class="axtask-md-image" draggable="false"/>`;
          }
        } else if (opts.allowRemoteImages && HTTPS_PREFIX.test(node.src) && isSafeHref(node.src)) {
          out += `<img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt || "")}" loading="lazy" decoding="async" referrerPolicy="no-referrer" class="axtask-md-image" draggable="false"/>`;
        } else {
          out += `![${escapeHtml(node.alt)}](${escapeHtml(node.src)})`;
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function headingClass(level: number): string {
  return `axtask-md-heading axtask-md-h${level}`;
}

function renderBlockReact(
  block: BlockNode,
  key: number,
  opts: RenderOpts,
): React.ReactNode {
  switch (block.kind) {
    case "paragraph":
      return (
        <p key={key} className="axtask-md-paragraph">
          {renderInline(tokenizeInline(block.text), opts)}
        </p>
      );
    case "heading": {
      const lv = Math.min(6, Math.max(1, block.level));
      const tag = `h${lv}`;
      return React.createElement(
        tag,
        { key, className: headingClass(lv) },
        renderInline(tokenizeInline(block.text), opts),
      );
    }
    case "codeFence": {
      const langClass = block.info ? ` axtask-md-code-block--${block.info.replace(/[^a-zA-Z0-9_-]/g, "")}` : "";
      return (
        <pre key={key} className="axtask-md-pre">
          <code className={`axtask-md-code-block${langClass}`}>{block.body}</code>
        </pre>
      );
    }
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag key={key} className={block.ordered ? "axtask-md-ol" : "axtask-md-ul"}>
          {block.items.map((item, j) => (
            <li key={j} className="axtask-md-li">
              {renderInline(tokenizeInline(item), opts)}
            </li>
          ))}
        </Tag>
      );
    }
    case "blockquote":
      return (
        <blockquote key={key} className="axtask-md-blockquote">
          {block.children.map((ch, j) => renderBlockReact(ch, j, opts))}
        </blockquote>
      );
    case "thematicBreak":
      return <hr key={key} className="axtask-md-hr" />;
    default:
      return null;
  }
}

function renderBlockHtml(block: BlockNode, opts: RenderOpts): string {
  switch (block.kind) {
    case "paragraph":
      return `<p class="axtask-md-paragraph">${renderInlineHtml(tokenizeInline(block.text), opts)}</p>`;
    case "heading": {
      const lv = Math.min(6, Math.max(1, block.level));
      const tag = `h${lv}`;
      return `<${tag} class="${headingClass(lv)}">${renderInlineHtml(tokenizeInline(block.text), opts)}</${tag}>`;
    }
    case "codeFence": {
      const safeInfo = block.info.replace(/[^a-zA-Z0-9_-]/g, "");
      const langClass = safeInfo ? ` axtask-md-code-block--${safeInfo}` : "";
      return `<pre class="axtask-md-pre"><code class="axtask-md-code-block${langClass}">${escapeHtml(block.body)}</code></pre>`;
    }
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const cls = block.ordered ? "axtask-md-ol" : "axtask-md-ul";
      const inner = block.items
        .map((item) => `<li class="axtask-md-li">${renderInlineHtml(tokenizeInline(item), opts)}</li>`)
        .join("");
      return `<${tag} class="${cls}">${inner}</${tag}>`;
    }
    case "blockquote": {
      const inner = block.children.map((ch) => renderBlockHtml(ch, opts)).join("");
      return `<blockquote class="axtask-md-blockquote">${inner}</blockquote>`;
    }
    case "thematicBreak":
      return `<hr class="axtask-md-hr"/>`;
    default:
      return "";
  }
}

export function SafeMarkdown({
  source,
  allowedAttachmentIds,
  allowRemoteImages = false,
  className,
}: SafeMarkdownProps): React.ReactElement {
  const opts: RenderOpts = {
    allowedAttachmentIds: toSet(allowedAttachmentIds),
    allowRemoteImages,
  };
  const blocks = parseDocument(source ?? "");
  const rootClass = ["axtask-md-body", className].filter(Boolean).join(" ");
  return (
    <div className={rootClass}>
      {blocks.map((b, bIdx) => renderBlockReact(b, bIdx, opts))}
    </div>
  );
}

/**
 * Same output as SafeMarkdown but as an HTML string (no React DOM).
 * For Pretext hot paths — caller must only inject this trusted output.
 */
export function renderSafeMarkdownHtmlString(source: string, opts: SafeMarkdownHtmlOpts = {}): string {
  const ro: RenderOpts = {
    allowedAttachmentIds: toSet(opts.allowedAttachmentIds),
    allowRemoteImages: opts.allowRemoteImages ?? false,
  };
  const blocks = parseDocument(source ?? "");
  const inner = blocks.map((b) => renderBlockHtml(b, ro)).join("");
  const rootClass = ["axtask-md-body", opts.className].filter(Boolean).join(" ");
  return `<div class="${escapeHtml(rootClass)}">${inner}</div>`;
}

export const __internal = {
  tokenizeInline,
  splitBlocks,
  isSafeHref,
  parseDocument,
};
