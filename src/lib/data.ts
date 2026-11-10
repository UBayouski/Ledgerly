import { paypalFetch } from "./paypal";
import type { ViewId } from "./tools";

/**
 * Flat row shapes for the AG Grid views. Each fetcher calls the PayPal REST
 * API directly (same OAuth token as the agent tools) and normalises the
 * response into grid-friendly rows with a stable `id`.
 */

export type TransactionRow = {
  id: string;
  date: string;
  status: string;
  statusLabel: string;
  eventCode: string;
  kind: string;
  amount: number;
  currency: string;
  fee: number;
  net: number;
  payerName: string;
  payerEmail: string;
  subject: string;
  invoiceId: string;
};

export type InvoiceRow = {
  id: string;
  number: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  daysOverdue: number;
  recipientName: string;
  recipientEmail: string;
  amount: number;
  due: number;
  paid: number;
  currency: string;
  note: string;
  viewUrl: string;
};

export type DisputeRow = {
  id: string;
  status: string;
  reason: string;
  stage: string;
  channel: string;
  amount: number;
  currency: string;
  created: string;
  responseDue: string;
  daysToRespond: number;
  transactionId: string;
  outcome: string;
  buyer: string;
  buyerMessage: string;
};

export type CatalogRow = {
  id: string;
  kind: "product" | "plan";
  name: string;
  description: string;
  type: string;
  status: string;
  price: number | null;
  currency: string;
  interval: string;
  productId: string;
  created: string;
};

export type Row = TransactionRow | InvoiceRow | DisputeRow | CatalogRow;

const STATUS_LABELS: Record<string, string> = {
  S: "Success",
  P: "Pending",
  D: "Denied",
  V: "Reversed",
  F: "Partially refunded",
};

const EVENT_KINDS: Record<string, string> = {
  T0000: "Payment",
  T0001: "Mass pay",
  T0002: "Subscription",
  T0003: "Pre-approved payment",
  T0005: "Card payment",
  T0004: "eBay",
  T0006: "Checkout",
  T0007: "Website payment",
  T0011: "Mobile",
  T0013: "Donation",
  T1107: "Refund",
  T1201: "Chargeback",
  T1106: "Reversal",
  T0400: "Withdrawal",
  T0300: "Bank deposit",
  T0700: "Card payment",
  T1900: "Adjustment",
  T0106: "Chargeback fee",
};

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function dateRangeDays(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  return { start: start.toISOString().replace(/\.\d{3}Z$/, "Z"), end: end.toISOString().replace(/\.\d{3}Z$/, "Z") };
}

type AnyRecord = Record<string, unknown>;
const rec = (v: unknown): AnyRecord => (v && typeof v === "object" ? (v as AnyRecord) : {});
const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

export async function fetchTransactions(days = 30): Promise<TransactionRow[]> {
  // The Transaction Search API allows a 31-day window per request.
  const { start, end } = dateRangeDays(Math.min(days, 31));
  const qs = new URLSearchParams({
    start_date: start,
    end_date: end,
    fields: "transaction_info,payer_info,cart_info",
    page_size: "100",
    page: "1",
  });
  const res = await paypalFetch<{ transaction_details?: AnyRecord[] }>(`/v1/reporting/transactions?${qs}`);
  return (res.transaction_details ?? []).map((d) => {
    const ti = rec(d.transaction_info);
    const pi = rec(d.payer_info);
    const amount = rec(ti.transaction_amount);
    const fee = rec(ti.fee_amount);
    const name = rec(pi.payer_name);
    const status = str(ti.transaction_status);
    const eventCode = str(ti.transaction_event_code);
    const gross = num(amount.value);
    const feeV = num(fee.value);
    return {
      id: str(ti.transaction_id),
      date: str(ti.transaction_initiation_date),
      status,
      statusLabel: STATUS_LABELS[status] ?? status,
      eventCode,
      kind: EVENT_KINDS[eventCode] ?? eventCode,
      amount: gross,
      currency: str(amount.currency_code),
      fee: feeV,
      net: Math.round((gross + feeV) * 100) / 100,
      payerName: [name.given_name, name.surname].filter(Boolean).join(" ") || str(name.alternate_full_name),
      payerEmail: str(pi.email_address),
      subject: str(ti.transaction_subject) || str(ti.transaction_note),
      invoiceId: str(ti.invoice_id),
    };
  });
}

