"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Building2, Eye, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, right } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { CompanyFormDrawer, type CompanyForForm } from "@/features/companies/company-form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useQueryFlag } from "@/hooks/use-query-flag";
import { api } from "@/lib/api/client";
import { COMPANY_TYPE, Options, PAYMENT_TERMS, label } from "@/lib/constants";
import { addDays, dateOnly, formatDate, parseDateOnly, todayDateOnly } from "@/lib/dates";
import type { CompanyRow } from "@/types";

export default function CompaniesPage() {
  const router = useRouter();
  const { can } = useSession();
  const finance = can("billing.read");
  const [open, setOpen] = useQueryFlag("new");
  const [editing, setEditing] = useState<string | null>(null);
  const editingCo = useApi<CompanyForForm>(editing ? `/api/companies/${editing}` : null);
  const { confirm, dialog } = useConfirm();
  const archive = useApiMutation((id: string) => api.delete(`/api/companies/${id}`), { success: "Company archived", invalidate: ["/api/companies"] });

  const columns = useMemo<ColumnDef<CompanyRow, unknown>[]>(() => {
    const soon = dateOnly(addDays(parseDateOnly(todayDateOnly()), 60));
    const cols: ColumnDef<CompanyRow, unknown>[] = [
      {
        id: "name", header: "Company",
        cell: ({ row: { original: c } }) => (
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-muted text-[13px] font-bold">{c.name.slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{c.name}</p>
              <p className="truncate text-[12px] text-muted-foreground">{label(COMPANY_TYPE, c.type)} · {c.billingEmail ?? c.legalName ?? ""}</p>
            </div>
          </div>
        ),
      },
      { id: "projects", header: "Projects", enableSorting: false, meta: right, cell: ({ row }) => <span className="num">{row.original.projectCount}</span> },
      { id: "people", header: "People", enableSorting: false, meta: right, cell: ({ row }) => <span className="num">{row.original.employeeCount}</span> },
      { id: "terms", header: "Terms", enableSorting: false, cell: ({ row }) => <span className="text-[13px]">{label(PAYMENT_TERMS, row.original.paymentTerms)} · {row.original.currency}</span> },
      {
        id: "contractEnd", header: "Contract ends",
        cell: ({ row: { original: c } }) => c.contractEnd
          ? <span className={`num whitespace-nowrap text-[13px] ${c.contractEnd <= soon && c.contractEnd >= todayDateOnly() ? "font-semibold text-warning" : ""}`}>{formatDate(c.contractEnd)}</span>
          : <span className="text-muted-foreground/60">—</span>,
      },
    ];
    if (finance) {
      cols.push(
        { id: "invoiced", header: "Invoiced", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.invoiced} compact /> },
        { id: "outstanding", header: "Outstanding", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.outstanding} compact tone={row.original.overdue ? "danger" : undefined} className="font-semibold" /> },
      );
    }
    cols.push({ id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> });
    return cols;
  }, [finance]);

  return (
    <>
      <PageHeader
        title="Companies"
        description="Clients, their contracts, and how much they owe."
        actions={can("company.write") && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4" /> Add company</Button>}
      />
      <DataTable<CompanyRow>
        endpoint="/api/companies"
        exportKey="companies"
        columns={columns}
        defaultSort={{ id: "name", desc: false }}
        searchPlaceholder="Search name, GST or email…"
        rowHref={(c) => `/companies/${c.id}`}
        filters={[
          { type: "select", key: "status", label: "Status", options: Options.companyStatus },
          { type: "select", key: "type", label: "Type", options: Options.companyType },
        ]}
        rowActions={() => [
          { label: "View", icon: Eye, href: (r) => `/companies/${r.id}` },
          { label: "Edit", icon: Pencil, hidden: () => !can("company.write"), onSelect: (r) => { setEditing(r.id); setOpen(true); } },
          {
            label: "Archive", icon: Archive, destructive: true, separatorBefore: true, hidden: () => !can("company.write"),
            onSelect: async (r) => { if ((await confirm({ title: `Archive ${r.name}?`, description: "Only possible once its projects are no longer active. Invoices and payments stay on record.", confirmLabel: "Archive", destructive: true })).ok) archive.mutate(r.id); },
          },
        ]}
        empty={{ icon: Building2, title: "No companies yet", description: "Add a client company, then create its projects." }}
      />
      <CompanyFormDrawer
        open={open && (!editing || !!editingCo.data)}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}
        company={editing ? editingCo.data : null}
        onSaved={(id) => { if (!editing) router.push(`/companies/${id}`); }}
      />
      {dialog}
    </>
  );
}
