"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUpRight, History, Pencil, Plus, TrendingUp } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CardBody, CardHead, GlassCard } from "@/components/shared/glass-card";
import { Drawer, Modal } from "@/components/shared/overlays";
import {
  applyServerErrors, CurrencyField, DateField, Form, FormSection, MonthField, SelectField, SwitchField, TextField, TextareaField,
} from "@/components/shared/form-field";
import { Money } from "@/components/shared/money";
import { Pill, StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { DEDUCTION_CODE, label, Options } from "@/lib/constants";
import { addMonths, currentMonth, formatDate, monthLabel, todayDateOnly } from "@/lib/dates";
import { formatMoney, round2 } from "@/lib/money";
import { salaryStructureSchema, recurringDeductionSchema, type RecurringDeductionInput } from "@/validations/salary";
import type { SalaryStructure } from "@/types";

type Revision = { id: string; previousCtc: number | null; newCtc: number; changePercent: number | null; reason: string | null; effectiveFrom: string; revisedBy: { name: string } | null; createdAt: string };
type Recurring = { id: string; code: string; label: string; amount: number; startMonth: string; endMonth: string | null; isActive: boolean; notes: string | null };
type History = { current: SalaryStructure | null; structures: SalaryStructure[]; revisions: Revision[]; recurring: Recurring[] };

const COMPONENTS: { key: keyof SalaryStructure; label: string; employer?: boolean }[] = [
  { key: "basic", label: "Basic salary" },
  { key: "hra", label: "House rent allowance" },
  { key: "specialAllowance", label: "Special allowance" },
  { key: "otherAllowances", label: "Other allowances" },
  { key: "bonus", label: "Bonus (monthly)" },
  { key: "employerPf", label: "Employer PF", employer: true },
  { key: "gratuity", label: "Gratuity", employer: true },
];

export function SalaryTab({ employeeId, canWrite }: { employeeId: string; canWrite: boolean }) {
  const { data, isLoading } = useApi<History>(`/api/employees/${employeeId}/salary`);
  const [revising, setRevising] = useState(false);
  const [recurring, setRecurring] = useState<Recurring | "new" | null>(null);

  if (isLoading || !data) return <Skeleton className="h-96 rounded-2xl" />;
  const cur = data.current;

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <div className="flex flex-col gap-4 xl:col-span-3">
        <GlassCard>
          <CardHead
            title="Current salary"
            description={cur ? `In force since ${formatDate(cur.effectiveFrom)}` : "No salary structure yet"}
            action={canWrite && <Button size="sm" onClick={() => setRevising(true)}>{cur ? <><TrendingUp className="size-4" /> Revise salary</> : <><Plus className="size-4" /> Set salary</>}</Button>}
          />
          <CardBody>
            {!cur ? (
              <EmptyState title="No salary on file" description="Set a salary structure before generating payroll for this employee." />
            ) : (
              <>
                <div className="mb-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-brand-soft/60 px-4 py-3">
                    <p className="text-[12px] text-muted-foreground">Annual CTC</p>
                    <p className="num mt-1 text-[22px] font-bold tracking-tight">{formatMoney(cur.annualCtc, "INR", { decimals: 0 })}</p>
                  </div>
                  <div className="rounded-xl bg-muted px-4 py-3">
                    <p className="text-[12px] text-muted-foreground">Monthly CTC</p>
                    <p className="num mt-1 text-[22px] font-bold tracking-tight">{formatMoney(cur.monthlyCtc, "INR", { decimals: 0 })}</p>
                  </div>
                </div>
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className="text-[11.5px] tracking-wide text-muted-foreground uppercase">
                      <th className="pb-2 text-left font-semibold">Component</th>
                      <th className="pb-2 text-right font-semibold">Monthly</th>
                      <th className="pb-2 text-right font-semibold">Annual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPONENTS.filter((c) => Number(cur[c.key]) > 0).map((c) => (
                      <tr key={c.key} className="border-t border-border">
                        <td className="py-2.5">{c.label}{c.employer && <Pill className="ml-2">Employer</Pill>}</td>
                        <td className="py-2.5 text-right"><Money value={Number(cur[c.key])} /></td>
                        <td className="py-2.5 text-right text-muted-foreground"><Money value={Number(cur[c.key]) * 12} /></td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-foreground/15 font-semibold">
                      <td className="py-2.5">Total cost to company</td>
                      <td className="py-2.5 text-right"><Money value={cur.monthlyCtc} /></td>
                      <td className="py-2.5 text-right"><Money value={cur.annualCtc} /></td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </CardBody>
        </GlassCard>

        <GlassCard>
          <CardHead
            title="Recurring deductions"
            description="Applied automatically each payroll month — projected TDS, loan recovery and similar."
            action={canWrite && <Button size="sm" variant="outline" onClick={() => setRecurring("new")}><Plus className="size-4" /> Add</Button>}
          />
          <CardBody>
            {!data.recurring.length ? (
              <p className="py-4 text-[13px] text-muted-foreground">None. PF, PT and ESI come from the payroll rules in Settings.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recurring.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{r.label} <span className="text-[12px] text-muted-foreground">· {label(DEDUCTION_CODE, r.code)}</span></p>
                      <p className="text-[12px] text-muted-foreground">{monthLabel(r.startMonth, "short")} – {r.endMonth ? monthLabel(r.endMonth, "short") : "ongoing"}{r.notes ? ` · ${r.notes}` : ""}</p>
                    </div>
                    {!r.isActive && <StatusBadge status="INACTIVE" />}
                    <Money value={r.amount} className="font-semibold" />
                    {canWrite && <Button variant="ghost" size="icon-sm" onClick={() => setRecurring(r)} aria-label="Edit deduction"><Pencil className="size-3.5" /></Button>}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </GlassCard>
      </div>

      <GlassCard className="xl:col-span-2">
        <CardHead title="Salary history" description="Every version is kept — revisions never overwrite the past." />
        <CardBody>
          {!data.revisions.length ? (
            <p className="text-[13px] text-muted-foreground">No history yet.</p>
          ) : (
            <ol className="relative flex flex-col gap-5">
              {data.revisions.map((r, i) => {
                const s = data.structures.find((x) => x.effectiveFrom === r.effectiveFrom);
                return (
                  <li key={r.id} className="relative flex gap-3.5">
                    {i < data.revisions.length - 1 && <span className="absolute top-8 -bottom-5 left-[15px] w-px bg-border" aria-hidden />}
                    <span className={cn("relative z-[1] grid size-8 shrink-0 place-items-center rounded-full", i === 0 ? "bg-brand-soft text-brand-ink" : "bg-muted text-muted-foreground")}>
                      {i === 0 ? <ArrowUpRight className="size-4" /> : <History className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-[13px] font-semibold">{monthLabel(r.effectiveFrom.slice(0, 7))}</p>
                        {r.changePercent != null && (
                          <span className={cn("num text-[12px] font-semibold", r.changePercent >= 0 ? "text-success" : "text-danger")}>
                            {r.changePercent >= 0 ? "+" : ""}{r.changePercent}%
                          </span>
                        )}
                      </div>
                      <p className="num mt-0.5 text-[18px] font-bold tracking-tight">{formatMoney(r.newCtc, "INR", { decimals: 0 })} <span className="text-[12px] font-medium text-muted-foreground">CTC</span></p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {r.reason ?? "Revision"}{r.revisedBy ? ` · ${r.revisedBy.name}` : ""}
                        {s?.effectiveTo ? ` · until ${formatDate(s.effectiveTo)}` : i === 0 ? " · current" : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardBody>
      </GlassCard>

      <SalaryRevisionDrawer open={revising} onOpenChange={setRevising} employeeId={employeeId} current={cur} />
      <RecurringModal employeeId={employeeId} value={recurring} onClose={() => setRecurring(null)} />
    </div>
  );
}

/** Suggests a standard split: basic 40% of monthly CTC, HRA half of basic, PF capped at ₹1,800. */
function suggest(annual: number) {
  const monthly = Math.round(annual / 12);
  const basic = Math.round(monthly * 0.4);
  const hra = Math.round(basic * 0.5);
  const otherAllowances = 1600;
  const employerPf = Math.min(Math.round(basic * 0.12), 1800);
  const gratuity = Math.round(basic * 0.0481);
  return { basic, hra, otherAllowances, employerPf, gratuity, bonus: 0, specialAllowance: monthly - basic - hra - otherAllowances - employerPf - gratuity };
}

function SalaryRevisionDrawer({ open, onOpenChange, employeeId, current }: { open: boolean; onOpenChange: (o: boolean) => void; employeeId: string; current: SalaryStructure | null }) {
  const form = useForm({
    resolver: zodResolver(salaryStructureSchema),
    defaultValues: { annualCtc: 0, basic: 0, hra: 0, specialAllowance: 0, otherAllowances: 0, bonus: 0, employerPf: 0, gratuity: 0, effectiveFrom: todayDateOnly(), reason: "", notes: "" },
  });
  useEffect(() => {
    if (!open) return;
    const next = `${addMonths(currentMonth(), 1)}-01`;
    form.reset(current ? {
      annualCtc: current.annualCtc, basic: current.basic, hra: current.hra, specialAllowance: current.specialAllowance, otherAllowances: current.otherAllowances,
      bonus: current.bonus, employerPf: current.employerPf, gratuity: current.gratuity, effectiveFrom: next, reason: "Annual appraisal", notes: "",
    } : { annualCtc: 0, basic: 0, hra: 0, specialAllowance: 0, otherAllowances: 0, bonus: 0, employerPf: 0, gratuity: 0, effectiveFrom: todayDateOnly(), reason: "Initial salary", notes: "" });
  }, [open, current, form]);

  const values = useWatch({ control: form.control });
  const monthly = round2(Number(values.annualCtc || 0) / 12);
  const sum = useMemo(
    () => ["basic", "hra", "specialAllowance", "otherAllowances", "bonus", "employerPf", "gratuity"].reduce((s, k) => s + Number((values as Record<string, unknown>)[k] || 0), 0),
    [values],
  );
  const diff = round2(monthly - sum);

  const save = useApiMutation((v: unknown) => api.post(`/api/employees/${employeeId}/salary`, v), {
    success: "Salary saved — the previous version is kept in history",
    invalidate: [`/api/employees/${employeeId}`, "/api/employees"],
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={current ? "Revise salary" : "Set salary"}
      description={current ? `Currently ${formatMoney(current.annualCtc, "INR", { decimals: 0 })} a year. The new version starts on the date you choose; the old one is closed the day before.` : "The first salary structure for this employee."}
      formId="salary-form"
      submitLabel="Save salary"
      pending={save.isPending}
    >
      <Form form={form} id="salary-form" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
        <FormSection>
          <CurrencyField name="annualCtc" label="Annual CTC" required />
          <DateField name="effectiveFrom" label="Effective from" required />
          <div className="sm:col-span-2">
            <Button type="button" variant="outline" size="sm" onClick={() => {
              const s = suggest(Number(form.getValues("annualCtc") || 0));
              for (const [k, v] of Object.entries(s)) form.setValue(k as "basic", v, { shouldValidate: true });
            }}>
              Split into standard components
            </Button>
          </div>
        </FormSection>
        <FormSection title="Monthly components" description="Must add up to CTC ÷ 12.">
          <CurrencyField name="basic" label="Basic" required />
          <CurrencyField name="hra" label="HRA" required />
          <CurrencyField name="specialAllowance" label="Special allowance" required />
          <CurrencyField name="otherAllowances" label="Other allowances" />
          <CurrencyField name="bonus" label="Bonus (monthly)" />
          <CurrencyField name="employerPf" label="Employer PF" />
          <CurrencyField name="gratuity" label="Gratuity" />
        </FormSection>
        <div className={cn("flex items-center justify-between rounded-xl px-4 py-3 text-[13px]", Math.abs(diff) <= 1 ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
          <span>Components {formatMoney(sum)} of {formatMoney(monthly)} a month</span>
          <span className="num font-semibold">{Math.abs(diff) <= 1 ? "Balanced" : `${diff > 0 ? "Short by" : "Over by"} ${formatMoney(Math.abs(diff))}`}</span>
        </div>
        <FormSection>
          <TextField name="reason" label="Reason" placeholder="Annual appraisal" full />
          <TextareaField name="notes" label="Notes" rows={2} />
        </FormSection>
      </Form>
    </Drawer>
  );
}

function RecurringModal({ employeeId, value, onClose }: { employeeId: string; value: Recurring | "new" | null; onClose: () => void }) {
  const editing = value && value !== "new" ? value : null;
  const form = useForm({
    resolver: zodResolver(recurringDeductionSchema),
    defaultValues: { code: "TDS", label: "Income tax deducted at source", amount: 0, startMonth: currentMonth(), endMonth: "", isActive: true, notes: "" } as RecurringDeductionInput,
  });
  useEffect(() => {
    if (!value) return;
    form.reset(editing
      ? { code: editing.code as RecurringDeductionInput["code"], label: editing.label, amount: editing.amount, startMonth: editing.startMonth, endMonth: editing.endMonth ?? "", isActive: editing.isActive, notes: editing.notes ?? "" }
      : { code: "TDS", label: "Income tax deducted at source", amount: 0, startMonth: currentMonth(), endMonth: "", isActive: true, notes: "" });
  }, [value, editing, form]);

  const save = useApiMutation(
    (v: unknown) => (editing ? api.put(`/api/employees/${employeeId}/recurring-deductions/${editing.id}`, v) : api.post(`/api/employees/${employeeId}/recurring-deductions`, v)),
    { success: "Deduction saved", invalidate: [`/api/employees/${employeeId}`], onSuccess: onClose },
  );

  return (
    <Modal open={!!value} onOpenChange={(o) => !o && onClose()} title={editing ? "Edit recurring deduction" : "Add recurring deduction"} formId="recurring-form" pending={save.isPending}>
      <Form form={form} id="recurring-form" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
        <FormSection>
          <SelectField name="code" label="Type" options={Options.deductionCode} required onValueChange={(c) => !editing && form.setValue("label", label(DEDUCTION_CODE, c))} />
          <CurrencyField name="amount" label="Monthly amount" required />
          <TextField name="label" label="Label on payslip" required full />
          <MonthField name="startMonth" label="From" required />
          <MonthField name="endMonth" label="Until" clearable hint="Leave empty to continue" />
          <SwitchField name="isActive" label="Active" full />
          <TextareaField name="notes" label="Notes" rows={2} />
        </FormSection>
      </Form>
    </Modal>
  );
}
