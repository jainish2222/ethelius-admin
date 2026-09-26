"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, Calculator, CalendarCheck, Eye, FileCheck2, Landmark, Loader2, Play, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, right } from "@/components/shared/data-table";
import { GlassCard } from "@/components/shared/glass-card";
import { MonthPicker } from "@/components/shared/pickers";
import { Money } from "@/components/shared/money";
import { PersonCell } from "@/components/shared/person";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { BankCreditModal, PAYROLL_INVALIDATE, type CreditTarget } from "@/features/payroll/bank-credit";
import { Stepper, type Step } from "@/features/payroll/stepper";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { Options } from "@/lib/constants";
import { currentMonth, formatDate, monthLabel } from "@/lib/dates";
import { formatCompact } from "@/lib/money";
import type { PayrollRow } from "@/types";

type Summary = {
  month: string; eligible: number; withSalary: number; attendanceRecorded: number; payslips: number; generated: number;
  counts: Record<string, number>; gross: number; net: number; credited: number;
};

export default function PayrollPage() {
  const search = useSearchParams();
  const { can } = useSession();
  const [month, setMonth] = useState(search.get("month") ?? currentMonth());
  const { data: s, isLoading } = useApi<Summary>("/api/payroll/summary", { month });
  const [crediting, setCrediting] = useState<CreditTarget | null>(null);
  const { confirm, dialog } = useConfirm();
  const write = can("payroll.write");
  const approver = can("payroll.approve");
  const c = (k: string) => s?.counts[k] ?? 0;
  const locked = c("APPROVED") + c("PROCESSING") + c("PAID");

  const generate = useApiMutation(() => api.post<{ created: number; calculated: number; skipped: { employee: string; reason: string }[] }>("/api/payroll", { month, calculate: true }), {
    invalidate: PAYROLL_INVALIDATE,
    success: (r) => `${r.created} payroll record${r.created === 1 ? "" : "s"} generated and calculated`,
    onSuccess: (r) => {
      const noSalary = r.skipped.filter((x) => x.reason.startsWith("No salary"));
      if (noSalary.length) toast.warning(`${noSalary.length} skipped — no salary structure: ${noSalary.map((x) => x.employee).join(", ")}`);
    },
  });
  const bulk = useApiMutation((b: { action: "calculate" | "approve"; ids?: string[] }) => api.post<{ done: number; failed: string[] }>("/api/payroll/bulk", { month, ...b }), {
    invalidate: PAYROLL_INVALIDATE,
    success: (r, v) => `${r.done} payroll${r.done === 1 ? "" : "s"} ${v.action === "approve" ? "approved and locked" : "recalculated"}${r.failed.length ? ` · ${r.failed.length} failed` : ""}`,
  });
  const payslips = useApiMutation((ids: string[]) => api.post<{ results: { error?: string }[] }>("/api/payslips", { payrollIds: ids }), {
    invalidate: PAYROLL_INVALIDATE,
    success: (r) => `${r.results.filter((x) => !x.error).length} payslip(s) ready`,
    onSuccess: (r) => { const f = r.results.filter((x) => x.error); if (f.length) toast.error(f[0].error!); },
  });

  const approveAll = async () => {
    const { ok } = await confirm({
      title: `Approve ${c("CALCULATED")} payroll records for ${monthLabel(month)}?`,
      description: "Approval locks earnings and deductions — they can no longer be edited. Bank credits can still be recorded afterwards.",
      confirmLabel: "Approve & lock",
    });
    if (ok) bulk.mutate({ action: "approve" });
  };

  const generatePayslipsForMonth = async () => {
    const list = await api.get<{ data: PayrollRow[] }>("/api/payroll", { month, status: "APPROVED,PROCESSING,PAID", pageSize: 1000 });
    const ids = list.data.filter((r) => !r.payslip).map((r) => r.id);
    if (!ids.length) return toast.message("Every approved payroll already has a payslip.");
    payslips.mutate(ids);
  };

  const steps: Step[] = useMemo(() => {
    if (!s) return [];
    const gen = s.generated;
    const st = (done: boolean, current: boolean): Step["state"] => (done ? "done" : current ? "current" : "todo");
    const attendanceDone = s.attendanceRecorded >= s.eligible && s.eligible > 0;
    const calcDone = gen > 0 && c("DRAFT") === 0;
    const approveDone = gen > 0 && c("CALCULATED") === 0 && c("DRAFT") === 0;
    const payDone = gen > 0 && c("PAID") === gen - c("CANCELLED");
    const slipDone = payDone && s.payslips >= c("PAID");
    return [
      { label: "Attendance", hint: `${s.attendanceRecorded}/${s.eligible} recorded`, state: st(attendanceDone, !attendanceDone && gen === 0) },
      { label: "Calculate", hint: gen ? `${gen} generated` : "Not started", state: st(calcDone, attendanceDone && !calcDone) },
      { label: "Review", hint: `${c("CALCULATED")} to review`, state: st(approveDone, calcDone && !approveDone) },
      { label: "Approve", hint: `${locked} locked`, state: st(approveDone, false) },
      { label: "Pay", hint: `${c("PAID")} credited`, state: st(payDone, approveDone && !payDone) },
      { label: "Payslips", hint: `${s.payslips} generated`, state: st(slipDone, payDone && !slipDone) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const columns = useMemo<ColumnDef<PayrollRow, unknown>[]>(() => [
    { id: "employee", header: "Employee", cell: ({ row: { original: p } }) => <PersonCell id={p.employee.id} name={p.employee.fullName} subtitle={`${p.employee.employeeCode} · ${p.employee.department}`} /> },
    { id: "days", header: "Paid days", enableSorting: false, meta: right, cell: ({ row: { original: p } }) => <span className="num">{p.paidDays}<span className="text-muted-foreground">/{p.workingDays}</span></span> },
    { id: "gross", header: "Gross", meta: right, cell: ({ row }) => <Money value={row.original.grossEarnings} decimals={0} /> },
    { id: "pf", header: "PF", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.pf} decimals={0} tone="muted" /> },
    { id: "pt", header: "PT", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.pt} decimals={0} tone="muted" /> },
    { id: "tds", header: "TDS", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.tds} decimals={0} tone="muted" /> },
    { id: "deductions", header: "Deductions", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.totalDeductions} decimals={0} /> },
    { id: "net", header: "Net salary", meta: right, cell: ({ row }) => <Money value={row.original.netSalary} decimals={0} className="font-semibold" /> },
    {
      id: "bankCredit", header: "Bank credit", meta: right,
      cell: ({ row: { original: p } }) => p.actualBankCredit == null ? <span className="text-[12px] text-muted-foreground">—</span> : (
        <div className="text-right">
          <Money value={p.actualBankCredit} decimals={0} />
          {p.variance ? <p className="num text-[11px] font-semibold text-warning">{p.variance > 0 ? "+" : ""}{p.variance.toLocaleString("en-IN")}</p> : <p className="text-[11px] text-muted-foreground">{formatDate(p.bankCreditDate)}</p>}
        </div>
      ),
    },
    { id: "status", header: "Status", cell: ({ row: { original: p } }) => <div className="flex items-center gap-1.5"><StatusBadge status={p.status} />{p.payslip && <FileCheck2 className="size-3.5 text-success" aria-label="Payslip generated" />}</div> },
  ], []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll"
        description="Generate, review and approve the month's payroll, record bank credits, then issue payslips."
        className="mb-0 lg:mb-0"
        actions={<div className="w-[190px]"><MonthPicker value={month} onChange={(v) => v && setMonth(v)} /></div>}
      />

      <GlassCard className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold">{monthLabel(month)} payroll run</p>
            <p className="text-[12.5px] text-muted-foreground">
              {s ? `${s.eligible} employees on the books · ${s.withSalary} with a salary structure` : "Loading…"}
            </p>
          </div>
          {write && s && (
            <div className="flex flex-wrap gap-2">
              {s.attendanceRecorded < s.eligible && <Button variant="outline" asChild><Link href={`/attendance?month=${month}`}><CalendarCheck className="size-4" /> Attendance ({s.attendanceRecorded}/{s.eligible})</Link></Button>}
              {s.generated < s.withSalary && (
                <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                  {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Generate payroll ({s.withSalary - s.generated})
                </Button>
              )}
              {c("DRAFT") + c("CALCULATED") > 0 && (
                <Button variant="outline" onClick={() => bulk.mutate({ action: "calculate" })} disabled={bulk.isPending}><Calculator className="size-4" /> Recalculate</Button>
              )}
              {approver && c("CALCULATED") > 0 && (
                <Button onClick={approveAll} disabled={bulk.isPending}><BadgeCheck className="size-4" /> Approve {c("CALCULATED")}</Button>
              )}
              {locked > 0 && c("PAID") < locked && <Button variant="outline" asChild><Link href={`/bank-payments?month=${month}`}><Landmark className="size-4" /> Record bank credits</Link></Button>}
              {can("payslip.write") && locked > s.payslips && (
                <Button variant="outline" onClick={generatePayslipsForMonth} disabled={payslips.isPending}>
                  {payslips.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />} Generate payslips ({locked - s.payslips})
                </Button>
              )}
            </div>
          )}
        </div>
        {s && <Stepper steps={steps} />}
      </GlassCard>

      <StatGrid>
        <StatCard label="Gross earnings" value={formatCompact(s?.gross ?? 0)} loading={isLoading} icon={Wallet} tone="info" />
        <StatCard label="Net salary" value={formatCompact(s?.net ?? 0)} loading={isLoading} icon={Wallet} tone="brand" hint={`${s?.generated ?? 0} employees`} />
        <StatCard label="Credited to banks" value={formatCompact(s?.credited ?? 0)} loading={isLoading} icon={Landmark} tone="success" hint={`${c("PAID")} paid`} />
        <StatCard label="Awaiting approval" value={c("CALCULATED")} loading={isLoading} icon={BadgeCheck} tone={c("CALCULATED") ? "warning" : "neutral"} hint={approver ? "You can approve" : "Needs a finance approver"} />
      </StatGrid>

      <DataTable<PayrollRow>
        key={month}
        endpoint="/api/payroll"
        exportKey="payroll"
        params={{ month }}
        syncFromUrl={false}
        columns={columns}
        defaultSort={{ id: "employee", desc: false }}
        defaultPageSize={50}
        compact
        searchPlaceholder="Search employee…"
        rowHref={(p) => `/payroll/${p.id}`}
        selectable={write}
        filters={[
          { type: "select", key: "status", label: "Status", options: Options.payrollStatus },
          { type: "select", key: "paymentStatus", label: "Payment", options: Options.salaryPaymentStatus },
        ]}
        bulkActions={(rows, clear) => (
          <>
            <Button size="sm" variant="outline" onClick={() => { bulk.mutate({ action: "calculate", ids: rows.map((r) => r.id) }); clear(); }}>Recalculate</Button>
            {approver && <Button size="sm" onClick={() => { bulk.mutate({ action: "approve", ids: rows.map((r) => r.id) }); clear(); }}>Approve</Button>}
            {can("payslip.write") && <Button size="sm" variant="outline" onClick={() => { payslips.mutate(rows.filter((r) => ["APPROVED", "PROCESSING", "PAID"].includes(r.status)).map((r) => r.id)); clear(); }}>Generate payslips</Button>}
          </>
        )}
        rowActions={() => [
          { label: "Open", icon: Eye, href: (r) => `/payroll/${r.id}` },
          { label: "Record bank credit", icon: Landmark, hidden: (r) => !write || !["APPROVED", "PROCESSING", "PAID"].includes(r.status), onSelect: (r) => setCrediting({ ...r, employee: { ...r.employee } }) },
          { label: "View payslip", icon: FileCheck2, hidden: (r) => !r.payslip, href: (r) => `/payslips/${r.payslip!.id}` },
        ]}
        empty={{ icon: Wallet, title: `No payroll for ${monthLabel(month)} yet`, description: write ? "Use “Generate payroll” to create and calculate it for everyone with a salary structure." : undefined }}
      />
      <BankCreditModal target={crediting} onClose={() => setCrediting(null)} />
      {dialog}
    </div>
  );
}
