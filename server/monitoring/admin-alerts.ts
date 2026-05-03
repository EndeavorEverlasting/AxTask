import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

export type ApiErrorAlert = {
  requestId?: string;
  route: string;
  method: string;
  statusCode: number;
  errorName: string;
  errorMessage: string;
};

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function shouldNotify(): boolean {
  const mode = (process.env.ADMIN_ALERT_MODE || "production").trim().toLowerCase();
  if (mode === "off" || mode === "false" || mode === "0") return false;
  if (mode === "always") return true;
  return process.env.NODE_ENV === "production";
}

function buildSubject(alert: ApiErrorAlert): string {
  const rid = alert.requestId ? ` rid=${alert.requestId}` : "";
  return `[AxTask] API error ${alert.statusCode} ${alert.method} ${alert.route}${rid}`;
}

function buildText(alert: ApiErrorAlert): string {
  const lines = [
    `API error`,
    `status=${alert.statusCode}`,
    `route=${alert.method} ${alert.route}`,
    alert.requestId ? `requestId=${alert.requestId}` : undefined,
    `error=${alert.errorName}: ${alert.errorMessage}`,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

const dedupe = new Map<string, number>();

function shouldSendDedupe(key: string, ttlMs: number): boolean {
  const now = Date.now();
  const prev = dedupe.get(key);
  if (typeof prev === "number" && now - prev < ttlMs) return false;
  dedupe.set(key, now);
  return true;
}

async function resolveAdminEmails(): Promise<string[]> {
  const configured = parseCsv(process.env.ADMIN_ALERT_EMAILS);
  if (configured.length > 0) return configured;

  // Fallback: send to DB admins (users.role === "admin")
  const { db } = await import("../db");
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.role, "admin"));
  return rows.map((r) => r.email).filter((e): e is string => typeof e === "string" && e.includes("@"));
}

async function sendResendAlertEmail(to: string[], subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return;
  const from = process.env.RESEND_FROM?.trim() || "AxTask <onboarding@resend.dev>";
  const html = `<pre style="font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space: pre-wrap">${escapeHtml(text)}</pre>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${body.slice(0, 200)}`);
  }
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function postWebhook(text: string): Promise<void> {
  const url = (process.env.ADMIN_ALERT_WEBHOOK_URL || "").trim();
  if (!url) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Webhook error ${res.status}: ${body.slice(0, 200)}`);
  }
}

export async function notifyAdminsOfApiError(alert: ApiErrorAlert): Promise<void> {
  if (!shouldNotify()) return;

  const key = `${alert.statusCode}:${alert.method}:${alert.route}:${alert.errorName}:${alert.errorMessage.slice(0, 80)}`;
  const ttlMs = Math.max(10_000, Math.min(10 * 60_000, Number(process.env.ADMIN_ALERT_DEDUPE_TTL_MS) || 60_000));
  if (!shouldSendDedupe(key, ttlMs)) return;

  const subject = buildSubject(alert);
  const text = buildText(alert);

  const recipients = await resolveAdminEmails().catch(() => []);
  const tasks: Array<Promise<void>> = [];
  if (recipients.length > 0) {
    tasks.push(sendResendAlertEmail(recipients, subject, text));
  }
  tasks.push(postWebhook(text));

  await Promise.allSettled(tasks);
}

