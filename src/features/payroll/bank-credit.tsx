"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { Modal } from "@/components/shared/overlays";
import { applyServerErrors, CurrencyField, DateField, Form, FormSection, SelectField, TextField, TextareaField } from "@/components/shared/form-field";
import { useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { Options } from "@/lib/constants";
import { monthLabel, todayDateOnly } from "@/lib/dates";
import { formatMoney, maskAccount, round2 } from "@/lib/money";
import { bankCreditSchema, type BankCreditInput } from "@/validations/finance";

export type CreditTarget = {
  id: string; month: string; netSalary: number; actualBankCredit: number | null; bankCreditDate: string | null; transactionRef: string | null;
  paymentMode?: string | null; paymentStatus: string; notes?: string | null; bankAccountId?: string | null;
  employee: { fullName: string; employeeCode: string; bankAccounts?: { id: string; bankName: string; accountNumber: string; isPrimary: boolean }[] };
};

export const PAYROLL_INVALIDATE = ["/api/payroll", "/api/employees", "/api/payslips", "/api/dashboard", "/api/reports"];

/**
 * Records what actually reached the employee's account. It defaults to the net salary but can differ
 * (a held-back amount, a split credit) — the difference is shown as a variance, never hidden.
 */
export function BankCreditModal({ target, onClose }: { target: CreditTarget | null; onClose: () => void }) {
  const form = useForm({ resolver: zodResolver(bankCreditSchema), defaultValues: {} as BankCreditInput });
  useEffect(() => {
    if (!target) return;
    form.reset({
      actualBankCredit: target.actualBankCredit ?? target.netSalary,
      bankCreditDate: target.bankCreditDate || todayDateOnly(),
      bankAccountId: target.bankAccountId ?? target.employee.bankAccounts?.find((b) => b.isPrimary)?.id ?? null,
      transactionRef: target.transactionRef ?? "",
      paymentMode: target.paymentMode ?? "Bank transfer (NEFT)",
      paymentStatus: (target.paymentStatus === "PENDING" ? "PAID" : target.paymentStatus) as BankCreditInput["paymentStatus"],
      notes: target.notes ?? "",
    });
  }, [target, form]);
  const credit = Number(useWatch({ control: form.control, name: "actualBankCredit" }) || 0);
  const variance = target ? round2(credit - target.netSalary) : 0;

  const save = useApiMutation((v: unknown) => api.post(`/api/payroll/${target!.id}/bank-credit`, v), {
    success: "Bank credit recorded", invalidate: PAYROLL_INVALIDATE, onSuccess: onClose,
  });

  return (
    <Modal
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title="Record bank credit"
      description={target ? `${target.employee.fullName} · ${monthLabel(target.month)} · net salary ${formatMoney(target.netSalary)}` : undefined}
      formId="credit-form"
      submitLabel="Save credit"
      pending={save.isPending}
    >
      <Form form={form} id="credit-form" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
        <FormSection>
          <CurrencyField name="actualBankCredit" label="Amount credited" required />
          <DateField name="bankCreditDate" label="Credit date" required />
          {target?.employee.bankAccounts?.length ? (
            <SelectField name="bankAccountId" label="Into account" full options={target.employee.bankAccounts.map((b) => ({ value: b.id, label: `${b.bankName} ${maskAccount(b.accountNumber)}${b.isPrimary ? " · primary" : ""}` }))} />
          ) : null}
          <TextField name="transactionRef" label="Transaction reference" placeholder="UTR / batch reference" />
          <TextField name="paymentMode" label="Payment mode" />
          <SelectField name="paymentStatus" label="Payment status" options={Options.salaryPaymentStatus} full />
        </FormSection>
        {target && (
          <div className={cn("flex items-center justify-between rounded-xl px-4 py-3 text-[13px]", Math.abs(variance) < 0.005 ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
            <span>{Math.abs(variance) < 0.005 ? "Matches the calculated net salary" : "Differs from the calculated net salary"}</span>
            {Math.abs(variance) >= 0.005 && <span className="num font-semibold">{variance > 0 ? "+" : "−"}{formatMoney(Math.abs(variance))}</span>}
          </div>
        )}
        <TextareaField name="notes" label="Notes" rows={2} hint={Math.abs(variance) >= 0.005 ? "Explain the difference for the audit trail" : undefined} />
      </Form>
    </Modal>
  );
}
