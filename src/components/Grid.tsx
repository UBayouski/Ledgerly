"use client";

import { createElement, forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type FilterModel,
  type GridApi,
  type GridReadyEvent,
  type IRowNode,
  type ICellRendererParams,
} from "ag-grid-community";
import type { CatalogRow, DisputeRow, InvoiceRow, Row, TransactionRow } from "@/lib/data";
import type { ViewId } from "@/lib/tools";
import { COLUMNS, NUMBER_FIELDS, VIEW_LABELS } from "./columns";
import { describeGrid, type GridContext } from "./grid-context";
import { InvoiceDetails } from "./InvoiceDetails";
import { TransactionDetails } from "./TransactionDetails";
import { DisputeDetails } from "./DisputeDetails";
import { CatalogDetails } from "./CatalogDetails";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  backgroundColor: "#eef1f6",
  foregroundColor: "#0f1a2b",
  headerBackgroundColor: "#e3e8f0",
  headerTextColor: "#5a6a80",
  borderColor: "#c6d0dd",
  accentColor: "#2563eb",
  rowHoverColor: "#e6ebf3",
  selectedRowBackgroundColor: "#dbe7fb",
  chromeBackgroundColor: "#e3e8f0",
  fontFamily: "inherit",
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 500,
  spacing: 6,
  wrapperBorderRadius: 0,
  wrapperBorder: false,
});

export type FilterSpec = {
  field: string;
  op: "contains" | "equals" | "notEqual" | "greaterThan" | "lessThan" | "inRange" | "blank" | "notBlank";
  value?: string | number;
  valueTo?: string | number;
};

export type ShowCommand = {
  filters?: FilterSpec[];
  sort?: { field: string; dir: "asc" | "desc" };
  highlightIds?: string[];
  quickSearch?: string;
};

export type GridHandle = {
  apply: (cmd: ShowCommand) => { visibleRows: number; highlighted: number; unknownFields: string[] };
  snapshot: (limit: number, onlySelected: boolean) => { rows: Row[]; total: number };
  clearFilters: () => void;
  selectedIds: () => string[];
};

type Props = {
  view: ViewId;
  rows: Row[];
  loading: boolean;
  loadFailed?: boolean;
  onSelectionChange: (ids: string[]) => void;
  onContextChange: (context: GridContext) => void;
};

const EMPTY_DETAILS: Record<ViewId, string> = {
  invoices: "Invoices from your connected PayPal account will appear here once created.",
  transactions: "Payments from the last 30 days will appear here once available.",
  disputes: "Disputes from your connected PayPal account will appear here if a case is opened.",
  catalog: "Products and subscription plans will appear here once added to your PayPal account.",
};

function GridEmpty({ filtered, view, loadFailed, onClear }: {
  filtered: boolean;
  view: ViewId;
  loadFailed: boolean;
  onClear: () => void;
}) {
  return (
    <div className="grid-empty">
      <strong>{loadFailed ? "Records unavailable" : filtered ? `No matching ${view === "catalog" ? "products or plans" : VIEW_LABELS[view].toLowerCase()}` : view === "disputes" ? "No disputes to review" : `No ${view === "catalog" ? "products or plans" : VIEW_LABELS[view].toLowerCase()} yet`}</strong>
      <p>{loadFailed ? "Use Retry above to load your records." : filtered ? "Try another search or clear the current filters." : EMPTY_DETAILS[view]}</p>
      {!loadFailed && filtered && <button className="ghost" onClick={onClear}>Clear search and filters</button>}
    </div>
  );
}

