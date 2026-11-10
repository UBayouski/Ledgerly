import test from "node:test";
import assert from "node:assert/strict";
import { COLUMNS } from "./columns.ts";

const deadlineColumn = COLUMNS.disputes.find((column) => column.field === "responseDue");

test("disputes default to the earliest actionable deadline, with resolved and undated cases last", () => {
  assert.equal(deadlineColumn.sort, "asc");
  const cases = [
    { id: "resolved", status: "RESOLVED", responseDue: "2026-10-01T12:00:00Z" },
    { id: "undated", status: "OPEN", responseDue: "" },
    { id: "later", status: "WAITING_FOR_SELLER_RESPONSE", responseDue: "2026-11-10T12:00:00Z" },
    { id: "first", status: "WAITING_FOR_SELLER_RESPONSE", responseDue: "2026-11-04T12:00:00Z" },
    { id: "invalid", status: "OPEN", responseDue: "invalid" },
  ];
  const sorted = [...cases].sort((a, b) => deadlineColumn.comparator(a.responseDue, b.responseDue, { data: a }, { data: b }, false));
  assert.deepEqual(sorted.map((row) => row.id), ["first", "later", "resolved", "undated", "invalid"]);
});

test("missing deadlines and resolved cases never display a misleading zero days left", () => {
  const days = COLUMNS.disputes.find((column) => column.field === "daysToRespond");
  for (const data of [{ status: "OPEN", responseDue: "" }, { status: "RESOLVED", responseDue: "2026-10-01" }]) {
    assert.equal(days.valueFormatter({ value: 0, data }), "—");
    assert.equal(days.cellClass({ value: 0, data }).includes("status-overdue"), false);
  }
  const urgent = { value: 2, data: { status: "WAITING_FOR_SELLER_RESPONSE", responseDue: "2026-11-05" } };
  assert.equal(days.valueFormatter(urgent), "2");
  assert.equal(days.cellClass(urgent).includes("status-overdue"), true);
});

test("disputes show the case ID and buyer by default", () => {
  const visible = COLUMNS.disputes.filter((column) => !column.hide).map((column) => column.field);
  assert.ok(visible.includes("id"));
  assert.ok(visible.includes("buyer"));
});
