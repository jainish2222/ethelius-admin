"use client";

import { DocTitle } from "@/components/shared/doc-title";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BadgeIndianRupee, Building2, CalendarRange, Hourglass, Pencil, PiggyBank, Receipt, TrendingUp, UserRound, Users, Wallet } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardBody, CardHead, GlassCard } from "@/components/shared/glass-card";
import { DetailList } from "@/components/shared/detail-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { Money } from "@/components/shared/money";
import { useSession } from "@/components/providers/session";
import { ProjectFormDrawer, type ProjectForForm } from "@/features/projects/project-form";
import { AssignmentsTable } from "@/features/assignments/assignments-table";
import { InvoicesTable } from "@/features/invoices/invoices-table";
import { PaymentsTable } from "@/features/payments/payments-table";
import { ExpensesTable } from "@/features/expenses/expenses";
import { MonthHistoryList } from "@/features/billing/month-history";
import { useApi } from "@/hooks/use-api";
import { BILLING_TYPE, PAYMENT_TERMS, label } from "@/lib/constants";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatCompact } from "@/lib/money";
import type { AuditRow } from "@/features/activity/describe";
import type { AssignmentRow, MonthHistory, Profitability } from "@/types";

type Project = ProjectForForm & {
  company: { id: string; name: string; currency: string };
  manager: { id: string; fullName: string; designation: string } | null;
  assignments: AssignmentRow[];
  finances: null | { invoiced: number; received: number; outstanding: number; overdue: number; history: MonthHistory[] };
  profitability: (Profitability & { months: NonNullable<Profitability["months"]> }) | null;
};

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const { data: p, isLoading, error, refetch } = useApi<Project>(`/api/projects/${id}`);
  const [editing, setEditing] = useState(false);
  if (isLoading) return <LoadingState />;
  if (error || !p) return <ErrorState message={error ? (error as Error).message : "Project not found."} onRetry={() => refetch()} />;

  const current = p.assignments.filter((a) => a.isCurrent);
  const f = p.finances;
  const pr = p.profitability;

  return (
    <div className="flex flex-col gap-6">
      <DocTitle title={p.name} />
      <Link href="/projects" className="-mb-2 w-fit text-[13px] font-medium text-muted-foreground hover:text-foreground">← Projects</Link>
      <GlassCard className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_160%_at_0%_0%,var(--brand-soft),transparent_65%)]" />
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="min-w-0 flex-1">
            <p className="num mb-1 text-[12px] font-semibold tracking-wide text-brand-ink uppercase">{p.code}</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[26px] leading-tight font-bold tracking-[-0.025em]">{p.name}</h1>
              <StatusBadge status={p.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground">
              <Link href={`/companies/${p.company.id}`} className="flex items-center gap-1.5 hover:text-foreground"><Building2 className="size-3.5" /> {p.company.name}</Link>
              {p.manager && <Link href={`/employees/${p.manager.id}`} className="flex items-center gap-1.5 hover:text-foreground"><UserRound className="size-3.5" /> {p.manager.fullName}</Link>}
              <span className="flex items-center gap-1.5"><CalendarRange className="size-3.5" /> {formatDate(p.startDate)} – {p.endDate ? formatDate(p.endDate) : "ongoing"}</span>
              <span className="flex items-center gap-1.5"><Users className="size-3.5" /> {current.length} on the team</span>
            </div>
          </div>
          {can("project.write") && <Button onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit</Button>}
        </div>
      </GlassCard>

      {(f || pr) && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard label="Monthly billing" value={p.monthlyBillingAmount ? formatCompact(p.monthlyBillingAmount, p.currency) : label(BILLING_TYPE, p.billingType)} icon={TrendingUp} tone="brand" />
          {f && <StatCard label="Total invoiced" value={formatCompact(f.invoiced)} icon={Receipt} tone="info" />}
          {f && <StatCard label="Total received" value={formatCompact(f.received)} icon={BadgeIndianRupee} tone="success" />}
          {f && <StatCard label="Outstanding" value={formatCompact(f.outstanding)} icon={Hourglass} tone="warning" emphasis={f.overdue ? "danger" : undefined} hint={f.overdue ? `${formatCompact(f.overdue)} overdue` : undefined} />}
          {pr && <StatCard label="Employee cost" value={formatCompact(pr.employeeCost)} icon={Wallet} tone="neutral" hint={pr.expenses ? `+ ${formatCompact(pr.expenses)} expenses` : "Allocated payroll cost"} />}
          {pr && (
            <StatCard label="Estimated margin" value={formatCompact(pr.expectedMargin)} icon={PiggyBank} tone={pr.expectedMargin >= 0 ? "success" : "danger"}
              emphasis={pr.expectedMargin < 0 ? "danger" : undefined} hint={pr.expectedMarginPct != null ? `${pr.expectedMarginPct}% on invoiced revenue` : undefined} />
          )}
        </div>
      )}

      <Tabs defaultValue="overview" className="gap-5">
        <div className="scroll-thin -mx-1 overflow-x-auto px-1">
          <TabsList variant="line" className="h-10 gap-1 border-b border-border">
            <TabsTrigger value="overview" className="px-3">Overview</TabsTrigger>
            {can("assignment.read") && <TabsTrigger value="employees" className="px-3">Employees</TabsTrigger>}
            {can("billing.read") && <TabsTrigger value="billing" className="px-3">Billing</TabsTrigger>}
            {can("payment.read") && <TabsTrigger value="payments" className="px-3">Payments</TabsTrigger>}
            {can("expense.read") && <TabsTrigger value="expenses" className="px-3">Expenses</TabsTrigger>}
            {pr && <TabsTrigger value="profitability" className="px-3">Profitability</TabsTrigger>}
            <TabsTrigger value="activity" className="px-3">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-5">
          <GlassCard className="lg:col-span-3">
            <CardHead title="Project information" />
            <CardBody>
              <DetailList items={[
                { label: "Company", value: <Link className="hover:underline" href={`/companies/${p.company.id}`}>{p.company.name}</Link> },
                { label: "Project manager", value: p.manager?.fullName },
                { label: "Billing type", value: label(BILLING_TYPE, p.billingType) },
                { label: "Monthly billing", value: p.monthlyBillingAmount ? <Money value={p.monthlyBillingAmount} currency={p.currency} /> : null, hidden: p.billingType !== "MONTHLY" },
                { label: "Hourly rate", value: p.hourlyRate ? <Money value={p.hourlyRate} currency={p.currency} /> : null, hidden: p.billingType !== "HOURLY" },
                { label: "Tax", value: `${p.taxPercent}%` },
                { label: "Currency", value: p.currency },
                { label: "Payment terms", value: label(PAYMENT_TERMS, p.paymentTerms) },
                { label: "Start date", value: formatDate(p.startDate) },
                { label: "End date", value: p.endDate ? formatDate(p.endDate) : "Ongoing" },
                { label: "Description", value: p.description, full: true },
              ]} />
            </CardBody>
          </GlassCard>
          <div className="flex flex-col gap-4 lg:col-span-2">
            <GlassCard>
              <CardHead title="Current team" description={`${current.reduce((s, a) => s + a.allocationPercent, 0) / 100} FTE`} />
              <CardBody>
                {!current.length ? <p className="text-[13px] text-muted-foreground">Nobody is assigned right now.</p> : (
                  <ul className="flex flex-col gap-1">
                    {current.map((a) => (
                      <li key={a.id}>
                        <Link href={`/employees/${a.employee!.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-accent">
                          <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{a.employee!.fullName}</span><span className="block truncate text-[12px] text-muted-foreground">{a.role}</span></span>
                          <span className="num text-[12.5px] font-semibold">{a.allocationPercent}%</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </GlassCard>
            {f && (
              <GlassCard>
                <CardHead title="Payment history" />
                <CardBody><MonthHistoryList rows={f.history} limit={6} /></CardBody>
              </GlassCard>
            )}
          </div>
        </TabsContent>

        {can("assignment.read") && <TabsContent value="employees"><AssignmentsTable params={{ projectId: p.id }} hideProject /></TabsContent>}
        {can("billing.read") && <TabsContent value="billing"><InvoicesTable params={{ projectId: p.id, companyId: p.company.id }} hideCompany hideProject /></TabsContent>}
        {can("payment.read") && <TabsContent value="payments"><PaymentsTable params={{ projectId: p.id, companyId: p.company.id }} hideCompany /></TabsContent>}
        {can("expense.read") && <TabsContent value="expenses"><ExpensesTable scope={{ projectId: p.id }} /></TabsContent>}
        {pr && <TabsContent value="profitability"><ProfitabilityPanel pr={pr} /></TabsContent>}
        <TabsContent value="activity"><ProjectActivity id={p.id} /></TabsContent>
      </Tabs>

      <ProjectFormDrawer open={editing} onOpenChange={setEditing} project={p} />
    </div>
  );
}

function ProfitabilityPanel({ pr }: { pr: NonNullable<Project["profitability"]> }) {
  const rows = [...pr.months].reverse().filter((m) => m.revenue || m.cost || m.expenses);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Waterfall title="Expected — on invoiced revenue" revenue={pr.expectedRevenue} cost={pr.employeeCost} expenses={pr.expenses} margin={pr.expectedMargin} pct={pr.expectedMarginPct} />
        <Waterfall title="Actual — on money received" revenue={pr.receivedRevenue} cost={pr.employeeCost} expenses={pr.expenses} margin={pr.actualMargin} pct={pr.actualMarginPct} />
      </div>
      <GlassCard>
        <CardHead title="By month" description="Employee cost is each person's payroll cost × allocation, pro-rated for part months." />
        <CardBody className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead><tr className="text-[11.5px] tracking-wide text-muted-foreground uppercase">
              <th className="pb-2 text-left font-semibold">Month</th><th className="pb-2 text-right font-semibold">Invoiced</th><th className="pb-2 text-right font-semibold">Received</th>
              <th className="pb-2 text-right font-semibold">Employee cost</th><th className="pb-2 text-right font-semibold">Expenses</th><th className="pb-2 text-right font-semibold">Margin</th>
            </tr></thead>
            <tbody>
              {rows.map((m) => {
                const margin = m.revenue - m.cost - m.expenses;
                return (
                  <tr key={m.month} className="border-t border-border">
                    <td className="py-2.5 font-medium">{monthLabel(m.month, "short")}</td>
                    <td className="py-2.5 text-right"><Money value={m.revenue} decimals={0} /></td>
                    <td className="py-2.5 text-right"><Money value={m.received} decimals={0} tone="muted" /></td>
                    <td className="py-2.5 text-right"><Money value={m.cost} decimals={0} /></td>
                    <td className="py-2.5 text-right"><Money value={m.expenses} decimals={0} tone="muted" /></td>
                    <td className="py-2.5 text-right"><Money value={margin} decimals={0} tone={margin < 0 ? "danger" : "success"} className="font-semibold" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </GlassCard>
    </div>
  );
}

function Waterfall({ title, revenue, cost, expenses, margin, pct }: { title: string; revenue: number; cost: number; expenses: number; margin: number; pct: number | null }) {
  const max = Math.max(revenue, cost + expenses, 1);
  const bar = (v: number, cls: string) => <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", cls)} style={{ width: `${Math.max(0, (v / max) * 100)}%` }} /></div>;
  return (
    <GlassCard>
      <CardHead title={title} />
      <CardBody className="flex flex-col gap-3.5 text-[13.5px]">
        <div><div className="mb-1.5 flex justify-between"><span>Revenue</span><Money value={revenue} decimals={0} className="font-semibold" /></div>{bar(revenue, "bg-[var(--chart-1)]")}</div>
        <div><div className="mb-1.5 flex justify-between text-muted-foreground"><span>− Employee cost</span><Money value={cost} decimals={0} /></div>{bar(cost, "bg-[var(--chart-axis)]")}</div>
        <div><div className="mb-1.5 flex justify-between text-muted-foreground"><span>− Project expenses</span><Money value={expenses} decimals={0} /></div>{bar(expenses, "bg-[var(--chart-axis)]")}</div>
        <div className="mt-1 flex items-baseline justify-between border-t border-border pt-3">
          <span className="font-semibold">Estimated gross margin</span>
          <span className="text-right"><Money value={margin} decimals={0} tone={margin < 0 ? "danger" : "success"} className="text-[18px] font-bold" />{pct != null && <span className="ml-2 text-[12.5px] text-muted-foreground">{pct}%</span>}</span>
        </div>
      </CardBody>
    </GlassCard>
  );
}

function ProjectActivity({ id }: { id: string }) {
  const { data } = useApi<AuditRow[]>(`/api/projects/${id}/activity`);
  return <GlassCard><CardHead title="Activity" /><CardBody><ActivityFeed items={data ?? []} /></CardBody></GlassCard>;
}
