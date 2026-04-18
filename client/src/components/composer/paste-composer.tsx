/**
 * Hybrid paste composer: a markdown-aware textarea with a thumbnail rail for
 * pasted images/GIFs. The composer emits two outputs back to the caller:
 *
 *   - `body`    -- the raw markdown text the user sees, with inline
 *                  `![alt](attachment:<id>)` tokens spliced in at paste time.
 *   - `attachmentAssetIds` -- the list of ids (stable order) that back
 *                  those tokens, plus any orphan thumbnails the user
 *                  chose not to inline.
 *
 * The companion renderer is `SafeMarkdown` in `@/lib/safe-markdown`.
 *
 * This is a low-level primitive; page-specific copy (button label,
 * placeholder) is passed in by the caller.
 */
import React, { useCallback, useImperativeHandle, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  usePasteUpload,
  type UploadedAttachment,
} from "@/lib/use-paste-upload";
import { GifPicker } from "./gif-picker";

export type PasteComposerValue = {
  body: string;
  attachmentAssetIds: string[];
};

export type PasteComposerProps = {
  value: PasteComposerValue;
  onChange: (next: PasteComposerValue) => void;
  placeholder?: string;
  ariaLabel?: string;
  maxBodyLength?: number;
  maxAttachments?: number;
  disabled?: boolean;
  kind?: string;
  allowGifPicker?: boolean;
  className?: string;
  textareaClassName?: string;
  onError?: (message: string) => void;
  /**
   * Extra right-rail actions (e.g. submit button) rendered alongside the
   * built-in GIF / image action buttons.
   */
  actionsSlot?: React.ReactNode;
  testIdPrefix?: string;
};

export type PasteComposerHandle = {
  focus: () => void;
  clear: () => void;
};

export const PasteComposer = React.forwardRef<
  PasteComposerHandle,
  PasteComposerProps
>(function PasteComposer(props, forwardedRef) {
  const {
    value,
    onChange,
    placeholder,
    ariaLabel,
    maxBodyLength = 8000,
    maxAttachments = 8,
    disabled = false,
    kind = "paste",
    allowGifPicker = true,
    className,
    textareaClassName,
    onError,
    actionsSlot,
    testIdPrefix = "paste-composer",
  } = props;

  const [gifOpen, setGifOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const applyAttachment = useCallback(
    (attachment: UploadedAttachment, inlineMarkdown = true) => {
      const ta = textareaRef.current;
      const token = `![](${attachment.markdownToken})`;
      let nextBody = value.body;
      if (inlineMarkdown && ta && document.activeElement === ta) {
        const start = ta.selectionStart ?? value.body.length;
        const end = ta.selectionEnd ?? start;
        const before = value.body.slice(0, start);
        const after = value.body.slice(end);
        const needsNewline = before.length > 0 && !/\n$/.test(before);
        const prefix = needsNewline ? "\n" : "";
        const insertion = `${prefix}${token}\n`;
        nextBody = `${before}${insertion}${after}`;
      }
      onChange({
        body: nextBody,
        attachmentAssetIds: [...value.attachmentAssetIds, attachment.assetId],
      });
    },
    [value.body, value.attachmentAssetIds, onChange],
  );

  const paste = usePasteUpload({
    maxAttachments,
    kind,
    onError,
    onAttached: (attachment) => applyAttachment(attachment, true),
  });

  useImperativeHandle(
    forwardedRef,
    () => ({
      focus: () => textareaRef.current?.focus(),
      clear: () => {
        paste.reset();
        onChange({ body: "", attachmentAssetIds: [] });
      },
    }),
    [onChange, paste],
  );

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return;
      const native = event.clipboardData;
      const hasImageFile = Array.from(native.files || []).some((f) =>
        (f.type || "").startsWith("image/"),
      );
      if (hasImageFile) {
        event.preventDefault();
        await paste.consumeClipboard(event);
        return;
      }
      const text = native.getData("text/plain");
      if (text && /^https:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(text.trim())) {
        event.preventDefault();
        await paste.addUrl(text.trim());
      }
      // Otherwise let the browser paste plain text normally.
    },
    [paste, disabled],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLTextAreaElement>) => {
      if (disabled) return;
      const files = Array.from(event.dataTransfer?.files || []).filter((f) =>
        (f.type || "").startsWith("image/"),
      );
      if (files.length === 0) return;
      event.preventDefault();
      for (const file of files) {
        await paste.addFile(file);
      }
    },
    [paste, disabled],
  );

  const handlePickLocalFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleLocalFiles = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      for (const file of files) await paste.addFile(file);
      event.target.value = "";
    },
    [paste],
  );

  const removeAttachment = useCallback(
    (assetId: string) => {
      paste.remove(assetId);
      onChange({
        body: value.body.replace(
          new RegExp(`!\\[[^\\]]*\\]\\(attachment:${assetId}\\)\\n?`, "g"),
          "",
        ),
        attachmentAssetIds: value.attachmentAssetIds.filter((id) => id !== assetId),
      });
    },
    [paste, onChange, value.body, value.attachmentAssetIds],
  );

  return (
    <div className={className}>
      <Textarea
        ref={textareaRef}
        value={value.body}
        onChange={(e) =>
          onChange({ ...value, body: e.target.value.slice(0, maxBodyLength) })
        }
        onPaste={handlePaste}
        onDrop={handleDrop}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled || paste.isUploading}
        maxLength={maxBodyLength}
        className={textareaClassName}
        data-testid={`${testIdPrefix}-textarea`}
      />

      {paste.attachments.length > 0 && (
        <ul
          className="axtask-paste-composer__thumbs"
          data-testid={`${testIdPrefix}-thumbs`}
        >
          {paste.attachments.map((a) => (
            <li key={a.assetId}>
              <img
                src={`/api/attachments/${a.assetId}/download`}
                alt={a.fileName}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                draggable={false}
              />
              <button
                type="button"
                onClick={() => removeAttachment(a.assetId)}
                aria-label={`Remove ${a.fileName}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="axtask-paste-composer__actions">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={handleLocalFiles}
          data-testid={`${testIdPrefix}-file-input`}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handlePickLocalFile}
          disabled={disabled || paste.attachments.length >= maxAttachments}
          data-testid={`${testIdPrefix}-file-button`}
        >
          Add image
        </Button>
        {allowGifPicker && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setGifOpen((v) => !v)}
            disabled={disabled || paste.attachments.length >= maxAttachments}
            aria-expanded={gifOpen}
            data-testid={`${testIdPrefix}-gif-button`}
          >
            GIF
          </Button>
        )}
        {actionsSlot}
      </div>

      {allowGifPicker && (
        <GifPicker
          open={gifOpen}
          onClose={() => setGifOpen(false)}
          onPick={async (pick) => {
            await paste.addResolvedGif(pick);
            setGifOpen(false);
          }}
        />
      )}
    </div>
  );
});
