# Billing UI & Architecture

## Overview
AxTask billing spans the primary application interface (`client/src/pages/billing.tsx`) and the underlying backend services (`server/routes.ts`). The goal is to provide a single, unified view of subscription status, payment methods, and invoices.

## Expected API Surface
1. **`GET /api/billing/summary`**: Returns `BillingSummary`
   - Active/inactive subscription rows
   - Default vs non-default payment methods
   - Invoice history and outstanding balances
2. **`GET /api/billing/profile`**: Returns `BillingProfile`
   - User demographic/billing contact data
3. **`PATCH /api/billing/profile`**: Update `BillingProfile`
4. **`GET|POST /api/billing/payment-methods`**: Payment token management

## The Billing Bridge
The Billing Bridge (`tools/billing_bridge`) reconciles timesheets, task tracking, and evidence ledgers. It connects to the web UI through:
- **`POST /api/billing-bridge/reconcile`**
- **`POST /api/billing-bridge/hours-report`**

The bridge normalizes names (including extracting "(PM)" suffixes mapped to the side) to maintain compatibility with legacy Excel admin templates.
