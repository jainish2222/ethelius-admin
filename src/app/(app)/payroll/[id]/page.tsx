"use client";

import { DocTitle } from "@/components/shared/doc-title";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BadgeCheck, Ban, Calculator, Eye, FileCheck2, Landmark, Lock, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CardBody, CardHead, GlassCard } from "@/components/shared/glass-card";
import { DetailList } from "@/components/shared/detail-list";
import { Money } from "@/components/shared/money";
import { CurrencyInput } from "@/components/shared/pickers";
import { Pill, StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Modal } from "@/components/shared/overlays";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { BankCreditModal, PAYROLL_INVALIDATE, type CreditTarget } from "@/features/payroll/bank-credit";
import { Stepper } from "@/features/payroll/stepper";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { DEDUCTION_CODE, EARNING_CODE, label } from "@/lib/constants";
import { formatDate, formatDateTime, monthLabel } from "@/lib/dates";
import { amountInWords, formatMoney, maskAccount, round2 } from "@/lib/money";

type Line = { id?: string; code: string; label: string; amount: number; isManual?: boolean };
type Payroll = CreditTarget & {
  status: string; workingDays: number; paidDays: number; lopDays: number; overtimeHours: number;
  grossEarnings: number; totalDeductions: number; employerCost: number; calculatedAt: string | null; approvedAt: string | null; paidAt: string | null;
  approvedBy: { name: string } | null; locked: boolean;
  employee: CreditTarget["employee"] & { id: string; designation: string; department: string; joiningDate: string };
  salaryStructure: { annualCtc: number; monthlyCtc: number; effectiveFrom: string; basic: number };
  items: Line[]; deductions: Line[];
  bankAccount: { bankName: string; accountNumber: string; ifsc: string } | null;
  payslip: { id: string; payslipNumber: string; generatedAt: string; emailedAt: string | null } | null;
  attendance: { presentDays: number; paidLeave: number; unpaidLeave: number; holidays: number; leaveBalance: number | null } | null;
  history: { id: string; action: string; userName: string | null; createdAt: string }[];
};

const HISTORY_LABEL: Record<string, string> = {
  "payroll.calculated": "Calculated", "payroll.edited": "Lines edited", "payroll.approved": "Approved and locked", "payroll.cancelled": "Cancelled",
  "payroll.reopened": "Reopened", "payroll.bank_credit_recorded": "Bank credit recorded",
};

