"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Brief as BriefT } from "@/lib/brief";
import type { ViewId } from "@/lib/tools";

type Props = {
  dataRevision?: number;
  onShow: (view: ViewId, ids: string[]) => void;
  onReviewOverdue: () => void;
};

function money(v: number, cur: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${v.toFixed(0)} ${cur}`;
  }
}

export function Brief({ onShow, onReviewOverdue, dataRevision = 0 }: Props) {
  const [brief, setBrief] = useState<BriefT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const initialRevision = useRef(dataRevision);
  const [briefRevision, setBriefRevision] = useState(dataRevision);
  const stale = dataRevision > briefRevision;
  // One row of cards is visible by default; the row holds as many as fit.
  const itemsRef = useRef<HTMLDivElement>(null);
  const [perRow, setPerRow] = useState(3);
  useEffect(() => {
    const el = itemsRef.current;
    if (!el) return;
    const measure = () => {
      const cols = getComputedStyle(el).gridTemplateColumns.split(" ").filter((c) => c !== "0px").length;
      setPerRow(Math.max(1, cols));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [brief]);

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
        if (alive) {
          setBrief(b);
          setBriefRevision(initialRevision.current);
        }
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
    const revision = dataRevision;
    setLoading(true);
    setError(null);
    try {
      setBrief(await fetchBrief());
      setBriefRevision(revision);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load brief");
    } finally {
      setLoading(false);
    }
  };

  const m = brief?.metrics;
  // Strict severity order: urgent, attention, good. When the row cannot hold
  // everything, one good-news card moves up into the last visible slot so a
  // small screen still shows something positive; the rest fold.
  const ordered = [...(brief?.items ?? [])].sort((a, b) =>
    ["urgent", "attention", "good"].indexOf(a.severity) - ["urgent", "attention", "good"].indexOf(b.severity),
  );
  const items = (() => {
    if (ordered.length <= perRow) return ordered;
    const goodIndex = ordered.findIndex((it) => it.severity === "good");
    if (perRow < 2 || goodIndex < perRow) return ordered;
    const good = ordered[goodIndex];
    const without = ordered.filter((it) => it !== good);
    return [...without.slice(0, perRow - 1), good, ...without.slice(perRow - 1)];
  })();
  const hidden = Math.max(0, items.length - perRow);

  return (
    <section className={`brief${collapsed ? " collapsed" : ""}`}>
      <div className="brief-head">
        <div className="brief-title">
          <div className="brief-kicker">{today()}</div>
          <h2>{loading && !brief ? "Reading your account…" : brief?.headline ?? (error ? "The brief could not be loaded" : "")}</h2>
          {error && <div className="err small">{brief ? "Couldn’t refresh the brief. Showing the previous summary." : "The account brief is temporarily unavailable. You can still work with your records below."}</div>}
          {stale && <div className="brief-stale small">Account changed. Refresh this brief to update its summary.</div>}
        </div>
        <div className="row">
          {m && m.overdueInvoicesTotal > 0 && (
            <button className="primary brief-review" onClick={onReviewOverdue}>Review overdue invoices <span aria-hidden>→</span></button>
          )}
          <button className="ghost small" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : stale ? "Refresh brief" : "Refresh"}
          </button>
          <button className="ghost small" aria-expanded={!collapsed} aria-controls="brief-content" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>
      <div id="brief-content" className="brief-fold" aria-hidden={collapsed} inert={collapsed}>
        <div>
          <div className="brief-body">
            {loading && !brief && (
              <div className="ledger-groups" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="ledger-group skeleton-group">
                    <div className="skeleton skeleton-line short" />
                    <div className="skeleton skeleton-line" />
                    <div className="skeleton skeleton-line" />
                  </div>
                ))}
              </div>
            )}
            {m && (
              <div className="ledger-groups">
                <section className="ledger-group" aria-labelledby="revenue-heading">
                  <h3 id="revenue-heading">Revenue <span>Last 30 days</span></h3>
                  <dl className="ledger-col">
                    <Metric label="Gross payments" value={money(m.gross30d, m.currency)} />
                    <Metric label="Fees paid" value={money(m.fees30d, m.currency)} />
                    <Metric label="Refunded" value={money(m.refunds30d, m.currency)} />
                  </dl>
                </section>
                <section className="ledger-group" aria-labelledby="invoices-heading">
                  <h3 id="invoices-heading">Invoices</h3>
                  <dl className="ledger-col">
                    <Metric label="Open invoices" value={money(m.openInvoicesTotal, m.currency)} />
                    <Metric label="Overdue" value={money(m.overdueInvoicesTotal, m.currency)} tone={m.overdueInvoicesTotal > 0 ? "warn" : undefined} />
                  </dl>
                </section>
                <section className="ledger-group" aria-labelledby="disputes-heading">
                  <h3 id="disputes-heading">Disputes</h3>
                  <dl className="ledger-col">
                    <Metric label="In dispute" value={money(m.openDisputesTotal, m.currency)} tone={m.openDisputesTotal > 0 ? "bad" : undefined} />
                  </dl>
                </section>
              </div>
            )}
            <div className="brief-items" ref={itemsRef}>
              {(showAll ? items : items.slice(0, perRow)).map((it, i) => (
                <article key={i} className={`brief-item sev-${it.severity}`}>
                  <span className="ink-dot" aria-hidden />
                  <div>
                    <div className="brief-item-title">{it.title}</div>
                    <p>{it.detail}</p>
                  </div>
                  <div className="row">
                    <button className="small" onClick={() => onShow(it.view, it.ids)}>
                      Show in grid
                    </button>
                    <button
                      className="link small"
                      onClick={() => window.dispatchEvent(new CustomEvent("ledgerly:prompt", { detail: it.suggestedPrompt }))}
                    >
                      Ask the copilot
                    </button>
                  </div>
                </article>
              ))}
              {loading && !brief &&
                [0, 1, 2].map((i) => (
                  <div key={i} className="brief-item skeleton-card" aria-hidden>
                    <span className="ink-dot skeleton" />
                    <div>
                      <div className="skeleton skeleton-line title" />
                      <div className="skeleton skeleton-line" />
                      <div className="skeleton skeleton-line short" />
                    </div>
                  </div>
                ))}
              {hidden > 0 && (
                <button className="ghost small brief-more" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show fewer updates" : `View ${hidden} more ${hidden === 1 ? "update" : "updates"}`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" | "bad" }) {
  return (
    <div className={`ledger-row${tone ? ` ${tone}` : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function today(): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
}
