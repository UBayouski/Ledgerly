import type { ViewId } from "./tools";

// New toolkit tools require approval unless explicitly recognized as read-only.
const READ_ONLY_PREFIXES = ["list_", "get_", "show_", "search_", "generate_"];

export function needsApproval(name: string): boolean {
  return !READ_ONLY_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function affectedViews(name: string): ViewId[] {
  if (!needsApproval(name)) return [];
  if (/invoice|invoicing|recurring_series/.test(name)) return ["invoices"];
  if (/dispute/.test(name)) return ["disputes", "transactions"];
  if (/product|plan/.test(name)) return ["catalog"];
  if (/subscription/.test(name)) return ["catalog", "transactions"];
  if (/refund|payment|order|capture|shipment/.test(name)) return ["transactions", "invoices"];
  return ["transactions", "invoices", "disputes", "catalog"];
}

type Message = { parts: readonly { type: string; state?: string; toolName?: string; toolCallId?: string; output?: unknown }[] };

/** Claim each confirmed mutation once; streamed updates and failed/denied calls must not replay it. */
export function completedActions(messages: readonly Message[], seen: Set<string>) {
  const completed: { id: string; name: string }[] = [];
  for (const message of messages) for (const part of message.parts) {
    if (part.state !== "output-available" || !part.toolCallId || seen.has(part.toolCallId)) continue;
    const name = part.type === "dynamic-tool" ? part.toolName : part.type.startsWith("tool-") ? part.type.slice(5) : undefined;
    if (!name || !needsApproval(name)) continue;
    const output = part.output as Record<string, unknown> | null | undefined;
    if (output && typeof output === "object" && (output.error || output.ok === false || output.success === false)) continue;
    seen.add(part.toolCallId);
    completed.push({ id: part.toolCallId, name });
  }
  return completed;
}
