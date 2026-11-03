"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import type { ViewId } from "@/lib/tools";
import type { ShowCommand } from "./Grid";
import { Markdown } from "./Markdown";
import { VIEW_LABELS } from "./columns";

export type ChatContext = { view: ViewId; selectedIds: string[]; rowCount: number; visibleRowCount: number; filters: string[] };

export type ChatController = {
  /** Switch view (loading data if needed) and apply grid commands. */
  show: (view: ViewId, cmd: ShowCommand) => Promise<{ ok: boolean; view: ViewId; visibleRows: number; highlighted: number; unknownFields: string[] }>;
  snapshot: (view: ViewId, limit: number, onlySelected: boolean) => Promise<{ view: ViewId; rows: unknown[]; total: number }>;
  getContext: () => ChatContext;
};

type Suggestion = { label: string; detail: string; prompt: string };
const SUGGESTIONS: Record<ViewId, Suggestion[]> = {
  invoices: [
    { label: "Review overdue", detail: "See who owes you and what to prioritize", prompt: "Show overdue invoices sorted by outstanding amount, and tell me what needs attention." },
    { label: "Draft reminders", detail: "Prepare follow-ups for late payments", prompt: "Draft reminders for every invoice more than 14 days overdue. Explain each reminder before requesting my approval." },
    { label: "Summarize this view", detail: "Understand the invoices on screen", prompt: "Summarize the invoices on screen, including outstanding balances and payment statuses." },
  ],
  transactions: [
    { label: "Summarize payments", detail: "Gross payments, fees, and refunds", prompt: "Summarize the payments on screen, including fees, refunds, and top customers." },
    { label: "Review refunds", detail: "Find refunded and reversed payments", prompt: "Show refunded or reversed transactions and summarize their amounts and customers." },
    { label: "Understand fees", detail: "See how fees affect your revenue", prompt: "Summarize the fees and net revenue of the transactions on screen, keeping currencies separate." },
  ],
  disputes: [
    { label: "Check deadlines", detail: "Find disputes that need a response", prompt: "Which open disputes need a response this week? Show them sorted by response deadline and explain what I should do." },
    { label: "Plan a response", detail: "Review the evidence you may need", prompt: "Review the disputes on screen and suggest response steps and evidence needed. Do not submit anything." },
    { label: "Summarize this view", detail: "Review amounts at risk and case status", prompt: "Summarize the disputes on screen, including amounts at risk and response deadlines." },
  ],
  catalog: [
    { label: "Review catalog", detail: "Get an overview of products and plans", prompt: "Summarize the products and subscription plans on screen, including their statuses." },
    { label: "Check inactive items", detail: "Find products or plans to review", prompt: "Find inactive products and subscription plans and show them in the grid. Explain what needs review." },
    { label: "Compare plans", detail: "Compare prices and billing intervals", prompt: "Compare subscription plans in the current catalog, including prices, currencies, billing intervals, and statuses." },
  ],
};

