/**
 * React hook that drives the paste-composer upload pipeline.
 *
 * Responsibilities:
 *   - Accept `File`-like inputs from ClipboardEvent / drag-drop / file input.
 *   - Enforce per-image size cap + image MIME allowlist BEFORE touching the
 *     network (defense in depth: the server re-checks).
 *   - Call /api/attachments/upload-url + /api/attachments/upload/:token.
 *   - For plain-text paste that looks like an image URL, call
 *     /api/attachments/import-url (which goes through the SSRF-safe fetcher).
 *   - Respect `maxAttachments` so the composer can't bury the server with a
 *     megaton paste.
 *
 * The hook is deliberately framework-agnostic below the React surface so
 * it can be unit-tested without mounting a real textarea.
 */
import { useCallback, useRef, useState } from "react";
import { apiRequest, getCsrfToken } from "./queryClient";
import { AXTASK_CSRF_HEADER } from "@shared/http-auth";
import { ATTACHMENT_IMAGE_MAX_BYTES } from "@shared/attachment-image-limits";

export const PASTE_IMAGE_BYTE_CAP = ATTACHMENT_IMAGE_MAX_BYTES;
export const PASTE_ACCEPTED_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export type UploadedAttachment = {
  assetId: string;
  mimeType: string;
  byteSize: number;
  fileName: string;
  /** `attachment:<id>` token to splice into the markdown body. */
  markdownToken: string;
};

export type UsePasteUploadOptions = {
  /** Hard cap on number of attachments the composer will accept. */
  maxAttachments?: number;
  /** Called with a translated error message when an upload is rejected. */
  onError?: (message: string) => void;
  /** Called when a successful attachment joins the composer. */
  onAttached?: (attachment: UploadedAttachment) => void;
  /** Label prefix for sanitised filenames (default "paste"). */
  filenamePrefix?: string;
  /** Kind tag recorded on attachment_assets ("paste", "feedback", ...). */
  kind?: string;
};

const DEFAULT_MAX = 8;

