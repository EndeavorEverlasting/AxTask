/**
 * Pure helpers for Markdown task export coin pricing (no DB imports — safe for unit tests).
 */

export function isPaidMarkdownExportProduct(products: string[]): boolean {
  return products.includes("axtask") || products.includes("bundle");
}

/**
 * Freemium Markdown pricing: each export-efficiency level removes 1 coin from the base
 * (default base 5 → 5,4,3,2,1,0). Paid members always 0.
 */
export function markdownTaskExportCoinPrice(baseCoins: number, exportEfficiencyLevel: number, isPaid: boolean): number {
  if (isPaid) return 0;
  const b = Math.max(0, baseCoins);
  const lv = Math.max(0, Math.floor(exportEfficiencyLevel));
  return Math.max(0, b - Math.min(b, lv));
}
