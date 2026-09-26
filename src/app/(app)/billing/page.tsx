"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { FilePlus2, Plus, Sparkles } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { GlassCard } from "@/components/shared/glass-card";
import { Combobox, MonthPicker } from "@/components/shared/pickers";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Modal } from "@/components/shared/overlays";
import { ErrorState } from "@/components/shared/states";
import { BILLING_TYPE, STATUS_LABELS } from "@/lib/constants";
import { useSession } from "@/components/providers/session";
import { InvoiceFormDrawer } from "@/features/invoices/invoice-form";
import { useApi, useApiMutation, useCompanyOptions } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { addMonths, currentMonth, monthLabel, monthShort } from "@/lib/dates";
import { formatCompact, formatMoney } from "@/lib/money";

type Cell = { month: string; billable: boolean; invoice: null | { id: string; invoiceNumber: string; status: string; currency: string; total: number; settled: number; outstanding: number } };
type Grid = {
  months: string[];
  rows: { project: { id: string; name: string; code: string; billingType: string; monthlyBillingAmount: number; currency: string; status: string }; company: { id: string; name: string }; cells: Cell[] }[];
  monthTotals: { month: string; invoiced: number; received: number; missing: number }[];
};

const CELL_TONE: Record<string, string> = {
  PAID: "bg-success-soft text-success",
  PARTIALLY_PAID: "bg-warning-soft text-warning",
  OVERDUE: "bg-danger-soft text-danger",
  SENT: "bg-info-soft text-info",
  DRAFT: "bg-neutral-soft text-muted-foreground",
};

