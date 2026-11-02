"use client";

import { useCallback, useEffect, useState } from "react";
import type { Brief as BriefT } from "@/lib/brief";
import type { ViewId } from "@/lib/tools";

type Props = {
  onShow: (view: ViewId, ids: string[]) => void;
};

function money(v: number, cur: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${v.toFixed(0)} ${cur}`;
  }
}

export function Brief({ onShow }: Props) {
  const [brief, setBrief] = useState<BriefT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const fetchBrief = useCallback(async (): Promise<BriefT> => {
    const res = await fetch("/api/brief", { cache: "no-store" });
    const json = (await res.json()) as { brief?: BriefT; error?: string };
    if (!res.ok || !json.brief) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json.brief;
  }, []);

  useEffect(() => {
    let alive = true;
    fetchBrief()
      .then((b) => {
        if (alive) setBrief(b);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load brief");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [fetchBrief]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setBrief(await fetchBrief());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load brief");
    } finally {
      setLoading(false);
    }
  };

  const m = brief?.metrics;

  return (
    <section className={`brief${collapsed ? " collapsed" : ""}`}>
      <div className="brief-head">
        <div className="brief-title">
          <span className="eyebrow">Morning brief</span>
          <h2>{loading && !brief ? "Reading your account…" : brief?.headline ?? (error ? "Brief unavailable" : "")}</h2>
          {error && <div className="err small">{error}</div>}
        </div>
        <div className="row">
          <button className="ghost small" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button className="ghost small" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="brief-body">
          {m && (
            <div className="metrics">
              <Metric label="Gross, 30d" value={money(m.gross30d, m.currency)} />
              <Metric label="Fees, 30d" value={money(m.fees30d, m.currency)} />
              <Metric label="Refunds, 30d" value={money(m.refunds30d, m.currency)} />
              <Metric label="Open invoices" value={money(m.openInvoicesTotal, m.currency)} />
              <Metric label="Overdue" value={money(m.overdueInvoicesTotal, m.currency)} tone={m.overdueInvoicesTotal > 0 ? "warn" : undefined} />
              <Metric label="In dispute" value={money(m.openDisputesTotal, m.currency)} tone={m.openDisputesTotal > 0 ? "bad" : undefined} />
            </div>
          )}
          <div className="brief-items">
            {brief?.items.map((it, i) => (
              <article key={i} className={`brief-item sev-${it.severity}`}>
                <div className="brief-item-title">{it.title}</div>
                <p>{it.detail}</p>
                <div className="row">
                  <button className="ghost small" onClick={() => onShow(it.view, it.ids)}>
                    Show in grid
                  </button>
                  <button
                    className="link small"
                    onClick={() => window.dispatchEvent(new CustomEvent("ledgerly:prompt", { detail: it.suggestedPrompt }))}
                  >
                    Ask copilot →
                  </button>
                </div>
              </article>
            ))}
            {loading && !brief && [0, 1, 2].map((i) => <div key={i} className="brief-item skeleton" />)}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" | "bad" }) {
  return (
    <div className={`metric${tone ? ` ${tone}` : ""}`}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}
