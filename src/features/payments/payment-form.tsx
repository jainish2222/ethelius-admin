"use client";

import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { Drawer } from "@/components/shared/overlays";
import {
  applyServerErrors, ComboField, CurrencyField, DateField, Form, FormSection, NumberField, SelectField, TextField, TextareaField,
} from "@/components/shared/form-field";
import { useApi, useApiMutation, useCompanyOptions, useProjectOptions } from "@/hooks/use-api";
import { api, type ListResponse } from "@/lib/api/client";
import { Options } from "@/lib/constants";
import { todayDateOnly, monthLabel } from "@/lib/dates";
import { CURRENCY_CODES, formatMoney, round2 } from "@/lib/money";
import { paymentSchema, type PaymentInput } from "@/validations/finance";
import type { InvoiceRow, PaymentRow } from "@/types";

/**
 * Records money received from a client. The amount settled against the invoice (TDS included)
 * and what actually reached the bank are separate: bank credit = settled − TDS − other deductions.
 */
export function PaymentFormDrawer({
  open, onOpenChange, payment, preset,
}: { open: boolean; onOpenChange: (o: boolean) => void; payment?: PaymentRow | null; preset?: { companyId?: string; invoiceId?: string } }) {
  const companies = useCompanyOptions(open);
  const projects = useProjectOptions(open);
  const empty: PaymentInput = {
    companyId: preset?.companyId ?? "", projectId: null, invoiceId: preset?.invoiceId ?? null, paymentDate: todayDateOnly(), amountReceived: 0,
    tdsDeducted: 0, otherDeduction: 0, currency: "INR", exchangeRate: 1, method: "NEFT", bankAccount: "HDFC Bank current a/c ••••4412",
    transactionRef: "", utr: "", status: "RECEIVED", notes: "",
  };
  const form = useForm({ resolver: zodResolver(paymentSchema), defaultValues: empty });
  const v = useWatch({ control: form.control });

  const openInvoices = useApi<ListResponse<InvoiceRow>>(
    open && v.companyId ? "/api/invoices" : null,
    { companyId: v.companyId, status: "SENT,PARTIALLY_PAID,OVERDUE", pageSize: 200, sort: "invoiceDate", order: "desc" },
  );
  const invoiceList = useMemo(() => {
    const list = openInvoices.data?.data ?? [];
    // When editing, keep the payment's own invoice selectable even if it is now fully paid.
    if (payment?.invoice && !list.some((i) => i.id === payment.invoice!.id)) {
      return [...list, { id: payment.invoice.id, invoiceNumber: payment.invoice.invoiceNumber, outstanding: 0 } as InvoiceRow];
    }
    return list;
  }, [openInvoices.data, payment]);
  const invoice = invoiceList.find((i) => i.id === v.invoiceId);

  useEffect(() => {
    if (!open) return;
    form.reset(payment ? {
      companyId: payment.companyId, projectId: payment.projectId, invoiceId: payment.invoiceId, paymentDate: payment.paymentDate, amountReceived: payment.amountReceived,
      tdsDeducted: payment.tdsDeducted, otherDeduction: payment.otherDeduction, currency: payment.currency as PaymentInput["currency"], exchangeRate: payment.exchangeRate,
      method: payment.method as PaymentInput["method"], bankAccount: payment.bankAccount ?? "", transactionRef: payment.transactionRef ?? "", utr: payment.utr ?? "",
      status: payment.status as PaymentInput["status"], notes: payment.notes ?? "",
    } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment]);

  // Choosing an invoice fills in the amount still owed, its currency, and 10% TDS on the pre-tax value.
  const pickInvoice = (id: string | null) => {
    const inv = invoiceList.find((i) => i.id === id);
    if (!inv || payment) return;
    form.setValue("currency", inv.currency as PaymentInput["currency"]);
    form.setValue("exchangeRate", inv.exchangeRate);
    form.setValue("projectId", inv.project?.id ?? null);
    form.setValue("amountReceived", inv.outstanding);
    const share = inv.total ? inv.outstanding / inv.total : 0;
    form.setValue("tdsDeducted", inv.currency === "INR" ? round2((inv.subtotal - inv.discountAmount) * 0.1 * share) : 0);
  };

  const settled = Number(v.amountReceived || 0);
  const deductions = Number(v.tdsDeducted || 0) + Number(v.otherDeduction || 0);
  const credit = round2(settled - deductions);
  const cur = v.currency ?? "INR";
  const remaining = invoice ? round2(invoice.outstanding - (payment?.invoiceId === invoice.id ? 0 : settled)) : null;

  const save = useApiMutation((b: unknown) => (payment ? api.put(`/api/payments/${payment.id}`, b) : api.post("/api/payments", b)), {
    success: payment ? "Payment updated" : "Payment recorded",
    invalidate: ["/api/payments", "/api/invoices", "/api/companies", "/api/projects", "/api/dashboard", "/api/reports", "/api/notifications"],
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={payment ? "Edit payment" : "Record client payment"}
      description="Log what the client actually paid. Partial payments are fine — record each one as it arrives."
      formId="payment-form" pending={save.isPending} submitLabel={payment ? "Save" : "Record payment"} wide>
      <Form form={form} id="payment-form" onSubmit={(b) => save.mutateAsync(b).catch((e) => applyServerErrors(form, e))}>
        <FormSection title="From">
          <ComboField name="companyId" label="Company" required disabled={!!preset?.companyId || !!payment}
            options={(companies.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            onValueChange={(id) => { form.setValue("invoiceId", null); const c = companies.data?.find((x) => x.id === id); if (c) form.setValue("currency", c.currency as PaymentInput["currency"]); }} />
          <ComboField name="invoiceId" label="Against invoice" clearable placeholder={v.companyId ? "Advance / no invoice" : "Choose a company first"} disabled={!v.companyId || !!preset?.invoiceId}
            loading={openInvoices.isLoading}
            options={invoiceList.map((i) => ({ value: i.id, label: i.invoiceNumber, description: `${i.billingMonth ? monthLabel(i.billingMonth, "short") + " · " : ""}${formatMoney(i.outstanding, i.currency)} due` }))}
            onValueChange={pickInvoice} />
          {!v.invoiceId && (
            <ComboField name="projectId" label="Project" clearable placeholder="No project"
              options={(projects.data ?? []).filter((p) => p.companyId === v.companyId).map((p) => ({ value: p.id, label: p.name }))} />
          )}
        </FormSection>

        <FormSection title="Amounts">
          <CurrencyField name="amountReceived" label="Amount settled" currency={cur} required hint="Reduces the invoice balance — TDS included" />
          <CurrencyField name="tdsDeducted" label="TDS deducted" currency={cur} />
          <CurrencyField name="otherDeduction" label="Other deductions" currency={cur} hint="Bank charges, short payments" />
          <SelectField name="currency" label="Currency" options={CURRENCY_CODES.map((c) => ({ value: c, label: c }))} />
          {cur !== "INR" && <NumberField name="exchangeRate" label={`Rate (1 ${cur} in INR)`} step="0.0001" />}
        </FormSection>

        <div className="grid gap-2 rounded-2xl border border-border p-4 text-[13.5px]">
          {invoice && <Line label={`${invoice.invoiceNumber} outstanding`} value={formatMoney(invoice.outstanding, cur)} muted />}
          <Line label="Amount settled" value={formatMoney(settled, cur)} />
          <Line label="Less TDS & deductions" value={`− ${formatMoney(deductions, cur)}`} muted />
          <div className="h-px bg-border" />
          <Line label="Actual bank credit" value={formatMoney(credit, cur)} strong />
          {remaining != null && (
            <p className={cn("text-[12.5px] font-medium", remaining > 0.005 ? "text-warning" : "text-success")}>
              {remaining > 0.005 ? `Partial — ${formatMoney(remaining, cur)} will remain outstanding` : "Settles the invoice in full"}
            </p>
          )}
        </div>

        <FormSection title="Transaction">
          <DateField name="paymentDate" label="Payment date" required />
          <SelectField name="status" label="Status" options={Options.paymentStatus} hint="Pending payments don't reduce the balance" />
          <SelectField name="method" label="Method" options={Options.paymentMethod} />
          <TextField name="bankAccount" label="Received into" />
          <TextField name="transactionRef" label="Transaction reference" />
          <TextField name="utr" label="UTR / reference number" />
          <TextareaField name="notes" label="Notes" rows={2} />
        </FormSection>
      </Form>
    </Drawer>
  );
}

function Line({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", muted && "text-muted-foreground", strong && "text-[15px] font-bold")}>
      <span>{label}</span><span className="num">{value}</span>
    </div>
  );
}
