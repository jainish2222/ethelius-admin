"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, right } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { StatCard } from "@/components/shared/stat-card";
import { useReportFilters } from "@/features/reports/report-filters";
import { monthLabel } from "@/lib/dates";
import { formatCompact } from "@/lib/money";

type Row = { company: string; project: string; month: string; invoices: number; invoiceAmount: number; tax: number; total: number; received: number; outstanding: number };
type Summary = { invoiceAmount: number; total: number; received: number; outstanding: number };

export default function RevenueReportPage() {
  const filters = useReportFilters();
  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { id: "company", header: "Company", enableSorting: false, cell: ({ row }) => <span className="font-semibold">{row.original.company}</span> },
    { id: "project", header: "Project", enableSorting: false, cell: ({ row }) => row.original.project },
    { id: "month", header: "Month", enableSorting: false, cell: ({ row }) => <span className="whitespace-nowrap">{monthLabel(row.original.month, "short")}</span> },
    { id: "invoiceAmount", header: "Invoice amount", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.invoiceAmount} /> },
    { id: "tax", header: "Tax", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.tax} tone="muted" /> },
    { id: "total", header: "Total invoiced", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.total} className="font-semibold" /> },
    { id: "received", header: "Received", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.received} tone={row.original.received ? "success" : "muted"} /> },
    { id: "outstanding", header: "Outstanding", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.outstanding} tone={row.original.outstanding ? "warning" : "muted"} className="font-semibold" /> },
  ], []);

  return (
    <>
      <PageHeader eyebrow="Reports" title="Revenue" description="Invoiced against received, by company, project and billing month. All amounts in INR; foreign-currency invoices use their recorded exchange rate." />
      <DataTable<Row, Summary>
        endpoint="/api/reports/revenue"
        exportKey="report-revenue"
        columns={columns}
        filters={filters}
        defaultPageSize={50}
        searchPlaceholder="Search…"
        getRowId={(r) => `${r.company}|${r.project}|${r.month}`}
        summary={(s, loading) => (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Invoice amount" value={formatCompact(s?.invoiceAmount ?? 0)} loading={loading} tone="info" hint="Before tax" />
            <StatCard label="Total invoiced" value={formatCompact(s?.total ?? 0)} loading={loading} tone="brand" hint="Including tax" />
            <StatCard label="Received" value={formatCompact(s?.received ?? 0)} loading={loading} tone="success" hint={s?.total ? `${Math.round((s.received / s.total) * 100)}% collected` : undefined} />
            <StatCard label="Outstanding" value={formatCompact(s?.outstanding ?? 0)} loading={loading} tone="warning" />
          </div>
        )}
        empty={{ icon: TrendingUp, title: "No revenue in this range" }}
      />
    </>
  );
}
