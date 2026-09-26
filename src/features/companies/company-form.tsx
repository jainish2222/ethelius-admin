"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Drawer } from "@/components/shared/overlays";
import { applyServerErrors, DateField, Form, FormSection, NumberField, SelectField, TextField, TextareaField } from "@/components/shared/form-field";
import { useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { Options } from "@/lib/constants";
import { CURRENCY_CODES } from "@/lib/money";
import { companySchema, type CompanyInput } from "@/validations/business";

export type CompanyForForm = {
  id: string; name: string; legalName: string | null; type: string; billingContactName: string | null; billingEmail: string | null; phone: string | null;
  address: string | null; gstNumber: string | null; pan: string | null; paymentTerms: string; customPaymentDays: number | null; currency: string;
  contractStart: string; contractEnd: string; status: string; notes: string | null;
};

const EMPTY: CompanyInput = {
  name: "", legalName: "", type: "ENTERPRISE", billingContactName: "", billingEmail: "", phone: "", address: "", gstNumber: "", pan: "",
  paymentTerms: "NET_30", customPaymentDays: null, currency: "INR", contractStart: "", contractEnd: "", status: "ACTIVE", notes: "",
};

export function CompanyFormDrawer({ open, onOpenChange, company, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; company?: CompanyForForm | null; onSaved?: (id: string) => void }) {
  const form = useForm({ resolver: zodResolver(companySchema), defaultValues: EMPTY });
  useEffect(() => {
    if (!open) return;
    form.reset(company ? {
      name: company.name, legalName: company.legalName ?? "", type: company.type as CompanyInput["type"], billingContactName: company.billingContactName ?? "",
      billingEmail: company.billingEmail ?? "", phone: company.phone ?? "", address: company.address ?? "", gstNumber: company.gstNumber ?? "", pan: company.pan ?? "",
      paymentTerms: company.paymentTerms as CompanyInput["paymentTerms"], customPaymentDays: company.customPaymentDays, currency: company.currency as CompanyInput["currency"],
      contractStart: company.contractStart ?? "", contractEnd: company.contractEnd ?? "", status: company.status as CompanyInput["status"], notes: company.notes ?? "",
    } : EMPTY);
  }, [open, company, form]);
  const terms = useWatch({ control: form.control, name: "paymentTerms" });

  const save = useApiMutation((v: unknown) => (company ? api.put<{ id: string }>(`/api/companies/${company.id}`, v) : api.post<{ id: string }>("/api/companies", v)), {
    success: company ? "Company updated" : "Company added",
    invalidate: ["/api/companies", "/api/dashboard"],
    onSuccess: (r) => { onOpenChange(false); onSaved?.(r.id); },
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={company ? `Edit ${company.name}` : "Add company"} description="Clients Ethelius bills. Projects, invoices and payments hang off the company." formId="company-form" pending={save.isPending} submitLabel={company ? "Save changes" : "Add company"} wide>
      <Form form={form} id="company-form" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
        <FormSection title="Company">
          <TextField name="name" label="Company name" required />
          <TextField name="legalName" label="Legal name" />
          <SelectField name="type" label="Company type" options={Options.companyType} required />
          <SelectField name="status" label="Status" options={Options.companyStatus} required />
          <TextField name="gstNumber" label="GST number" placeholder="24AABCA1234F1Z5" />
          <TextField name="pan" label="PAN" />
          <TextareaField name="address" label="Address" rows={2} />
        </FormSection>
        <FormSection title="Billing">
          <TextField name="billingContactName" label="Billing contact" />
          <TextField name="billingEmail" label="Billing email" type="email" />
          <TextField name="phone" label="Phone" />
          <SelectField name="currency" label="Currency" options={CURRENCY_CODES.map((c) => ({ value: c, label: c }))} required />
          <SelectField name="paymentTerms" label="Payment terms" options={Options.paymentTerms} required />
          {terms === "CUSTOM" && <NumberField name="customPaymentDays" label="Days to pay" min={0} suffix="days" />}
        </FormSection>
        <FormSection title="Contract">
          <DateField name="contractStart" label="Contract start" clearable />
          <DateField name="contractEnd" label="Contract end" clearable hint="You'll be alerted 30 days before it ends." />
        </FormSection>
        <TextareaField name="notes" label="Notes" rows={3} />
      </Form>
    </Drawer>
  );
}
