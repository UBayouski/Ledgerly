"use client";

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  colorSchemeDark,
  themeQuartz,
  type ColDef,
  type FilterModel,
  type GridApi,
  type GridReadyEvent,
  type IRowNode,
} from "ag-grid-community";
import type { Row } from "@/lib/data";
import type { ViewId } from "@/lib/tools";
import { COLUMNS, NUMBER_FIELDS } from "./columns";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: "#0f141b",
  foregroundColor: "#d7dee8",
  headerBackgroundColor: "#121922",
  headerTextColor: "#8b98a9",
  borderColor: "#1f2733",
  accentColor: "#3b82f6",
  rowHoverColor: "#16202b",
  selectedRowBackgroundColor: "#1b2a3d",
  fontFamily: "inherit",
  fontSize: 13,
  headerFontSize: 12,
  spacing: 6,
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
  onSelectionChange: (ids: string[]) => void;
};

export const Grid = forwardRef<GridHandle, Props>(function Grid({ view, rows, loading, onSelectionChange }, ref) {
  const apiRef = useRef<GridApi | null>(null);
  const [quickFilter, setQuickFilter] = useState("");
  const highlight = useRef<Set<string>>(new Set());

  const columnDefs = useMemo<ColDef[]>(() => COLUMNS[view], [view]);
  const defaultColDef = useMemo<ColDef>(
    () => ({ sortable: true, filter: true, resizable: true, floatingFilter: false, suppressHeaderMenuButton: false }),
    [],
  );

  const onGridReady = useCallback((e: GridReadyEvent) => {
    apiRef.current = e.api;
  }, []);

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
      clearFilters: () => {
        apiRef.current?.setFilterModel(null);
        setQuickFilter("");
        highlight.current = new Set();
        apiRef.current?.redrawRows();
      },
      selectedIds: () => (apiRef.current?.getSelectedRows() as Row[] | undefined)?.map((r) => r.id) ?? [],
    }),
    [view],
  );

  return (
    <div className="grid-shell">
      <div className="grid-toolbar">
        <input
          className="quick"
          placeholder={`Quick filter ${view}…`}
          value={quickFilter}
          onChange={(e) => setQuickFilter(e.target.value)}
        />
        <button
          className="ghost"
          onClick={() => {
            apiRef.current?.setFilterModel(null);
            setQuickFilter("");
            highlight.current = new Set();
            apiRef.current?.redrawRows();
          }}
        >
          Clear filters
        </button>
        <span className="muted">{loading ? "Loading…" : `${rows.length} rows`}</span>
      </div>
      <div className="grid-body">
        <AgGridReact
          key={view}
          theme={theme}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(p) => String((p.data as Row).id)}
          rowSelection={{ mode: "multiRow", checkboxes: true, headerCheckbox: true, enableClickSelection: true }}
          quickFilterText={quickFilter}
          loading={loading}
          animateRows
          onGridReady={onGridReady}
          onSelectionChanged={(e) => onSelectionChange((e.api.getSelectedRows() as Row[]).map((r) => r.id))}
          rowClassRules={{ "row-highlight": (p) => highlight.current.has(String((p.data as Row | undefined)?.id)) }}
          overlayNoRowsTemplate='<div class="empty">No rows. Try the seed script in the README, or make a sandbox purchase.</div>'
        />
      </div>
    </div>
  );
});
