import assert from "node:assert/strict";
import test from "node:test";
import { describeGrid } from "./grid-context.ts";

const invoice = (id, due, currency = "USD", status = "SENT") => ({ id, due, currency, status });
const summary = (overrides = {}) => describeGrid({
  view: "invoices", rows: [invoice("a", 2850), invoice("b", 900), invoice("c", 450)],
  totalRows: 6, filterModel: {}, search: "", highlightedIds: new Set(),
  columns: [{ field: "daysOverdue", headerName: "Overdue (days)" }], sorted: false,
  ...overrides,
});

test("overdue view reports only visible balances and the active filter", () => {
  const result = summary({ filterModel: { daysOverdue: { type: "greaterThan", filter: 0 } } });
  assert.equal(result.title, "3 overdue invoices");
  assert.equal(result.detail, "$4,200.00 outstanding");
  assert.equal(result.visibleRows, 3);
  assert.equal(result.totalRows, 6);
  assert.deepEqual(result.filters, ["Overdue (days) > 0"]);
  assert.equal(result.canClear, true);
});

test("currencies remain separate instead of forming an invalid combined balance", () => {
  const result = summary({ rows: [invoice("a", 10), invoice("b", 20, "EUR"), invoice("c", 5)] });
  assert.equal(result.detail, "$15.00 + €20.00 outstanding");
});

test("brief highlights total only the highlighted records still visible", () => {
  const result = summary({ highlightedIds: new Set(["a", "missing"]) });
  assert.equal(result.highlighted, 1);
  assert.equal(result.detail, "Highlighted: $2,850.00 outstanding");
  assert.equal(result.visibleRows, 3);
});

test("an empty search result has no invented amount and can be cleared", () => {
  const result = summary({ rows: [], search: "no match" });
  assert.equal(result.title, "0 invoices");
  assert.equal(result.detail, "");
  assert.deepEqual(result.filters, ["Search: “no match”"]);
  assert.equal(result.canClear, true);
});

test("an unfiltered view has no clear action, while a custom sort does", () => {
  assert.equal(summary().canClear, false);
  assert.equal(summary({ sorted: true }).canClear, true);
  assert.equal(summary({ rows: [invoice("a", 0)] }).title, "1 invoice");
});

test("draft, cancelled, and paid invoices do not inflate the outstanding balance", () => {
  const result = summary({ totalRows: 7, rows: [
    invoice("draft", 1200, "USD", "DRAFT"),
    invoice("paid", 0, "USD", "MARKED_AS_PAID"),
    invoice("cancelled", 700, "USD", "CANCELLED"),
    invoice("sent", 650), invoice("late-a", 2850), invoice("late-b", 900), invoice("late-c", 450),
  ] });
  assert.equal(result.detail, "$4,850.00 outstanding");
  assert.equal(result.visibleRows, 7);
});

test("all open statuses contribute their remaining balance, including zero", () => {
  const result = summary({ rows: [
    invoice("sent", 10), invoice("unpaid", 20, "USD", "UNPAID"),
    invoice("partial", 5, "USD", "PARTIALLY_PAID"),
    invoice("pending", 3, "USD", "PAYMENT_PENDING"),
    { ...invoice("settling", 0, "USD", "PAYMENT_PENDING"), amount: 100 },
  ] });
  assert.equal(result.detail, "$38.00 outstanding");
});

test("a draft-only view or highlight never claims money is owed", () => {
  const rows = [invoice("draft", 1200, "USD", "DRAFT")];
  assert.equal(summary({ rows }).detail, "No outstanding balance");
  assert.equal(summary({ rows, highlightedIds: new Set(["draft"]) }).detail, "Highlighted: No outstanding balance");
});
