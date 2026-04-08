# Billing UI (account plane)

The **`/billing`** page is the **account plane** only: subscription snapshot, payment health, saved payment methods (fingerprints), billing identity for receipts, and invoice history. It is **not** tied to community or task feeds.

## Design reference

The layout follows **Stripe / OpenAI-style billing** patterns:

- **Left column:** Dark panel, “Manage your AxTask billing settings”, return link, trust copy.
- **Right column:** Sections with uppercase micro-labels:
  1. **Current subscription** — status badges (active, grace, payment issue), plan name, price from catalog when available, optional “View details” for multiple subscriptions.
  2. **Payment method** — rows with **Default** badge, remove control, collapsible **+ Add payment method** (MFA + non-PCI card flow).
  3. **Billing information** — legal name and address; **Update information** opens a dialog.
  4. **Invoice history** — date, amount, status badge, description; **View more** when there are many rows.

Reference screenshots may live under your Cursor workspace assets when captured from design reviews; filenames are environment-specific.

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/billing/summary` | Read model: subscriptions, payment methods, recent invoices (see `server/engines/billing-summary-engine.ts`). |
| GET | `/api/billing/profile` | Billing identity row (`user_billing_profiles`) or `null`. |
| PATCH | `/api/billing/profile` | Upsert billing address / legal name. |
| GET | `/api/billing/payment-methods` | Raw payment method rows. |
| POST | `/api/billing/payment-methods` | Add method after MFA. |
| DELETE | `/api/billing/payment-methods/:id` | Remove method; promotes another default if needed. |
| GET | `/api/invoices` | User-scoped invoice list (must never return other users’ invoices). |

## Related docs

- [ENGINES.md](./ENGINES.md) — billing summary is an **account-plane** engine.
- [BRANDING.md](./BRANDING.md) — favicon / logo paths.
- [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md) — full product checklist.

## Database

- `billing_payment_methods`, `invoices`, `premium_subscriptions` (existing).
- **`user_billing_profiles`** — legal name + address lines for receipts (`shared/schema.ts`). Apply with `npm run db:push` when `DATABASE_URL` is set.