function isLikelyImageUrl(value: string): boolean {
  if (!/^https:\/\//i.test(value)) return false;
  if (value.length > 2048) return false;
  return /\.(png|jpe?g|gif|webp)($|\?|#)/i.test(value) || /giphy|tenor|cdn/i.test(value);
}

function sanitizeFilename(base: string, mimeType: string): string {
  const cleaned = (base || "paste").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const ext = mimeType.split("/")[1]?.split("+")[0] || "bin";
  if (cleaned.includes(".")) return cleaned;
  return `${cleaned}.${ext}`;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Upload failed";
}

type UseLike = {
  attachments: UploadedAttachment[];
  isUploading: boolean;
  addFile: (file: File) => Promise<UploadedAttachment | null>;
  addUrl: (rawUrl: string) => Promise<UploadedAttachment | null>;
  addResolvedGif: (
    result: { provider: "giphy" | "tenor"; id: string; originalUrl: string },
  ) => Promise<UploadedAttachment | null>;
  remove: (assetId: string) => void;
  reset: () => void;
  consumeClipboard: (event: ClipboardEvent | React.ClipboardEvent) => Promise<
    UploadedAttachment[] | null
  >;
};

export function usePasteUpload(options: UsePasteUploadOptions = {}): UseLike {
  const { onError, onAttached } = options;
  const maxAttachments = options.maxAttachments ?? DEFAULT_MAX;
  const kind = options.kind ?? "paste";
  const filenamePrefix = options.filenamePrefix ?? "paste";
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const pending = useRef(0);

  const reportError = useCallback(
    (message: string) => {
      if (onError) onError(message);
      else if (typeof console !== "undefined") console.warn("[paste-upload]", message);
    },
    [onError],
  );

  const appendAttachment = useCallback(
    (a: UploadedAttachment) => {
      setAttachments((prev) => [...prev, a]);
      if (onAttached) onAttached(a);
    },
    [onAttached],
  );

  const remove = useCallback((assetId: string) => {
    setAttachments((prev) => prev.filter((a) => a.assetId !== assetId));
  }, []);

  const reset = useCallback(() => setAttachments([]), []);

  const addFile = useCallback(
    async (file: File): Promise<UploadedAttachment | null> => {
      if (!file) return null;
      if (attachments.length + pending.current >= maxAttachments) {
        reportError(`You can attach up to ${maxAttachments} images.`);
        return null;
      }
      if (!PASTE_ACCEPTED_MIME.has(file.type)) {
        reportError(`${file.type || "unknown"} is not a supported image type.`);
        return null;
      }
      if (file.size > PASTE_IMAGE_BYTE_CAP) {
        reportError(
          `Image exceeds the ${Math.round(PASTE_IMAGE_BYTE_CAP / (1024 * 1024))} MB attachment limit.`,
        );
        return null;
      }
      pending.current += 1;
      setIsUploading(true);
      try {
        const fileName = sanitizeFilename(file.name || filenamePrefix, file.type);
        const start = await apiRequest("POST", "/api/attachments/upload-url", {
          fileName,
          mimeType: file.type,
          byteSize: file.size,
          kind,
        });
        const startBody = await start.json();
        const { uploadUrl, assetId } = startBody as { uploadUrl: string; assetId: string };
        const buf = await file.arrayBuffer();
        const csrf = getCsrfToken();
        const putHeaders: Record<string, string> = { "Content-Type": file.type };
        if (csrf) putHeaders[AXTASK_CSRF_HEADER] = csrf;
        const put = await fetch(uploadUrl, {
          method: "PUT",
          credentials: "include",
          headers: putHeaders,
          body: buf,
        });
        if (!put.ok) {
          const text = (await put.text().catch(() => "")) || put.statusText;
          throw new Error(`${put.status}: ${text}`);
        }
        const attachment: UploadedAttachment = {
          assetId,
          mimeType: file.type,
          byteSize: file.size,
          fileName,
          markdownToken: `attachment:${assetId}`,
        };
        appendAttachment(attachment);
        return attachment;
      } catch (err) {
        reportError(describeError(err));
        return null;
      } finally {
        pending.current = Math.max(0, pending.current - 1);
        if (pending.current === 0) setIsUploading(false);
      }
    },
    [attachments.length, maxAttachments, reportError, appendAttachment, filenamePrefix, kind],
  );

  const addUrl = useCallback(
    async (rawUrl: string): Promise<UploadedAttachment | null> => {
      const url = rawUrl.trim();
      if (!url) return null;
      if (attachments.length + pending.current >= maxAttachments) {
        reportError(`You can attach up to ${maxAttachments} images.`);
        return null;
      }
      if (!/^https:\/\//i.test(url)) {
        reportError("Only https:// image URLs can be pasted.");
        return null;
      }
      pending.current += 1;
      setIsUploading(true);
      try {
        const res = await apiRequest("POST", "/api/attachments/import-url", {
          url,
          kind,
        });
        const body = (await res.json()) as {
          assetId: string;
          mimeType: string;
          byteSize: number;
        };
        const fileName = sanitizeFilename(filenamePrefix, body.mimeType);
        const attachment: UploadedAttachment = {
          assetId: body.assetId,
          mimeType: body.mimeType,
          byteSize: body.byteSize,
          fileName,
          markdownToken: `attachment:${body.assetId}`,
        };
        appendAttachment(attachment);
        return attachment;
      } catch (err) {
        reportError(describeError(err));
        return null;
      } finally {
        pending.current = Math.max(0, pending.current - 1);
        if (pending.current === 0) setIsUploading(false);
      }
    },
    [attachments.length, maxAttachments, reportError, appendAttachment, filenamePrefix, kind],
  );

  const addResolvedGif = useCallback(
    async (result: {
      provider: "giphy" | "tenor";
      id: string;
      originalUrl: string;
    }): Promise<UploadedAttachment | null> => {
      if (attachments.length + pending.current >= maxAttachments) {
        reportError(`You can attach up to ${maxAttachments} images.`);
        return null;
      }
      pending.current += 1;
      setIsUploading(true);
      try {
        const res = await apiRequest("POST", "/api/gif/resolve", result);
        const body = (await res.json()) as {
          assetId: string;
          mimeType: string;
          byteSize: number;
        };
        const attachment: UploadedAttachment = {
          assetId: body.assetId,
          mimeType: body.mimeType,
          byteSize: body.byteSize,
          fileName: `${result.provider}-${result.id}.gif`,
          markdownToken: `attachment:${body.assetId}`,
        };
        appendAttachment(attachment);
        return attachment;
      } catch (err) {
        reportError(describeError(err));
        return null;
      } finally {
        pending.current = Math.max(0, pending.current - 1);
        if (pending.current === 0) setIsUploading(false);
      }
    },
    [attachments.length, maxAttachments, reportError, appendAttachment],
  );

  const consumeClipboard = useCallback(
    async (event: ClipboardEvent | React.ClipboardEvent) => {
      const native = "clipboardData" in event ? event.clipboardData : null;
      if (!native) return null;

      const uploaded: UploadedAttachment[] = [];
      const files = Array.from(native.files || []);
      for (const file of files) {
        if (!PASTE_ACCEPTED_MIME.has(file.type)) continue;
        const a = await addFile(file);
        if (a) uploaded.push(a);
      }
      if (uploaded.length === 0) {
        // Plain-text URL fallback.
        const text = native.getData("text/plain");
        if (text && isLikelyImageUrl(text.trim())) {
          const a = await addUrl(text.trim());
          if (a) uploaded.push(a);
        }
      }
      return uploaded.length > 0 ? uploaded : null;
    },
    [addFile, addUrl],
  );

  return {
    attachments,
    isUploading,
    addFile,
    addUrl,
    addResolvedGif,
    remove,
    reset,
    consumeClipboard,
  };
}

/** Exposed for unit tests. */
export const __internal = {
  isLikelyImageUrl,
  sanitizeFilename,
  PASTE_IMAGE_BYTE_CAP,
  PASTE_ACCEPTED_MIME,
};
