"use client";

import { DocTitle } from "@/components/shared/doc-title";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeIndianRupee, Hourglass, Mail, Pencil, Phone, Plus, Receipt, Trash2, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardBody, CardHead, GlassCard } from "@/components/shared/glass-card";
import { DetailList } from "@/components/shared/detail-list";
import { Pill, StatusBadge } from "@/components/shared/status-badge";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { Money } from "@/components/shared/money";
import { Modal } from "@/components/shared/overlays";
import { applyServerErrors, Form, FormSection, SwitchField, TextField } from "@/components/shared/form-field";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { CompanyFormDrawer, type CompanyForForm } from "@/features/companies/company-form";
import { InvoicesTable } from "@/features/invoices/invoices-table";
import { PaymentsTable } from "@/features/payments/payments-table";
import { AssignmentsTable } from "@/features/assignments/assignments-table";
import { DocumentsTable } from "@/features/documents/documents";
import { MonthHistoryList } from "@/features/billing/month-history";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { BILLING_TYPE, COMPANY_TYPE, PAYMENT_TERMS, label } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { formatCompact } from "@/lib/money";
import { companyContactSchema } from "@/validations/business";
import type { AuditRow } from "@/features/activity/describe";
import type { MonthHistory } from "@/types";

type Company = CompanyForForm & {
  contacts: { id: string; name: string; email: string | null; phone: string | null; designation: string | null; isPrimary: boolean }[];
  projects: { id: string; name: string; code: string; status: string; billingType: string; monthlyBillingAmount: number | null; currency: string; startDate: string; endDate: string; headcount: number; manager: { id: string; fullName: string } | null }[];
  finances: null | { invoiced: number; received: number; outstanding: number; overdue: number; overdueCount: number; bankCredited: number; tdsDeducted: number; monthlyRevenue: number; history: MonthHistory[] };
};

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const { data: c, isLoading, error, refetch } = useApi<Company>(`/api/companies/${id}`);
  const [editing, setEditing] = useState(false);
  if (isLoading) return <LoadingState />;
  if (error || !c) return <ErrorState message={error ? (error as Error).message : "Company not found."} onRetry={() => refetch()} />;
  const f = c.finances;

  return (
    <div className="flex flex-col gap-6">
      <DocTitle title={c.name} />
      <Link href="/companies" className="-mb-2 w-fit text-[13px] font-medium text-muted-foreground hover:text-foreground">← Companies</Link>
      <GlassCard className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_160%_at_0%_0%,var(--info-soft),transparent_65%)]" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl border border-border bg-surface-2 text-[20px] font-bold">{c.name.slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[26px] leading-tight font-bold tracking-[-0.025em]">{c.name}</h1>
              <StatusBadge status={c.status} />
            </div>
            <p className="mt-1 text-[14px] text-muted-foreground">{c.legalName ?? label(COMPANY_TYPE, c.type)} · {label(PAYMENT_TERMS, c.paymentTerms)} · {c.currency}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted-foreground">
              {c.billingEmail && <a href={`mailto:${c.billingEmail}`} className="flex items-center gap-1.5 hover:text-foreground"><Mail className="size-3.5" /> {c.billingEmail}</a>}
              {c.phone && <span className="flex items-center gap-1.5"><Phone className="size-3.5" /> {c.phone}</span>}
              {c.contractEnd && <span>Contract {formatDate(c.contractStart)} – {formatDate(c.contractEnd)}</span>}
            </div>
          </div>
          {can("company.write") && <Button onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit</Button>}
        </div>
      </GlassCard>

      {f && (
        <StatGrid>
          <StatCard label="Monthly revenue" value={formatCompact(f.monthlyRevenue, c.currency)} icon={TrendingUp} tone="brand" hint="Active monthly-billed projects" />
          <StatCard label="Total invoiced" value={formatCompact(f.invoiced)} icon={Receipt} tone="info" hint={`${f.history.length} billing months`} />
          <StatCard label="Received" value={formatCompact(f.received)} icon={BadgeIndianRupee} tone="success" hint={<>Bank credit <span className="num font-semibold text-foreground">{formatCompact(f.bankCredited)}</span> after {formatCompact(f.tdsDeducted)} TDS</>} />
          <StatCard label="Outstanding" value={formatCompact(f.outstanding)} icon={Hourglass} tone="warning" emphasis={f.overdue > 0 ? "danger" : undefined} hint={f.overdue > 0 ? `${formatCompact(f.overdue)} overdue on ${f.overdueCount} invoice${f.overdueCount === 1 ? "" : "s"}` : "Nothing overdue"} />
        </StatGrid>
      )}

      <Tabs defaultValue="overview" className="gap-5">
        <div className="scroll-thin -mx-1 overflow-x-auto px-1">
          <TabsList variant="line" className="h-10 gap-1 border-b border-border">
            <TabsTrigger value="overview" className="px-3">Overview</TabsTrigger>
            <TabsTrigger value="projects" className="px-3">Projects <Pill className="ml-1 h-5">{c.projects.length}</Pill></TabsTrigger>
            {can("billing.read") && <TabsTrigger value="billing" className="px-3">Billing</TabsTrigger>}
            {can("payment.read") && <TabsTrigger value="payments" className="px-3">Payments</TabsTrigger>}
            {can("assignment.read") && <TabsTrigger value="employees" className="px-3">Employees</TabsTrigger>}
            {can("document.read") && <TabsTrigger value="documents" className="px-3">Documents</TabsTrigger>}
            <TabsTrigger value="activity" className="px-3">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-5">
          <div className="flex flex-col gap-4 lg:col-span-3">
            {f && (
              <GlassCard>
                <CardHead title="Monthly payment history" description="What was invoiced for each billing month and how much has come in." />
                <CardBody><MonthHistoryList rows={f.history} /></CardBody>
              </GlassCard>
            )}
            <GlassCard>
              <CardHead title="Company information" />
              <CardBody>
                <DetailList items={[
                  { label: "Legal name", value: c.legalName },
                  { label: "Company type", value: label(COMPANY_TYPE, c.type) },
                  { label: "GST number", value: c.gstNumber },
                  { label: "PAN", value: c.pan },
                  { label: "Payment terms", value: c.paymentTerms === "CUSTOM" ? `${c.customPaymentDays} days` : label(PAYMENT_TERMS, c.paymentTerms) },
                  { label: "Currency", value: c.currency },
                  { label: "Contract start", value: c.contractStart ? formatDate(c.contractStart) : null },
                  { label: "Contract end", value: c.contractEnd ? formatDate(c.contractEnd) : null },
                  { label: "Address", value: c.address, full: true },
                  { label: "Notes", value: c.notes, full: true, hidden: !c.notes },
                ]} />
              </CardBody>
            </GlassCard>
          </div>
          <Contacts company={c} />
        </TabsContent>

        <TabsContent value="projects">
          <GlassCard>
            <CardHead title="Projects" description="Everything Ethelius delivers for this client." action={can("project.write") && <Button size="sm" asChild><Link href={`/projects?new=1&companyId=${c.id}`}><Plus className="size-4" /> New project</Link></Button>} />
            <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {c.projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="glass flex flex-col gap-3 rounded-2xl p-4 transition-all hover:-translate-y-px hover:border-foreground/15">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate font-semibold">{p.name}</p><p className="num text-[12px] text-muted-foreground">{p.code}</p></div>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex items-end justify-between gap-2 text-[12.5px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Users className="size-3.5" /> {p.headcount} · {p.manager?.fullName ?? "No manager"}</span>
                    <span className="text-right">{label(BILLING_TYPE, p.billingType)}{p.monthlyBillingAmount ? <> · <Money value={p.monthlyBillingAmount} currency={p.currency} compact className="font-semibold text-foreground" />/mo</> : null}</span>
                  </div>
                </Link>
              ))}
              {!c.projects.length && <p className="text-[13px] text-muted-foreground">No projects yet.</p>}
            </CardBody>
          </GlassCard>
        </TabsContent>

        {can("billing.read") && <TabsContent value="billing"><InvoicesTable params={{ companyId: c.id }} hideCompany /></TabsContent>}
        {can("payment.read") && <TabsContent value="payments"><PaymentsTable params={{ companyId: c.id }} hideCompany showSummary /></TabsContent>}
        {can("assignment.read") && <TabsContent value="employees"><AssignmentsTable params={{ companyId: c.id }} /></TabsContent>}
        {can("document.read") && <TabsContent value="documents"><DocumentsTable owner={{ companyId: c.id }} /></TabsContent>}
        <TabsContent value="activity"><CompanyActivity id={c.id} /></TabsContent>
      </Tabs>

      <CompanyFormDrawer open={editing} onOpenChange={setEditing} company={c} />
    </div>
  );
}

