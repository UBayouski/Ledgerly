"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Row } from "@/lib/data";
import { VIEWS, type ViewId } from "@/lib/tools";
import { Brief } from "./Brief";
import { Chat, type ChatController } from "./Chat";
import { Grid, type GridHandle, type ShowCommand } from "./Grid";
import { VIEW_LABELS } from "./columns";
import type { GridContext } from "./grid-context";
import { affectedViews } from "@/lib/tool-policy";

type Cache = Partial<Record<ViewId, { rows: Row[]; fetchedAt: string }>>;

export function Dashboard({ sandbox, modelLabel }: { sandbox: boolean; modelLabel: string }) {
  const [view, setView] = useState<ViewId>("invoices");
  const [cache, setCache] = useState<Cache>({});
  const [loading, setLoading] = useState<Partial<Record<ViewId, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<ViewId, string>>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [gridContext, setGridContext] = useState<GridContext | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const refreshQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const requestVersions = useRef<Partial<Record<ViewId, number>>>({});
  const gridRef = useRef<GridHandle>(null);
  const pending = useRef<ShowCommand | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  const reload = useCallback(async (v: ViewId, force = false): Promise<{ rows: Row[]; ok: boolean }> => {
    const hit = cacheRef.current[v];
    if (hit && !force) return { rows: hit.rows, ok: true };
    const version = (requestVersions.current[v] ?? 0) + 1;
    requestVersions.current[v] = version;
    setLoading((l) => ({ ...l, [v]: true }));
    setErrors((e) => ({ ...e, [v]: undefined }));
    try {
      const res = await fetch(`/api/data/${v}`, { cache: "no-store" });
      const json = (await res.json()) as { rows: Row[]; fetchedAt?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (requestVersions.current[v] !== version) return { rows: cacheRef.current[v]?.rows ?? [], ok: false };
      const entry = { rows: json.rows ?? [], fetchedAt: json.fetchedAt ?? new Date().toISOString() };
      setCache((c) => ({ ...c, [v]: entry }));
      cacheRef.current = { ...cacheRef.current, [v]: entry };
      return { rows: entry.rows, ok: true };
    } catch (e) {
      if (requestVersions.current[v] === version) setErrors((er) => ({ ...er, [v]: e instanceof Error ? e.message : "Failed to load" }));
      return { rows: cacheRef.current[v]?.rows ?? [], ok: false };
    } finally {
      if (requestVersions.current[v] === version) setLoading((l) => ({ ...l, [v]: false }));
    }
  }, []);

  const load = useCallback(async (v: ViewId, force = false) => (await reload(v, force)).rows, [reload]);

  const afterActions = useCallback((names: string[]): Promise<boolean> => {
    const views = [...new Set(names.flatMap(affectedViews))];
    if (!views.length) return Promise.resolve(true);
    setDataRevision((revision) => revision + 1);
    // Batch parallel tool results, and let a later mutation refresh after any earlier one.
    const task = refreshQueue.current.then(async () => {
      const results = await Promise.all(views.map((v) => reload(v, true)));
      return results.every((result) => result.ok);
    });
    refreshQueue.current = task.catch(() => false);
    return refreshQueue.current;
  }, [reload]);

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
        setSelected([]);
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
    afterActions,
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
      visibleRowCount: gridContext?.view === view ? gridContext.visibleRows : cacheRef.current[view]?.rows.length ?? 0,
      filters: gridContext?.view === view ? gridContext.filters : [],
    }),
  };

  const rows = cache[view]?.rows ?? [];
  const currentGridContext = gridContext?.view === view ? gridContext : null;
  const announcement = loading[view] ? `Loading ${VIEW_LABELS[view].toLowerCase()}.` : currentGridContext ? [
    `Showing ${currentGridContext.visibleRows} of ${currentGridContext.totalRows} ${VIEW_LABELS[view].toLowerCase()} records.`,
    currentGridContext.detail,
    ...currentGridContext.filters,
    `${currentGridContext.highlighted} highlighted.`,
    `${selected.length} selected.`,
  ].filter(Boolean).join(" ") : "";

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
            {loading[view] ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <Brief
        dataRevision={dataRevision}
        onShow={(v, ids) => void show(v, { highlightIds: ids })}
        onReviewOverdue={() => void show("invoices", {
          filters: [{ field: "daysOverdue", op: "greaterThan", value: 0 }],
          sort: { field: "due", dir: "desc" },
        })}
      />

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      <div className="workspace">
        <section className="panel">
          <nav className="tabs" aria-label="Record views">
            {VIEWS.map((v) => (
              <button key={v} className={`tab${v === view ? " active" : ""}`} aria-pressed={v === view} onClick={() => { if (v !== view) setSelected([]); setView(v); }}>
                {VIEW_LABELS[v]}
                {cache[v] && <span className="count">{cache[v]!.rows.length}</span>}
              </button>
            ))}
          </nav>
          {errors[view] && (
            <div className="banner err">
              <div>
                <strong>Could not {cache[view] ? "refresh" : "load"} {VIEW_LABELS[view].toLowerCase()}.</strong>{" "}
                {cache[view] ? "Your last loaded records are still shown. Check your connection and try again." : "Check your connection and try again."}
              </div>
              <button className="ghost small" onClick={() => void load(view, true)}>Retry</button>
            </div>
          )}
          <Grid key={view} ref={gridRef} view={view} rows={rows} loading={Boolean(loading[view])} loadFailed={Boolean(errors[view])} onSelectionChange={setSelected} onContextChange={setGridContext} />
          {selected.length > 0 && (
            <div className="selection-bar">
              <span>{selected.length} selected</span>
              <button
                className="link"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("ledgerly:prompt", {
                      detail: `Review my ${selected.length} selected ${view} records and tell me what needs attention.`,
                    }),
                  )
                }
              >
                Ask the copilot about these rows
              </button>
            </div>
          )}
        </section>
        <Chat controller={controller} modelLabel={modelLabel} loading={Boolean(loading[view])} />
      </div>
    </div>
  );
}
