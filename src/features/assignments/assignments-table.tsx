"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarX2, Pencil, Plus, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, right, type Filter } from "@/components/shared/data-table";
import { PersonCell } from "@/components/shared/person";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { useApiMutation, useCompanyOptions, useEmployeeOptions, useProjectOptions } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { Options } from "@/lib/constants";
import { formatDate, todayDateOnly } from "@/lib/dates";
import { AssignmentFormDrawer } from "./assignment-form";
import type { AssignmentRow } from "@/types";

export function AssignmentsTable({ params, hideProject, hideEmployee }: { params?: { projectId?: string; companyId?: string; employeeId?: string }; hideProject?: boolean; hideEmployee?: boolean }) {
  const { can } = useSession();
  const write = can("assignment.write");
  const seeCost = can("salary.read") || can("report.project");
  const [editing, setEditing] = useState<AssignmentRow | "new" | null>(null);
  const { confirm, dialog } = useConfirm();
  const employees = useEmployeeOptions(true, !hideEmployee);
  const projects = useProjectOptions(!hideProject);
  const companies = useCompanyOptions(!params?.companyId && !hideProject);
  const end = useApiMutation((id: string) => api.post(`/api/assignments/${id}/end`, {}), { success: "Assignment ended — kept in history", invalidate: ["/api/assignments", "/api/employees", "/api/projects", "/api/companies"] });
  const today = todayDateOnly();

  const columns = useMemo<ColumnDef<AssignmentRow, unknown>[]>(() => [
    ...(hideEmployee ? [] : [{
      id: "employee", header: "Employee",
      cell: ({ row: { original: a } }: { row: { original: AssignmentRow } }) => <PersonCell id={a.employee!.id} name={a.employee!.fullName} subtitle={`${a.employee!.employeeCode} · ${a.employee!.designation}`} hasPhoto={a.employee!.hasPhoto} href={`/employees/${a.employee!.id}`} />,
    }]),
    ...(hideProject ? [] : [{
      id: "project", header: "Project",
      cell: ({ row: { original: a } }: { row: { original: AssignmentRow } }) => (
        <div className="min-w-0 max-w-[220px]">
          <Link href={`/projects/${a.project!.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:underline">{a.project!.name}</Link>
          <p className="truncate text-[12px] text-muted-foreground">{a.project!.company.name}</p>
        </div>
      ),
    }]),
    { id: "role", header: "Role", enableSorting: false, cell: ({ row }) => <span className="text-[13px]">{row.original.role}</span> },
    { id: "startDate", header: "Period", cell: ({ row: { original: a } }) => <span className="num whitespace-nowrap text-[13px]">{formatDate(a.startDate)} – {a.endDate ? formatDate(a.endDate) : "present"}</span> },
    { id: "allocation", header: "Allocation", meta: right, cell: ({ row }) => <span className="num font-semibold">{row.original.allocationPercent}%</span> },
    ...(seeCost ? [
      { id: "billingRate", header: "Billing / mo", enableSorting: false, meta: right, cell: ({ row }: { row: { original: AssignmentRow } }) => <Money value={row.original.billingRate} decimals={0} /> },
      { id: "employeeCost", header: "Cost / mo", enableSorting: false, meta: right, cell: ({ row }: { row: { original: AssignmentRow } }) => <Money value={row.original.employeeCost} decimals={0} tone="muted" /> },
    ] : []),
    {
      id: "status", header: "Status",
      cell: ({ row: { original: a } }) => {
        const current = a.status === "ACTIVE" && a.startDate <= today && (!a.endDate || a.endDate >= today);
        return current ? <StatusBadge status="ACTIVE" label="Current" /> : <StatusBadge status={a.status} />;
      },
    },
  ], [hideEmployee, hideProject, seeCost, today]);

  const filters: Filter[] = [
    { type: "select", key: "status", label: "Status", options: Options.assignmentStatus },
    { type: "select", key: "current", label: "Timeframe", options: [{ value: "true", label: "Current only" }] },
  ];
  if (!hideEmployee) filters.push({ type: "combo", key: "employeeId", label: "Employee", options: (employees.data ?? []).map((e) => ({ value: e.id, label: e.fullName, description: e.employeeCode })) });
  if (!hideProject) filters.push({ type: "combo", key: "projectId", label: "Project", options: (projects.data ?? []).filter((p) => !params?.companyId || p.companyId === params.companyId).map((p) => ({ value: p.id, label: p.name })) });
  if (!params?.companyId && !hideProject) filters.push({ type: "combo", key: "companyId", label: "Company", options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })) });

  return (
    <>
      <DataTable<AssignmentRow>
        endpoint="/api/assignments"
        exportKey="assignments"
        params={params}
        syncFromUrl={!params}
        columns={columns}
        defaultSort={{ id: "startDate", desc: true }}
        searchPlaceholder="Search employee, project or role…"
        filters={filters}
        toolbar={write && <Button className="h-9 rounded-[10px]" onClick={() => setEditing("new")}><Plus className="size-4" /> Assign</Button>}
        rowActions={() => [
          { label: "Edit", icon: Pencil, hidden: () => !write, onSelect: setEditing },
          {
            label: "End assignment", icon: CalendarX2, destructive: true, separatorBefore: true, hidden: (r) => !write || r.status === "ENDED",
            onSelect: async (r) => {
              if ((await confirm({ title: `End ${r.employee?.fullName ?? "this"} on ${r.project?.name ?? "the project"}?`, description: "The assignment is closed as of yesterday and kept in the employee's history.", confirmLabel: "End assignment", destructive: true })).ok) end.mutate(r.id);
            },
          },
        ]}
        empty={{ icon: Waypoints, title: "No assignments", description: "Assign employees to projects to track who works where and what it costs." }}
      />
      <AssignmentFormDrawer
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        assignment={editing === "new" ? null : editing}
        preset={{ projectId: params?.projectId, employeeId: params?.employeeId }}
      />
      {dialog}
    </>
  );
}