function CompanyActivity({ id }: { id: string }) {
  const { data } = useApi<AuditRow[]>(`/api/companies/${id}/activity`);
  return <GlassCard><CardHead title="Activity" /><CardBody><ActivityFeed items={data ?? []} /></CardBody></GlassCard>;
}

function Contacts({ company: c }: { company: Company }) {
  const { can } = useSession();
  const [adding, setAdding] = useState(false);
  const { confirm, dialog } = useConfirm();
  const form = useForm({ resolver: zodResolver(companyContactSchema), defaultValues: { name: "", email: "", phone: "", designation: "", isPrimary: false } });
  const add = useApiMutation((v: unknown) => api.post(`/api/companies/${c.id}/contacts`, v), { success: "Contact added", invalidate: [`/api/companies/${c.id}`], onSuccess: () => { setAdding(false); form.reset(); } });
  const remove = useApiMutation((cid: string) => api.delete(`/api/companies/${c.id}/contacts/${cid}`), { success: "Contact removed", invalidate: [`/api/companies/${c.id}`] });

  return (
    <GlassCard className="lg:col-span-2">
      <CardHead title="Contacts" description={c.billingContactName ? `Billing: ${c.billingContactName}` : undefined} action={can("company.write") && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="size-4" /> Add</Button>} />
      <CardBody>
        {!c.contacts.length ? <p className="text-[13px] text-muted-foreground">No contacts yet.</p> : (
          <ul className="flex flex-col divide-y divide-border">
            {c.contacts.map((ct) => (
              <li key={ct.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{ct.name} {ct.isPrimary && <Pill tone="brand" className="ml-1">Primary</Pill>}</p>
                  <p className="text-[12.5px] text-muted-foreground">{ct.designation}</p>
                  <p className="mt-1 text-[12.5px]">{[ct.email, ct.phone].filter(Boolean).join(" · ")}</p>
                </div>
                {can("company.write") && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${ct.name}`} onClick={async () => { if ((await confirm({ title: `Remove ${ct.name}?`, destructive: true, confirmLabel: "Remove" })).ok) remove.mutate(ct.id); }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <Modal open={adding} onOpenChange={setAdding} title="Add contact" formId="contact-form" pending={add.isPending}>
        <Form form={form} id="contact-form" onSubmit={(v) => add.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
          <FormSection>
            <TextField name="name" label="Name" required />
            <TextField name="designation" label="Designation" />
            <TextField name="email" label="Email" type="email" />
            <TextField name="phone" label="Phone" />
            <SwitchField name="isPrimary" label="Primary contact" full />
          </FormSection>
        </Form>
      </Modal>
      {dialog}
    </GlassCard>
  );
}
