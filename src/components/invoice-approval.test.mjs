import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as previewData from "../lib/reminder-preview.ts";
import * as actions from "../lib/invoice-actions.ts";
import { formatMoney } from "./columns.ts";

// Node strips TypeScript but not JSX. Compile these presentational components only;
// their real formatters and data helpers are shared with the app, without network calls.
function componentModule(file, imports) {
  const filename = fileURLToPath(new URL(file, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = new Module(filename);
  const require = createRequire(filename);
  loaded.require = (name) => imports[name] || require(name);
  loaded._compile(compiled, filename);
  return loaded.exports;
}
const reminder = componentModule("./ReminderPreview.tsx", { "@/lib/reminder-preview": previewData, "@/lib/invoice-actions": actions, "./columns": { formatMoney } });
const { InvoiceActionPreview } = componentModule("./InvoiceActionPreview.tsx", {
  "@/lib/reminder-preview": previewData, "@/lib/invoice-actions": actions,
  "./ReminderPreview": reminder, "./columns": { formatMoney },
});
const invoice = { id: "INV2-EXAMPLE", number: "0006", status: "DRAFT", total: "1200.00", balance: "850.00", currency: "USD", recipients: [{ name: "Sam Reyes", email: "sam@example.com" }] };
const render = (name, input = {}) => renderToStaticMarkup(createElement(InvoiceActionPreview, { name, input: { invoice_id: invoice.id, ...input }, invoice }));

test("send approval stands alone with PayPal identity, total, and explicit notification settings", () => {
  const html = render("send_invoice", { send_to_recipient: false, additional_recipients: ["accounts@example.com"], note: "Please review <invoice>." });
  for (const value of ["0006", "Sam Reyes", "sam@example.com", "$1,200.00", "accounts@example.com", "No, do not notify", "Please review &lt;invoice&gt;."]) assert.ok(html.includes(value), value);
  assert.ok(!html.includes("$850.00"));
});

test("cancellation approval uses outstanding balance and never claims to refund paid money", () => {
  const html = render("cancel_sent_invoice", { send_to_recipient: true, note: "Replaced by a revised invoice." });
  for (const value of ["$850.00", "does not refund", "Yes, notify", "Replaced by a revised invoice."]) assert.ok(html.includes(value), value);
  assert.ok(!html.includes("$1,200.00"));
});

test("payment approval distinguishes the existing balance from the exact proposed payment", () => {
  const html = render("record_payment_for_invoice", { amount: { value: "250.00", currency_code: "EUR" }, method: "BANK_TRANSFER", payment_date: "2026-11-03", payment_id: "PAY-123", note: "Received at bank." });
  for (const value of ["$850.00", "€250.00", "bank transfer", "2026-11-03", "PAY-123", "Received at bank.", "does not charge"]) assert.ok(html.includes(value), value);
  assert.ok(render("record_payment_for_invoice").includes("Not specified in request"));
});

test("deletion preview identifies the invoice and explains permanent deletion", () => {
  const html = render("delete_invoice");
  for (const value of ["Permanently delete", "$1,200.00", "0006", "Sam Reyes", "draft"]) assert.ok(html.includes(value), value);
  assert.ok(!html.includes("Notify customer"));
});

test("invoice actions have specific labels and only notification actions require recipient emails", () => {
  for (const [name, button] of Object.entries({ send_invoice: "Send invoice", cancel_sent_invoice: "Cancel invoice", record_payment_for_invoice: "Record payment", delete_invoice: "Delete invoice" })) {
    assert.equal(actions.invoiceAction(name).button, button);
  }
  assert.equal(actions.invoiceAction("get_invoice"), undefined);
  assert.equal(actions.requiresInvoiceRecipient("send_invoice", true), true);
  assert.equal(actions.requiresInvoiceRecipient("send_invoice", false), false);
  assert.equal(actions.requiresInvoiceRecipient("send_invoice_reminder", false), true);
  assert.equal(actions.requiresInvoiceRecipient("record_payment_for_invoice"), false);
  assert.equal(actions.requiresInvoiceRecipient("delete_invoice"), false);
});
