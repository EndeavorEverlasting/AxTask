/** URL/file-safe slug: lowercase, hyphens, max 48 chars of meaningful content (caller may truncate to 64). */
export function slugifyPlaceBase(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s.length > 0 ? s : "place";
}
