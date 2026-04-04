/** Luhn check for user feedback only — server never receives full PAN. */
export function luhnValid(digits: string): boolean {
  const d = digits.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = parseInt(d[i]!, 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export type BillingCardBrand = "visa" | "mastercard" | "amex" | "discover" | "unknown";

export function inferBrandFromPan(panDigits: string): BillingCardBrand {
  const d = panDigits.replace(/\D/g, "");
  if (!d.length) return "unknown";
  if (/^4/.test(d)) return "visa";
  if (/^5[1-5]/.test(d) || /^2(2[2-9]\d|[3-6]\d{2}|7[01]\d|720)/.test(d)) return "mastercard";
  if (/^3[47]/.test(d)) return "amex";
  if (/^6(?:011|5)/.test(d)) return "discover";
  return "unknown";
}

export function formatPanGroups(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 19);
  const parts: string[] = [];
  for (let i = 0; i < d.length; i += 4) {
    parts.push(d.slice(i, i + 4));
  }
  return parts.join(" ");
}

export function last4FromPan(panDigits: string): string {
  const d = panDigits.replace(/\D/g, "");
  if (d.length < 4) return "";
  return d.slice(-4);
}
