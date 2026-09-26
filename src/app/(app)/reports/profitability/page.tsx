"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FolderKanban } from "lucide-react";
import { cn } from "cn";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, right } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useReportFilters } from "@/features/reports/report-filters";
import { Options } from "@/lib/constants";
import { formatCompact } from "@/lib/money";
import type { Profitability } from "@/types";

type Row = Profitability & { id: string; project: string; code: string; status: string; company: string; headcount: number };
type Summary = Omit<Profitability, "months">;

const pct = (v: number | null) => (v == null ? <span className="text-muted-foreground/60">—</span> : <span className={cn("num text-[12.5px] font-semibold", v < 0 ? "text-danger" : v < 20 ? "text-warning" : "text-success")}>{v.toFixed(1)}%</span>);

export default function ProfitabilityReportPage() {
  const filters = useReportFilters();
  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    {
      id: "project", header: "Project", enableSorting: false,
      cell: ({ row: { original: r } }) => <div className="max-w-[220px]"><p className="truncate font-semibold">{r.project}</p><p className="truncate text-[12px] text-muted-foreground">{r.company} · {r.headcount} people</p></div>,
    },
    { id: "status", header: "Status", enableSorting: false, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "expected", header: "Expected revenue", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.expectedRevenue} decimals={0} /> },
    { id: "received", header: "Received revenue", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.receivedRevenue} decimals={0} tone="muted" /> },
    { id: "cost", header: "Employee cost", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.employeeCost} decimals={0} /> },
    { id: "expenses", header: "Expenses", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.expenses} decimals={0} tone="muted" /> },
    {
      id: "margin", header: "Est. gross margin", enableSorting: false, meta: right,
      cell: ({ row: { original: r } }) => <div className="text-right"><Money value={r.expectedMargin} decimals={0} tone={r.expectedMargin < 0 ? "danger" : undefined} className="font-semibold" /><div>{pct(r.expectedMarginPct)}</div></div>,
    },
    {
      id: "actual", header: "Cash margin", enableSorting: false, meta: right,
      cell: ({ row: { original: r } }) => <div className="text-right"><Money value={r.actualMargin} decimals={0} tone={r.actualMargin < 0 ? "danger" : "muted"} /><div>{pct(r.actualMarginPct)}</div></div>,
    },
  ], []);

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Project profitability"
        description="Revenue − employee cost − project expenses. Expected margin uses what was invoiced; cash margin uses what has actually been received."
      />
      <DataTable<Row, Summary>
        endpoint="/api/reports/profitability"
        exportKey="report-profitability"
        columns={columns}
        filters={[...filters, { type: "select", key: "status", label: "Status", options: Options.projectStatus }]}
        defaultPageSize={25}
        searchPlaceholder="Search…"
        rowHref={(r) => `/projects/${r.id}`}
        summary={(s, loading) => (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Expected revenue" value={formatCompact(s?.expectedRevenue ?? 0)} loading={loading} tone="info" hint={`Received ${formatCompact(s?.receivedRevenue ?? 0)}`} />
            <StatCard label="Employee cost" value={formatCompact(s?.employeeCost ?? 0)} loading={loading} tone="neutral" hint={`+ ${formatCompact(s?.expenses ?? 0)} expenses`} />
            <StatCard label="Estimated gross margin" value={formatCompact(s?.expectedMargin ?? 0)} loading={loading} tone="success" hint={s?.expectedMarginPct != null ? `${s.expectedMarginPct}% of invoiced` : undefined} />
            <StatCard label="Cash margin" value={formatCompact(s?.actualMargin ?? 0)} loading={loading} tone="brand" hint={s?.actualMarginPct != null ? `${s.actualMarginPct}% of received` : undefined} />
          </div>
        )}
        empty={{ icon: FolderKanban, title: "No projects match" }}
      />
    </>
  );
}
