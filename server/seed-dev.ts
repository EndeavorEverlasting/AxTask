/**
 * Development seed — creates dev accounts on server startup.
 * Only runs when NODE_ENV === "development" (explicit match, not just != production).
 *
 * Passwords are generated randomly at startup using crypto.randomBytes.
 * They are NEVER hardcoded, NEVER persisted to disk, and only printed to the
 * server console for the current process lifetime.
 *
 * Accounts are idempotent: if the email already exists, a new random password
 * is set so you always have a working credential without storing stale ones.
 */
import { randomBytes } from "crypto";
import { getUserByEmail, createUser, resetPasswordForDev } from "./storage";

interface DevAccount {
  email: string;
  displayName: string;
  role: "admin" | "user";
}

const DEV_ACCOUNTS: DevAccount[] = [
  { email: "dev@axtask.local", displayName: "Dev User", role: "user" },
  { email: "admin@axtask.local", displayName: "Admin User", role: "admin" },
];

/** Generate a random password that satisfies the strong-password policy. */
function generateDevPassword(): string {
  // 16 bytes → 22 base64 chars, then prepend policy-satisfying chars
  const rand = randomBytes(16).toString("base64url");
  // Guarantee: uppercase, lowercase, digit, special char
  return `Ax!1${rand}`;
}

export async function seedDevAccounts(): Promise<void> {
  // Strict guard: only run when NODE_ENV is explicitly "development"
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.DISABLE_DEV_SEED === "true") return;

  const rows: { email: string; password: string; status: string }[] = [];

  for (const acct of DEV_ACCOUNTS) {
    const password = generateDevPassword();
    const existing = await getUserByEmail(acct.email);

    if (existing) {
      // Rotate password every restart — no stale credentials
      await resetPasswordForDev(acct.email, password);
      rows.push({ email: acct.email, password, status: "rotated" });
    } else {
      await createUser(acct.email, password, acct.displayName, acct.role);
      rows.push({ email: acct.email, password, status: "created" });
    }
  }

  // Print ephemeral credentials — they exist only in this process's memory
  const maxEmail = Math.max(...rows.map((r) => r.email.length));
  const maxPass = Math.max(...rows.map((r) => r.password.length));

  console.log(`\n┌${"─".repeat(maxEmail + maxPass + 19)}┐`);
  console.log(`│  🔧  DEV ACCOUNTS  (ephemeral — regenerated every restart)  │`);
  console.log(`├${"─".repeat(maxEmail + 2)}┬${"─".repeat(maxPass + 2)}┬──────────┤`);
  console.log(`│ ${"Email".padEnd(maxEmail)} │ ${"Password".padEnd(maxPass)} │ Status   │`);
  console.log(`├${"─".repeat(maxEmail + 2)}┼${"─".repeat(maxPass + 2)}┼──────────┤`);
  for (const r of rows) {
    console.log(`│ ${r.email.padEnd(maxEmail)} │ ${r.password.padEnd(maxPass)} │ ${r.status.padEnd(8)} │`);
  }
  console.log(`└${"─".repeat(maxEmail + 2)}┴${"─".repeat(maxPass + 2)}┴──────────┘`);

  const sec = process.env.SESSION_SECRET?.trim() ?? "";
  const secretOk =
    sec.length >= 32 && !sec.toLowerCase().includes("replace-with");
  if (secretOk) {
    console.log(
      "[seed-dev] Session signing: SESSION_SECRET is set in .env (value not shown).\n",
    );
  } else {
    console.log(
      "[seed-dev] If login fails: run `npm run local:secrets-bootstrap` (or `npm run local:env-init`).",
    );
    console.log(
      "[seed-dev] A strong SESSION_SECRET is written to .env only — it is not printed here.\n",
    );
  }
}

