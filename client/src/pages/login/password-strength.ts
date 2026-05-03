export function getPasswordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { label: "Weak", color: "bg-red-500", pct: 33 };
  if (score <= 4) return { label: "Fair", color: "bg-yellow-500", pct: 66 };
  return { label: "Strong", color: "bg-green-500", pct: 100 };
}
