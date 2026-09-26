"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Drawer } from "@/components/shared/overlays";
import {
  applyServerErrors, ComboField, CurrencyField, DateField, Form, FormSection, NumberField, SelectField, TextField, TextareaField,
} from "@/components/shared/form-field";
import { useApiMutation, useEmployeeOptions, useProjectOptions } from "@/hooks/use-api";
import { useSession } from "@/components/providers/session";
import { api } from "@/lib/api/client";
import { Options } from "@/lib/constants";
import { todayDateOnly } from "@/lib/dates";
import { assignmentSchema, type AssignmentInput } from "@/validations/business";
import type { AssignmentRow } from "@/types";

export function AssignmentFormDrawer({
  open, onOpenChange, assignment, preset,
}: { open: boolean; onOpenChange: (o: boolean) => void; assignment?: AssignmentRow | null; preset?: { employeeId?: string; projectId?: string } }) {
  const { can } = useSession();
  const employees = useEmployeeOptions(false, open);
  const projects = useProjectOptions(open);
  const seeCost = can("salary.read") || can("report.project");

  const empty: AssignmentInput = {
    employeeId: preset?.employeeId ?? "", projectId: preset?.projectId ?? "", role: "", startDate: todayDateOnly(), endDate: "",
    allocationPercent: 100, billingRate: null, employeeCost: null, status: "ACTIVE", notes: "",
  };
  const form = useForm({ resolver: zodResolver(assignmentSchema), defaultValues: empty });

  useEffect(() => {
    if (!open) return;
    form.reset(assignment ? {
      employeeId: assignment.employeeId, projectId: assignment.projectId, role: assignment.role, startDate: assignment.startDate,
      endDate: assignment.endDate ?? "", allocationPercent: assignment.allocationPercent, billingRate: assignment.billingRate,
      employeeCost: assignment.employeeCost, status: assignment.status as AssignmentInput["status"], notes: assignment.notes ?? "",
    } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignment]);

  const save = useApiMutation(
    (v: unknown) => (assignment ? api.put(`/api/assignments/${assignment.id}`, v) : api.post("/api/assignments", v)),
    {
      success: assignment ? "Assignment updated" : "Employee assigned",
      invalidate: ["/api/assignments", "/api/employees", "/api/projects", "/api/companies"],
      onSuccess: () => onOpenChange(false),
    },
  );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={assignment ? "Edit assignment" : "Assign to project"}
      description="An employee can be on several projects at once, up to 100% in total. Moving projects? End the old assignment so the history stays."
      formId="assignment-form"
      submitLabel={assignment ? "Save" : "Assign"}
      pending={save.isPending}
    >
      <Form form={form} id="assignment-form" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
        <FormSection>
          <ComboField
            name="employeeId" label="Employee" required full disabled={!!assignment || !!preset?.employeeId} loading={employees.isLoading}
            options={(employees.data ?? []).map((e) => ({ value: e.id, label: e.fullName, description: e.employeeCode }))}
          />
          <ComboField
            name="projectId" label="Project" required full disabled={!!assignment || !!preset?.projectId} loading={projects.isLoading}
            options={(projects.data ?? []).filter((p) => !["COMPLETED", "CANCELLED"].includes(p.status) || p.id === assignment?.projectId)
              .map((p) => ({ value: p.id, label: p.name, description: p.company.name, group: p.company.name }))}
          />
          <TextField name="role" label="Role on project" required placeholder="Backend Engineer" />
          <NumberField name="allocationPercent" label="Allocation" min={1} max={100} suffix="%" required />
          <DateField name="startDate" label="Start date" required />
          <DateField name="endDate" label="End date" clearable hint="Leave open for ongoing work" />
          <SelectField name="status" label="Status" options={Options.assignmentStatus} required />
        </FormSection>
        {seeCost && (
          <FormSection title="Commercials" description="Monthly figures used for project profitability when payroll isn't available.">
            <CurrencyField name="billingRate" label="Billing rate / month" />
            <CurrencyField name="employeeCost" label="Employee cost / month" />
          </FormSection>
        )}
        <TextareaField name="notes" label="Notes" rows={2} />
      </Form>
    </Drawer>
  );
}
