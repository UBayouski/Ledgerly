type Part = { type: string; toolName?: string };

function toolName(part: Part): string | undefined {
  if (part.type === "dynamic-tool") return part.toolName;
  return part.type.startsWith("tool-") ? part.type.slice(5) : undefined;
}

/**
 * The model narrates an approval-gated action in the same step as the tool
 * call, and it often streams that sentence after the call. Rendered under the
 * card, "This will cancel invoice 0003" reads as the outcome, even after the
 * user dismissed the card. Within each step that proposes a gated action, put
 * the step's text before its tool parts so the narration introduces the card.
 * Later steps (the outcome after a decision) start with a step-start part and
 * keep their own order.
 */
export function orderStepParts<T extends Part>(parts: readonly T[], gated: (toolName: string) => boolean): T[] {
  const out: T[] = [];
  let step: T[] = [];
  const flush = () => {
    if (step.some((p) => { const name = toolName(p); return name !== undefined && gated(name); })) {
      out.push(...step.filter((p) => p.type === "text"), ...step.filter((p) => p.type !== "text"));
    } else {
      out.push(...step);
    }
    step = [];
  };
  for (const part of parts) {
    if (part.type === "step-start") { flush(); out.push(part); continue; }
    step.push(part);
  }
  flush();
  return out;
}
