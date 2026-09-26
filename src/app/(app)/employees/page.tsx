"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Eye, Pencil, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, right } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { PersonCell } from "@/components/shared/person";
import { Money } from "@/components/shared/money";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { EmployeeFormDrawer } from "@/features/employees/employee-form";
import { useApi, useApiMutation, useCompanyOptions, useProjectOptions } from "@/hooks/use-api";
import { useQueryFlag } from "@/hooks/use-query-flag";
import { api } from "@/lib/api/client";
import { EMPLOYMENT_TYPE, Options, label } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import type { EmployeeRow } from "@/types";

export default function EmployeesPage() {
  const router = useRouter();
  const { can } = useSession();
  const [open, setOpen] = useQueryFlag("new");
  const { confirm, dialog } = useConfirm();
  const departments = useApi<string[]>("/api/employees/departments");
  const companies = useCompanyOptions();
  const projects = useProjectOptions();
  const [editing, setEditing] = useState<string | null>(null);
  const editingEmp = useApi<import("@/types").EmployeeDetail>(editing ? `/api/employees/${editing}` : null);

  const archive = useApiMutation((id: string) => api.delete(`/api/employees/${id}`), { success: "Employee archived", invalidate: ["/api/employees", "/api/dashboard"] });

  const columns = useMemo<ColumnDef<EmployeeRow, unknown>[]>(() => {
    const cols: ColumnDef<EmployeeRow, unknown>[] = [
      {
        id: "name", header: "Employee",
        cell: ({ row: { original: e } }) => <PersonCell id={e.id} name={e.fullName} subtitle={`${e.employeeCode} · ${e.officialEmail ?? ""}`} hasPhoto={e.hasPhoto} />,
      },
      {
        id: "designation", header: "Role",
        cell: ({ row: { original: e } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{e.designation}</p>
            <p className="truncate text-[12px] text-muted-foreground">{e.department}</p>
          </div>
        ),
      },
      {
        id: "project", header: "Project", enableSorting: false,
        cell: ({ row: { original: e } }) =>
          e.projects.length ? (
            <div className="min-w-0 max-w-[200px]">
              <p className="truncate font-medium">{e.projects.map((p) => p.name).join(", ")}</p>
              <p className="truncate text-[12px] text-muted-foreground">{[...new Set(e.projects.map((p) => p.companyName))].join(", ")}</p>
            </div>
          ) : <span className="text-[12.5px] text-muted-foreground">Bench / internal</span>,
      },
      { id: "type", header: "Type", enableSorting: false, cell: ({ row }) => <span className="text-[13px]">{label(EMPLOYMENT_TYPE, row.original.employmentType)}</span> },
      { id: "joiningDate", header: "Joined", cell: ({ row }) => <span className="num whitespace-nowrap">{formatDate(row.original.joiningDate)}</span> },
    ];
    if (can("salary.read")) {
      cols.push({ id: "ctc", header: "Annual CTC", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.currentCtc} decimals={0} /> });
    }
    cols.push({ id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> });
    return cols;
  }, [can]);

  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone on the books — their role, current project, and employment status."
        actions={can("employee.write") && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4" /> Add employee</Button>}
      />
      <DataTable<EmployeeRow>
        endpoint="/api/employees"
        exportKey="employees"
        columns={columns}
        defaultSort={{ id: "name", desc: false }}
        searchPlaceholder="Search name, ID, email or role…"
        rowHref={(e) => `/employees/${e.id}`}
        filters={[
          { type: "select", key: "status", label: "Status", options: Options.employeeStatus },
          { type: "select", key: "department", label: "Department", options: (departments.data ?? []).map((d) => ({ value: d, label: d })) },
          { type: "select", key: "employmentType", label: "Type", options: Options.employmentType },
          { type: "combo", key: "companyId", label: "Company", options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
          { type: "combo", key: "projectId", label: "Project", options: (projects.data ?? []).map((p) => ({ value: p.id, label: p.name, description: p.code })) },
          { type: "dateRange", from: "from", to: "to", label: "Joined between" },
        ]}
        rowActions={() => [
          { label: "View", icon: Eye, href: (r) => `/employees/${r.id}` },
          { label: "Edit", icon: Pencil, hidden: () => !can("employee.write"), onSelect: (r) => { setEditing(r.id); setOpen(true); } },
          {
            label: "Archive", icon: Archive, destructive: true, separatorBefore: true, hidden: () => !can("employee.write"),
            onSelect: async (r) => {
              const { ok } = await confirm({
                title: `Archive ${r.fullName}?`,
                description: "They disappear from lists and new payroll runs. Their payroll, payslips and history stay intact.",
                confirmLabel: "Archive", destructive: true,
              });
              if (ok) archive.mutate(r.id);
            },
          },
        ]}
        empty={{ icon: Users, title: "No employees yet", description: "Add your first employee to start assigning projects and running payroll." }}
      />
      <EmployeeFormDrawer
        open={open && (!editing || !!editingEmp.data)}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}
        employee={editing ? editingEmp.data : null}
        onSaved={(id) => { if (!editing) { toast.message("Next: set their salary and assign a project."); router.push(`/employees/${id}`); } }}
      />
      {dialog}
    </>
  );
}
