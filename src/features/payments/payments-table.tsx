"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, BadgeCheck, CreditCard, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, right, type Filter } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { useApiMutation, useCompanyOptions, useProjectOptions } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { Options, PAYMENT_METHOD, label } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { formatCompact } from "@/lib/money";
import { PaymentFormDrawer } from "./payment-form";
import type { PaymentRow } from "@/types";

type Summary = { settled: number; tds: number; other: number; bankCredit: number };
const INVALIDATE = ["/api/payments", "/api/invoices", "/api/companies", "/api/projects", "/api/dashboard", "/api/reports"];

export function PaymentsTable({
  params, hideCompany, showSummary, endpoint = "/api/payments", exportKey = "payments", createOpen, onCreateOpenChange,
}: {
  params?: { companyId?: string; projectId?: string; invoiceId?: string }; hideCompany?: boolean; showSummary?: boolean; endpoint?: string; exportKey?: string;
  createOpen?: boolean; onCreateOpenChange?: (o: boolean) => void;
}) {
  const { can } = useSession();
  const write = can("payment.write");
  const companies = useCompanyOptions(!hideCompany);
  const projects = useProjectOptions(!params?.projectId);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [localCreate, setLocalCreate] = useState(false);
  const creating = createOpen ?? localCreate;
  const setCreating = onCreateOpenChange ?? setLocalCreate;
  const { confirm, dialog } = useConfirm();
  const reconcile = useApiMutation((id: string) => api.post(`/api/payments/${id}/reconcile`), { success: "Payment reconciled", invalidate: INVALIDATE });
  const archive = useApiMutation((id: string) => api.delete(`/api/payments/${id}`), { success: "Payment archived — the invoice balance was restored", invalidate: INVALIDATE });

  const columns = useMemo<ColumnDef<PaymentRow, unknown>[]>(() => [
    { id: "paymentDate", header: "Date", cell: ({ row }) => <span className="num whitespace-nowrap">{formatDate(row.original.paymentDate)}</span> },
    ...(hideCompany ? [] : [{
      id: "company", header: "Company",
      cell: ({ row: { original: p } }: { row: { original: PaymentRow } }) => (
        <div className="min-w-0 max-w-[200px]"><p className="truncate font-medium">{p.company.name}</p><p className="truncate text-[12px] text-muted-foreground">{p.project?.name ?? "—"}</p></div>
      ),
    }]),
    {
      id: "invoice", header: "Invoice", enableSorting: false,
      cell: ({ row: { original: p } }) => p.invoice
        ? <Link href={`/invoices/${p.invoice.id}`} onClick={(e) => e.stopPropagation()} className="num font-medium hover:underline">{p.invoice.invoiceNumber}</Link>
        : <span className="text-[12.5px] text-muted-foreground">Advance</span>,
    },
    { id: "amountReceived", header: "Settled", meta: right, cell: ({ row }) => <Money value={row.original.amountReceived} currency={row.original.currency} /> },
    {
      id: "deductions", header: "TDS / other", enableSorting: false, meta: right,
      cell: ({ row: { original: p } }) => <Money value={p.tdsDeducted + p.otherDeduction} currency={p.currency} tone="muted" />,
    },
    { id: "bankCredit", header: "Bank credit", meta: right, cell: ({ row }) => <Money value={row.original.bankCredit} currency={row.original.currency} className="font-semibold" /> },
    {
      id: "ref", header: "Reference", enableSorting: false,
      cell: ({ row: { original: p } }) => (
        <div className="min-w-0 max-w-[180px]"><p className="num truncate text-[12.5px]">{p.utr ?? p.transactionRef ?? "—"}</p><p className="text-[12px] text-muted-foreground">{label(PAYMENT_METHOD, p.method)}</p></div>
      ),
    },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ], [hideCompany]);

  const filters: Filter[] = [{ type: "select", key: "status", label: "Status", options: Options.paymentStatus }];
  if (!hideCompany) filters.push({ type: "combo", key: "companyId", label: "Company", options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })) });
  if (!params?.projectId) filters.push({ type: "combo", key: "projectId", label: "Project", options: (projects.data ?? []).filter((p) => !params?.companyId || p.companyId === params.companyId).map((p) => ({ value: p.id, label: p.name })) });
  filters.push({ type: "select", key: "method", label: "Method", options: Options.paymentMethod });
  filters.push({ type: "dateRange", from: "from", to: "to", label: "Payment date" });

  return (
    <>
      <DataTable<PaymentRow, Summary>
        endpoint={endpoint}
        exportKey={exportKey}
        params={params}
        syncFromUrl={!params}
        columns={columns}
        defaultSort={{ id: "paymentDate", desc: true }}
        searchPlaceholder="Search reference, UTR, company or invoice…"
        onRowClick={write ? (p) => setEditing(p) : undefined}
        filters={filters}
        summary={showSummary ? (s, loading) => (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Settled against invoices" value={formatCompact(s?.settled ?? 0)} loading={loading} tone="info" hint="Received & reconciled, TDS included" />
            <StatCard label="TDS deducted" value={formatCompact(s?.tds ?? 0)} loading={loading} tone="warning" hint="Claimable against tax" />
            <StatCard label="Other deductions" value={formatCompact(s?.other ?? 0)} loading={loading} tone="neutral" hint="Bank charges, short payments" />
            <StatCard label="Actual bank credit" value={formatCompact(s?.bankCredit ?? 0)} loading={loading} tone="success" hint="Cash that reached the bank" />
          </div>
        ) : undefined}
        toolbar={write && <Button className="h-9 rounded-[10px]" onClick={() => setCreating(true)}><Plus className="size-4" /> Record payment</Button>}
        rowActions={() => [
          { label: "Edit", icon: Pencil, hidden: () => !write, onSelect: setEditing },
          { label: "Mark reconciled", icon: BadgeCheck, hidden: (r) => !write || r.status !== "RECEIVED", onSelect: (r) => reconcile.mutate(r.id) },
          {
            label: "Archive", icon: Archive, destructive: true, separatorBefore: true, hidden: () => !write,
            onSelect: async (r) => { if ((await confirm({ title: "Archive this payment?", description: "The amount goes back onto the invoice as outstanding. The record is kept for audit.", confirmLabel: "Archive", destructive: true })).ok) archive.mutate(r.id); },
          },
        ]}
        empty={{ icon: CreditCard, title: "No payments recorded", description: "Record client payments as they land in the bank — partial payments are fine." }}
      />
      <PaymentFormDrawer open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} payment={editing} preset={{ companyId: params?.companyId, invoiceId: params?.invoiceId }} />
      {dialog}
    </>
  );
}