export default function BillingPage() {
  const { can } = useSession();
  const write = can("billing.write");
  const [to, setTo] = useState(currentMonth());
  const [from, setFrom] = useState(addMonths(currentMonth(), -5));
  const [companyId, setCompanyId] = useState<string | null>(null);
  const companies = useCompanyOptions();
  const { data, isLoading, error, refetch } = useApi<Grid>("/api/invoices/billing-grid", { from, to, companyId });
  const [genOpen, setGenOpen] = useState(false);
  const [genMonth, setGenMonth] = useState(currentMonth());
  const [send, setSend] = useState(true);
  const [manual, setManual] = useState<{ projectId: string; companyId: string; month: string } | "new" | null>(null);

  const generate = useApiMutation((b: { month: string; send: boolean; projectIds?: string[] }) => api.post<{ created: number; skipped: number }>("/api/invoices/generate", b), {
    success: (r) => (r.created ? `${r.created} invoice${r.created === 1 ? "" : "s"} created${r.skipped ? ` · ${r.skipped} already billed` : ""}` : "Every billable project already has an invoice for that month"),
    invalidate: ["/api/invoices", "/api/payments", "/api/dashboard", "/api/companies", "/api/projects"],
    onSuccess: () => setGenOpen(false),
  });

  const selected = data?.monthTotals.find((m) => m.month === to);
  const totals = data?.monthTotals.reduce((a, m) => ({ invoiced: a.invoiced + m.invoiced, received: a.received + m.received }), { invoiced: 0, received: 0 });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Monthly billing"
        description="One row per project, one column per billing month. Generate the month's invoices in one go, then track them to payment."
        className="mb-0 lg:mb-0"
        actions={write && (
          <>
            <Button variant="outline" onClick={() => setManual("new")}><Plus className="size-4" /> Manual invoice</Button>
            <Button onClick={() => { setGenMonth(to); setGenOpen(true); }}><Sparkles className="size-4" /> Generate invoices</Button>
          </>
        )}
      />

      <StatGrid>
        <StatCard label={`Invoiced · ${monthLabel(to, "short")}`} value={formatCompact(selected?.invoiced ?? 0)} loading={isLoading} tone="info" />
        <StatCard label={`Received · ${monthLabel(to, "short")}`} value={formatCompact(selected?.received ?? 0)} loading={isLoading} tone="success" hint="Settled against that month's invoices" />
        <StatCard label="Not yet invoiced" value={selected?.missing ?? 0} loading={isLoading} tone={selected?.missing ? "warning" : "neutral"} hint={`Billable projects without an invoice for ${monthLabel(to, "short")}`} />
        <StatCard label="Period total" value={formatCompact(totals?.invoiced ?? 0)} loading={isLoading} tone="brand" hint={`${formatCompact(totals?.received ?? 0)} received · ${monthLabel(from, "short")} – ${monthLabel(to, "short")}`} />
      </StatGrid>

      <GlassCard className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:p-4">
          <div className="w-[170px]"><MonthPicker value={from} onChange={(v) => v && setFrom(v)} className="h-9 text-[13px]" /></div>
          <span className="text-muted-foreground">→</span>
          <div className="w-[170px]"><MonthPicker value={to} onChange={(v) => v && setTo(v)} className="h-9 text-[13px]" /></div>
          <div className="w-[210px]"><Combobox value={companyId} onChange={setCompanyId} clearable placeholder="All companies" options={(companies.data ?? []).map((c) => ({ value: c.id, label: c.name }))} className="h-9 text-[13px]" /></div>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-[11.5px] text-muted-foreground">
            {["PAID", "PARTIALLY_PAID", "SENT", "OVERDUE", "DRAFT"].map((s) => (
              <span key={s} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-[3px]", CELL_TONE[s])} style={{ background: "currentColor" }} />{STATUS_LABELS[s]}</span>
            ))}
          </div>
        </div>

        {error ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> : isLoading || !data ? (
          <div className="p-4"><Skeleton className="h-80 rounded-xl" /></div>
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[2] min-w-[240px] border-b border-border bg-surface-2/95 px-4 py-2.5 text-left text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">Project</th>
                  {data.months.map((m) => (
                    <th key={m} className="border-b border-border px-2 py-2.5 text-center text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {monthShort(m)} <span className="font-normal opacity-70">{m.slice(2, 4)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const newCompany = i === 0 || data.rows[i - 1].company.id !== r.company.id;
                  return (
                    <Fragment key={r.project.id}>
                      {newCompany && (
                        <tr>
                          <td colSpan={data.months.length + 1} className="sticky left-0 border-b border-border bg-muted/60 px-4 py-1.5 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                            <Link href={`/companies/${r.company.id}`} className="hover:text-foreground">{r.company.name}</Link>
                          </td>
                        </tr>
                      )}
                      <tr className="group">
                        <td className="sticky left-0 z-[1] border-b border-border bg-surface-2/95 px-4 py-2 backdrop-blur">
                          <Link href={`/projects/${r.project.id}`} className="block truncate font-semibold hover:underline">{r.project.name}</Link>
                          <p className="text-[11.5px] text-muted-foreground">{r.project.billingType === "MONTHLY" ? `${formatCompact(r.project.monthlyBillingAmount, r.project.currency)} / month` : BILLING_TYPE[r.project.billingType as keyof typeof BILLING_TYPE] ?? r.project.billingType}</p>
                        </td>
                        {r.cells.map((c) => (
                          <td key={c.month} className="border-b border-border p-1.5 text-center">
                            {c.invoice ? (
                              <Link href={`/invoices/${c.invoice.id}`} title={`${c.invoice.invoiceNumber} · ${STATUS_LABELS[c.invoice.status]} · ${formatMoney(c.invoice.outstanding, c.invoice.currency)} outstanding`}
                                className={cn("flex h-11 flex-col items-center justify-center rounded-lg px-1 transition-opacity hover:opacity-80", CELL_TONE[c.invoice.status])}>
                                <span className="num text-[12.5px] font-bold">{formatCompact(c.invoice.total, c.invoice.currency)}</span>
                                <span className="text-[10.5px] font-semibold">{c.invoice.status === "PARTIALLY_PAID" ? "Partial" : STATUS_LABELS[c.invoice.status]}</span>
                              </Link>
                            ) : c.billable && write ? (
                              <button type="button" onClick={() => setManual({ projectId: r.project.id, companyId: r.company.id, month: c.month })}
                                className="flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-brand/60 hover:bg-brand-soft/40 hover:text-foreground">
                                <FilePlus2 className="size-3.5" /> Bill
                              </button>
                            ) : c.billable ? (
                              <span className="flex h-11 items-center justify-center rounded-lg border border-dashed border-border text-[11.5px] text-muted-foreground">Not billed</span>
                            ) : <span className="text-muted-foreground/40">·</span>}
                          </td>
                        ))}
                      </tr>
                    </Fragment>
                  );
                })}
                {!data.rows.length && (
                  <tr><td colSpan={data.months.length + 1} className="px-4 py-12 text-center text-muted-foreground">No billable projects in this range.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky left-0 bg-surface-2/95 px-4 py-3 text-[12px] font-semibold backdrop-blur">Invoiced / received</td>
                  {data.monthTotals.map((m) => (
                    <td key={m.month} className="px-2 py-3 text-center">
                      <p className="num text-[12.5px] font-bold">{formatCompact(m.invoiced)}</p>
                      <p className="num text-[11.5px] text-muted-foreground">{formatCompact(m.received)}</p>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </GlassCard>

      <Modal
        open={genOpen}
        onOpenChange={setGenOpen}
        title="Generate monthly invoices"
        description="Creates one invoice per active monthly-billed project that doesn't have one for the month yet. Existing invoices are never touched."
        footer={<><Button variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button><Button onClick={() => generate.mutate({ month: genMonth, send })} disabled={generate.isPending}><Sparkles className="size-4" /> {generate.isPending ? "Generating…" : "Generate"}</Button></>}
      >
        <div className="grid gap-4">
          <div className="grid gap-1.5"><Label className="text-[12.5px]">Billing month</Label><MonthPicker value={genMonth} onChange={(v) => v && setGenMonth(v)} /></div>
          {data?.monthTotals.find((m) => m.month === genMonth) && (
            <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px]">{data.monthTotals.find((m) => m.month === genMonth)!.missing} billable project(s) are waiting for an invoice for {monthLabel(genMonth)}.</p>
          )}
          <label className="flex items-start gap-3 text-[13px]">
            <Checkbox checked={send} onCheckedChange={(v) => setSend(!!v)} className="mt-0.5" />
            <span><span className="font-medium">Mark as sent</span><span className="block text-muted-foreground">Leave unticked to create drafts you can review first.</span></span>
          </label>
        </div>
      </Modal>

      <InvoiceFormDrawer
        open={!!manual}
        onOpenChange={(o) => !o && setManual(null)}
        preset={manual && manual !== "new" ? { companyId: manual.companyId, projectId: manual.projectId, month: manual.month } : undefined}
      />
    </div>
  );
}
