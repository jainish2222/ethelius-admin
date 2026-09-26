"use client";

import Link from "next/link";
import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/components/providers/session";
import { formatCompact, formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Wallet } from "lucide-react";

type Row = {
  id: string; month: string; status: string; paymentStatus: string; netSalary: number; grossEarnings: number; totalDeductions: number;
  actualBankCredit: number | null; bankCreditDate: string; payslip: { id: string; payslipNumber: string } | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Year-by-year grid of an employee's payroll months; each month opens its payroll (or payslip). */
export function PayrollMonths({ employeeId }: { employeeId: string }) {
  const { can } = useSession();
  const { data, isLoading } = useApi<Row[]>(`/api/employees/${employeeId}/payroll`);
  if (isLoading) return <Skeleton className="h-72 rounded-2xl" />;
  if (!data?.length) return <EmptyState icon={Wallet} title="No payroll yet" description="Monthly payroll appears here once it has been generated." />;

  const years = [...new Set(data.map((r) => r.month.slice(0, 4)))].sort().reverse();
  const admin = can("payroll.read");

  return (
    <div className="flex flex-col gap-6">
      {years.map((y) => {
        const rows = data.filter((r) => r.month.startsWith(y) && r.status !== "CANCELLED");
        const total = rows.reduce((s, r) => s + r.netSalary, 0);
        return (
          <section key={y}>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-[15px] font-semibold">{y}</h3>
              <p className="text-[12.5px] text-muted-foreground">Net paid <span className="num font-semibold text-foreground">{formatMoney(total, "INR", { decimals: 0 })}</span></p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {MONTHS.map((m, i) => {
                const key = `${y}-${String(i + 1).padStart(2, "0")}`;
                const r = data.find((x) => x.month === key);
                if (!r) {
                  return (
                    <div key={key} className="rounded-xl border border-dashed border-border px-3.5 py-3 opacity-60">
                      <p className="text-[12.5px] font-semibold text-muted-foreground">{m}</p>
                      <p className="mt-2 text-[12px] text-muted-foreground">—</p>
                    </div>
                  );
                }
                const href = admin ? `/payroll/${r.id}` : r.payslip ? `/payslips/${r.payslip.id}` : undefined;
                const body = (
                  <div className={cn("glass h-full rounded-xl px-3.5 py-3 transition-all duration-150", href && "hover:-translate-y-px hover:border-foreground/15")}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12.5px] font-semibold">{m}</p>
                      {r.payslip && <span className="text-[10.5px] font-semibold text-brand-ink">Payslip</span>}
                    </div>
                    <p className="num mt-1.5 text-[17px] font-bold tracking-tight" title={formatMoney(r.netSalary)}>{formatCompact(r.netSalary)}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <StatusBadge status={r.status} className="h-5 px-2 text-[10.5px]" />
                    </div>
                    {r.bankCreditDate && <p className="mt-1.5 text-[11px] text-muted-foreground">Credited {formatDate(r.bankCreditDate)}</p>}
                  </div>
                );
                return href ? <Link key={key} href={href} className="rounded-xl">{body}</Link> : <div key={key}>{body}</div>;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
