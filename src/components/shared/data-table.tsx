"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState, type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, FileType2, ListFilter, MoreHorizontal, Search, X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useList } from "@/hooks/use-api";
import { useDebounced } from "@/hooks/use-debounced";
import { qs, type Params } from "@/lib/api/client";
import { formatDate } from "@/lib/dates";
import { GlassCard } from "./glass-card";
import { EmptyState, ErrorState } from "./states";
import { Combobox, DatePicker, MonthPicker } from "./pickers";

export type Filter =
  | { type: "select"; key: string; label: string; options: { value: string; label: string }[] }
  | { type: "combo"; key: string; label: string; options: { value: string; label: string; description?: string }[] }
  | { type: "month"; key: string; label: string }
  | { type: "dateRange"; from: string; to: string; label: string };

export type RowAction<T> = {
  label: string;
  icon?: LucideIcon;
  onSelect?: (row: T) => void;
  href?: (row: T) => string;
  destructive?: boolean;
  hidden?: (row: T) => boolean;
  separatorBefore?: boolean;
};

type Props<T, S> = {
  endpoint: string;
  columns: ColumnDef<T, unknown>[];
  /** Enables the export menu, using /api/export/{exportKey} with the current filters. */
  exportKey?: string;
  filters?: Filter[];
  /** Fixed query params (e.g. scoping to one employee). */
  params?: Params;
  defaultSort?: { id: string; desc: boolean };
  defaultPageSize?: number;
  searchPlaceholder?: string;
  rowHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => RowAction<T>[];
  toolbar?: React.ReactNode;
  /** Renders above the table using the response summary. */
  summary?: (summary: S | undefined, loading: boolean) => React.ReactNode;
  empty?: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode };
  selectable?: boolean;
  bulkActions?: (rows: T[], clear: () => void) => React.ReactNode;
  getRowId?: (row: T) => string;
  /** Read initial filter values from the page URL (default true). */
  syncFromUrl?: boolean;
  className?: string;
  compact?: boolean;
};

const PAGE_SIZES = [10, 25, 50, 100];

