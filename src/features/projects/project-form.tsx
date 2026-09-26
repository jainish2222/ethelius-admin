"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Drawer } from "@/components/shared/overlays";
import {
  applyServerErrors, ComboField, CurrencyField, DateField, Form, FormSection, NumberField, SelectField, TextField, TextareaField,
} from "@/components/shared/form-field";
import { useApiMutation, useCompanyOptions, useEmployeeOptions } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { Options } from "@/lib/constants";
import { todayDateOnly } from "@/lib/dates";
import { CURRENCY_CODES } from "@/lib/money";
import { projectSchema, type ProjectInput } from "@/validations/business";

export type ProjectForForm = {
  id: string; name: string; code: string; companyId: string; managerId: string | null; startDate: string; endDate: string; billingType: string;
  monthlyBillingAmount: number | null; hourlyRate: number | null; taxPercent: number; currency: string; paymentTerms: string; customPaymentDays: number | null;
  status: string; description: string | null;
};

export function ProjectFormDrawer({ open, onOpenChange, project, presetCompanyId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; project?: ProjectForForm | null; presetCompanyId?: string; onSaved?: (id: string) => void }) {
  const companies = useCompanyOptions(open);
  const managers = useEmployeeOptions(false, open);
  const empty: ProjectInput = {
    name: "", code: "", companyId: presetCompanyId ?? "", managerId: null, startDate: todayDateOnly(), endDate: "", billingType: "MONTHLY",
    monthlyBillingAmount: null, hourlyRate: null, taxPercent: 18, currency: "INR", paymentTerms: "NET_30", customPaymentDays: null, status: "ACTIVE", description: "",
  };
  const form = useForm({ resolver: zodResolver(projectSchema), defaultValues: empty });
  useEffect(() => {
    if (!open) return;
    form.reset(project ? {
      ...project, endDate: project.endDate ?? "", description: project.description ?? "",
      billingType: project.billingType as ProjectInput["billingType"], currency: project.currency as ProjectInput["currency"],
      paymentTerms: project.paymentTerms as ProjectInput["paymentTerms"], status: project.status as ProjectInput["status"],
    } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project]);
  const [billingType, terms, currency] = useWatch({ control: form.control, name: ["billingType", "paymentTerms", "currency"] });

  const save = useApiMutation((v: unknown) => (project ? api.put<{ id: string }>(`/api/projects/${project.id}`, v) : api.post<{ id: string }>("/api/projects", v)), {
    success: project ? "Project updated" : "Project created",
    invalidate: ["/api/projects", "/api/companies", "/api/dashboard", "/api/invoices/billing-grid"],
    onSuccess: (r) => { onOpenChange(false); onSaved?.(r.id); },
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={project ? `Edit ${project.name}` : "New project"} description="Monthly-billed projects appear in Monthly billing, ready for one-click invoices." formId="project-form" pending={save.isPending} submitLabel={project ? "Save changes" : "Create project"} wide>
      <Form form={form} id="project-form" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
        <FormSection title="Project">
          <TextField name="name" label="Project name" required />
          <TextField name="code" label="Project code" required placeholder="ARC-EHR" />
          <ComboField name="companyId" label="Company" required options={(companies.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            onValueChange={(id) => { const c = companies.data?.find((x) => x.id === id); if (c && !project) { form.setValue("currency", c.currency as ProjectInput["currency"]); form.setValue("paymentTerms", c.paymentTerms as ProjectInput["paymentTerms"]); form.setValue("taxPercent", c.currency === "INR" ? 18 : 0); } }} />
          <ComboField name="managerId" label="Project manager" clearable placeholder="Unassigned" options={(managers.data ?? []).map((m) => ({ value: m.id, label: m.fullName, description: m.designation }))} />
          <DateField name="startDate" label="Start date" required />
          <DateField name="endDate" label="End date" clearable />
          <SelectField name="status" label="Status" options={Options.projectStatus} required />
        </FormSection>
        <FormSection title="Billing">
          <SelectField name="billingType" label="Billing type" options={Options.billingType} required />
          <SelectField name="currency" label="Currency" options={CURRENCY_CODES.map((c) => ({ value: c, label: c }))} />
          {billingType === "MONTHLY" && <CurrencyField name="monthlyBillingAmount" label="Monthly billing amount" currency={currency} required />}
          {billingType === "HOURLY" && <CurrencyField name="hourlyRate" label="Hourly rate" currency={currency} />}
          <NumberField name="taxPercent" label="Tax (GST)" min={0} max={50} step="0.01" suffix="%" />
          <SelectField name="paymentTerms" label="Payment terms" options={Options.paymentTerms} />
          {terms === "CUSTOM" && <NumberField name="customPaymentDays" label="Days to pay" min={0} suffix="days" />}
        </FormSection>
        <TextareaField name="description" label="Description" rows={3} />
      </Form>
    </Drawer>
  );
}
