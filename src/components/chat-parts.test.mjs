import test from "node:test";
import assert from "node:assert/strict";
import { orderStepParts as order } from "../lib/chat-parts.ts";
import { needsApproval } from "../lib/tool-policy.ts";

const orderStepParts = (parts) => order(parts, needsApproval);

const text = (t) => ({ type: "text", text: t });
const tool = (name, state = "approval-requested") => ({ type: `tool-${name}`, toolCallId: name, state });
const step = { type: "step-start" };

test("narration streamed after a gated call is shown before its card", () => {
  const parts = [step, tool("get_invoice", "output-available"), step, tool("cancel_sent_invoice"), text("This will cancel invoice 0003 for $450.00.")];
  assert.deepEqual(orderStepParts(parts).map((p) => p.type), ["step-start", "tool-get_invoice", "step-start", "text", "tool-cancel_sent_invoice"]);
});

test("the outcome sentence after a decision stays after the card", () => {
  const parts = [step, text("Cancelling now."), tool("cancel_sent_invoice", "output-available"), step, text("Invoice 0003 is cancelled.")];
  assert.deepEqual(orderStepParts(parts).map((p) => p.type), ["step-start", "text", "tool-cancel_sent_invoice", "step-start", "text"]);
});

test("steps with only read tools keep their order", () => {
  const parts = [step, tool("list_invoices", "output-available"), text("You have three overdue invoices."), tool("show_view", "output-available")];
  assert.deepEqual(orderStepParts(parts).map((p) => p.type), ["step-start", "tool-list_invoices", "text", "tool-show_view"]);
});

test("dynamic tool parts are recognised by name", () => {
  const parts = [{ type: "dynamic-tool", toolName: "send_invoice", state: "approval-requested" }, text("Sending to Sam.")];
  assert.deepEqual(orderStepParts(parts).map((p) => p.type), ["text", "dynamic-tool"]);
});
