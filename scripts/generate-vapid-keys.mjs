#!/usr/bin/env node
/**
 * Generate a VAPID key pair for Web Push and print env-var lines the operator
 * can paste into Render / .env / docker-compose. We never write to disk to
 * avoid accidentally committing the private key.
 *
 * Usage:
 *   npm run vapid:generate
 *   npm run vapid:generate -- --subject mailto:alerts@yourdomain.tld
 *
 * Notes:
 * - Requires the runtime dependency `web-push` (already a server dep).
 * - Paste the three lines into your deploy env (Render: Environment tab).
 * - After setting them, redeploy and hard-reload the app so the service worker
 *   rotates. See docs/NOTIFICATIONS_AND_PUSH.md.
 */
import webpush from "web-push";

function parseSubject(argv) {
  const flag = "--subject";
  const idx = argv.indexOf(flag);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1].trim();
  return "mailto:alerts@axtask.app";
}

const subject = parseSubject(process.argv.slice(2));
const { publicKey, privateKey } = webpush.generateVAPIDKeys();

process.stdout.write("# AxTask VAPID keys -- paste into Render environment or .env\n");
process.stdout.write(`VAPID_PUBLIC_KEY=${publicKey}\n`);
process.stdout.write(`VAPID_PRIVATE_KEY=${privateKey}\n`);
process.stdout.write(`VAPID_SUBJECT=${subject}\n`);
process.stdout.write(
  "# Optional: also expose the public key to the Vite build if you want the client to\n",
);
process.stdout.write("# resolve it without a runtime round-trip to /api/notifications/push-public-config.\n");
process.stdout.write(`# VITE_VAPID_PUBLIC_KEY=${publicKey}\n`);
