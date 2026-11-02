import { tool, type Tool, type ToolSet } from "ai";
import { z } from "zod";
import { getToolkit } from "./paypal";

/**
 * The PayPal Agent Toolkit ships tools in the AI SDK v4 shape
 * (`parameters` + `execute(args)` returning a JSON string). This adapter
 * re-wraps them for AI SDK v7 (`inputSchema`), parses the JSON result so the
 * model sees structured data, and marks money-moving actions as requiring
 * human approval before they run.
 */

/**
 * Read-only tool name prefixes. Everything else the toolkit exposes changes
 * money or state in PayPal and pauses for explicit human approval. An
 * allowlist (rather than a list of risky tools) means a tool added by a
 * toolkit upgrade is gated by default.
 */
const READ_ONLY_PREFIXES = ["list_", "get_", "show_", "search_", "generate_"];

export function needsApproval(name: string): boolean {
  return !READ_ONLY_PREFIXES.some((prefix) => name.startsWith(prefix));
}

type LegacyTool = {
  description?: string;
  parameters: unknown;
  execute?: (args: unknown, options?: unknown) => Promise<unknown>;
};

function parseResult(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function paypalTools(): ToolSet {
  const legacy = getToolkit().getTools() as unknown as Record<string, LegacyTool>;
  const out: ToolSet = {};
  for (const [name, t] of Object.entries(legacy)) {
    out[name] = tool({
      description: t.description ?? name,
      // zod v3 schema from the toolkit; AI SDK v7 accepts it as a Standard Schema.
      inputSchema: t.parameters as never,
      needsApproval: needsApproval(name),
      execute: async (input: unknown, options) => {
        if (!t.execute) throw new Error(`${name} has no executor`);
        const raw = await t.execute(input, { toolCallId: options.toolCallId, messages: [] });
        const parsed = parseResult(raw);
        // Trim very large payloads so a 100-row listing does not flood context.
        const text = JSON.stringify(parsed);
        if (text.length > 60_000) {
          return {
            truncated: true,
            note: "Result truncated to 60k characters",
            preview: text.slice(0, 60_000),
          };
        }
        return parsed;
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
