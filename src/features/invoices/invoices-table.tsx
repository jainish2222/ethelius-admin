"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Ban, Eye, HandCoins, Pencil, Plus, Receipt, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, right, type Filter } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { useApi, useApiMutation, useCompanyOptions, useProjectOptions } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { Options } from "@/lib/constants";
import { formatDate, monthLabel, todayDateOnly } from "@/lib/dates";
import { InvoiceFormDrawer, type InvoiceForForm } from "./invoice-form";
import { PaymentFormDrawer } from "@/features/payments/payment-form";
import type { InvoiceRow } from "@/types";

export const INVOICE_INVALIDATE = ["/api/invoices", "/api/payments", "/api/companies", "/api/projects", "/api/dashboard", "/api/reports"];

export function useInvoiceActions() {
  const { confirm, dialog } = useConfirm();
  const status = useApiMutation(({ id, action }: { id: string; action: "send" | "cancel" | "reopen" }) => api.post(`/api/invoices/${id}/status`, { action }), {
    success: (_r, v) => ({ send: "Invoice marked as sent", cancel: "Invoice cancelled", reopen: "Invoice reopened as a draft" })[v.action],
    invalidate: INVOICE_INVALIDATE,
  });
  const archive = useApiMutation((id: string) => api.delete(`/api/invoices/${id}`), { success: "Invoice archived", invalidate: INVOICE_INVALIDATE });
  const cancel = async (r: { id: string; invoiceNumber: string }) => {
    if ((await confirm({ title: `Cancel ${r.invoiceNumber}?`, description: "A cancelled invoice stays on record but no longer counts as revenue or a receivable.", confirmLabel: "Cancel invoice", destructive: true })).ok) status.mutate({ id: r.id, action: "cancel" });
  };
  const remove = async (r: { id: string; invoiceNumber: string }) => {
    if ((await confirm({ title: `Archive ${r.invoiceNumber}?`, description: "Archived invoices are hidden but never deleted.", confirmLabel: "Archive", destructive: true })).ok) archive.mutate(r.id);
  };
  return { status, cancel, remove, dialog };
}

