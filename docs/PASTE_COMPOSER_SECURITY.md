# Paste composer security

The paste composer (`client/src/components/composer/paste-composer.tsx`) lets users attach images and GIFs inline to collab messages, community replies, and feedback. It reuses the existing signed-URL upload pipeline and layers additional controls so that the surface is closer in security posture to the login flow than a naïve rich text field.

## Threat model

The composer is reachable to any logged-in user and accepts:

- Binary image files pasted, dropped, or file-picked from the OS.
- HTTPS URLs pasted as text that look like images.
- GIFs selected from the built-in GIF picker (proxied server-side).
- Markdown-formatted text bodies referencing `attachment:<uuid>` tokens.

It must resist: SSRF via user-supplied URLs, stored XSS via markdown/HTML, credential leakage to third-party image hosts, and denial-of-service through oversized payloads, high fan-out uploads, or repeated GIF searches.

## Layered controls

1. **Signed upload tokens** — Binary uploads still go through `POST /api/attachments/upload-url` → `PUT /api/attachments/upload/:token`. Tokens are HMAC-signed, single-use, and scoped to a session. Composer uploads are additionally gated by `attachmentUploadLimiter` (80 attempts / 15 min / account).
2. **Magic-byte validation** — `server/services/attachment-scan.ts` verifies the raw bytes match an allowlisted image type (`image/png`, `image/jpeg`, `image/webp`, `image/gif`). The client-side MIME label is never trusted.
3. **SSRF-hardened URL fetcher** — `server/services/attachment-url-fetch.ts` rejects non-HTTPS, private IPv4 (RFC1918, loopback, link-local, CGNAT, reserved), private IPv6 (ULA, link-local, loopback, mapped-v4), non-image `Content-Type`, missing/incorrect magic bytes, redirects outside HTTPS-to-public, bodies over the per-image cap in `@shared/attachment-image-limits` (aligned with `scanAttachmentBuffer`), and enforces per-request timeouts and a max of 3 redirect hops. Every rejection is logged via `logSecurityEvent("attachment_url_fetch_rejected", …)`.
4. **GIF search proxy** — `server/services/gif-search.ts` and the `/api/gif/search` + `/api/gif/resolve` routes keep Giphy/Tenor API keys server-side, sanitise user queries, clamp result limits, scrub provider API keys from returned URLs, and re-host picked GIFs through `fetchImageByUrl` so the browser never loads third-party image origins (CSP stays closed). Search is gated by `gifSearchLimiter` (40 / minute / account).
5. **Per-message attachment cap** — Route schemas (`collabBodySchema`, `communityReplySchema`, feedback submission) enforce `attachmentAssetIds.max(8)`. `linkAttachmentsToOwner` refuses to link assets the caller does not own or that are soft-deleted.
6. **Session-scoped downloads** — Rendered bodies resolve `attachment:<uuid>` tokens to `/api/attachments/:assetId/download`, which continues to require a valid session. No public-readable path is introduced.
7. **Safe renderer** — `client/src/lib/safe-markdown.tsx` parses a closed subset: **inline** — `**bold**` / `__bold__`, `*italic*` / `_italic_`, `` `code` ``, `[label](https://… or /api/attachments/…)`, `![alt](attachment:<uuid>)`, optional `![alt](https://…)` when opted in; **block** — ATX headings (`#`–`######`), fenced ``` / ~~~ code blocks (body is text-only, HTML-escaped on the static HTML path), single-level `ul` / `ol`, `>` blockquotes (depth-capped), thematic breaks (`---` / `***` / `___` alone), paragraphs separated by blank lines. Raw HTML tags are never interpreted (they appear as escaped text in React, or entity-escaped in `renderSafeMarkdownHtmlString`). `javascript:` / `data:` / unknown link protocols and non-allowlisted attachment ids are inert. The Pretext task list uses `renderSafeMarkdownHtmlString` (same rules) for notes preview HTML — no duplicate policy.
8. **No-referrer image loads** — Every rendered `<img>` (thumbnail rail and `SafeMarkdown`) uses `referrerPolicy="no-referrer"` so that asset GETs never leak URLs to third parties.

## Read path

Every endpoint that returns a body which can embed `attachment:<uuid>` tokens must also return a serialised `attachments: PublicAttachmentRef[]` list built via `toPublicAttachmentRef` (`shared/public-client-dtos.ts`). That list:

- Contains only attachments actually linked to the row (via `message_attachments`).
- Is the sole allow-list the client uses to decide which tokens to resolve.
- Does not expose raw `userId`, storage keys, or internal metadata — only `{ id, mimeType, byteSize, fileName, downloadUrl }`.

## Surfaces using the composer

| Surface | Write route | Read route | Notes |
| --- | --- | --- | --- |
| Collaboration inbox | `POST /api/collaboration/inbox` | `GET /api/collaboration/inbox` | Session-scoped both directions. |
| Community post replies | `POST /api/public/community/posts/:id/reply` | `GET /api/public/community/posts/:id` | Replies + original post carry attachments scoped to their author. |
| Feedback | `POST /api/feedback` | (operator only) | Merged with existing screenshot pipeline. |

Text-only surfaces (login, AI prompt boxes, contact form) intentionally do **not** mount `PasteComposer` — pasted images there are ignored to keep the attack surface minimal.

**Composer Preview tab** — `PasteComposer` can show a **Preview** tab that renders the draft body via `renderSafeMarkdownHtmlString` (same closed grammar and URL rules as `SafeMarkdown` on read paths). Attachment tokens are resolved only against the draft’s `attachmentAssetIds` (plus the same HTTPS-only / optional remote-image rules as the renderer).

## Operational watchlist

When extending the composer, re-run:

```
npx tsc --noEmit
npm test -- server/services/attachment-url-fetch.test.ts server/services/gif-search.test.ts client/src/lib/safe-markdown.test.tsx
```

And grep for `attachmentAssetIds` to confirm every new write endpoint is paired with `linkAttachmentsToOwner`, a `.max(8)` cap, and a matching read endpoint that returns `attachments[]`.
