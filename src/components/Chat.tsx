"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

export type ChatContext = { view: ViewId; selectedIds: string[]; rowCount: number };

export type ChatController = {
  /** Switch view (loading data if needed) and apply grid commands. */
  show: (view: ViewId, cmd: ShowCommand) => Promise<{ ok: boolean; view: ViewId; visibleRows: number; highlighted: number; unknownFields: string[] }>;
  snapshot: (view: ViewId, limit: number, onlySelected: boolean) => Promise<{ view: ViewId; rows: unknown[]; total: number }>;
  getContext: () => ChatContext;
};

const SUGGESTIONS = [
  "Who owes me money? Show overdue invoices sorted by amount.",
  "Summarize the last 30 days: gross, fees, refunds, and top customers.",
  "Any disputes that need a response this week? What should I do?",
  "Draft reminders for every invoice more than 14 days overdue.",
];

function humanTool(name: string): string {
  return name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
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
          <pre>{JSON.stringify(part.input, null, 2)}</pre>
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

export function Chat({ controller, modelLabel }: { controller: ChatController; modelLabel: string }) {
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
          <div className="chat-title">Copilot</div>
          <div className="muted small">{modelLabel} + PayPal Agent Toolkit</div>
        </div>
        <button className="ghost small" onClick={() => setMessages([])} disabled={busy || messages.length === 0}>
          New chat
        </button>
      </div>
      <div className="chat-scroll" ref={scroller}>
        {messages.length === 0 && (
          <div className="suggestions">
            <div className="muted">Try asking</div>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="suggestion" onClick={() => void sendMessage({ text: s })}>
                {s}
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
        {error && <div className="msg error">{error.message}</div>}
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
          placeholder="Ask about your PayPal account, or tell me what to do…"
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
    </aside>
  );
}
