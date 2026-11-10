import { tool, type Tool, type ToolSet } from "ai";
import { z } from "zod";
import { getToolkit } from "./paypal";
import { parseToolResult } from "./tool-result";
import { needsApproval } from "./tool-policy";
import { SCHEMA_OVERRIDES } from "./tool-schemas";
export { needsApproval } from "./tool-policy";

/**
 * The PayPal Agent Toolkit ships tools in the AI SDK v4 shape
 * (`parameters` + `execute(args)` returning a JSON string). This adapter
 * re-wraps them for AI SDK v7 (`inputSchema`), parses the JSON result so the
 * model sees structured data, and marks money-moving actions as requiring
 * human approval before they run.
 */

type LegacyTool = {
  description?: string;
  parameters: unknown;
  execute?: (args: unknown, options?: unknown) => Promise<unknown>;
};

export function paypalTools(): ToolSet {
  const legacy = getToolkit().getTools() as unknown as Record<string, LegacyTool>;
  const out: ToolSet = {};
  for (const [name, t] of Object.entries(legacy)) {
    out[name] = tool({
      description: t.description ?? name,
      // zod v3 schema from the toolkit; AI SDK v7 accepts it as a Standard Schema.
      inputSchema: (SCHEMA_OVERRIDES[name] ?? t.parameters) as never,
      needsApproval: needsApproval(name),
      execute: async (input: unknown, options) => {
        if (!t.execute) throw new Error(`${name} has no executor`);
        const raw = await t.execute(input, { toolCallId: options.toolCallId, messages: [] });
        const parsed = parseToolResult(raw);
        // Trim very large payloads so a 100-row listing does not flood context.
        const text = JSON.stringify(parsed);
        if (text && text.length > 60_000) {
          return {
            truncated: true,
            note: "Result truncated to 60k characters",
            preview: text.slice(0, 60_000),
          };
        }
        return parsed === undefined ? null : parsed;
      },
    }) as Tool;
  }
  return out;
}

export const VIEWS = ["transactions", "invoices", "disputes", "catalog"] as const;
export type ViewId = (typeof VIEWS)[number];

/**
 * UI-side tools. They have no `execute` on the server: the browser handles
 * them (via `onToolCall`) and drives the AG Grid, then reports back.
 */
export function uiTools(): ToolSet {
  return {
    show_view: tool({
      description:
        "Switch the dashboard grid to a view and optionally filter, sort, and highlight rows. " +
        "Use this whenever the user asks to see, find, filter, or sort data, or when you want to point at specific rows. " +
        "Field names must match the grid columns for that view (see the system prompt).",
      inputSchema: z.object({
        view: z.enum(VIEWS),
        filters: z
          .array(
            z.object({
              field: z.string().describe("Column field name"),
              op: z.enum([
                "contains",
                "equals",
                "notEqual",
                "greaterThan",
                "lessThan",
                "inRange",
                "blank",
                "notBlank",
              ]),
              value: z.union([z.string(), z.number()]).optional(),
              valueTo: z
                .union([z.string(), z.number()])
                .optional()
                .describe("Upper bound for inRange"),
            }),
          )
          .optional(),
        sort: z.object({ field: z.string(), dir: z.enum(["asc", "desc"]) }).optional(),
        highlightIds: z.array(z.string()).optional().describe("Row ids to flash and scroll to"),
        quickSearch: z.string().optional().describe("Free-text quick filter across all columns"),
      }),
    }),
    get_grid_snapshot: tool({
      description:
        "Read the rows currently loaded in a dashboard view (after the user's filters). " +
        "Cheaper and more accurate than calling PayPal again when the data is already on screen. Returns up to `limit` rows.",
      inputSchema: z.object({
        view: z.enum(VIEWS),
        limit: z.number().int().min(1).max(200).default(50),
        onlySelected: z
          .boolean()
          .default(false)
          .describe("Only rows the user has selected in the grid"),
      }),
    }),
  };
}

export function allTools(): ToolSet {
  return { ...paypalTools(), ...uiTools() };
}