export default function PayrollDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const { data: p, isLoading, error, refetch } = useApi<Payroll>(`/api/payroll/${id}`);
  const [editing, setEditing] = useState(false);
  const [earnings, setEarnings] = useState<Line[]>([]);
  const [deductions, setDeductions] = useState<Line[]>([]);
  const [crediting, setCrediting] = useState(false);
  const [preview, setPreview] = useState(false);
  const { confirm, dialog } = useConfirm();

  const status = useApiMutation((action: "calculate" | "approve" | "cancel" | "reopen") => api.post(`/api/payroll/${id}/status`, { action }), {
    invalidate: PAYROLL_INVALIDATE,
    success: (_r, a) => ({ calculate: "Recalculated from salary, attendance and rules", approve: "Approved — earnings and deductions are now locked", cancel: "Payroll cancelled", reopen: "Reopened as draft" })[a],
  });
  const saveLines = useApiMutation(() => api.put(`/api/payroll/${id}`, { earnings, deductions, notes: p?.notes ?? null }), {
    invalidate: PAYROLL_INVALIDATE, success: "Payroll lines saved", onSuccess: () => setEditing(false),
  });
  const genSlip = useApiMutation((regenerate: boolean) => api.post<{ results: { payslipId?: string; error?: string }[] }>("/api/payslips", { payrollIds: [id], regenerate }), {
    invalidate: PAYROLL_INVALIDATE,
    onSuccess: (r) => { const x = r.results[0]; if (x?.error) toast.error(x.error); else toast.success("Payslip generated"); },
  });

  if (isLoading) return <LoadingState rows={2} />;
  if (error || !p) return <ErrorState message={error ? (error as Error).message : "Payroll not found."} onRetry={() => refetch()} />;

  const startEdit = () => { setEarnings(p.items); setDeductions(p.deductions); setEditing(true); };
  const write = can("payroll.write");
  const editable = write && ["DRAFT", "CALCULATED"].includes(p.status);
  const gross = round2(earnings.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const ded = round2(deductions.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const net = round2(gross - ded);
  const variance = p.actualBankCredit == null ? null : round2(p.actualBankCredit - p.netSalary);
  const order = ["DRAFT", "CALCULATED", "APPROVED", "PROCESSING", "PAID"];
  const at = order.indexOf(p.status);
  const st = (i: number) => (p.status === "CANCELLED" ? "todo" : at > i ? "done" : at === i ? "current" : "todo") as "done" | "current" | "todo";

  return (
    <div className="flex flex-col gap-6">
      <DocTitle title={`${p.employee.fullName} · payroll`} />
      <Link href={`/payroll?month=${p.month}`} className="-mb-2 w-fit text-[13px] font-medium text-muted-foreground hover:text-foreground">← Payroll · {monthLabel(p.month)}</Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold tracking-wide text-brand-ink uppercase">{monthLabel(p.month)} payroll</p>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] font-bold tracking-[-0.025em]"><Link href={`/employees/${p.employee.id}`} className="hover:underline">{p.employee.fullName}</Link></h1>
            <StatusBadge status={p.status} />
            {p.locked && <Pill><Lock className="mr-1 size-3" /> Locked</Pill>}
          </div>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{p.employee.employeeCode} · {p.employee.designation} · {p.employee.department}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreview(true)}><Eye className="size-4" /> Preview payslip</Button>
          {editable && !editing && <Button variant="outline" onClick={() => status.mutate("calculate")} disabled={status.isPending}><Calculator className="size-4" /> Recalculate</Button>}
          {editable && !editing && <Button variant="outline" onClick={startEdit}><Pencil className="size-4" /> Edit lines</Button>}
          {can("payroll.approve") && p.status === "CALCULATED" && !editing && (
            <Button onClick={async () => { if ((await confirm({ title: "Approve this payroll?", description: "Earnings and deductions will be locked. You can still record the bank credit and generate the payslip.", confirmLabel: "Approve & lock" })).ok) status.mutate("approve"); }}>
              <BadgeCheck className="size-4" /> Approve
            </Button>
          )}
          {write && p.locked && <Button onClick={() => setCrediting(true)}><Landmark className="size-4" /> {p.actualBankCredit == null ? "Record bank credit" : "Edit bank credit"}</Button>}
          {can("payslip.write") && p.locked && !p.payslip && <Button variant="outline" onClick={() => genSlip.mutate(false)} disabled={genSlip.isPending}><FileCheck2 className="size-4" /> Generate payslip</Button>}
          {p.payslip && <Button variant="outline" asChild><Link href={`/payslips/${p.payslip.id}`}><FileCheck2 className="size-4" /> {p.payslip.payslipNumber}</Link></Button>}
          {write && ["DRAFT", "CALCULATED"].includes(p.status) && !editing && (
            <Button variant="ghost" onClick={async () => { if ((await confirm({ title: "Cancel this payroll?", description: "It can be reopened later.", destructive: true, confirmLabel: "Cancel payroll" })).ok) status.mutate("cancel"); }}><Ban className="size-4" /> Cancel</Button>
          )}
          {write && p.status === "CANCELLED" && <Button variant="outline" onClick={() => status.mutate("reopen")}><RotateCcw className="size-4" /> Reopen</Button>}
        </div>
      </div>

      <Stepper steps={[
        { label: "Draft", hint: "Created", state: st(0) },
        { label: "Calculated", hint: p.calculatedAt ? formatDate(p.calculatedAt) : "—", state: st(1) },
        { label: "Reviewed", hint: p.status === "CALCULATED" ? "Awaiting approval" : at > 1 ? "Done" : "—", state: at > 1 ? "done" : p.status === "CALCULATED" ? "current" : "todo" },
        { label: "Approved", hint: p.approvedBy ? `${p.approvedBy.name}` : "—", state: st(2) },
        { label: "Paid", hint: p.bankCreditDate ? formatDate(p.bankCreditDate) : "—", state: p.status === "PAID" ? "done" : p.status === "PROCESSING" || p.status === "APPROVED" ? "current" : "todo" },
        { label: "Payslip", hint: p.payslip ? p.payslip.payslipNumber : "—", state: p.payslip ? "done" : p.status === "PAID" ? "current" : "todo" },
      ]} />

      <div className="grid gap-4 xl:grid-cols-3">
        <GlassCard className="xl:col-span-2">
          <CardHead
            title="Earnings & deductions"
            description={editing ? "Manual deduction lines are kept when you recalculate; computed earnings are rebuilt from salary and attendance." : p.locked ? "Locked after approval." : "Calculated from the salary structure, attendance, payroll rules and recurring deductions."}
            action={editing && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X className="size-4" /> Discard</Button>
                <Button size="sm" onClick={() => saveLines.mutate()} disabled={saveLines.isPending || ded > gross}><Save className="size-4" /> Save</Button>
              </div>
            )}
          />
          <CardBody>
            <div className="grid gap-6 md:grid-cols-2">
              <LineEditor title="Earnings" lines={editing ? earnings : p.items} setLines={setEarnings} editing={editing} codes={EARNING_CODE} defaultCode="CUSTOM" />
              <LineEditor title="Deductions" lines={editing ? deductions : p.deductions} setLines={setDeductions} editing={editing} codes={DEDUCTION_CODE} defaultCode="OTHER" />
            </div>
            <div className="mt-5 grid gap-3 border-t border-border pt-4 text-[13.5px] sm:grid-cols-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Gross earnings</span><Money value={editing ? gross : p.grossEarnings} className="font-semibold" /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total deductions</span><Money value={editing ? ded : p.totalDeductions} className="font-semibold" /></div>
            </div>
            <div className="mt-4 flex items-baseline justify-between rounded-xl bg-[#0E1A16] px-4 py-3 text-white dark:bg-black/60">
              <span className="text-[13.5px] font-semibold">Calculated net salary</span>
              <span className="num text-[22px] font-extrabold text-[#B8F3E5]">{formatMoney(editing ? net : p.netSalary)}</span>
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">{amountInWords(editing ? net : p.netSalary)}</p>
            {editing && ded > gross && <p className="mt-2 text-[12.5px] font-medium text-danger">Deductions exceed gross earnings.</p>}
          </CardBody>
        </GlassCard>

        <div className="flex flex-col gap-4">
          <GlassCard>
            <CardHead title="Bank credit" description="What actually reached the employee's account." />
            <CardBody>
              {p.actualBankCredit == null ? (
                <p className="text-[13px] text-muted-foreground">{p.locked ? "Not recorded yet." : "Available once the payroll is approved."}</p>
              ) : (
                <DetailList columns={1} items={[
                  { label: "Actual bank credit", value: <span className="num text-[17px] font-bold">{formatMoney(p.actualBankCredit)}</span> },
                  { label: "Difference from net salary", value: variance ? <span className="num font-semibold text-warning">{variance > 0 ? "+" : "−"}{formatMoney(Math.abs(variance))}</span> : <span className="text-success">None</span> },
                  { label: "Credit date", value: formatDate(p.bankCreditDate) },
                  { label: "Reference", value: p.transactionRef },
                  { label: "Account", value: p.bankAccount ? `${p.bankAccount.bankName} ${maskAccount(p.bankAccount.accountNumber)}` : null },
                  { label: "Payment status", value: <StatusBadge status={p.paymentStatus} /> },
                  { label: "Notes", value: p.notes, hidden: !p.notes },
                ]} />
              )}
            </CardBody>
          </GlassCard>
          <GlassCard>
            <CardHead title="Inputs" />
            <CardBody>
              <DetailList columns={2} items={[
                { label: "Working days", value: p.workingDays },
                { label: "Paid days", value: p.paidDays },
                { label: "LOP days", value: p.lopDays },
                { label: "Overtime", value: p.overtimeHours ? `${p.overtimeHours} h` : "—" },
                { label: "Present days", value: p.attendance?.presentDays ?? "Not recorded" },
                { label: "Leave balance", value: p.attendance?.leaveBalance ?? null },
                { label: "Salary structure", value: `${formatMoney(p.salaryStructure.annualCtc, "INR", { decimals: 0 })} CTC`, full: true },
                { label: "Effective from", value: formatDate(p.salaryStructure.effectiveFrom) },
                { label: "Employer cost", value: formatMoney(p.employerCost, "INR", { decimals: 0 }) },
              ]} />
            </CardBody>
          </GlassCard>
          <GlassCard>
            <CardHead title="History" />
            <CardBody>
              {!p.history.length ? <p className="text-[13px] text-muted-foreground">No changes recorded yet.</p> : (
                <ul className="flex flex-col gap-2.5">
                  {p.history.map((h) => (
                    <li key={h.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="font-medium">{HISTORY_LABEL[h.action] ?? h.action}</span>
                      <span className="text-right text-[12px] text-muted-foreground">{h.userName} · {formatDateTime(h.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </GlassCard>
        </div>
      </div>

      <BankCreditModal target={crediting ? p : null} onClose={() => setCrediting(false)} />
      <Modal open={preview} onOpenChange={setPreview} title="Payslip preview" description={p.locked ? undefined : "Marked PREVIEW until the payroll is approved."} className="sm:max-w-[880px]">
        <iframe title="Payslip preview" src={`/api/payroll/${p.id}/preview`} className="h-[70vh] w-full rounded-xl border border-border bg-white" />
      </Modal>
      {dialog}
    </div>
  );
}

function LineEditor<C extends Record<string, string>>({
  title, lines, setLines, editing, codes, defaultCode,
}: { title: string; lines: Line[]; setLines: (l: Line[]) => void; editing: boolean; codes: C; defaultCode: keyof C & string }) {
  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div>
      <p className="mb-2 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="flex flex-col">
        {lines.map((l, i) => (
          <li key={l.id ?? i} className={cn("flex items-center gap-2 border-b border-border py-2", editing && "py-1.5")}>
            {editing ? (
              <>
                <Select value={l.code} onValueChange={(v) => update(i, { code: v })}>
                  <SelectTrigger size="sm" className="h-8 w-[110px] shrink-0 rounded-lg text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(codes).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={l.label} onChange={(e) => update(i, { label: e.target.value })} className="h-8 min-w-0 flex-1 rounded-lg text-[13px]" aria-label="Label" />
                <div className="w-[130px] shrink-0"><CurrencyInput value={l.amount} onChange={(n) => update(i, { amount: n === "" ? 0 : n })} /></div>
                <Button variant="ghost" size="icon-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 className="size-3.5" /></Button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{l.label}{l.isManual && <Pill className="ml-2 h-5">Manual</Pill>}</span>
                <Money value={l.amount} className="text-[13.5px]" />
              </>
            )}
          </li>
        ))}
        {!lines.length && <li className="py-3 text-[13px] text-muted-foreground">None</li>}
      </ul>
      {editing && (
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setLines([...lines, { code: defaultCode, label: label(codes, defaultCode), amount: 0 }])}>
          <Plus className="size-3.5" /> Add line
        </Button>
      )}
    </div>
  );
}
