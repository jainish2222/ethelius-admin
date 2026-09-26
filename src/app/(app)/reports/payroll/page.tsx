"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, right } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { StatCard } from "@/components/shared/stat-card";
import { useReportFilters } from "@/features/reports/report-filters";
import { useEmployeeOptions } from "@/hooks/use-api";
import { monthLabel } from "@/lib/dates";
import { formatCompact } from "@/lib/money";

type Row = {
  id: string; month: string; employee: string; employeeCode: string; employeeId: string; project: string; company: string;
  gross: number; pf: number; pt: number; tds: number; otherDeductions: number; totalDeductions: number; net: number; bankCredit: number | null;
};
type Summary = { gross: number; pf: number; pt: number; tds: number; deductions: number; net: number; bankCredit: number; employerCost: number };

export default function PayrollReportPage() {
  const filters = useReportFilters();
  const employees = useEmployeeOptions(true);
  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { id: "month", header: "Month", enableSorting: false, cell: ({ row }) => <span className="whitespace-nowrap">{monthLabel(row.original.month, "short")}</span> },
    {
      id: "employee", header: "Employee", enableSorting: false,
      cell: ({ row: { original: r } }) => <div><Link href={`/employees/${r.employeeId}`} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>{r.employee}</Link><p className="text-[12px] text-muted-foreground">{r.employeeCode}</p></div>,
    },
    { id: "project", header: "Project", enableSorting: false, cell: ({ row }) => <div className="max-w-[180px]"><p className="truncate">{row.original.project}</p><p className="truncate text-[12px] text-muted-foreground">{row.original.company}</p></div> },
    { id: "gross", header: "Gross", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.gross} decimals={0} /> },
    { id: "pf", header: "PF", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.pf} decimals={0} tone="muted" /> },
    { id: "pt", header: "PT", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.pt} decimals={0} tone="muted" /> },
    { id: "tds", header: "TDS", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.tds} decimals={0} tone="muted" /> },
    { id: "deductions", header: "Deductions", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.totalDeductions} decimals={0} /> },
    { id: "net", header: "Net salary", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.net} decimals={0} className="font-semibold" /> },
    { id: "bank", header: "Bank credit", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.bankCredit} decimals={0} tone={row.original.bankCredit != null && row.original.bankCredit !== row.original.net ? "warning" : undefined} /> },
  ], []);

  return (
    <>
      <PageHeader eyebrow="Reports" title="Payroll" description="The payroll register — gross, statutory deductions, net salary and what was actually credited, with the project each person was mostly on." />
      <DataTable<Row, Summary>
        endpoint="/api/reports/payroll"
        exportKey="report-payroll"
        columns={columns}
        filters={[...filters, { type: "combo", key: "employeeId", label: "Employee", options: (employees.data ?? []).map((e) => ({ value: e.id, label: e.fullName })) }]}
        defaultPageSize={50}
        compact
        searchPlaceholder="Search employee…"
        summary={(s, loading) => (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Gross earnings" value={formatCompact(s?.gross ?? 0)} loading={loading} tone="info" hint={`Employer cost ${formatCompact(s?.employerCost ?? 0)}`} />
            <StatCard label="PF · PT · TDS" value={formatCompact((s?.pf ?? 0) + (s?.pt ?? 0) + (s?.tds ?? 0))} loading={loading} tone="warning" hint={`PF ${formatCompact(s?.pf ?? 0)} · PT ${formatCompact(s?.pt ?? 0)} · TDS ${formatCompact(s?.tds ?? 0)}`} />
            <StatCard label="Net salary" value={formatCompact(s?.net ?? 0)} loading={loading} tone="brand" />
            <StatCard label="Bank credit" value={formatCompact(s?.bankCredit ?? 0)} loading={loading} tone="success" />
          </div>
        )}
        empty={{ icon: BarChart3, title: "No payroll in this range" }}
      />
    </>
  );
}
