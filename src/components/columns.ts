import { createElement } from "react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import type { CatalogRow, DisputeRow, InvoiceRow, TransactionRow } from "@/lib/data";
import type { ViewId } from "@/lib/tools";

export function formatMoney(value: number | string, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency}`;
  }
}

const money = (p: ValueFormatterParams) => {
  const v = p.value;
  if (v === null || v === undefined || v === "") return "";
  return formatMoney(v, (p.data?.currency as string) || "USD");
};

const dateTime = (p: ValueFormatterParams) => {
  const v = p.value as string;
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toISOString().slice(0, 16).replace("T", " ");
};

/** SENT, MARKED_AS_PAID -> Sent, Marked as paid */
const statusLabel = (p: ValueFormatterParams) => {
  const v = p.value;
  if (v === null || v === undefined || v === "") return "";
  const s = String(v).replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Short grid labels for PayPal's dispute reason codes; the panel and tooltip keep the full wording. */
export const DISPUTE_REASONS: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Item not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described",
  UNAUTHORISED: "Unauthorized payment",
  CREDIT_NOT_PROCESSED: "Credit not processed",
  DUPLICATE_TRANSACTION: "Duplicate charge",
  INCORRECT_AMOUNT: "Incorrect amount",
  PAYMENT_BY_OTHER_MEANS: "Paid another way",
  CANCELED_RECURRING_BILLING: "Cancelled subscription",
  PROBLEM_WITH_REMITTANCE: "Remittance problem",
  OTHER: "Other",
};
const disputeReason = (value: unknown) => DISPUTE_REASONS[String(value)] ?? statusLabel({ value } as ValueFormatterParams);

const badge = (p: ICellRendererParams) => p.value ? createElement("span", {
  className: `invoice-badge status-${String(p.value).toLowerCase().replace(/\s+/g, "-")}`,
  title: p.valueFormatted ?? String(p.value),
}, p.valueFormatted ?? p.value) : null;

const num: Partial<ColDef> = {
  filter: "agNumberColumnFilter",
  type: "rightAligned",
  valueFormatter: money,
  width: 130,
};

export const NUMBER_FIELDS: Record<ViewId, Set<string>> = {
  transactions: new Set(["amount", "fee", "net"]),
  invoices: new Set(["amount", "due", "paid", "daysOverdue"]),
  disputes: new Set(["amount", "daysToRespond"]),
  catalog: new Set(["price"]),
};

export const COLUMNS: Record<ViewId, ColDef[]> = {
  transactions: [
    { field: "date", headerName: "Date (UTC)", valueFormatter: dateTime, width: 160, sort: "desc" },
    { field: "kind", headerName: "Type", width: 172 },
    { field: "statusLabel", headerName: "Status", width: 104, valueFormatter: statusLabel, cellRenderer: badge },
    { field: "payerName", headerName: "Customer", flex: 1, minWidth: 140,
      cellRenderer: (p: ICellRendererParams<TransactionRow>) => createElement("div", { className: "invoice-customer" },
        createElement("span", null, p.data?.payerName || p.data?.payerEmail || "Unknown customer"),
        createElement("span", { className: "invoice-email" }, p.data?.payerEmail)),
    },
    { field: "payerEmail", headerName: "Email", width: 200, hide: true },
    { field: "amount", headerName: "Gross", ...num, width: 110 },
    { field: "fee", headerName: "Fee", ...num, width: 88 },
    { field: "net", headerName: "Net", ...num, width: 110 },
    { field: "subject", headerName: "Subject", width: 240, hide: true },
    { field: "invoiceId", headerName: "Invoice", width: 130, hide: true },
    { field: "id", headerName: "Transaction ID", width: 190, hide: true },
  ],
  invoices: [
    { field: "number", headerName: "Invoice #", width: 104 },
    { field: "recipientName", headerName: "Customer", flex: 1, minWidth: 180,
      cellRenderer: (p: ICellRendererParams<InvoiceRow>) => createElement("div", { className: "invoice-customer" },
        createElement("span", null, p.data?.recipientName || p.data?.recipientEmail || "Unknown customer"),
        createElement("span", { className: "invoice-email" }, p.data?.recipientEmail)),
    },
    { field: "status", headerName: "Status", width: 132, valueFormatter: statusLabel,
      getQuickFilterText: (p) => `${Number(p.data?.daysOverdue) > 0 ? "Overdue " : ""}${String(p.value ?? "").replace(/_/g, " ")}`,
      cellRenderer: (p: ICellRendererParams<InvoiceRow>) => createElement("span", {
        className: `invoice-badge status-${Number(p.data?.daysOverdue) > 0 ? "overdue" : String(p.value).toLowerCase()}`,
        title: p.valueFormatted ?? String(p.value ?? ""),
      }, Number(p.data?.daysOverdue) > 0 ? "Overdue" : p.valueFormatted),
    },
    { field: "due", headerName: "Outstanding", ...num, width: 130, cellClass: "ag-right-aligned-cell invoice-outstanding" },
    { field: "dueDate", headerName: "Due date", width: 112 },
    {
      field: "daysOverdue",
      headerName: "Overdue",
      headerTooltip: "Days overdue",
      sort: "desc",
      filter: "agNumberColumnFilter",
      type: "rightAligned",
      width: 128,
      cellClass: (p) => (Number(p.value) > 0 ? "ag-right-aligned-cell status status-overdue" : "ag-right-aligned-cell"),
    },
    { field: "recipientEmail", headerName: "Email", width: 210, hide: true },
    { field: "amount", headerName: "Total", ...num, hide: true },
    { field: "paid", headerName: "Paid", ...num, hide: true },
    { field: "invoiceDate", headerName: "Issued", width: 120, hide: true },
    { field: "note", headerName: "Note", width: 240, hide: true },
    { field: "id", headerName: "Invoice ID", width: 200, hide: true },
  ],
  disputes: [
    // Buyer with the case ID underneath, like a customer's email; the ID column stays for search.
    { field: "buyer", headerName: "Buyer", width: 190, tooltipField: "id",
      cellRenderer: (p: ICellRendererParams<DisputeRow>) => createElement("div", { className: "invoice-customer" },
        createElement("span", null, p.value || "Unknown buyer"),
        createElement("span", { className: "invoice-email" }, p.data?.id)) },
    { field: "id", headerName: "Case ID", width: 168, hide: true },
    { field: "created", headerName: "Opened (UTC)", valueFormatter: dateTime, width: 170, hide: true },
    { field: "status", headerName: "Status", width: 206, valueFormatter: statusLabel, cellRenderer: badge },
    { field: "stage", headerName: "Stage", width: 140, valueFormatter: statusLabel, hide: true },
    { field: "reason", headerName: "Reason", flex: 1, minWidth: 200, valueFormatter: (p) => disputeReason(p.value),
      tooltipValueGetter: (p) => [statusLabel({ value: p.value } as ValueFormatterParams), (p.data as DisputeRow | undefined)?.buyerMessage].filter(Boolean).join(": "),
      // Second line: the buyer's own words, like the email under a customer's name.
      cellRenderer: (p: ICellRendererParams<DisputeRow>) => createElement("div", { className: "invoice-customer" },
        createElement("span", null, disputeReason(p.value)),
        createElement("span", { className: "invoice-email" }, p.data?.buyerMessage || "No message from the buyer")) },
    { field: "amount", headerName: "Amount", ...num, width: 110 },
    { field: "responseDue", headerName: "Respond by", headerTooltip: "Response deadline (UTC)", valueFormatter: dateTime, width: 152, sort: "asc",
      comparator: (a, b, nodeA, nodeB) => {
        const deadline = (value: string, status: string) => {
          const parsed = Date.parse(value);
          return status === "RESOLVED" || !Number.isFinite(parsed) ? Infinity : parsed;
        };
        const left = deadline(a, nodeA.data?.status);
        const right = deadline(b, nodeB.data?.status);
        return left === right ? 0 : left < right ? -1 : 1;
      },
    },
    {
      field: "daysToRespond",
      headerName: "Days left",
      filter: "agNumberColumnFilter",
      type: "rightAligned",
      width: 110,
      valueFormatter: (p) => p.data?.responseDue && p.data?.status !== "RESOLVED" ? String(p.value) : "—",
      cellClass: (p) => `ag-right-aligned-cell${p.data?.responseDue && p.data?.status !== "RESOLVED" && Number(p.value) <= 3 ? " status status-overdue" : ""}`,
    },
    { field: "transactionId", headerName: "Transaction", width: 190, hide: true },
    { field: "outcome", headerName: "Outcome", width: 150, valueFormatter: statusLabel, hide: true },
    { field: "buyerMessage", headerName: "Buyer's message", width: 320, hide: true, tooltipField: "buyerMessage" },
  ],
  catalog: [
    { field: "kind", headerName: "Kind", width: 100, valueFormatter: statusLabel },
    { field: "name", headerName: "Name", flex: 1, minWidth: 200, sort: "asc", tooltipField: "description",
      cellRenderer: (p: ICellRendererParams<CatalogRow>) => createElement("div", { className: "invoice-customer" },
        createElement("span", null, p.value),
        createElement("span", { className: "invoice-email" }, p.data?.description || "No description")) },
    { field: "status", headerName: "Status", width: 120, valueFormatter: statusLabel, cellRenderer: badge },
    { field: "price", headerName: "Price", ...num },
    { field: "interval", headerName: "Interval", width: 120 },
    { field: "description", headerName: "Description", width: 280, hide: true },
    { field: "productId", headerName: "Product", width: 200, hide: true },
    { field: "created", headerName: "Created (UTC)", valueFormatter: dateTime, width: 170, hide: true },
    { field: "id", headerName: "ID", width: 200, hide: true },
  ],
};

export const VIEW_LABELS: Record<ViewId, string> = {
  transactions: "Transactions",
  invoices: "Invoices",
  disputes: "Disputes",
  catalog: "Catalog & plans",
};