function humanTool(name: string): string {
  return name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Tool input as a readable list; nested values collapse to compact JSON. */
function Params({ input }: { input: unknown }) {
  if (!input || typeof input !== "object") return <pre>{JSON.stringify(input, null, 2)}</pre>;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return null;
  return (
    <dl className="params">
      {entries.map(([k, v]) => (
        <Fragment key={k}>
          <dt>{k.replace(/_/g, " ")}</dt>
          <dd>{typeof v === "string" ? v : JSON.stringify(v)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function ToolCard({
  part,
  onApprove,
}: {
  part: Extract<UIMessage["parts"][number], { type: `tool-${string}` } | { type: "dynamic-tool" }>;
  onApprove: (id: string, approved: boolean) => void;
}) {
  const name = getToolName(part);
  const state = part.state;
  const [open, setOpen] = useState(false);
  const isUi = name === "show_view" || name === "get_grid_snapshot";
  const label =
    state === "approval-requested"
      ? "Needs your approval"
      : state === "approval-responded"
        ? part.approval.approved
          ? "Approved, running…"
          : "Denied"
        : state === "output-denied"
          ? "Denied"
          : state === "output-error"
            ? "Failed"
            : state === "output-available"
              ? "Done"
              : "Running…";
  return (
    <div className={`tool-card state-${state}${isUi ? " ui" : ""}`}>
      <button className="tool-head" onClick={() => setOpen((o) => !o)}>
        <span className="dot" />
        <span className="tool-name">{humanTool(name)}</span>
        <span className="tool-state">{label}</span>
      </button>
      {state === "approval-requested" && (
        <div className="approval">
          <Params input={part.input} />
          <div className="row">
            <button className="primary" onClick={() => onApprove(part.approval.id, true)}>
              Approve
            </button>
            <button className="ghost" onClick={() => onApprove(part.approval.id, false)}>
              Deny
            </button>
          </div>
        </div>
      )}
      {open && state !== "approval-requested" && (
        <div className="tool-body">
          {"input" in part && part.input !== undefined && (
            <>
              <div className="muted">Input</div>
              <pre>{JSON.stringify(part.input, null, 2)}</pre>
            </>
          )}
          {state === "output-available" && (
            <>
              <div className="muted">Output</div>
              <pre>{JSON.stringify(part.output, null, 2).slice(0, 4000)}</pre>
            </>
          )}
          {state === "output-error" && <pre className="err">{part.errorText}</pre>}
        </div>
      )}
    </div>
  );
}

/**
 * The transport is created once, but the controller (grid handle, selection)
 * changes every render. Keep the latest one here so request bodies and
 * client-side tool calls always see current UI state. One Chat per page.
 */
const latest: { controller: ChatController | null } = { controller: null };

export function Chat({ controller, modelLabel, loading }: { controller: ChatController; modelLabel: string; loading: boolean }) {
  useEffect(() => {
    latest.controller = controller;
    return () => {
      if (latest.controller === controller) latest.controller = null;
    };
  }, [controller]);
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ context: latest.controller?.getContext() }),
      }),
    [],
  );

  const { messages, sendMessage, status, error, addToolOutput, addToolApprovalResponse, stop, setMessages } = useChat({
    transport,
    sendAutomaticallyWhen: ({ messages }) =>
      lastAssistantMessageIsCompleteWithToolCalls({ messages }) ||
      lastAssistantMessageIsCompleteWithApprovalResponses({ messages }),
    onToolCall: async ({ toolCall }) => {
      const name = toolCall.toolName;
      const ctl = latest.controller;
      if (!ctl) return;
      if (name === "show_view") {
        const input = toolCall.input as ShowCommand & { view: ViewId };
        const out = await ctl.show(input.view, input);
        addToolOutput({ tool: "show_view", toolCallId: toolCall.toolCallId, output: out });
      } else if (name === "get_grid_snapshot") {
        const input = toolCall.input as { view: ViewId; limit?: number; onlySelected?: boolean };
        const out = await ctl.snapshot(input.view, input.limit ?? 50, input.onlySelected ?? false);
        addToolOutput({ tool: "get_grid_snapshot", toolCallId: toolCall.toolCallId, output: out });
      }
    },
  });

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text) void sendMessage({ text });
    };
    window.addEventListener("ledgerly:prompt", handler);
    return () => window.removeEventListener("ledgerly:prompt", handler);
  }, [sendMessage]);

  const busy = status === "submitted" || status === "streaming";
  const context = controller.getContext();
  const viewLabel = VIEW_LABELS[context.view].toLowerCase();
  const recordLabel = context.visibleRowCount === context.rowCount
    ? `${context.rowCount} ${context.rowCount === 1 ? "record" : "records"}`
    : `${context.visibleRowCount} of ${context.rowCount} records`;
  const suggestions = context.selectedIds.length > 0 ? [
    {
      label: "Review selection",
      detail: `${context.selectedIds.length} selected ${context.selectedIds.length === 1 ? "record" : "records"}`,
      prompt: "Summarize only my selected records and tell me what needs attention.",
    },
    ...SUGGESTIONS[context.view].slice(0, 2),
  ] : SUGGESTIONS[context.view];

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  };

  return (
    <aside className="chat">
      <div className="chat-head">
        <div>
          <div className="chat-title"><span className="copilot-mark" aria-hidden>✦</span> Copilot</div>
          <div className="chat-view-context">
            Viewing {viewLabel}, {loading ? "Loading…" : recordLabel}
          </div>
        </div>
        <button className="ghost small" onClick={() => setMessages([])} disabled={busy || messages.length === 0}>
          New chat
        </button>
      </div>
      {(context.selectedIds.length > 0 || context.filters.length > 0) && (
        <div className="chat-context-bar">
          {context.selectedIds.length > 0 && <span>{context.selectedIds.length} selected</span>}
          {context.filters.length > 0 && <span>Using the filtered view</span>}
        </div>
      )}
      <div className="chat-scroll" ref={scroller}>
        {messages.length === 0 && (
          <div className="suggestions">
            <div className="copilot-welcome">
              <h3>What needs your attention?</h3>
            </div>
            {suggestions.map((s) => (
              <button key={s.label} className="suggestion" disabled={loading || busy} onClick={() => void sendMessage({ text: s.prompt })}>
                <span className="suggestion-copy"><strong>{s.label}</strong><span>{s.detail}</span></span>
                <span className="suggestion-arrow" aria-hidden>↗</span>
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.parts.map((part, i) => {
              if (part.type === "text") return <Markdown key={i} text={part.text} />;
              if (isToolUIPart(part)) {
                return (
                  <ToolCard
                    key={i}
                    part={part}
                    onApprove={(id, approved) => void addToolApprovalResponse({ id, approved })}
                  />
                );
              }
              return null;
            })}
          </div>
        ))}
        {error && <div className="msg error">The copilot couldn’t complete this response. You can send another message or start a new chat.</div>}
        {busy && <div className="typing">Thinking…</div>}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Message copilot"
          placeholder={context.selectedIds.length ? "Ask about your selection…" : `Ask about your ${viewLabel}…`}
          rows={2}
        />
        {busy ? (
          <button type="button" className="ghost" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit" className="primary" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
      <div className="chat-footnote">
        <span>{modelLabel} with the PayPal Agent Toolkit.</span>
        <span>Changes to PayPal need your approval.</span>
      </div>
    </aside>
  );
}
