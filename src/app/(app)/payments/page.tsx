"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, BadgeIndianRupee, Hourglass, Receipt } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, right } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { PaymentsTable } from "@/features/payments/payments-table";
import { PaymentFormDrawer } from "@/features/payments/payment-form";
import { useCompanyOptions, useProjectOptions } from "@/hooks/use-api";
import { useQueryFlag } from "@/hooks/use-query-flag";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatCompact } from "@/lib/money";

type TrackerRow = {
  id: string; invoiceNumber: string; company: { id: string; name: string }; project: { id: string; name: string; code: string } | null;
  month: string | null; dueDate: string; currency: string; invoiced: number; expected: number; received: number; deductions: number;
  bankCredit: number; outstanding: number; lastPayment: string | null; pendingPayments: number; status: string;
};
type TrackerSummary = { invoiced: number; received: number; bankCredit: number; deductions: number; outstanding: number; overdue: number; counts: Record<string, number> };

export default function PaymentsPage() {
  const search = useSearchParams();
  const [tab, setTab] = useState(search.get("tab") === "transactions" ? "transactions" : "tracker");
  const [recording, setRecording] = useQueryFlag("new");
  const companies = useCompanyOptions();
  const projects = useProjectOptions();
  const year = new Date().getFullYear();

  const columns = useMemo<ColumnDef<TrackerRow, unknown>[]>(() => [
    {
      id: "company", header: "Company",
      cell: ({ row: { original: r } }) => <div className="min-w-0 max-w-[200px]"><p className="truncate font-semibold">{r.company.name}</p><p className="truncate text-[12px] text-muted-foreground">{r.project?.name ?? "—"}</p></div>,
    },
    { id: "month", header: "Month", cell: ({ row }) => <span className="whitespace-nowrap">{row.original.month ? monthLabel(row.original.month, "short") : "—"}</span> },
    {
      id: "invoice", header: "Invoice",
      cell: ({ row: { original: r } }) => (
        <div>
          <Link href={`/invoices/${r.id}`} onClick={(e) => e.stopPropagation()} className="num font-medium hover:underline">{r.invoiceNumber}</Link>
          <p className="text-[12px] text-muted-foreground">Due {formatDate(r.dueDate)}</p>
        </div>
      ),
    },
    { id: "invoiced", header: "Invoice amt", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.invoiced} currency={row.original.currency} compact tone="muted" /> },
    { id: "expected", header: "Expected", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.expected} currency={row.original.currency} compact /> },
    {
      id: "received", header: "Received", enableSorting: false, meta: right,
      cell: ({ row: { original: r } }) => (
        <div className="text-right">
          <Money value={r.received} currency={r.currency} compact className="font-semibold" />
          {r.bankCredit > 0 && <p className="text-[11.5px] text-muted-foreground">bank <Money value={r.bankCredit} currency={r.currency} compact /></p>}
        </div>
      ),
    },
    { id: "outstanding", header: "Outstanding", enableSorting: false, meta: right, cell: ({ row: { original: r } }) => <Money value={r.outstanding} currency={r.currency} compact tone={r.outstanding ? (r.status === "OVERDUE" ? "danger" : "warning") : "muted"} className="font-semibold" /> },
    {
      id: "status", header: "Status", enableSorting: false,
      cell: ({ row: { original: r } }) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={r.status} />
          {r.pendingPayments > 0 && <span className="text-[11px] text-muted-foreground">{r.pendingPayments} payment pending</span>}
        </div>
      ),
    },
  ], []);

  return (
    <>
      <PageHeader
        title="Client payments"
        description="What each client was invoiced, what they actually paid, and what is still owed — invoice amount and cash received are never mixed."
      />
      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList variant="line" className="h-10 gap-1 border-b border-border">
          <TabsTrigger value="tracker" className="px-3">Monthly tracker</TabsTrigger>
          <TabsTrigger value="transactions" className="px-3">Transactions</TabsTrigger>
        </TabsList>
        <TabsContent value="tracker">
          <DataTable<TrackerRow, TrackerSummary>
            endpoint="/api/payments/tracker"
            exportKey="payment-tracker"
            columns={columns}
            defaultSort={{ id: "month", desc: true }}
            searchPlaceholder="Search invoice, company or project…"
            rowHref={(r) => `/invoices/${r.id}`}
            filters={[
              { type: "combo", key: "companyId", label: "Company", options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
              { type: "combo", key: "projectId", label: "Project", options: (projects.data ?? []).map((p) => ({ value: p.id, label: p.name, description: p.company.name })) },
              { type: "month", key: "month", label: "Month" },
              { type: "select", key: "year", label: "Year", options: [year, year - 1, year - 2].map((y) => ({ value: String(y), label: String(y) })) },
              { type: "select", key: "status", label: "Status", options: [{ value: "PAID", label: "Paid" }, { value: "PARTIAL", label: "Partial" }, { value: "PENDING", label: "Pending" }, { value: "OVERDUE", label: "Overdue" }] },
              { type: "dateRange", from: "from", to: "to", label: "Payment date" },
            ]}
            summary={(s, loading) => (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                <StatCard label="Total invoiced" value={formatCompact(s?.invoiced ?? 0)} loading={loading} icon={Receipt} tone="info" hint="Expected receivable, incl. tax" />
                <StatCard label="Total received" value={formatCompact(s?.received ?? 0)} loading={loading} icon={BadgeIndianRupee} tone="success" hint={<>Bank credit <span className="num font-semibold text-foreground">{formatCompact(s?.bankCredit ?? 0)}</span> · TDS {formatCompact(s?.deductions ?? 0)}</>} />
                <StatCard label="Total outstanding" value={formatCompact(s?.outstanding ?? 0)} loading={loading} icon={Hourglass} tone="warning" hint={`${s?.counts.PENDING ?? 0} pending · ${s?.counts.PARTIAL ?? 0} partial`} />
                <StatCard label="Total overdue" value={formatCompact(s?.overdue ?? 0)} loading={loading} icon={AlertTriangle} tone="danger" emphasis={s?.overdue ? "danger" : undefined} hint={`${s?.counts.OVERDUE ?? 0} invoice${s?.counts.OVERDUE === 1 ? "" : "s"} past due`} />
              </div>
            )}
            empty={{ icon: Receipt, title: "No issued invoices", description: "Sent invoices show up here with what has been paid against them." }}
          />
        </TabsContent>
        <TabsContent value="transactions">
          <PaymentsTable showSummary createOpen={recording} onCreateOpenChange={setRecording} />
        </TabsContent>
      </Tabs>
      {/* The dashboard's "Record payment" shortcut can land on the tracker tab. */}
      {tab === "tracker" && <PaymentFormDrawer open={recording} onOpenChange={setRecording} />}
    </>
  );
}
