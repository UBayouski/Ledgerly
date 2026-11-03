import test from "node:test";
import assert from "node:assert/strict";
import { reminderInvoice, reminderInput } from "../lib/reminder-preview.ts";
import { parseToolResult } from "../lib/tool-result.ts";

test("the approval recipient and balance come from the PayPal invoice, including every primary recipient", () => {
  const invoice = reminderInvoice({
    id: "INV2-EXAMPLE", detail: { invoice_number: "0001" },
    amount: { value: "300.00", currency_code: "USD" },
    due_amount: { value: "125.00", currency_code: "USD" },
    primary_recipients: [
      { billing_info: { name: { given_name: "Maya", surname: "Chen" }, email_address: "maya@example.com" } },
      { billing_info: { business_name: "Accounts", email_address: "accounts@example.com" } },
    ],
  });
  assert.equal(invoice.number, "0001");
  assert.equal(invoice.balance, "125.00");
  assert.deepEqual(invoice.recipients, [{ name: "Maya Chen", email: "maya@example.com" }, { name: "Accounts", email: "accounts@example.com" }]);
});

test("missing recipients or balances stay unknown instead of being invented", () => {
  assert.deepEqual(reminderInvoice({ id: "INV2-EXAMPLE" }), { id: "INV2-EXAMPLE", number: "", recipients: [], balance: "", currency: "", total: "", status: "" });
});

test("the exact subject, whitespace, message, and extra recipients are preserved", () => {
  const input = { invoice_id: "INV2-EXAMPLE", subject: "Invoice 0001 reminder", note: "Hello Maya,\n\nPlease review invoice 0001.\nThanks!", additional_recipients: ["accounts@example.com"] };
  const preview = reminderInput(input);
  assert.equal(preview.note, input.note);
  assert.equal(preview.subject, input.subject);
  assert.deepEqual(preview.additionalRecipients, input.additional_recipients);
  assert.equal(reminderInput({}).note, "");
});

test("serialized toolkit failures never become successful tool results", () => {
  for (const result of [
    { ok: false, code: "PAYPAL_API_HTTP_ERROR", status: 422, message: "Invoice cannot be reminded" },
    { error: { type: "paypal_error", message: "Request failed" } },
    { success: false, message: "Could not send" },
  ]) {
    assert.throws(() => parseToolResult(JSON.stringify(result)), new RegExp(result.message || result.error.message));
    assert.throws(() => parseToolResult(result));
  }
});

test("empty successful responses and valid toolkit data remain successful", () => {
  assert.equal(parseToolResult(undefined), undefined);
  assert.equal(parseToolResult(""), "");
  assert.deepEqual(parseToolResult('{"success":true}'), { success: true });
  assert.deepEqual(parseToolResult('{"items":[]}'), { items: [] });
});
