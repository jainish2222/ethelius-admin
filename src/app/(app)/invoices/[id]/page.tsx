"use client";

import { DocTitle } from "@/components/shared/doc-title";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Ban, HandCoins, Pencil, RotateCcw, Send } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { CardBody, CardHead, GlassCard } from "@/components/shared/glass-card";
import { DetailList } from "@/components/shared/detail-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { useSession } from "@/components/providers/session";
import { InvoiceFormDrawer, type InvoiceForForm } from "@/features/invoices/invoice-form";
import { useInvoiceActions } from "@/features/invoices/invoices-table";
import { PaymentsTable } from "@/features/payments/payments-table";
import { useApi } from "@/hooks/use-api";
import { PAYMENT_TERMS, label } from "@/lib/constants";
import { formatDate, formatDateTime, monthLabel, todayDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

type Invoice = Omit<InvoiceForForm, "items"> & {
  company: { id: string; name: string; legalName: string | null; address: string | null; gstNumber: string | null; billingEmail: string | null };
  project: { id: string; name: string; code: string } | null;
  items: { id: string; description: string; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number; taxAmount: number; total: number; amountSettled: number; outstanding: number; bankCredited: number; deductions: number;
  sentAt: string | null; createdAt: string; createdBy: { name: string } | null;
  payments: { id: string; status: string }[];
};

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const { data: inv, isLoading, error, refetch } = useApi<Invoice>(`/api/invoices/${id}`);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const actions = useInvoiceActions();
  if (isLoading) return <LoadingState rows={2} />;
  if (error || !inv) return <ErrorState message={error ? (error as Error).message : "Invoice not found."} onRetry={() => refetch()} />;

  const cur = inv.currency;
  const payable = ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status);
  const overdue = inv.outstanding > 0 && inv.dueDate < todayDateOnly() && payable;
  const write = can("billing.write");
  const paid = inv.total ? Math.min(100, (inv.amountSettled / inv.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <DocTitle title={inv.invoiceNumber} />
      <Link href="/invoices" className="-mb-2 w-fit text-[13px] font-medium text-muted-foreground hover:text-foreground">← Invoices</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="num text-[28px] font-bold tracking-[-0.025em]">{inv.invoiceNumber}</h1>
            <StatusBadge status={inv.status} />
          </div>
          <p className="mt-1 text-[14px] text-muted-foreground">
            <Link href={`/companies/${inv.company.id}`} className="hover:text-foreground">{inv.company.name}</Link>
            {inv.project && <> · <Link href={`/projects/${inv.project.id}`} className="hover:text-foreground">{inv.project.name}</Link></>}
            {inv.billingMonth && <> · {monthLabel(inv.billingMonth)}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {write && inv.status === "DRAFT" && <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit draft</Button>}
          {write && inv.status === "DRAFT" && <Button onClick={() => actions.status.mutate({ id: inv.id, action: "send" })}><Send className="size-4" /> Mark as sent</Button>}
          {write && inv.status === "CANCELLED" && <Button variant="outline" onClick={() => actions.status.mutate({ id: inv.id, action: "reopen" })}><RotateCcw className="size-4" /> Reopen</Button>}
          {write && inv.status !== "CANCELLED" && !inv.payments.length && <Button variant="outline" onClick={() => actions.cancel(inv)}><Ban className="size-4" /> Cancel</Button>}
          {can("payment.write") && payable && <Button onClick={() => setPaying(true)}><HandCoins className="size-4" /> Record payment</Button>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <CardHead title="Invoice" description={`Issued ${formatDate(inv.invoiceDate)} · due ${formatDate(inv.dueDate)} · ${label(PAYMENT_TERMS, inv.paymentTerms)}`} />
          <CardBody className="flex flex-col gap-5">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13.5px]">
                <thead><tr className="text-[11.5px] tracking-wide text-muted-foreground uppercase">
                  <th className="pb-2 text-left font-semibold">Description</th><th className="pb-2 text-right font-semibold">Qty</th>
                  <th className="pb-2 text-right font-semibold">Rate</th><th className="pb-2 text-right font-semibold">Amount</th>
                </tr></thead>
                <tbody>
                  {inv.items.map((it) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="py-3 pr-4">{it.description}</td>
                      <td className="num py-3 text-right">{it.quantity}</td>
                      <td className="num py-3 text-right">{formatMoney(it.unitPrice, cur)}</td>
                      <td className="num py-3 text-right font-medium">{formatMoney(it.amount, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto w-full max-w-xs text-[13.5px]">
              <Line label="Invoice amount" value={formatMoney(inv.subtotal, cur)} />
              {inv.discountAmount > 0 && <Line label="Discount" value={`− ${formatMoney(inv.discountAmount, cur)}`} />}
              <Line label={`Tax (${inv.taxPercent}%)`} value={formatMoney(inv.taxAmount, cur)} />
              <div className="my-2 h-px bg-border" />
              <Line label="Total invoice amount" value={formatMoney(inv.total, cur)} strong />
              {cur !== "INR" && <p className="mt-1 text-right text-[12px] text-muted-foreground">≈ {formatMoney(inv.total * inv.exchangeRate, "INR", { decimals: 0 })} at {inv.exchangeRate}</p>}
            </div>
            <DetailList columns={3} items={[
              { label: "Bill to", value: <>{inv.company.legalName ?? inv.company.name}<span className="block text-[12.5px] font-normal text-muted-foreground">{inv.company.address}</span></> },
              { label: "GST", value: inv.company.gstNumber },
              { label: "Created", value: `${formatDateTime(inv.createdAt)}${inv.createdBy ? ` · ${inv.createdBy.name}` : ""}` },
              { label: "Notes", value: inv.notes, full: true, hidden: !inv.notes },
            ]} />
          </CardBody>
        </GlassCard>

        <GlassCard>
          <CardHead title="Collection" description="Invoice amount and money received are tracked separately." />
          <CardBody className="flex flex-col gap-4">
            <div>
              <div className="mb-2 flex items-baseline justify-between text-[13px]"><span className="text-muted-foreground">Settled</span><span className="num font-semibold">{paid.toFixed(0)}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--chart-2)]" style={{ width: `${paid}%` }} /></div>
            </div>
            <div className="text-[13.5px]">
              <Line label="Invoice amount" value={formatMoney(inv.subtotal - inv.discountAmount, cur)} />
              <Line label="Expected receivable" value={formatMoney(inv.total, cur)} hint="Including tax" />
              <Line label="Settled by client" value={formatMoney(inv.amountSettled, cur)} />
              <Line label="Deductions (TDS & other)" value={`− ${formatMoney(inv.deductions, cur)}`} />
              <Line label="Actual bank credit" value={formatMoney(inv.bankCredited, cur)} strong />
            </div>
            <div className={cn("rounded-xl px-4 py-3", inv.outstanding > 0.005 ? (overdue ? "bg-danger-soft" : "bg-warning-soft") : "bg-success-soft")}>
              <p className={cn("text-[12px] font-semibold", inv.outstanding > 0.005 ? (overdue ? "text-danger" : "text-warning") : "text-success")}>
                {inv.status === "DRAFT" ? "Not sent yet" : inv.status === "CANCELLED" ? "Cancelled" : inv.outstanding > 0.005 ? (overdue ? `Overdue since ${formatDate(inv.dueDate)}` : `Outstanding · due ${formatDate(inv.dueDate)}`) : "Paid in full"}
              </p>
              <p className="num mt-0.5 text-[22px] font-bold tracking-tight">{formatMoney(inv.outstanding, cur)}</p>
            </div>
          </CardBody>
        </GlassCard>
      </div>

      {can("payment.read") && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[16px] font-semibold">Payments against this invoice</h2>
          <PaymentsTable params={{ invoiceId: inv.id, companyId: inv.company.id }} hideCompany createOpen={paying} onCreateOpenChange={setPaying} />
        </div>
      )}

      <InvoiceFormDrawer open={editing} onOpenChange={setEditing} invoice={inv} />
      {actions.dialog}
    </div>
  );
}

function Line({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1", strong ? "text-[14.5px] font-bold" : "text-muted-foreground")}>
      <span>{label}{hint && <span className="ml-1 text-[11.5px] opacity-70">({hint})</span>}</span>
      <span className={cn("num", strong ? "text-foreground" : "text-foreground/90")}>{value}</span>
    </div>
  );
}
