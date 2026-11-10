import test from "node:test";
import assert from "node:assert/strict";
import { isCustomerPayment } from "../lib/revenue.ts";

const row = (eventCode, amount, status = "S") => ({ eventCode, amount, status });

test("customer payments count as revenue", () => {
  assert.equal(isCustomerPayment(row("T0005", 129)), true);
  assert.equal(isCustomerPayment(row("T0003", 45.1)), true);
  assert.equal(isCustomerPayment(row("T0000", 40)), true);
});

test("starting balances, transfers, refunds and pending payments do not", () => {
  assert.equal(isCustomerPayment(row("T1900", 5000)), false);
  assert.equal(isCustomerPayment(row("T0300", 200)), false);
  assert.equal(isCustomerPayment(row("T1107", -40)), false);
  assert.equal(isCustomerPayment(row("T0005", 129, "P")), false);
  assert.equal(isCustomerPayment(row("T0005", -129)), false);
});