export function DataTable<T extends object, S = unknown>({
  endpoint, columns, exportKey, filters = [], params, defaultSort, defaultPageSize = 25, searchPlaceholder = "Search…",
  rowHref, onRowClick, rowActions, toolbar, summary, empty, selectable, bulkActions, getRowId, syncFromUrl = true, className, compact,
}: Props<T, S>) {
  const router = useRouter();
  const search = useSearchParams();
  const filterKeys = useMemo(() => filters.flatMap((f) => (f.type === "dateRange" ? [f.from, f.to] : [f.key])), [filters]);

  const [q, setQ] = useState(() => (syncFromUrl ? search.get("q") ?? "" : ""));
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (syncFromUrl) for (const k of filterKeys) { const v = search.get(k); if (v) init[k] = v; }
    return init;
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sorting, setSorting] = useState<SortingState>(defaultSort ? [defaultSort] : []);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const term = useDebounced(q, 300);

  useEffect(() => setPage(1), [term, values, pageSize]);

  const queryParams: Params = {
    ...params,
    ...values,
    q: term || undefined,
    page,
    pageSize,
    sort: sorting[0]?.id,
    order: sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined,
  };
  const { data, isLoading, isFetching, error, refetch } = useList<T, S>(endpoint, queryParams);
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const allColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    const cols = [...columns];
    if (selectable) {
      cols.unshift({
        id: "_select",
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all rows"
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} onClick={(e) => e.stopPropagation()} />
        ),
        meta: { className: "w-10" },
      });
    }
    if (rowActions) {
      cols.push({
        id: "_actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <RowMenu row={row.original} actions={rowActions(row.original)} />,
        meta: { className: "w-12 text-right" },
      });
    }
    return cols;
  }, [columns, rowActions, selectable]);

  const table = useReactTable({
    data: rows,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    enableSortingRemoval: false,
    state: { sorting, rowSelection: selection },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    enableRowSelection: selectable,
    getRowId: getRowId ?? ((r, i) => (r as { id?: string }).id ?? String(i)),
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const activeFilterCount = Object.values(values).filter(Boolean).length;
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const setFilter = (k: string, v: string | null) => setValues((cur) => {
    const next = { ...cur };
    if (v) next[k] = v; else delete next[k];
    return next;
  });

  const exportHref = (format: string) => {
    const { page: _p, pageSize: _s, ...rest } = queryParams;
    return `/api/export/${exportKey}${qs({ ...rest, format })}`;
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {summary?.((data as { summary?: S } | undefined)?.summary, isLoading)}

      <GlassCard className="overflow-hidden">
        {/* toolbar */}
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:p-4 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-[300px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="h-9 rounded-[10px] pl-9 text-[13.5px]" aria-label="Search" />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {filters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {filters.map((f) => <FilterControl key={f.type === "dateRange" ? f.from : f.key} filter={f} values={values} setFilter={setFilter} />)}
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setValues({})} className="text-muted-foreground">
                  <X className="size-3.5" /> Clear
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 lg:ml-auto">
            {toolbar}
            {exportKey && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 rounded-[10px]"><Download className="size-4" /> Export</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Exports use the current filters</DropdownMenuLabel>
                  <DropdownMenuItem asChild><a href={exportHref("csv")} download><FileText className="size-4" /> CSV</a></DropdownMenuItem>
                  <DropdownMenuItem asChild><a href={exportHref("xlsx")} download><FileSpreadsheet className="size-4" /> Excel</a></DropdownMenuItem>
                  <DropdownMenuItem asChild><a href={exportHref("pdf")} download><FileType2 className="size-4" /> PDF</a></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {selectable && selectedRows.length > 0 && bulkActions && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-brand-soft/50 px-4 py-2.5 text-[13px]">
            <span className="font-semibold">{selectedRows.length} selected</span>
            {bulkActions(selectedRows, () => setSelection({}))}
            <Button variant="ghost" size="sm" onClick={() => setSelection({})} className="ml-auto">Clear selection</Button>
          </div>
        )}

        {error ? (
          <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
        ) : (
          <div className={cn("scroll-thin relative overflow-x-auto transition-opacity", isFetching && !isLoading && "opacity-70")}>
            <Table className="text-[13.5px]">
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="border-border hover:bg-transparent">
                    {hg.headers.map((h) => {
                      const meta = h.column.columnDef.meta as { className?: string; align?: "right" } | undefined;
                      const sortable = h.column.getCanSort();
                      const dir = h.column.getIsSorted();
                      return (
                        <TableHead key={h.id} className={cn("h-10 px-4 text-[11.5px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase", meta?.align === "right" && "text-right", meta?.className)}>
                          {h.isPlaceholder ? null : sortable ? (
                            <button
                              type="button"
                              onClick={h.column.getToggleSortingHandler()}
                              className={cn("inline-flex items-center gap-1 uppercase transition-colors hover:text-foreground", dir && "text-foreground", meta?.align === "right" && "flex-row-reverse")}
                              aria-label={`Sort by ${String(h.column.columnDef.header)}`}
                            >
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {dir === "asc" ? <ArrowUp className="size-3" /> : dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                            </button>
                          ) : (
                            flexRender(h.column.columnDef.header, h.getContext())
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      {allColumns.map((_c, j) => (
                        <TableCell key={j} className="px-4 py-3"><Skeleton className={cn("h-4", j === 0 ? "w-40" : "w-20")} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={allColumns.length} className="p-0">
                      <EmptyState
                        icon={empty?.icon ?? ListFilter}
                        title={term || activeFilterCount ? "No results match" : empty?.title ?? "Nothing here yet"}
                        description={term || activeFilterCount ? "Try a different search or clear the filters." : empty?.description}
                        action={term || activeFilterCount ? <Button variant="outline" size="sm" onClick={() => { setQ(""); setValues({}); }}>Clear filters</Button> : empty?.action}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => {
                    const clickable = !!rowHref || !!onRowClick;
                    return (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() ? "selected" : undefined}
                        className={cn("border-border transition-colors duration-150", clickable && "cursor-pointer")}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("a,button,[role=checkbox],[role=menuitem]")) return;
                          if (onRowClick) onRowClick(row.original);
                          else if (rowHref) router.push(rowHref(row.original));
                        }}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const meta = cell.column.columnDef.meta as { className?: string; align?: "right" } | undefined;
                          return (
                            <TableCell key={cell.id} className={cn("px-4", compact ? "py-2" : "py-3", meta?.align === "right" && "text-right", meta?.className)}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* pagination */}
        <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 text-[12.5px] text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger size="sm" className="h-8 w-[72px] rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <span className="num">{total ? `${from}–${to} of ${total.toLocaleString("en-IN")}` : "0 results"}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
              <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight className="size-4" /></Button>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

const ALL = "__all__";

function FilterControl({ filter: f, values, setFilter }: { filter: Filter; values: Record<string, string>; setFilter: (k: string, v: string | null) => void }) {
  if (f.type === "select") {
    return (
      <Select value={values[f.key] ?? ALL} onValueChange={(v) => setFilter(f.key, v === ALL ? null : v)}>
        <SelectTrigger size="sm" className={cn("h-9 min-w-[130px] rounded-[10px] text-[13px]", values[f.key] && "border-brand/50 bg-brand-soft/40")} aria-label={f.label}>
          <SelectValue placeholder={f.label} />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={ALL}>Any {f.label.toLowerCase()}</SelectItem>
          {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (f.type === "combo") {
    return (
      <div className="w-[190px]">
        <Combobox value={values[f.key] ?? null} onChange={(v) => setFilter(f.key, v)} options={f.options} placeholder={f.label} clearable className={cn("h-9 text-[13px]", values[f.key] && "border-brand/50 bg-brand-soft/40")} />
      </div>
    );
  }
  if (f.type === "month") {
    return (
      <div className="w-[170px]">
        <MonthPicker value={values[f.key] ?? null} onChange={(v) => setFilter(f.key, v)} placeholder={f.label} clearable className={cn("h-9 text-[13px]", values[f.key] && "border-brand/50 bg-brand-soft/40")} />
      </div>
    );
  }
  const active = values[f.from] || values[f.to];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-9 rounded-[10px] text-[13px] font-normal", active && "border-brand/50 bg-brand-soft/40")}>
          {active ? `${values[f.from] ? formatDate(values[f.from]) : "…"} – ${values[f.to] ? formatDate(values[f.to]) : "…"}` : f.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px]">
        <p className="mb-3 text-[13px] font-semibold">{f.label}</p>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><span className="text-[12px] text-muted-foreground">From</span><DatePicker value={values[f.from]} onChange={(v) => setFilter(f.from, v)} clearable /></div>
          <div className="grid gap-1.5"><span className="text-[12px] text-muted-foreground">To</span><DatePicker value={values[f.to]} onChange={(v) => setFilter(f.to, v)} clearable /></div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RowMenu<T>({ row, actions }: { row: T; actions: RowAction<T>[] }) {
  const router = useRouter();
  const visible = actions.filter((a) => !a.hidden?.(row));
  if (!visible.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Row actions" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        {visible.map((a) => (
          <div key={a.label}>
            {a.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={a.destructive ? "destructive" : "default"}
              onSelect={() => (a.href ? router.push(a.href(row)) : a.onSelect?.(row))}
            >
              {a.icon && <a.icon className="size-4" />} {a.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Column helper for right-aligned numeric cells. */
export const right = { align: "right" as const };