export async function fetchInvoices(): Promise<InvoiceRow[]> {
  const res = await paypalFetch<{ items?: AnyRecord[] }>(`/v2/invoicing/invoices?page=1&page_size=100&total_required=true`);
  const today = new Date().toISOString().slice(0, 10);
  return (res.items ?? []).map((inv) => {
    const detail = rec(inv.detail);
    const term = rec(detail.payment_term);
    const amount = rec(inv.amount);
    const due = rec(inv.due_amount);
    const paid = rec(rec(inv.payments).paid_amount);
    const recipient = rec(rec((inv.primary_recipients as AnyRecord[] | undefined)?.[0]).billing_info);
    const rname = rec(recipient.name);
    const status = str(inv.status);
    const dueDate = str(term.due_date);
    const open = ["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING"].includes(status);
    const links = (inv.links as AnyRecord[] | undefined) ?? [];
    const viewUrl = str(links.find((l) => l.rel === "payer-view")?.href);
    return {
      id: str(inv.id),
      number: str(detail.invoice_number),
      status,
      invoiceDate: str(detail.invoice_date),
      dueDate,
      daysOverdue: open && dueDate && dueDate < today ? daysBetween(dueDate, today) : 0,
      recipientName: [rname.given_name, rname.surname].filter(Boolean).join(" ") || str(recipient.business_name),
      recipientEmail: str(recipient.email_address),
      amount: num(amount.value),
      due: num(due.value),
      paid: num(paid.value),
      currency: str(amount.currency_code),
      note: str(detail.note),
      viewUrl,
    };
  });
}

export async function fetchDisputes(): Promise<DisputeRow[]> {
  const res = await paypalFetch<{ items?: AnyRecord[] }>(`/v1/customer/disputes?page_size=50`);
  const now = new Date().toISOString();
  // The list omits the buyer's name and message; read the details of up to 10 open cases.
  const open = (res.items ?? []).filter((d) => !["RESOLVED", "OTHER"].includes(str(d.status))).slice(0, 10);
  const details = new Map<string, AnyRecord>();
  await Promise.all(open.map(async (d) => {
    const id = str(d.dispute_id);
    const detail = await paypalFetch<AnyRecord>(`/v1/customer/disputes/${encodeURIComponent(id)}`).catch(() => null);
    if (detail) details.set(id, detail);
  }));
  return (res.items ?? []).map((d) => {
    const amount = rec(d.dispute_amount);
    const responseDue = str(d.seller_response_due_date);
    const detail = details.get(str(d.dispute_id)) ?? d;
    const txs = (detail.disputed_transactions as AnyRecord[] | undefined) ?? [];
    const messages = (detail.messages as AnyRecord[] | undefined) ?? [];
    const buyerMessage = messages.find((m) => str(m.posted_by) === "BUYER");
    return {
      id: str(d.dispute_id),
      status: str(d.status),
      reason: str(d.reason),
      stage: str(d.dispute_life_cycle_stage),
      channel: str(d.dispute_channel),
      amount: num(amount.value),
      currency: str(amount.currency_code),
      created: str(d.create_time),
      responseDue,
      daysToRespond: responseDue ? daysBetween(now, responseDue) : 0,
      transactionId: str(txs[0]?.seller_transaction_id),
      outcome: str(rec(d.dispute_outcome).outcome_code),
      buyer: str(rec(txs[0]?.buyer).name),
      buyerMessage: str(buyerMessage?.content).trim(),
    };
  });
}

export async function fetchCatalog(): Promise<CatalogRow[]> {
  const [products, plans] = await Promise.all([
    paypalFetch<{ products?: AnyRecord[] }>(`/v1/catalogs/products?page_size=50&total_required=true`),
    paypalFetch<{ plans?: AnyRecord[] }>(`/v1/billing/plans?page_size=20&total_required=true`),
  ]);
  const rows: CatalogRow[] = [];
  for (const p of products.products ?? []) {
    rows.push({
      id: str(p.id),
      kind: "product",
      name: str(p.name),
      description: str(p.description),
      type: "",
      status: "",
      price: null,
      currency: "",
      interval: "",
      productId: str(p.id),
      created: str(p.create_time),
    });
  }
  for (const pl of plans.plans ?? []) {
    // The list endpoint returns a summary; billing cycles need a detail call.
    let price: number | null = null;
    let currency = "";
    let interval = "";
    try {
      const detail = await paypalFetch<AnyRecord>(`/v1/billing/plans/${str(pl.id)}`);
      const cycles = (detail.billing_cycles as AnyRecord[] | undefined) ?? [];
      const regular = cycles.find((c) => c.tenure_type === "REGULAR") ?? cycles[0];
      const fixed = rec(rec(rec(regular).pricing_scheme).fixed_price);
      const freq = rec(rec(regular).frequency);
      price = fixed.value !== undefined ? num(fixed.value) : null;
      currency = str(fixed.currency_code);
      interval = freq.interval_unit ? `${str(freq.interval_count) || "1"} ${str(freq.interval_unit).toLowerCase()}` : "";
    } catch {
      // keep summary-only row
    }
    rows.push({
      id: str(pl.id),
      kind: "plan",
      name: str(pl.name),
      description: str(pl.description),
      type: "",
      status: str(pl.status),
      price,
      currency,
      interval,
      productId: str(pl.product_id),
      created: str(pl.create_time),
    });
  }
  return rows;
}

export async function fetchView(view: ViewId): Promise<Row[]> {
  switch (view) {
    case "transactions":
      return fetchTransactions();
    case "invoices":
      return fetchInvoices();
    case "disputes":
      return fetchDisputes();
    case "catalog":
      return fetchCatalog();
  }
}
