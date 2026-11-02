import { z } from "zod";
import { VIEWS } from "./tools";

export const briefSchema = z.object({
  headline: z
    .string()
    .describe("One sentence, the single most important thing for the merchant today"),
  items: z
    .array(
      z.object({
        severity: z.enum(["urgent", "attention", "good"]),
        title: z.string().describe("Short, under 60 characters"),
        detail: z.string().describe("One or two sentences with concrete numbers and names"),
        view: z.enum(VIEWS),
        ids: z.array(z.string()).describe("Row ids in that view to highlight; may be empty"),
        suggestedPrompt: z
          .string()
          .describe("A message the user could send the copilot to act on this, phrased in first person"),
      }),
    )
    .max(6),
  metrics: z.object({
    gross30d: z.number(),
    fees30d: z.number(),
    refunds30d: z.number(),
    openInvoicesTotal: z.number(),
    overdueInvoicesTotal: z.number(),
    openDisputesTotal: z.number(),
    currency: z.string(),
  }),
});

export type Brief = z.infer<typeof briefSchema>;
