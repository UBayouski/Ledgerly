import test from "node:test";
import assert from "node:assert/strict";
import { affectedViews, completedActions, needsApproval } from "../lib/tool-policy.ts";

const call = (name, id, state = "output-available", output = null) => ({ type: `tool-${name}`, toolCallId: id, state, output });

test("only confirmed mutations trigger refresh, never reads, approval requests, denials, or failures", () => {
  const messages = [{ parts: [
    call("get_invoice", "read"), call("show_view", "ui"),
    call("send_invoice", "pending", "approval-requested"),
    call("send_invoice", "approved", "approval-responded"),
    call("send_invoice", "denied", "output-denied"),
    call("send_invoice", "failed", "output-error"),
    call("send_invoice", "legacy-error", "output-available", { ok: false, message: "Failed" }),
    call("send_invoice", "sent"),
  ] }];
  assert.deepEqual(completedActions(messages, new Set()), [{ id: "sent", name: "send_invoice" }]);
});

test("streamed updates and duplicate copies of a completed call refresh only once", () => {
  const seen = new Set();
  const messages = [{ parts: [call("record_payment_for_invoice", "payment"), call("record_payment_for_invoice", "payment")] }];
  assert.deepEqual(completedActions(messages, seen), [{ id: "payment", name: "record_payment_for_invoice" }]);
  assert.deepEqual(completedActions(messages, seen), []);
  messages[0].parts.push(call("send_invoice", "second"));
  assert.deepEqual(completedActions(messages, seen), [{ id: "second", name: "send_invoice" }]);
});

test("a failed call is not claimed and can refresh if it later receives a successful result", () => {
  const seen = new Set();
  assert.deepEqual(completedActions([{ parts: [call("send_invoice", "same", "output-error")] }], seen), []);
  assert.deepEqual(completedActions([{ parts: [call("send_invoice", "same")] }], seen), [{ id: "same", name: "send_invoice" }]);
});

test("dynamic toolkit calls also refresh after success", () => {
  assert.deepEqual(completedActions([{ parts: [{ type: "dynamic-tool", toolName: "cancel_sent_invoice", toolCallId: "cancel", state: "output-available", output: { success: true } }] }], new Set()), [{ id: "cancel", name: "cancel_sent_invoice" }]);
});

test("refresh targets match the records each action can affect", () => {
  assert.deepEqual(affectedViews("send_invoice"), ["invoices"]);
  assert.deepEqual(affectedViews("record_payment_for_invoice"), ["invoices"]);
  assert.deepEqual(affectedViews("create_refund"), ["transactions", "invoices"]);
  assert.deepEqual(affectedViews("accept_dispute_claim"), ["disputes", "transactions"]);
  assert.deepEqual(affectedViews("create_product"), ["catalog"]);
  assert.deepEqual(affectedViews("update_subscription"), ["catalog", "transactions"]);
  assert.deepEqual(affectedViews("get_invoice"), []);
});

test("unknown actions remain approval-gated and conservatively refresh all views", () => {
  assert.equal(needsApproval("new_paypal_action"), true);
  assert.deepEqual(affectedViews("new_paypal_action"), ["transactions", "invoices", "disputes", "catalog"]);
  for (const name of ["list_invoices", "get_invoice", "show_view", "search_invoicing", "generate_invoice_number"]) assert.equal(needsApproval(name), false);
});
