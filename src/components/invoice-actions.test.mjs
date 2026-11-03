import assert from "node:assert/strict";
import test from "node:test";
import { blockedReason, statusLabel } from "../lib/invoice-actions.ts";
import { cleanPayPalError, parseToolResult } from "../lib/tool-result.ts";

test("status labels read like the grid badges", () => {
  assert.equal(statusLabel("MARKED_AS_PAID"), "Marked as paid");
  assert.equal(statusLabel("SENT"), "Sent");
  assert.equal(statusLabel(""), "");
});

test("cancelling a paid invoice is blocked before approval", () => {
  assert.match(blockedReason("cancel_sent_invoice", "MARKED_AS_PAID"), /paid/);
  assert.equal(blockedReason("cancel_sent_invoice", "SENT"), undefined);
  assert.match(blockedReason("cancel_sent_invoice", "DRAFT"), /Delete the draft/);
});

test("sending and reminding follow the invoice lifecycle", () => {
  assert.equal(blockedReason("send_invoice", "DRAFT"), undefined);
  assert.match(blockedReason("send_invoice", "SENT"), /already been sent/);
  assert.match(blockedReason("send_invoice_reminder", "DRAFT"), /only be sent for invoices that have been sent/);
  assert.equal(blockedReason("send_invoice_reminder", "SENT"), undefined);
  assert.match(blockedReason("delete_invoice", "SENT"), /Only draft or scheduled/);
  assert.equal(blockedReason("record_payment_for_invoice", "UNPAID"), undefined);
});

test("PayPal's generic prefix is stripped from failures", () => {
  const raw = JSON.stringify({ ok: false, status: 422, message: "The requested action could not be performed, semantically incorrect, or failed business validation.: Cannot cancel a paid or partially paid invoice." });
  assert.throws(() => parseToolResult(raw), /^Error: Cannot cancel a paid or partially paid invoice\.$/);
  assert.equal(cleanPayPalError("Plain message"), "Plain message");
});