export function InvoicesTable({ params, hideCompany, hideProject }: { params?: { companyId?: string; projectId?: string }; hideCompany?: boolean; hideProject?: boolean }) {
  const { can } = useSession();
  const write = can("billing.write");
  const companies = useCompanyOptions(!hideCompany);
  const projects = useProjectOptions(!hideProject);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const editingInv = useApi<InvoiceForForm>(editing && editing !== "new" ? `/api/invoices/${editing}` : null);
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const actions = useInvoiceActions();
  const today = todayDateOnly();

  const columns = useMemo<ColumnDef<InvoiceRow, unknown>[]>(() => [
    {
      id: "invoiceNumber", header: "Invoice",
      cell: ({ row: { original: i } }) => (
        <div>
          <p className="num font-semibold">{i.invoiceNumber}</p>
          <p className="text-[12px] text-muted-foreground">{formatDate(i.invoiceDate)}</p>
        </div>
      ),
    },
    ...(hideCompany ? [] : [{
      id: "company", header: "Company",
      cell: ({ row: { original: i } }: { row: { original: InvoiceRow } }) => (
        <div className="min-w-0 max-w-[220px]"><p className="truncate font-medium">{i.company.name}</p>{!hideProject && <p className="truncate text-[12px] text-muted-foreground">{i.project?.name ?? "—"}</p>}</div>
      ),
    }]),
    ...(hideCompany && !hideProject ? [{ id: "project", header: "Project", enableSorting: false, cell: ({ row }: { row: { original: InvoiceRow } }) => <span className="font-medium">{row.original.project?.name ?? "—"}</span> }] : []),
    { id: "billingMonth", header: "Month", cell: ({ row }) => <span className="whitespace-nowrap">{row.original.billingMonth ? monthLabel(row.original.billingMonth, "short") : "—"}</span> },
    {
      id: "dueDate", header: "Due",
      cell: ({ row: { original: i } }) => <span className={`num whitespace-nowrap ${i.outstanding > 0 && i.dueDate < today && !["DRAFT", "CANCELLED"].includes(i.status) ? "font-semibold text-danger" : ""}`}>{formatDate(i.dueDate)}</span>,
    },
    { id: "total", header: "Total", meta: right, cell: ({ row }) => <Money value={row.original.total} currency={row.original.currency} className="font-semibold" /> },
    { id: "received", header: "Received", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.amountSettled} currency={row.original.currency} tone={row.original.amountSettled ? undefined : "muted"} /> },
    {
      id: "outstanding", header: "Outstanding", enableSorting: false, meta: right,
      cell: ({ row: { original: i } }) => ["CANCELLED", "DRAFT"].includes(i.status) ? <span className="text-muted-foreground/60">—</span>
        : <Money value={i.outstanding} currency={i.currency} tone={i.outstanding ? (i.status === "OVERDUE" ? "danger" : "warning") : "success"} />,
    },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ], [hideCompany, hideProject, today]);

  const filters: Filter[] = [
    { type: "select", key: "status", label: "Status", options: Options.invoiceStatus },
    { type: "month", key: "month", label: "Billing month" },
  ];
  if (!hideCompany) filters.push({ type: "combo", key: "companyId", label: "Company", options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })) });
  if (!hideProject) filters.push({ type: "combo", key: "projectId", label: "Project", options: (projects.data ?? []).filter((p) => !params?.companyId || p.companyId === params.companyId).map((p) => ({ value: p.id, label: p.name, description: p.code })) });
  filters.push({ type: "dateRange", from: "from", to: "to", label: "Invoice date" });

  return (
    <>
      <DataTable<InvoiceRow>
        endpoint="/api/invoices"
        exportKey="invoices"
        params={params}
        syncFromUrl={!params}
        columns={columns}
        defaultSort={{ id: "invoiceDate", desc: true }}
        searchPlaceholder="Search invoice number, company or project…"
        rowHref={(i) => `/invoices/${i.id}`}
        filters={filters}
        toolbar={write && <Button className="h-9 rounded-[10px]" onClick={() => setEditing("new")}><Plus className="size-4" /> New invoice</Button>}
        rowActions={() => [
          { label: "View", icon: Eye, href: (r) => `/invoices/${r.id}` },
          { label: "Record payment", icon: HandCoins, hidden: (r) => !can("payment.write") || !["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(r.status), onSelect: setPaying },
          { label: "Edit draft", icon: Pencil, hidden: (r) => !write || r.status !== "DRAFT", onSelect: (r) => setEditing(r.id) },
          { label: "Mark as sent", icon: Send, hidden: (r) => !write || r.status !== "DRAFT", onSelect: (r) => actions.status.mutate({ id: r.id, action: "send" }) },
          { label: "Reopen as draft", icon: RotateCcw, hidden: (r) => !write || r.status !== "CANCELLED", onSelect: (r) => actions.status.mutate({ id: r.id, action: "reopen" }) },
          { label: "Cancel", icon: Ban, destructive: true, separatorBefore: true, hidden: (r) => !write || r.status === "CANCELLED" || r.paymentCount > 0, onSelect: actions.cancel },
          { label: "Archive", icon: Archive, destructive: true, hidden: (r) => !write || r.paymentCount > 0, onSelect: actions.remove },
        ]}
        empty={{ icon: Receipt, title: "No invoices", description: "Generate monthly invoices from Monthly billing, or create one by hand." }}
      />
      <InvoiceFormDrawer
        open={editing === "new" || (!!editing && !!editingInv.data)}
        onOpenChange={(o) => !o && setEditing(null)}
        invoice={editing && editing !== "new" ? editingInv.data : null}
        preset={{ companyId: params?.companyId, projectId: params?.projectId }}
      />
      <PaymentFormDrawer open={!!paying} onOpenChange={(o) => !o && setPaying(null)} preset={paying ? { companyId: paying.company.id, invoiceId: paying.id } : undefined} />
      {actions.dialog}
    </>
  );
}
