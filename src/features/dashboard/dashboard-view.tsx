"use client";

import Link from "next/link";
import {
  AlarmClock, AlertTriangle, BadgeIndianRupee, Briefcase, Building2, CalendarClock, CircleDollarSign, FolderKanban, HandCoins, Hourglass,
  Plus, Receipt, UserMinus, Users, UserCheck, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/components/providers/session";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { CardBody, CardHead, GlassCard } from "@/components/shared/glass-card";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { ErrorState } from "@/components/shared/states";
import { RankBars, RevenueChart, TrendChart } from "@/components/charts/charts";
import { useApi } from "@/hooks/use-api";
import { formatCompact, formatMoney } from "@/lib/money";
import { formatDate, monthLabel } from "@/lib/dates";
import type { AuditRow } from "@/features/activity/describe";

type Dashboard = {
  month: string;
  people: {
    totalEmployees: number; activeEmployees: number; activeCompanies: number; activeProjects: number;
    employeesOnNotice: number; upcomingContractExpiry: number; joiningSoon: number;
    onNotice: { id: string; fullName: string; designation: string; exitDate: string }[];
    contractsExpiring: { id: string; name: string; contractEnd: string }[];
    projectsEnding: { id: string; name: string; endDate: string; company: { name: string } }[];
  };
  finance: null | {
    currentMonthRevenue: number; currentMonthReceived: number; currentMonthBankCredit: number; outstanding: number; overdueAmount: number;
    overduePayments: number; pendingPayments: number; payrollMonth: string; currentMonthPayroll: number; payrollHeadcount: number;
  };
  charts: null | {
    revenueTrend: { month: string; invoiced: number; received: number }[];
    payrollTrend: { month: string; net: number; gross: number; cost: number }[];
    projectRevenue: { id: string; name: string; code: string; value: number }[];
    companyRevenue: { id: string; name: string; value: number }[];
  };
  activity: AuditRow[];
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function DashboardView() {
  const { user, can } = useSession();
  const { data, isLoading, error, refetch } = useApi<Dashboard>("/api/dashboard");
  const f = data?.finance;
  const p = data?.people;

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={formatDate(new Date().toISOString().slice(0, 10))}
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        docTitle="Dashboard"
        description={f ? "Here's where billing, collections and payroll stand this month." : "Here's what's happening across the team."}
        actions={
          <>
            {can("payment.write") && <Button variant="outline" asChild><Link href="/payments?new=1"><HandCoins className="size-4" /> Record payment</Link></Button>}
            {can("payroll.write") && <Button asChild><Link href="/payroll"><Wallet className="size-4" /> Run payroll</Link></Button>}
            {!can("payroll.write") && can("employee.write") && <Button asChild><Link href="/employees?new=1"><Plus className="size-4" /> Add employee</Link></Button>}
          </>
        }
        className="mb-0 lg:mb-0"
      />

      <StatGrid>
        <StatCard label="Total employees" value={p?.totalEmployees ?? "—"} loading={isLoading} icon={Users} tone="brand" href="/employees" hint={p ? `${p.joiningSoon} joining in the next 30 days` : undefined} />
        <StatCard label="Active employees" value={p?.activeEmployees ?? "—"} loading={isLoading} icon={UserCheck} tone="success" href="/employees?status=ACTIVE" hint="Excludes those on notice" />
        <StatCard label="Active companies" value={p?.activeCompanies ?? "—"} loading={isLoading} icon={Building2} tone="info" href="/companies?status=ACTIVE" />
        <StatCard label="Active projects" value={p?.activeProjects ?? "—"} loading={isLoading} icon={FolderKanban} tone="info" href="/projects?status=ACTIVE" />
      </StatGrid>

      {(isLoading || f) && (
        <StatGrid>
          <StatCard
            label={`Revenue · ${data ? monthLabel(data.month, "short") : ""}`}
            value={f ? formatCompact(f.currentMonthRevenue) : "—"}
            loading={isLoading}
            icon={Receipt}
            tone="info"
            href="/billing"
            hint="Invoiced for this billing month"
          />
          <StatCard
            label="Received this month"
            value={f ? formatCompact(f.currentMonthReceived) : "—"}
            loading={isLoading}
            icon={BadgeIndianRupee}
            tone="success"
            href="/payments"
            hint={f ? <>Bank credit <span className="num font-semibold text-foreground">{formatCompact(f.currentMonthBankCredit)}</span> after TDS</> : undefined}
          />
          <StatCard
            label="Outstanding"
            value={f ? formatCompact(f.outstanding) : "—"}
            loading={isLoading}
            icon={Hourglass}
            tone="warning"
            href="/payments?tab=tracker"
            hint={f ? <><span className="num font-semibold text-danger">{formatCompact(f.overdueAmount)}</span> of it overdue</> : undefined}
          />
          <StatCard
            label={`Payroll · ${f ? monthLabel(f.payrollMonth, "short") : ""}`}
            value={f ? formatCompact(f.currentMonthPayroll) : "—"}
            loading={isLoading}
            icon={Wallet}
            tone="brand"
            href={f ? `/payroll?month=${f.payrollMonth}` : "/payroll"}
            hint={f ? `Net salary for ${f.payrollHeadcount} employees` : undefined}
          />
        </StatGrid>
      )}

      {/* secondary metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {f && (
          <>
            <MiniMetric icon={AlarmClock} tone="warning" label="Pending payments" value={f.pendingPayments} href="/payments?tab=tracker&status=PENDING" />
            <MiniMetric icon={AlertTriangle} tone="danger" label="Overdue payments" value={f.overduePayments} href="/payments?tab=tracker&status=OVERDUE" />
          </>
        )}
        <MiniMetric icon={UserMinus} tone="warning" label="Employees on notice" value={p?.employeesOnNotice} href="/employees?status=ON_NOTICE" loading={isLoading} />
        <MiniMetric icon={CalendarClock} tone="info" label="Contracts ending ≤ 60 days" value={p?.upcomingContractExpiry} href="/companies" loading={isLoading} />
      </div>

      {(isLoading || data?.charts) && (
        <div className="grid gap-4 xl:grid-cols-3">
          <GlassCard className="xl:col-span-2">
            <CardHead title="Revenue vs received" description="Invoiced by billing month against payments settled in the month, last 12 months" />
            <CardBody>{data?.charts ? <RevenueChart data={data.charts.revenueTrend} /> : <Skeleton className="h-[290px] rounded-xl" />}</CardBody>
          </GlassCard>
          <GlassCard>
            <CardHead title="Monthly payroll" description="Net salary paid, last 12 months" />
            <CardBody>{data?.charts ? <TrendChart data={data.charts.payrollTrend.map((x) => ({ month: x.month, value: x.net }))} label="Net payroll" /> : <Skeleton className="h-[290px] rounded-xl" />}</CardBody>
          </GlassCard>
        </div>
      )}

      {data?.charts && (
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHead title="Revenue by project" description="Invoiced over the last 6 billing months" action={<Button variant="ghost" size="sm" asChild><Link href="/reports/profitability">Profitability</Link></Button>} />
            <CardBody><RankBars data={data.charts.projectRevenue} hrefFor={(id) => `/projects/${id}`} /></CardBody>
          </GlassCard>
          <GlassCard>
            <CardHead title="Revenue by company" description="Invoiced over the last 6 billing months" action={<Button variant="ghost" size="sm" asChild><Link href="/reports/revenue">Revenue report</Link></Button>} />
            <CardBody><RankBars data={data.charts.companyRevenue} hrefFor={(id) => `/companies/${id}`} /></CardBody>
          </GlassCard>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <GlassCard className="lg:col-span-3">
          <CardHead title="Recent activity" description="Latest changes across the portal" action={can("audit.read") ? <Button variant="ghost" size="sm" asChild><Link href="/audit-logs">Audit log</Link></Button> : undefined} />
          <CardBody>{isLoading ? <Skeleton className="h-64 rounded-xl" /> : <ActivityFeed items={data?.activity ?? []} />}</CardBody>
        </GlassCard>
        <GlassCard className="lg:col-span-2">
          <CardHead title="Needs attention" description="Dates coming up in the next few weeks" />
          <CardBody className="flex flex-col gap-5">
            {isLoading ? <Skeleton className="h-64 rounded-xl" /> : (
              <>
                <AttentionList
                  title="Contracts ending"
                  icon={CalendarClock}
                  items={(p?.contractsExpiring ?? []).map((c) => ({ id: c.id, primary: c.name, secondary: `Ends ${formatDate(c.contractEnd)}`, href: `/companies/${c.id}` }))}
                  empty="No client contracts end in the next 60 days."
                />
                <AttentionList
                  title="Projects ending"
                  icon={Briefcase}
                  items={(p?.projectsEnding ?? []).map((x) => ({ id: x.id, primary: x.name, secondary: `${x.company.name} · ends ${formatDate(x.endDate)}`, href: `/projects/${x.id}` }))}
                  empty="No active projects end in the next 45 days."
                />
                <AttentionList
                  title="On notice"
                  icon={UserMinus}
                  items={(p?.onNotice ?? []).map((e) => ({ id: e.id, primary: e.fullName, secondary: `${e.designation}${e.exitDate ? ` · last day ${formatDate(e.exitDate)}` : ""}`, href: `/employees/${e.id}` }))}
                  empty="Nobody is serving notice."
                />
                {f && f.overdueAmount > 0 && (
                  <Link href="/payments?tab=tracker&status=OVERDUE" className="flex items-center gap-3 rounded-xl bg-danger-soft px-3.5 py-3 text-[13px] transition-opacity hover:opacity-90">
                    <CircleDollarSign className="size-4 text-danger" />
                    <span className="flex-1"><span className="font-semibold text-danger">{formatMoney(f.overdueAmount, "INR", { decimals: 0 })}</span> overdue across {f.overduePayments} invoice{f.overduePayments === 1 ? "" : "s"}</span>
                  </Link>
                )}
              </>
            )}
          </CardBody>
        </GlassCard>
      </div>
    </div>
  );
}

function MiniMetric({ icon: Icon, label, value, href, tone, loading }: { icon: typeof Users; label: string; value?: number; href: string; tone: "warning" | "danger" | "info"; loading?: boolean }) {
  const toneCls = { warning: "text-warning bg-warning-soft", danger: "text-danger bg-danger-soft", info: "text-info bg-info-soft" }[tone];
  return (
    <Link href={href} className="glass flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-colors hover:border-foreground/15">
      <span className={`grid size-9 place-items-center rounded-xl ${toneCls}`}><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-muted-foreground">{label}</span>
      {loading ? <Skeleton className="h-6 w-8" /> : <span className="num text-[20px] font-bold">{value ?? 0}</span>}
    </Link>
  );
}

function AttentionList({ title, icon: Icon, items, empty }: { title: string; icon: typeof Users; items: { id: string; primary: string; secondary: string; href: string }[]; empty: string }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase"><Icon className="size-3.5" /> {title}</p>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground/80">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.slice(0, 4).map((i) => (
            <li key={i.id}>
              <Link href={i.href} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent">
                <span className="truncate text-[13px] font-medium">{i.primary}</span>
                <span className="shrink-0 text-[12px] text-muted-foreground">{i.secondary}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