export const Grid = forwardRef<GridHandle, Props>(function Grid({ view, rows, loading, loadFailed = false, onSelectionChange, onContextChange }, ref) {
  const apiRef = useRef<GridApi | null>(null);
  const [quickFilter, setQuickFilter] = useState("");
  const [allColumns, setAllColumns] = useState(false);
  const [context, setContext] = useState<GridContext | null>(null);
  // Row id of the record whose details panel is open (invoices and transactions have one).
  const [detailId, setDetailId] = useState<string | null>(null);
  const closeDetails = useCallback(() => setDetailId(null), []);
  const invoice = view === "invoices" ? rows.find((row): row is InvoiceRow => "due" in row && row.id === detailId) : undefined;
  const transaction = view === "transactions" ? rows.find((row): row is TransactionRow => "eventCode" in row && row.id === detailId) : undefined;
  const dispute = view === "disputes" ? rows.find((row): row is DisputeRow => "daysToRespond" in row && row.id === detailId) : undefined;
  const catalogItem = view === "catalog" ? rows.find((row): row is CatalogRow => "productId" in row && row.id === detailId) : undefined;
  const highlight = useRef<Set<string>>(new Set());

  const columnDefs = useMemo<ColDef[]>(() => COLUMNS[view].map((column) => {
    if (view === "invoices" && column.field === "number") return {
      ...column,
      cellRenderer: (p: ICellRendererParams<InvoiceRow>) => createElement("button", {
        className: "link invoice-number-link",
        "aria-label": `View invoice ${p.value || p.data?.id} details`,
        "aria-haspopup": "dialog",
        onClick: () => { if (p.data) setDetailId(p.data.id); },
      }, p.value || "View invoice"),
    };
    return column.hide ? { ...column, hide: !allColumns } : column;
  }), [view, allColumns]);
  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true, filter: true, resizable: true, floatingFilter: false, suppressHeaderMenuButton: false,
      getQuickFilterText: (p) => `${p.value ?? ""} ${String(p.value ?? "").replace(/_/g, " ")}`,
      tooltipValueGetter: (p) => p.valueFormatted ?? String(p.value ?? ""),
    }),
    [],
  );

  const updateContext = useCallback((api: GridApi) => {
    const visible: Row[] = [];
    api.forEachNodeAfterFilterAndSort((node) => { if (node.data) visible.push(node.data as Row); });
    const summary = describeGrid({
      view, rows: visible, totalRows: rows.length,
      filterModel: api.getFilterModel(), search: api.getGridOption("quickFilterText") ?? "",
      highlightedIds: highlight.current, columns: COLUMNS[view],
      sorted: api.getColumnState().some((column) => (column.sort ?? null) !== (COLUMNS[view].find((def) => def.field === column.colId)?.sort ?? null)),
    });
    setContext(summary);
    onContextChange(summary);
  }, [view, rows.length, onContextChange]);

  const clearView = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    highlight.current = new Set();
    api.setFilterModel(null);
    api.setGridOption("quickFilterText", "");
    setQuickFilter("");
    api.applyColumnState({ state: COLUMNS[view].filter((column) => column.sort === "asc" || column.sort === "desc").map((column) => ({ colId: column.field!, sort: column.sort === "asc" ? "asc" : "desc" })), defaultState: { sort: null } });
    api.redrawRows();
    updateContext(api);
  }, [view, updateContext]);

  const onGridReady = useCallback((e: GridReadyEvent) => {
    apiRef.current = e.api;
    updateContext(e.api);
  }, [updateContext]);

  useImperativeHandle(
    ref,
    () => ({
      apply: (cmd) => {
        const api = apiRef.current;
        if (!api) return { visibleRows: 0, highlighted: 0, unknownFields: [] };
        const known = new Set(COLUMNS[view].map((c) => c.field as string));
        const unknownFields: string[] = [];
        const model: FilterModel = {};
        for (const f of cmd.filters ?? []) {
          if (!known.has(f.field)) {
            unknownFields.push(f.field);
            continue;
          }
          const isNum = NUMBER_FIELDS[view].has(f.field);
          if (f.op === "blank" || f.op === "notBlank") {
            model[f.field] = { filterType: isNum ? "number" : "text", type: f.op };
          } else if (isNum) {
            model[f.field] = {
              filterType: "number",
              type: f.op,
              filter: Number(f.value),
              filterTo: f.valueTo !== undefined ? Number(f.valueTo) : undefined,
            };
          } else {
            const op = f.op === "greaterThan" || f.op === "lessThan" || f.op === "inRange" ? "contains" : f.op;
            model[f.field] = { filterType: "text", type: op, filter: String(f.value ?? "") };
          }
        }
        api.setFilterModel(cmd.filters ? model : null);
        if (cmd.sort && known.has(cmd.sort.field)) {
          api.applyColumnState({ state: [{ colId: cmd.sort.field, sort: cmd.sort.dir }], defaultState: { sort: null } });
        }
        api.setGridOption("quickFilterText", cmd.quickSearch ?? "");
        setQuickFilter(cmd.quickSearch ?? "");
        highlight.current = new Set(cmd.highlightIds ?? []);
        api.redrawRows();
        const nodes: IRowNode[] = [];
        for (const id of highlight.current) {
          const n = api.getRowNode(id);
          if (n) nodes.push(n);
        }
        if (nodes.length) {
          api.ensureNodeVisible(nodes[0], "middle");
          api.flashCells({ rowNodes: nodes, flashDuration: 1500, fadeDuration: 1000 });
        }
        updateContext(api);
        return { visibleRows: api.getDisplayedRowCount(), highlighted: nodes.length, unknownFields };
      },
      snapshot: (limit, onlySelected) => {
        const api = apiRef.current;
        if (!api) return { rows: [], total: 0 };
        if (onlySelected) {
          const sel = api.getSelectedRows() as Row[];
          return { rows: sel.slice(0, limit), total: sel.length };
        }
        const out: Row[] = [];
        let total = 0;
        api.forEachNodeAfterFilterAndSort((n) => {
          total += 1;
          if (out.length < limit && n.data) out.push(n.data as Row);
        });
        return { rows: out, total };
      },
      clearFilters: clearView,
      selectedIds: () => (apiRef.current?.getSelectedRows() as Row[] | undefined)?.map((r) => r.id) ?? [],
    }),
    [view, clearView, updateContext],
  );

  return (
    <div className="grid-shell">
      <div className={`grid-context${context?.canClear ? " focused" : ""}`}>
        <div className="grid-context-copy">
          <div className="grid-context-title">
            <strong>{loading ? "Loading records…" : context?.title ?? "Your records"}</strong>
            {!loading && Boolean(context?.highlighted) && <span className="context-highlight">{context!.highlighted} highlighted</span>}
            {!loading && context?.detail && <span className="grid-context-total">{context.detail}</span>}
          </div>
          {!loading && Boolean(context?.filters.length) && <div className="grid-context-filters">{context!.filters.join(" · ")}</div>}
        </div>
        {context?.canClear && <button className="link small" onClick={clearView}>Clear view</button>}
      </div>
      <div className="grid-toolbar">
        <input
          className="quick"
          placeholder={`Search ${view === "catalog" ? "products and plans" : view}`}
          value={quickFilter}
          aria-label={`Search ${view === "catalog" ? "products and plans" : view}`}
          onChange={(e) => {
            setQuickFilter(e.target.value);
            apiRef.current?.setGridOption("quickFilterText", e.target.value);
          }}
        />
        <span className="muted small">{loading ? "Loading…" : context && context.visibleRows !== rows.length ? `${context.visibleRows} of ${rows.length} ${rows.length === 1 ? "record" : "records"}` : `${rows.length} ${rows.length === 1 ? "record" : "records"}`}</span>
        {COLUMNS[view].some((column) => column.hide) && (
          <button className="ghost column-toggle" aria-pressed={allColumns} onClick={() => setAllColumns((v) => !v)}>
            {allColumns ? "Show fewer columns" : "Show all columns"}
          </button>
        )}
      </div>
      <div className="grid-body">
        <AgGridReact
          key={view}
          theme={theme}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(p) => String((p.data as Row).id)}
          rowSelection={{ mode: "multiRow", checkboxes: true, headerCheckbox: true, enableClickSelection: false }}
          selectionColumnDef={{ width: 42, minWidth: 42, maxWidth: 42, resizable: false, cellClass: "invoice-selection-cell" }}
          quickFilterText={quickFilter}
          includeHiddenColumnsInQuickFilter
          rowHeight={58}
          loading={loading && rows.length === 0}
          animateRows
          scrollbarWidth={10}
          onGridReady={onGridReady}
          onModelUpdated={(e) => updateContext(e.api)}
          onRowClicked={(e) => {
            if (!e.data) return;
            const target = e.event?.target;
            if (target instanceof Element && target.closest("button, a, input, .ag-selection-checkbox, .invoice-selection-cell")) return;
            setDetailId((e.data as Row).id);
          }}
          onCellKeyDown={(e) => {
            if (!e.data || (e.event as KeyboardEvent | undefined)?.key !== "Enter") return;
            if (!("column" in e) || e.column?.getColId() === "ag-Grid-SelectionColumn") return;
            setDetailId((e.data as Row).id);
          }}
          onSelectionChanged={(e) => onSelectionChange((e.api.getSelectedRows() as Row[]).map((r) => r.id))}
          rowClassRules={{
            "row-highlight": (p) => highlight.current.has(String((p.data as Row | undefined)?.id)),
            "invoice-row": () => true,
            "tall-row": () => true,
          }}
          suppressOverlays={["noRows", "noMatchingRows"]}
        />
        {!loading && context?.visibleRows === 0 && (
          <div className="grid-empty-layer">
            <GridEmpty filtered={rows.length > 0} view={view} loadFailed={loadFailed && rows.length === 0} onClear={clearView} />
          </div>
        )}
      </div>
      {invoice && <InvoiceDetails invoice={invoice} onClose={closeDetails} onAsk={(prompt) => {
        setDetailId(null);
        window.dispatchEvent(new CustomEvent("ledgerly:prompt", { detail: prompt }));
      }} />}
      {transaction && <TransactionDetails transaction={transaction} onClose={closeDetails} onAsk={(prompt) => {
        setDetailId(null);
        window.dispatchEvent(new CustomEvent("ledgerly:prompt", { detail: prompt }));
      }} />}
      {dispute && <DisputeDetails dispute={dispute} onClose={closeDetails} onAsk={(prompt) => {
        setDetailId(null);
        window.dispatchEvent(new CustomEvent("ledgerly:prompt", { detail: prompt }));
      }} />}
      {catalogItem && <CatalogDetails item={catalogItem} catalog={rows.filter((row): row is CatalogRow => "productId" in row)} onClose={closeDetails} onAsk={(prompt) => {
        setDetailId(null);
        window.dispatchEvent(new CustomEvent("ledgerly:prompt", { detail: prompt }));
      }} />}
    </div>
  );
});
