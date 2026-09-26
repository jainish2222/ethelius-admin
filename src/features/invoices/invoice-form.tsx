"use client";

import { useEffect, useMemo } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/shared/overlays";
import { CurrencyInput } from "@/components/shared/pickers";
import {
  applyServerErrors, ComboField, CurrencyField, DateField, Form, FormSection, MonthField, NumberField, SelectField, TextField, TextareaField,
} from "@/components/shared/form-field";
import { useApiMutation, useCompanyOptions, useProjectOptions } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { Options } from "@/lib/constants";
import { addDays, currentMonth, dateOnly, monthLabel, parseDateOnly, termDays, todayDateOnly } from "@/lib/dates";
import { CURRENCY_CODES, formatMoney, round2 } from "@/lib/money";
import { invoiceSchema, type InvoiceInput } from "@/validations/finance";

export type InvoiceForForm = {
  id: string; companyId: string; projectId: string | null; billingMonth: string | null; invoiceNumber: string; invoiceDate: string; dueDate: string;
  currency: string; exchangeRate: number; taxPercent: number; discountAmount: number; paymentTerms: string; status: string; notes: string | null;
  items: { description: string; quantity: number; unitPrice: number }[];
};

export function InvoiceFormDrawer({
  open, onOpenChange, invoice, preset, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; invoice?: InvoiceForForm | null; preset?: { companyId?: string; projectId?: string; month?: string }; onSaved?: (id: string) => void }) {
  const companies = useCompanyOptions(open);
  const projects = useProjectOptions(open);
  const empty: InvoiceInput = {
    companyId: preset?.companyId ?? "", projectId: preset?.projectId ?? null, billingMonth: preset?.month ?? currentMonth(), invoiceNumber: "",
    invoiceDate: todayDateOnly(), dueDate: "", currency: "INR", exchangeRate: 1, taxPercent: 18, discountAmount: 0, paymentTerms: "NET_30",
    status: "DRAFT", notes: "", items: [{ description: "", quantity: 1, unitPrice: 0 }],
  };
  const form = useForm({ resolver: zodResolver(invoiceSchema), defaultValues: empty });
  const items = useFieldArray({ control: form.control, name: "items" });

  useEffect(() => {
    if (!open) return;
    form.reset(invoice ? {
      companyId: invoice.companyId, projectId: invoice.projectId, billingMonth: invoice.billingMonth ?? "", invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, currency: invoice.currency as InvoiceInput["currency"], exchangeRate: invoice.exchangeRate,
      taxPercent: invoice.taxPercent, discountAmount: invoice.discountAmount, paymentTerms: invoice.paymentTerms as InvoiceInput["paymentTerms"],
      status: invoice.status === "SENT" ? "SENT" : "DRAFT", notes: invoice.notes ?? "", items: invoice.items,
    } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice]);

  // Pre-fill from the chosen project the first time a preset project is used.
  useEffect(() => {
    if (!open || invoice || !preset?.projectId || !projects.data) return;
    const p = projects.data.find((x) => x.id === preset.projectId);
    if (p) applyProject(p.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projects.data]);

  const v = useWatch({ control: form.control });
  const companyId = v.companyId;
  const projectOpts = useMemo(() => (projects.data ?? []).filter((p) => !companyId || p.companyId === companyId), [projects.data, companyId]);

  const subtotal = round2((v.items ?? []).reduce((s, i) => s + Number(i?.quantity || 0) * Number(i?.unitPrice || 0), 0));
  const discount = Number(v.discountAmount || 0);
  const tax = round2((Math.max(subtotal - discount, 0) * Number(v.taxPercent || 0)) / 100);
  const total = round2(Math.max(subtotal - discount, 0) + tax);
  const cur = v.currency ?? "INR";
  const autoDue = v.invoiceDate ? dateOnly(addDays(parseDateOnly(v.invoiceDate), termDays(v.paymentTerms ?? "NET_30"))) : "";

  function applyProject(id: string | null) {
    const p = projects.data?.find((x) => x.id === id);
    if (!p) return;
    form.setValue("companyId", p.companyId);
    form.setValue("currency", p.currency as InvoiceInput["currency"]);
    form.setValue("taxPercent", p.taxPercent);
    form.setValue("paymentTerms", p.paymentTerms as InvoiceInput["paymentTerms"]);
    if (p.billingType === "MONTHLY" && p.monthlyBillingAmount && !form.getValues("items.0.unitPrice")) {
      const month = form.getValues("billingMonth") || currentMonth();
      form.setValue("items", [{ description: `Professional services — ${p.name} — ${monthLabel(month)}`, quantity: 1, unitPrice: p.monthlyBillingAmount }]);
    }
  }

  const save = useApiMutation(
    (body: unknown) => (invoice ? api.put<{ id: string }>(`/api/invoices/${invoice.id}`, body) : api.post<{ id: string }>("/api/invoices", body)),
    {
      success: (_r, b) => ((b as { status: string }).status === "SENT" ? "Invoice saved and marked as sent" : "Draft invoice saved"),
      invalidate: ["/api/invoices", "/api/payments", "/api/companies", "/api/projects", "/api/dashboard"],
      onSuccess: (r) => { onOpenChange(false); onSaved?.(r.id); },
    },
  );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={invoice ? `Edit ${invoice.invoiceNumber}` : "New invoice"}
      description="Only drafts can be edited. Sent invoices are cancelled and reissued, so the books never change silently."
      formId="invoice-form"
      pending={save.isPending}
      submitLabel={v.status === "SENT" ? "Save & mark sent" : "Save draft"}
      wide
    >
      <Form form={form} id="invoice-form" onSubmit={(b) => save.mutateAsync(b).catch((e) => applyServerErrors(form, e))}>
        <FormSection title="Bill to">
          <ComboField name="companyId" label="Company" required loading={companies.isLoading}
            options={(companies.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            onValueChange={(id) => {
              const c = companies.data?.find((x) => x.id === id);
              if (c) { form.setValue("currency", c.currency as InvoiceInput["currency"]); form.setValue("paymentTerms", c.paymentTerms as InvoiceInput["paymentTerms"]); }
              form.setValue("projectId", null);
            }} />
          <ComboField name="projectId" label="Project" clearable placeholder="No project" options={projectOpts.map((p) => ({ value: p.id, label: p.name, description: p.code }))} onValueChange={applyProject} />
          <MonthField name="billingMonth" label="Billing month" clearable />
          <TextField name="invoiceNumber" label="Invoice number" placeholder="Auto — INV-2026-0001" disabled={!!invoice} />
        </FormSection>

        <FormSection title="Dates & currency">
          <DateField name="invoiceDate" label="Invoice date" required />
          <SelectField name="paymentTerms" label="Payment terms" options={Options.paymentTerms} />
          <DateField name="dueDate" label="Due date" clearable hint={autoDue ? `Leave empty for ${autoDue.split("-").reverse().join("/")} from the terms` : undefined} />
          <SelectField name="currency" label="Currency" options={CURRENCY_CODES.map((c) => ({ value: c, label: c }))} />
          {cur !== "INR" && <NumberField name="exchangeRate" label={`Rate (1 ${cur} in INR)`} step="0.0001" min={0} hint="Used to report revenue in INR" />}
        </FormSection>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[13px] font-semibold">Line items</legend>
          <div className="hidden grid-cols-[1fr_80px_150px_120px_32px] gap-2 px-1 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase sm:grid">
            <span>Description</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Amount</span><span />
          </div>
          {items.fields.map((f, i) => {
            const it = v.items?.[i];
            const err = form.formState.errors.items?.[i];
            return (
              <div key={f.id} className="grid grid-cols-[1fr_32px] gap-2 sm:grid-cols-[1fr_80px_150px_120px_32px] sm:items-start">
                <div>
                  <Input {...form.register(`items.${i}.description`)} placeholder="Professional services — …" className="h-9 rounded-[10px]" aria-invalid={!!err?.description || undefined} aria-label="Description" />
                  {err?.description && <p className="mt-1 text-[12px] text-danger">{err.description.message}</p>}
                </div>
                <Button type="button" variant="ghost" size="icon-sm" className="mt-1 sm:order-last" onClick={() => items.remove(i)} disabled={items.fields.length === 1} aria-label="Remove line"><Trash2 className="size-3.5" /></Button>
                <Input type="number" step="any" min={0} {...form.register(`items.${i}.quantity`)} className="num h-9 rounded-[10px] text-right" aria-label="Quantity" />
                <CurrencyInput value={it?.unitPrice as number} onChange={(n) => form.setValue(`items.${i}.unitPrice`, n === "" ? 0 : n, { shouldValidate: true })} currency={cur} />
                <p className="num flex h-9 items-center justify-end text-[13.5px] font-medium">{formatMoney(Number(it?.quantity || 0) * Number(it?.unitPrice || 0), cur)}</p>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => items.append({ description: "", quantity: 1, unitPrice: 0 })}><Plus className="size-3.5" /> Add line</Button>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-4">
            <NumberField name="taxPercent" label="Tax (GST)" min={0} max={50} step="0.01" suffix="%" />
            <CurrencyField name="discountAmount" label="Discount" currency={cur} />
          </div>
          <div className="glass rounded-2xl p-4 text-[13.5px]">
            <Row label="Invoice amount" value={formatMoney(subtotal, cur)} />
            {discount > 0 && <Row label="Discount" value={`− ${formatMoney(discount, cur)}`} />}
            <Row label={`Tax ${v.taxPercent || 0}%`} value={formatMoney(tax, cur)} />
            <div className="my-2 h-px bg-border" />
            <Row label="Total invoice amount" value={formatMoney(total, cur)} strong />
          </div>
        </div>

        <FormSection>
          <SelectField name="status" label="Save as" options={[{ value: "DRAFT", label: "Draft — not sent yet" }, { value: "SENT", label: "Sent to client" }]} />
          <TextareaField name="notes" label="Notes" rows={2} />
        </FormSection>
      </Form>
    </Drawer>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${strong ? "text-[15px] font-bold" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className={`num ${strong ? "text-foreground" : "text-foreground/90"}`}>{value}</span>
    </div>
  );
}
