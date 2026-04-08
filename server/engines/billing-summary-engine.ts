/**
 * Account-plane read model for /billing — composes subscription, invoices, and payment methods.
 * Does not include task or community data.
 */
import type { Invoice, PremiumSubscription } from "@shared/schema";
import {
  listBillingPaymentMethodsForUser,
  listInvoicesForUser,
  listPremiumSubscriptions,
  PREMIUM_CATALOG,
} from "../storage";

export type BillingSummaryPaymentHealth = "ok" | "grace" | "failed" | "inactive" | "none";

export type BillingSummarySubscriptionDto = {
  id: string;
  product: string;
  planKey: string;
  status: string;
  displayName: string;
  priceLabel: string | null;
  paymentHealth: BillingSummaryPaymentHealth;
  graceUntil: string | null;
};

export type BillingSummaryInvoiceRowDto = {
  id: string;
  createdAt: string | null;
  amountCents: number;
  currency: string;
  status: string;
  description: string;
};

export type BillingSummaryDto = {
  primarySubscription: BillingSummarySubscriptionDto | null;
  subscriptions: BillingSummarySubscriptionDto[];
  defaultPaymentMethod: {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  paymentMethods: {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
  }[];
  invoices: BillingSummaryInvoiceRowDto[];
  hasOverdueIssuedInvoice: boolean;
};

function catalogPriceLabel(planKey: string): string | null {
  if (planKey.endsWith("_lifetime")) {
    return "Lifetime access";
  }
  const plan = PREMIUM_CATALOG.plans.find((p) => p.planKey === planKey);
  if (!plan) return null;
  const usd = plan.monthlyPriceUsd;
  if (typeof usd !== "number" || !Number.isFinite(usd)) return null;
  return `$${usd.toFixed(2)} per month`;
}

function subscriptionDisplayName(product: string, planKey: string): string {
  const productLabel =
    product === "axtask" ? "AxTask" : product === "nodeweaver" ? "NodeWeaver" : "Power Bundle";
  if (planKey.endsWith("_lifetime")) {
    return `${productLabel} · Lifetime (complimentary)`;
  }
  const plan = PREMIUM_CATALOG.plans.find((p) => p.planKey === planKey);
  if (plan) {
    return `${productLabel} · ${planKey.replace(/_/g, " ")}`;
  }
  return `${productLabel} · ${planKey}`;
}

function basePaymentHealth(status: string): BillingSummaryPaymentHealth {
  if (status === "grace") return "grace";
  if (status === "inactive") return "inactive";
  if (status === "active") return "ok";
  return "none";
}

function mapSubscription(sub: PremiumSubscription): BillingSummarySubscriptionDto {
  return {
    id: sub.id,
    product: sub.product,
    planKey: sub.planKey,
    status: sub.status,
    displayName: subscriptionDisplayName(sub.product, sub.planKey),
    priceLabel: catalogPriceLabel(sub.planKey),
    paymentHealth: basePaymentHealth(sub.status),
    graceUntil: sub.graceUntil ? new Date(sub.graceUntil).toISOString() : null,
  };
}

function invoiceDescription(inv: Invoice): string {
  if (inv.metadataJson) {
    try {
      const m = JSON.parse(inv.metadataJson) as { lineItem?: string; description?: string };
      if (typeof m.lineItem === "string") return m.lineItem;
      if (typeof m.description === "string") return m.description;
    } catch {
      /* ignore */
    }
  }
  return "AxTask subscription";
}

/** End of the due date's calendar day in UTC (23:59:59.999); invoice is overdue only after this instant. */
function dueDateEndOfDayUtcMs(dueDateStr: string): number | null {
  const trimmed = dueDateStr.trim();
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return Date.UTC(y, m, day, 23, 59, 59, 999);
}

function issuedOverdue(inv: Invoice): boolean {
  if (inv.status !== "issued") return false;
  if (!inv.dueDate) return false;
  const endMs = dueDateEndOfDayUtcMs(inv.dueDate);
  if (endMs === null) return false;
  return Date.now() > endMs;
}

export async function buildBillingSummary(userId: string): Promise<BillingSummaryDto> {
  const [subs, pms, invs] = await Promise.all([
    listPremiumSubscriptions(userId),
    listBillingPaymentMethodsForUser(userId),
    listInvoicesForUser(userId, 50),
  ]);

  const subscriptions = subs.map(mapSubscription);
  const now = new Date();
  const activeOrGrace = subs.filter((s) => {
    if (s.endsAt && new Date(s.endsAt) <= now) return false;
    if (s.status === "active") return true;
    if (s.status === "grace" && s.graceUntil && new Date(s.graceUntil) > now) return true;
    return false;
  });
  const primaryRow = activeOrGrace.sort((a, b) => {
    const ta = new Date(a.updatedAt || 0).getTime();
    const tb = new Date(b.updatedAt || 0).getTime();
    return tb - ta;
  })[0];

  const hasOverdueIssuedInvoice = invs.some(issuedOverdue);

  let primarySubscription: BillingSummarySubscriptionDto | null = null;
  if (primaryRow) {
    primarySubscription = mapSubscription(primaryRow);
    if (primarySubscription.paymentHealth === "ok" && hasOverdueIssuedInvoice) {
      primarySubscription = { ...primarySubscription, paymentHealth: "failed" };
    }
  } else if (subs.length > 0) {
    const newest = [...subs].sort(
      (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
    )[0];
    primarySubscription = mapSubscription(newest);
    if (primarySubscription.paymentHealth === "inactive" && hasOverdueIssuedInvoice) {
      primarySubscription = { ...primarySubscription, paymentHealth: "failed" };
    }
  }

  const defaultPm = pms.find((p) => p.isDefault) || pms[0];
  const defaultPaymentMethod = defaultPm
    ? {
        id: defaultPm.id,
        brand: defaultPm.brand,
        last4: defaultPm.last4,
        expMonth: defaultPm.expMonth,
        expYear: defaultPm.expYear,
      }
    : null;

  const paymentMethods = pms.map((p) => ({
    id: p.id,
    brand: p.brand,
    last4: p.last4,
    expMonth: p.expMonth,
    expYear: p.expYear,
    isDefault: p.isDefault,
  }));

  const invoices: BillingSummaryInvoiceRowDto[] = invs.map((inv) => ({
    id: inv.id,
    createdAt:
      inv.paidAt?.toISOString() ?? inv.issuedAt?.toISOString() ?? inv.createdAt?.toISOString() ?? null,
    amountCents: inv.amountCents,
    currency: inv.currency,
    status: inv.status,
    description: invoiceDescription(inv),
  }));

  return {
    primarySubscription,
    subscriptions,
    defaultPaymentMethod,
    paymentMethods,
    invoices,
    hasOverdueIssuedInvoice,
  };
}
