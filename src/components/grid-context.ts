import type { FilterModel } from "ag-grid-community";
import type { Row } from "@/lib/data";
import type { ViewId } from "@/lib/tools";

export type GridContext = {
  view: ViewId;
  visibleRows: number;
  totalRows: number;
  title: string;
  detail: string;
  filters: string[];
  highlighted: number;
  canClear: boolean;
};

const nouns: Record<ViewId, [string, string]> = {
  invoices: ["invoice", "invoices"],
  transactions: ["transaction", "transactions"],
  disputes: ["dispute", "disputes"],
  catalog: ["catalog record", "catalog records"],
};

// Match the open invoice statuses used by the account brief.
const openInvoiceStatuses = new Set(["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING"]);

export function isOpenInvoiceStatus(status: string) {
  return openInvoiceStatuses.has(status);
}

export function describeGrid({ view, rows, totalRows, filterModel, search, highlightedIds, columns, sorted }: {
  view: ViewId;
  rows: Row[];
  totalRows: number;
  filterModel: FilterModel;
  search: string;
  highlightedIds: Set<string>;
  columns: { field?: string; headerName?: string }[];
  sorted: boolean;
}): GridContext {
  const overdueFilter = filterModel.daysOverdue;
  const overdue = view === "invoices" && overdueFilter?.type === "greaterThan" && Number(overdueFilter.filter) >= 0;
  const noun = nouns[view][rows.length === 1 ? 0 : 1];
  const highlighted = rows.filter((row) => highlightedIds.has(row.id));
  const totals = new Map<string, number>();
  const amountRows = highlighted.length ? highlighted : rows;
  for (const row of amountRows) {
    if ("due" in row && !isOpenInvoiceStatus(row.status)) continue;
    const amount = "due" in row ? row.due : "amount" in row ? row.amount : null;
    if (amount === null || !Number.isFinite(amount)) continue;
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + amount);
  }
  const amounts = [...totals].map(([currency, amount]) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  });
  const filters = Object.entries(filterModel).map(([field, model]) => {
    const label = columns.find((column) => column.field === field)?.headerName ?? field;
    const operators: Record<string, string> = { equals: "=", notEqual: "≠", greaterThan: ">", greaterThanOrEqual: "≥", lessThan: "<", lessThanOrEqual: "≤", contains: "contains", notContains: "does not contain", startsWith: "starts with", endsWith: "ends with" };
    if (model.conditions || model.filterModels) return `${label}: multiple conditions`;
    if (model.type === "blank") return `${label}: empty`;
    if (model.type === "notBlank") return `${label}: not empty`;
    if (model.type === "inRange") return `${label}: ${model.filter}–${model.filterTo}`;
    return `${label} ${operators[model.type] ?? ":"} ${model.filter ?? model.dateFrom ?? "filtered"}`;
  });
  if (search.trim()) filters.push(`Search: “${search.trim()}”`);
  const title = `${rows.length} ${overdue ? "overdue " : ""}${noun}`;
  return {
    view, visibleRows: rows.length, totalRows, title, filters,
    highlighted: highlighted.length,
    detail: amounts.length ? `${highlighted.length ? "Highlighted: " : ""}${amounts.join(" + ")} ${view === "invoices" ? "outstanding" : "total"}` : view === "invoices" && amountRows.length ? `${highlighted.length ? "Highlighted: " : ""}No outstanding balance` : "",
    canClear: filters.length > 0 || highlightedIds.size > 0 || sorted,
  };
}
