import test from "node:test";
import assert from "node:assert/strict";
import { SCHEMA_OVERRIDES } from "../lib/tool-schemas.ts";
import { errorMessage } from "../lib/tool-result.ts";

const accept = SCHEMA_OVERRIDES.accept_dispute_claim;

test("accept_dispute_claim takes a normal sentence as its note", () => {
  const ok = accept.safeParse({ dispute_id: "PP-R-PIH-10197867", note: "Accepting the claim and refunding the buyer in full." });
  assert.equal(ok.success, true);
});

test("accept_dispute_claim still rejects a bad dispute ID and an empty note", () => {
  assert.equal(accept.safeParse({ dispute_id: "PP R 1", note: "Refund" }).success, false);
  assert.equal(accept.safeParse({ dispute_id: "PP-R-PIH-10197867", note: "  " }).success, false);
});

test("stream errors keep their reason", () => {
  assert.equal(errorMessage(new Error("Invalid PayPal Dispute ID")), "Invalid PayPal Dispute ID");
  assert.equal(errorMessage({ issues: [{ path: ["note"], message: "Invalid PayPal Dispute ID" }] }), "note: Invalid PayPal Dispute ID");
  assert.equal(errorMessage({ message: "Tool input failed validation" }), "Tool input failed validation");
  assert.equal(errorMessage(undefined), "Unknown error");
});
