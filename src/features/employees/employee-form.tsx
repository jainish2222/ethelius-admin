"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Drawer } from "@/components/shared/overlays";
import {
  applyServerErrors, ComboField, DateField, Form, FormSection, NumberField, SelectField, TextField, TextareaField,
} from "@/components/shared/form-field";
import { useApiMutation, useEmployeeOptions } from "@/hooks/use-api";
import { useSession } from "@/components/providers/session";
import { api } from "@/lib/api/client";
import { DEPARTMENTS, Options } from "@/lib/constants";
import { todayDateOnly } from "@/lib/dates";
import { employeeSchema, type EmployeeInput } from "@/validations/employee";
import type { EmployeeDetail } from "@/types";

const EMPTY: EmployeeInput = {
  employeeCode: "", fullName: "", personalEmail: "", officialEmail: "", phone: "", dateOfBirth: "", address: "",
  emergencyContactName: "", emergencyContactPhone: "", emergencyRelation: "", designation: "", department: "Engineering",
  experienceYears: 0, joiningDate: todayDateOnly(), employmentType: "PERMANENT", status: "ACTIVE", workLocation: "Surat, Gujarat",
  reportingManagerId: null, noticePeriodDays: 60, exitDate: "", notes: "", pan: "", uan: "", pfNumber: "", esiNumber: "",
};

function toInput(e: EmployeeDetail): EmployeeInput {
  return {
    employeeCode: e.employeeCode, fullName: e.fullName, personalEmail: e.personalEmail ?? "", officialEmail: e.officialEmail ?? "",
    phone: e.phone ?? "", dateOfBirth: e.dateOfBirth ?? "", address: e.address ?? "", emergencyContactName: e.emergencyContactName ?? "",
    emergencyContactPhone: e.emergencyContactPhone ?? "", emergencyRelation: e.emergencyRelation ?? "", designation: e.designation,
    department: e.department, experienceYears: e.experienceYears ?? 0, joiningDate: e.joiningDate, employmentType: e.employmentType as EmployeeInput["employmentType"],
    status: e.status as EmployeeInput["status"], workLocation: e.workLocation ?? "", reportingManagerId: e.reportingManagerId,
    noticePeriodDays: e.noticePeriodDays, exitDate: e.exitDate ?? "", notes: e.notes ?? "", pan: e.pan ?? "", uan: e.uan ?? "",
    pfNumber: e.pfNumber ?? "", esiNumber: e.esiNumber ?? "",
  };
}

export function EmployeeFormDrawer({
  open, onOpenChange, employee, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; employee?: EmployeeDetail | null; onSaved?: (id: string) => void }) {
  const { can } = useSession();
  const pii = can("employee.pii");
  const managers = useEmployeeOptions(false, open);
  const form = useForm({ resolver: zodResolver(employeeSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) form.reset(employee ? toInput(employee) : EMPTY);
  }, [open, employee, form]);

  const save = useApiMutation(
    (values: unknown) => (employee ? api.put<{ id: string }>(`/api/employees/${employee.id}`, values) : api.post<{ id: string }>("/api/employees", values)),
    {
      success: employee ? "Employee updated" : "Employee added",
      invalidate: ["/api/employees", "/api/dashboard"],
      onSuccess: (res) => {
        onOpenChange(false);
        onSaved?.(res.id);
      },
    },
  );

  const status = useWatch({ control: form.control, name: "status" });

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={employee ? `Edit ${employee.fullName}` : "Add employee"}
      description={employee ? `${employee.employeeCode} · ${employee.designation}` : "Salary, bank details and project assignments are added from the profile afterwards."}
      formId="employee-form"
      submitLabel={employee ? "Save changes" : "Add employee"}
      pending={save.isPending}
      wide
    >
      <Form form={form} id="employee-form" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
        <FormSection title="Basics">
          <TextField name="fullName" label="Full name" required autoComplete="off" />
          <TextField name="employeeCode" label="Employee ID" required placeholder="EMP021" />
          <TextField name="designation" label="Designation" required placeholder="Full Stack Developer" />
          <SelectField name="department" label="Department" options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} required />
        </FormSection>

        <FormSection title="Employment">
          <SelectField name="employmentType" label="Employment type" options={Options.employmentType} required />
          <SelectField name="status" label="Status" options={Options.employeeStatus} required />
          <DateField name="joiningDate" label="Joining date" required />
          <NumberField name="experienceYears" label="Years of experience" step="0.5" min={0} suffix="yrs" />
          <ComboField
            name="reportingManagerId"
            label="Reporting manager"
            clearable
            loading={managers.isLoading}
            placeholder="No manager"
            options={(managers.data ?? []).filter((m) => m.id !== employee?.id).map((m) => ({ value: m.id, label: m.fullName, description: m.designation }))}
          />
          <TextField name="workLocation" label="Work location" />
          <NumberField name="noticePeriodDays" label="Notice period" min={0} suffix="days" />
          <DateField name="exitDate" label="Exit date" clearable hint={status === "ACTIVE" ? "Only for people leaving" : undefined} />
        </FormSection>

        <FormSection title="Contact">
          <TextField name="officialEmail" label="Official email" type="email" />
          <TextField name="personalEmail" label="Personal email" type="email" disabled={!pii} hint={!pii ? "Restricted" : undefined} />
          <TextField name="phone" label="Contact number" />
          <DateField name="dateOfBirth" label="Date of birth" clearable disabled={!pii} />
          <TextareaField name="address" label="Address" rows={2} disabled={!pii} />
        </FormSection>

        {pii && (
          <FormSection title="Statutory" description="Visible only to HR and finance.">
            <TextField name="pan" label="PAN" placeholder="ABCDE1234F" />
            <TextField name="uan" label="UAN" placeholder="12 digits" />
            <TextField name="pfNumber" label="PF account number" />
            <TextField name="esiNumber" label="ESIC number" />
          </FormSection>
        )}

        <FormSection title="Emergency contact">
          <TextField name="emergencyContactName" label="Name" disabled={!pii} />
          <TextField name="emergencyContactPhone" label="Phone" disabled={!pii} />
          <TextField name="emergencyRelation" label="Relationship" disabled={!pii} />
        </FormSection>

        <TextareaField name="notes" label="Notes" rows={3} />
      </Form>
    </Drawer>
  );
}
