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
import { InvoiceActionPreview } from "./InvoiceActionPreview";
import { reminderInput, type ReminderInvoice } from "@/lib/reminder-preview";
import { blockedReason, invoiceAction, requiresInvoiceRecipient } from "@/lib/invoice-actions";
import { cleanPayPalError } from "@/lib/tool-result";
import { orderStepParts } from "@/lib/chat-parts";
import { completedActions, needsApproval } from "@/lib/tool-policy";

export type ChatContext = { view: ViewId; selectedIds: string[]; rowCount: number; visibleRowCount: number; filters: string[] };

export type ChatController = {
  /** Switch view (loading data if needed) and apply grid commands. */
  show: (view: ViewId, cmd: ShowCommand) => Promise<{ ok: boolean; view: ViewId; visibleRows: number; highlighted: number; unknownFields: string[] }>;
  snapshot: (view: ViewId, limit: number, onlySelected: boolean) => Promise<{ view: ViewId; rows: unknown[]; total: number }>;
  getContext: () => ChatContext;
  afterActions: (names: string[]) => Promise<boolean>;
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
  interrupted,
  refreshState,
}: {
  part: Extract<UIMessage["parts"][number], { type: `tool-${string}` } | { type: "dynamic-tool" }>;
  onApprove: (id: string, approved: boolean) => Promise<void>;
  interrupted: boolean;
  refreshState?: "refreshed" | "failed";
}) {
  const name = getToolName(part);
  const state = part.state;
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ id: string; invoice?: ReminderInvoice; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [decision, setDecision] = useState<boolean | null>(null);
  const decisionLock = useRef(false);
  const [decisionError, setDecisionError] = useState("");
  const action = invoiceAction(name);
  const invoiceTool = Boolean(action);
  const input = reminderInput("input" in part ? part.input : undefined);
  const awaitingApproval = state === "approval-requested";
  const invoice = preview?.id === input.invoiceId ? preview.invoice : undefined;
  const previewError = preview?.id === input.invoiceId ? preview.error : undefined;
  const missingRecipient = invoice && requiresInvoiceRecipient(name, input.sendToRecipient) && !invoice.recipients.some((recipient) => recipient.email);
  const missingPayment = name === "record_payment_for_invoice" && (!input.payment.amount || !input.payment.currency || !input.payment.method);
  const blocked = invoice ? blockedReason(name, invoice.status) : undefined;
  const actionButton = name === "delete_invoice" && invoice?.status === "DRAFT" ? "Delete draft" : action?.button || "Approve";

  useEffect(() => {
    if (!invoiceTool || !awaitingApproval || !input.invoiceId) return;
    const abort = new AbortController();
    void fetch(`/api/invoices/${encodeURIComponent(input.invoiceId)}/preview`, { cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load invoice");
        const data = await response.json() as { invoice: ReminderInvoice };
        if (!abort.signal.aborted) setPreview({ id: input.invoiceId, invoice: data.invoice });
      })
      .catch(() => { if (!abort.signal.aborted) setPreview({ id: input.invoiceId, error: "Couldn’t load the invoice details. Retry before confirming this action." }); });
    return () => abort.abort();
  }, [invoiceTool, awaitingApproval, input.invoiceId, retry]);

  const decide = async (approved: boolean) => {
    if (state !== "approval-requested" || decisionLock.current) return;
    decisionLock.current = true;
    setDecision(approved);
    setDecisionError("");
    try {
      await onApprove(part.approval.id, approved);
    } catch {
      decisionLock.current = false;
      setDecision(null);
      setDecisionError("Couldn’t record your decision. Please try again.");
    }
  };
  const isUi = name === "show_view" || name === "get_grid_snapshot";
  const label =
    state === "approval-requested"
      ? "Needs your approval"
      : state === "approval-responded"
        ? part.approval.approved
          ? action ? interrupted ? "Not confirmed" : action.pending : "Approved, running…"
          : invoiceTool ? "Not applied" : "Cancelled"
        : state === "output-denied"
          ? invoiceTool ? "Not applied" : "Cancelled"
          : state === "output-error"
            ? "Failed"
            : state === "output-available"
              ? action?.success || "Done"
              : "Running…";
  return (
    <div className={`tool-card state-${state}${isUi ? " ui" : ""}`}>
      <button className="tool-head" aria-expanded={state === "approval-requested" || open} onClick={() => setOpen((o) => !o)}>
        <span className="dot" />
        <span className="tool-name">{action?.title || humanTool(name)}</span>
        <span className="tool-state">{label}</span>
      </button>
      {state === "approval-requested" && (
        <div className="approval">
          {invoiceTool ? invoice ? <InvoiceActionPreview name={name} input={part.input} invoice={invoice} /> : (
            <div className="reminder-preview-status">
              <p>{!input.invoiceId ? "This action has no invoice reference. Cancel it and ask Copilot to prepare it again." : previewError || "Loading invoice and customer details for review…"}</p>
              {previewError && <button className="ghost small" onClick={() => { setPreview(null); setRetry((value) => value + 1); }}>Retry preview</button>}
            </div>
          ) : <Params input={part.input} />}
          {missingRecipient && <p className="reminder-caption">No recipient email is available to review. Cancel and check the invoice in PayPal.</p>}
          {missingPayment && <p className="reminder-caption">The payment amount, currency, and method must be specified for review. Cancel this proposal and ask Copilot to include them.</p>}
          {blocked && <p className="reminder-blocked" role="status">{blocked}</p>}
          <div className="row">
            <button className="primary" disabled={decision !== null || (invoiceTool && (!invoice || Boolean(missingRecipient) || missingPayment || Boolean(blocked)))} onClick={() => void decide(true)}>
              {decision === true ? "Confirming…" : actionButton}
            </button>
            <button className="ghost" disabled={decision !== null} onClick={() => void decide(false)}>
              {decision === false ? "Cancelling…" : name === "cancel_sent_invoice" || name === "delete_invoice" ? "Keep invoice" : "Cancel"}
            </button>
          </div>
          {decisionError && <p className="err" role="alert">{decisionError}</p>}
        </div>
      )}
      {action && state !== "approval-requested" && (
        <div className="reminder-result">
          {input.invoiceId && <div className="reminder-result-reference">Invoice {invoice?.number || input.invoiceId}</div>}
          {state === "output-available" ? action.result : state === "output-denied" || (state === "approval-responded" && !part.approval.approved) ? "Request dismissed. No change was made to the invoice." : state === "output-error" ? (part.errorText ? `PayPal refused: ${cleanPayPalError(part.errorText)}` : "PayPal did not confirm this action. Check the invoice before trying again.") : state === "approval-responded" && interrupted ? "PayPal did not confirm this action. Check the invoice before trying again." : state === "approval-responded" ? "Applying your approved action in PayPal…" : "Preparing this action for your review…"}
        </div>
      )}
      {state === "output-available" && needsApproval(name) && (
        <div className="tool-refresh">{refreshState === "refreshed" ? "Records refreshed." : refreshState === "failed" ? "Action completed, but records could not refresh. Use Refresh in the dashboard to try again." : "Refreshing records…"}</div>
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
  const scrollContent = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const refreshedCalls = useRef(new Set<string>());
  const [refreshStates, setRefreshStates] = useState<Record<string, "refreshed" | "failed">>({});

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
    const ctl = latest.controller;
    if (!ctl) return;
    const actions = completedActions(messages, refreshedCalls.current);
    if (!actions.length) return;
    void ctl.afterActions(actions.map((action) => action.name))
      .catch(() => false)
      .then((ok) => setRefreshStates((previous) => ({
        ...previous,
        ...Object.fromEntries(actions.map((action) => [action.id, ok ? "refreshed" : "failed"])),
      })));
  }, [messages]);

  useEffect(() => {
    const panel = scroller.current;
    if (panel && followOutput.current) panel.scrollTop = panel.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    const panel = scroller.current;
    const content = scrollContent.current;
    if (!panel || !content) return;
    // Tool previews can expand after their message arrives. Follow that growth
    // only while the reader is already following the end of the conversation.
    const observer = new ResizeObserver(() => {
      if (followOutput.current) panel.scrollTop = panel.scrollHeight;
    });
    observer.observe(content);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text) {
        followOutput.current = true;
        void sendMessage({ text });
      }
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
    followOutput.current = true;
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
        <button className="ghost small" onClick={() => { followOutput.current = true; setMessages([]); }} disabled={busy || messages.length === 0}>
          New chat
        </button>
      </div>
      {(context.selectedIds.length > 0 || context.filters.length > 0) && (
        <div className="chat-context-bar">
          {context.selectedIds.length > 0 && <span>{context.selectedIds.length} selected</span>}
          {context.filters.length > 0 && <span>Using the filtered view</span>}
        </div>
      )}
      <div className="chat-scroll" ref={scroller} onScroll={(event) => {
        const panel = event.currentTarget;
        followOutput.current = panel.scrollHeight - panel.clientHeight - panel.scrollTop <= 64;
      }}>
        <div className="chat-content" ref={scrollContent}>
        {messages.length === 0 && (
          <div className="suggestions">
            <div className="copilot-welcome">
              <h3>What needs your attention?</h3>
            </div>
            {suggestions.map((s) => (
              <button key={s.label} className="suggestion" disabled={loading || busy} onClick={() => { followOutput.current = true; void sendMessage({ text: s.prompt }); }}>
                <span className="suggestion-copy"><strong>{s.label}</strong><span>{s.detail}</span></span>
                <span className="suggestion-arrow" aria-hidden>↗</span>
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {orderStepParts(m.parts, needsApproval).map((part, i) => {
              if (part.type === "text") return <Markdown key={i} text={part.text} />;
              if (isToolUIPart(part)) {
                return (
                  <ToolCard
                    key={i}
                    part={part}
                    interrupted={status === "error"}
                    refreshState={refreshStates[part.toolCallId]}
                    onApprove={async (id, approved) => { await addToolApprovalResponse({ id, approved }); }}
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
