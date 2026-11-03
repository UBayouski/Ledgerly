import { createElement } from "react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import type { InvoiceRow } from "@/lib/data";
import type { ViewId } from "@/lib/tools";

const money = (p: ValueFormatterParams) => {
  const v = p.value;
  if (v === null || v === undefined || v === "") return "";
  const cur = (p.data?.currency as string) || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(Number(v));
  } catch {
    return `${Number(v).toFixed(2)} ${cur}`;
  }
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
    { field: "date", headerName: "Date", valueFormatter: dateTime, width: 150, sort: "desc" },
    { field: "kind", headerName: "Type", width: 130 },
    { field: "statusLabel", headerName: "Status", width: 120, valueFormatter: statusLabel, cellClass: (p) => `status status-${String(p.value).toLowerCase().replace(/\s+/g, "-")}` },
    { field: "payerName", headerName: "Customer", width: 170 },
    { field: "payerEmail", headerName: "Email", width: 200 },
    { field: "amount", headerName: "Gross", ...num },
    { field: "fee", headerName: "Fee", ...num, width: 110 },
    { field: "net", headerName: "Net", ...num },
    { field: "subject", headerName: "Subject", flex: 1, minWidth: 160 },
    { field: "invoiceId", headerName: "Invoice", width: 130 },
    { field: "id", headerName: "Transaction ID", width: 190 },
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
      width: 116,
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
    { field: "created", headerName: "Opened", valueFormatter: dateTime, width: 150, sort: "desc" },
    { field: "status", headerName: "Status", width: 230, valueFormatter: statusLabel, cellClass: (p) => `status status-${String(p.value).toLowerCase()}` },
    { field: "stage", headerName: "Stage", width: 140 },
    { field: "reason", headerName: "Reason", width: 240 },
    { field: "amount", headerName: "Amount", ...num },
    { field: "responseDue", headerName: "Respond by", valueFormatter: dateTime, width: 150 },
    {
      field: "daysToRespond",
      headerName: "Days left",
      filter: "agNumberColumnFilter",
      type: "rightAligned",
      width: 110,
      cellClass: (p) => (Number(p.value) <= 3 ? "status status-overdue" : ""),
    },
    { field: "transactionId", headerName: "Transaction", width: 190 },
    { field: "outcome", headerName: "Outcome", width: 150 },
    { field: "id", headerName: "Dispute ID", width: 190 },
  ],
  catalog: [
    { field: "kind", headerName: "Kind", width: 100 },
    { field: "name", headerName: "Name", width: 240 },
    { field: "status", headerName: "Status", width: 120, valueFormatter: statusLabel, cellClass: (p) => (p.value ? `status status-${String(p.value).toLowerCase()}` : "") },
    { field: "price", headerName: "Price", ...num },
    { field: "interval", headerName: "Interval", width: 120 },
    { field: "description", headerName: "Description", flex: 1, minWidth: 200 },
    { field: "productId", headerName: "Product", width: 200 },
    { field: "created", headerName: "Created", valueFormatter: dateTime, width: 150 },
    { field: "id", headerName: "ID", width: 200 },
  ],
};

export const VIEW_LABELS: Record<ViewId, string> = {
  transactions: "Transactions",
  invoices: "Invoices",
  disputes: "Disputes",
  catalog: "Catalog & plans",
};
