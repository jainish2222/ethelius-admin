"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Eye, FolderKanban, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, right } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { ProjectFormDrawer, type ProjectForForm } from "@/features/projects/project-form";
import { useApi, useApiMutation, useCompanyOptions, useEmployeeOptions } from "@/hooks/use-api";
import { useQueryFlag } from "@/hooks/use-query-flag";
import { api } from "@/lib/api/client";
import { BILLING_TYPE, Options, label } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import type { ProjectRow } from "@/types";

export default function ProjectsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { can } = useSession();
  const finance = can("billing.read");
  const [open, setOpen] = useQueryFlag("new");
  const [presetCompany] = useState(() => search.get("companyId") ?? undefined);
  const [editing, setEditing] = useState<string | null>(null);
  const editingProject = useApi<ProjectForForm>(editing ? `/api/projects/${editing}` : null);
  const companies = useCompanyOptions();
  const managers = useEmployeeOptions();
  const { confirm, dialog } = useConfirm();
  const archive = useApiMutation((id: string) => api.delete(`/api/projects/${id}`), { success: "Project archived", invalidate: ["/api/projects", "/api/companies"] });

  const columns = useMemo<ColumnDef<ProjectRow, unknown>[]>(() => {
    const cols: ColumnDef<ProjectRow, unknown>[] = [
      {
        id: "name", header: "Project",
        cell: ({ row: { original: p } }) => (
          <div className="min-w-0 max-w-[260px]">
            <p className="truncate font-semibold">{p.name}</p>
            <p className="truncate text-[12px] text-muted-foreground"><span className="num">{p.code}</span> · {p.company.name}</p>
          </div>
        ),
      },
      { id: "manager", header: "Manager", enableSorting: false, cell: ({ row }) => <span className="text-[13px]">{row.original.manager?.fullName ?? <span className="text-muted-foreground">—</span>}</span> },
      { id: "headcount", header: "Team", enableSorting: false, meta: right, cell: ({ row }) => <span className="num">{row.original.headcount}</span> },
      {
        id: "monthlyBillingAmount", header: "Billing",
        cell: ({ row: { original: p } }) => (
          <div className="whitespace-nowrap">
            <p className="text-[13px]">{label(BILLING_TYPE, p.billingType)}</p>
            {p.monthlyBillingAmount != null && <p className="text-[12px] text-muted-foreground"><Money value={p.monthlyBillingAmount} currency={p.currency} compact />/mo</p>}
          </div>
        ),
      },
      { id: "startDate", header: "Timeline", cell: ({ row: { original: p } }) => <span className="num whitespace-nowrap text-[13px]">{formatDate(p.startDate)} – {p.endDate ? formatDate(p.endDate) : "ongoing"}</span> },
    ];
    if (finance) {
      cols.push(
        { id: "invoiced", header: "Invoiced", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.invoiced} compact /> },
        { id: "outstanding", header: "Outstanding", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.outstanding} compact tone={row.original.outstanding ? "warning" : "muted"} /> },
      );
    }
    cols.push({ id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> });
    return cols;
  }, [finance]);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Client engagements, who runs them, and how they bill."
        actions={can("project.write") && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4" /> New project</Button>}
      />
      <DataTable<ProjectRow>
        endpoint="/api/projects"
        exportKey="projects"
        columns={columns}
        defaultSort={{ id: "name", desc: false }}
        searchPlaceholder="Search project, code or company…"
        rowHref={(p) => `/projects/${p.id}`}
        filters={[
          { type: "select", key: "status", label: "Status", options: Options.projectStatus },
          { type: "combo", key: "companyId", label: "Company", options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
          { type: "select", key: "billingType", label: "Billing", options: Options.billingType },
          { type: "combo", key: "managerId", label: "Manager", options: (managers.data ?? []).map((m) => ({ value: m.id, label: m.fullName })) },
        ]}
        rowActions={() => [
          { label: "View", icon: Eye, href: (r) => `/projects/${r.id}` },
          { label: "Edit", icon: Pencil, hidden: () => !can("project.write"), onSelect: (r) => { setEditing(r.id); setOpen(true); } },
          {
            label: "Archive", icon: Archive, destructive: true, separatorBefore: true, hidden: () => !can("project.write"),
            onSelect: async (r) => { if ((await confirm({ title: `Archive ${r.name}?`, description: "End its active assignments first. Invoices and payments remain on record.", confirmLabel: "Archive", destructive: true })).ok) archive.mutate(r.id); },
          },
        ]}
        empty={{ icon: FolderKanban, title: "No projects yet", description: "Create a project under a company, then assign people to it." }}
      />
      <ProjectFormDrawer
        open={open && (!editing || !!editingProject.data)}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}
        project={editing ? editingProject.data : null}
        presetCompanyId={presetCompany}
        onSaved={(id) => { if (!editing) router.push(`/projects/${id}`); }}
      />
      {dialog}
    </>
  );
}
