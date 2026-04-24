/**
 * Single-image attachment cap (task notes, paste composer, feedback screenshots, etc.).
 * Client and server both enforce this for defense in depth.
 */
export const ATTACHMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Express `raw()` body limit string — keep modest headroom over {@link ATTACHMENT_IMAGE_MAX_BYTES}. */
export const ATTACHMENT_UPLOAD_RAW_BODY_LIMIT = "7mb";
