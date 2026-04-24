import React, { useMemo } from "react";
import { renderSafeMarkdownHtmlString } from "@/lib/safe-markdown";
import { cn } from "@/lib/utils";

export type SafeMarkdownHtmlProps = {
  source: string;
  allowedAttachmentIds?: ReadonlySet<string> | string[];
  allowRemoteImages?: boolean;
  /** Classes on the outer wrapper (layout, line-clamp, etc.). */
  className?: string;
};

/**
 * Read-only markdown via our closed-world parser; `__html` is produced only by
 * `renderSafeMarkdownHtmlString` — never pass user-controlled raw HTML here.
 */
export function SafeMarkdownHtml({
  source,
  allowedAttachmentIds,
  allowRemoteImages = false,
  className,
}: SafeMarkdownHtmlProps): React.ReactElement {
  const html = useMemo(
    () =>
      renderSafeMarkdownHtmlString(source, {
        allowedAttachmentIds,
        allowRemoteImages,
      }),
    [source, allowedAttachmentIds, allowRemoteImages],
  );
  return <div className={cn(className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
