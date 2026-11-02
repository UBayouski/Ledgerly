"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Row } from "@/lib/data";
import { VIEWS, type ViewId } from "@/lib/tools";
import { Brief } from "./Brief";
import { Chat, type ChatController } from "./Chat";
import { Grid, type GridHandle, type ShowCommand } from "./Grid";
import { VIEW_LABELS } from "./columns";

type Cache = Partial<Record<ViewId, { rows: Row[]; fetchedAt: string }>>;

export function Dashboard({ sandbox, modelLabel }: { sandbox: boolean; modelLabel: string }) {
  const [view, setView] = useState<ViewId>("invoices");
  const [cache, setCache] = useState<Cache>({});
  const [loading, setLoading] = useState<Partial<Record<ViewId, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<ViewId, string>>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const gridRef = useRef<GridHandle>(null);
  const pending = useRef<ShowCommand | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  const load = useCallback(async (v: ViewId, force = false): Promise<Row[]> => {
    const hit = cacheRef.current[v];
    if (hit && !force) return hit.rows;
    setLoading((l) => ({ ...l, [v]: true }));
    setErrors((e) => ({ ...e, [v]: undefined }));
    try {
      const res = await fetch(`/api/data/${v}`, { cache: "no-store" });
      const json = (await res.json()) as { rows: Row[]; fetchedAt?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const entry = { rows: json.rows ?? [], fetchedAt: json.fetchedAt ?? new Date().toISOString() };
      setCache((c) => ({ ...c, [v]: entry }));
      cacheRef.current = { ...cacheRef.current, [v]: entry };
      return entry.rows;
    } catch (e) {
      setErrors((er) => ({ ...er, [v]: e instanceof Error ? e.message : "Failed to load" }));
      return [];
    } finally {
      setLoading((l) => ({ ...l, [v]: false }));
    }
  }, []);

  useEffect(() => {
    void load(view);
  }, [view, load]);

  // Apply a pending grid command once the target view's grid has mounted with data.
  useEffect(() => {
    if (!pending.current || !cache[view] || !gridRef.current) return;
    const cmd = pending.current;
    pending.current = null;
    const t = setTimeout(() => gridRef.current?.apply(cmd), 50);
    return () => clearTimeout(t);
  }, [view, cache]);

  const show = useCallback(
    async (v: ViewId, cmd: ShowCommand) => {
      await load(v);
      if (viewRef.current !== v) {
        pending.current = cmd;
        setView(v);
        // Give React a tick to mount the new grid, then apply.
        await new Promise((r) => setTimeout(r, 250));
        const res = gridRef.current?.apply(cmd) ?? { visibleRows: 0, highlighted: 0, unknownFields: [] };
        pending.current = null;
        return { ok: true, view: v, ...res };
      }
      const res = gridRef.current?.apply(cmd) ?? { visibleRows: 0, highlighted: 0, unknownFields: [] };
      return { ok: true, view: v, ...res };
    },
    [load],
  );

  const controller: ChatController = {
    show,
    snapshot: async (v, limit, onlySelected) => {
      if (v === viewRef.current && gridRef.current) {
        const snap = gridRef.current.snapshot(limit, onlySelected);
        return { view: v, ...snap };
      }
      const rows = await load(v);
      return { view: v, rows: rows.slice(0, limit), total: rows.length };
    },
    getContext: () => ({
      view: viewRef.current,
      selectedIds: selected,
      rowCount: cacheRef.current[viewRef.current]?.rows.length ?? 0,
    }),
  };

  const rows = cache[view]?.rows ?? [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden />
          <span>Ledgerly</span>
          <span className={`env ${sandbox ? "sandbox" : "live"}`}>{sandbox ? "Sandbox" : "Live"}</span>
        </div>
        <div className="row">
          <span className="muted small">
            {cache[view]?.fetchedAt ? `Updated ${new Date(cache[view]!.fetchedAt).toLocaleTimeString()}` : ""}
          </span>
          <button className="ghost small" onClick={() => void load(view, true)} disabled={loading[view]}>
            Refresh
          </button>
        </div>
      </header>

      <Brief onShow={(v, ids) => void show(v, { highlightIds: ids })} />

      <div className="workspace">
        <section className="panel">
          <nav className="tabs">
            {VIEWS.map((v) => (
              <button key={v} className={`tab${v === view ? " active" : ""}`} onClick={() => setView(v)}>
                {VIEW_LABELS[v]}
                {cache[v] && <span className="count">{cache[v]!.rows.length}</span>}
              </button>
            ))}
          </nav>
          {errors[view] && (
            <div className="banner err">
              <strong>Could not load {VIEW_LABELS[view].toLowerCase()}.</strong> {errors[view]}
            </div>
          )}
          <Grid ref={gridRef} view={view} rows={rows} loading={Boolean(loading[view])} onSelectionChange={setSelected} />
          {selected.length > 0 && (
            <div className="selection-bar">
              {selected.length} selected ·{" "}
              <button
                className="link"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("ledgerly:prompt", {
                      detail: `Look at the ${selected.length} selected ${view} rows (use get_grid_snapshot with onlySelected) and tell me what needs attention.`,
                    }),
                  )
                }
              >
                Ask copilot about selection
              </button>
            </div>
          )}
        </section>
        <Chat controller={controller} modelLabel={modelLabel} />
      </div>
    </div>
  );
}
