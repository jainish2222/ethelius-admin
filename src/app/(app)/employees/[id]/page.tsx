"use client";

import { DocTitle } from "@/components/shared/doc-title";
import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Briefcase, Building2, Calendar, Camera, Clock, FolderKanban, Landmark, Mail, MapPin, Pencil, Phone, Plus, Trash2, UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardBody, CardHead, GlassCard } from "@/components/shared/glass-card";
import { DetailList } from "@/components/shared/detail-list";
import { Initials } from "@/components/shared/person";
import { Pill, StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, LoadingState, EmptyState } from "@/components/shared/states";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { Modal } from "@/components/shared/overlays";
import { applyServerErrors, Form, FormSection, TextField } from "@/components/shared/form-field";
import { useSession } from "@/components/providers/session";
import { EmployeeFormDrawer } from "@/features/employees/employee-form";
import { AssignmentFormDrawer } from "@/features/assignments/assignment-form";
import { SalaryTab } from "@/features/salary/salary-tab";
import { PayrollMonths } from "@/features/payroll/payroll-months";
import { PayslipsTable } from "@/features/payslips/payslips-table";
import { DocumentsTable } from "@/features/documents/documents";
import { ExpensesTable } from "@/features/expenses/expenses";
import { useApi, useApiMutation, useInvalidate } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api/client";
import { EMPLOYMENT_TYPE, label } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { bankAccountSchema } from "@/validations/employee";
import type { AssignmentRow, EmployeeDetail } from "@/types";
import type { AuditRow } from "@/features/activity/describe";

function tenure(joined: string) {
  const months = Math.max(0, Math.floor((Date.now() - Date.parse(joined)) / (30.44 * 86400000)));
  const y = Math.floor(months / 12), m = months % 12;
  return y ? `${y} yr${y > 1 ? "s" : ""}${m ? ` ${m} mo` : ""}` : `${m} mo`;
}

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const { data: e, isLoading, error, refetch } = useApi<EmployeeDetail>(`/api/employees/${id}`);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState<AssignmentRow | "new" | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidate();

  if (isLoading) return <LoadingState />;
  if (error || !e) return <ErrorState message={error ? (error as Error).message : "Employee not found."} onRetry={() => refetch()} />;

  const current = e.assignments.filter((a) => a.isCurrent);
  const isSelf = e.access.self;
  const showPayroll = can("payroll.read") || isSelf;
  const showPayslips = can("payslip.read") || isSelf;
  const showDocs = can("document.read") || isSelf;
  const showExpenses = can("expense.read") || isSelf;

  const uploadPhoto = async (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    try {
      await api.post(`/api/employees/${id}/photo`, fd);
      toast.success("Photo updated");
      await invalidate(`/api/employees`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <DocTitle title={e.fullName} />
      {can("employee.read") && (
        <Link href="/employees" className="-mb-2 w-fit text-[13px] font-medium text-muted-foreground hover:text-foreground">← Employees</Link>
      )}

      {/* header */}
      <GlassCard className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_160%_at_0%_0%,var(--brand-soft),transparent_65%)]" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="group relative w-fit">
            <Initials name={e.fullName} photo={e.hasPhoto ? `/api/employees/${e.id}/photo?v=${e.hasPhoto}` : null} size="xl" className="ring-4 ring-background" />
            {e.access.write && (
              <>
                <button type="button" onClick={() => photoRef.current?.click()} aria-label="Change photo"
                  className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                  <Camera className="size-5" />
                </button>
                <input ref={photoRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(ev) => ev.target.files?.[0] && uploadPhoto(ev.target.files[0])} />
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[26px] leading-tight font-bold tracking-[-0.025em]">{e.fullName}</h1>
              <StatusBadge status={e.status} />
            </div>
            <p className="mt-1 text-[14.5px] text-muted-foreground">{e.designation} · {e.department}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted-foreground">
              <span className="num flex items-center gap-1.5"><UserRound className="size-3.5" /> {e.employeeCode}</span>
              {e.officialEmail && <a href={`mailto:${e.officialEmail}`} className="flex items-center gap-1.5 hover:text-foreground"><Mail className="size-3.5" /> {e.officialEmail}</a>}
              {e.phone && <span className="flex items-center gap-1.5"><Phone className="size-3.5" /> {e.phone}</span>}
              {e.workLocation && <span className="flex items-center gap-1.5"><MapPin className="size-3.5" /> {e.workLocation}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {can("assignment.write") && <Button variant="outline" onClick={() => setAssigning("new")}><FolderKanban className="size-4" /> Assign project</Button>}
            {e.access.write && <Button onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit</Button>}
          </div>
        </div>
      </GlassCard>

      <Tabs defaultValue="overview" className="gap-5">
        <div className="scroll-thin -mx-1 overflow-x-auto px-1">
          <TabsList variant="line" className="h-10 gap-1 border-b border-border">
            {[
              ["overview", "Overview", true], ["employment", "Employment", true], ["project", "Project", true],
              ["salary", "Salary", can("salary.read") || isSelf], ["payroll", "Payroll", showPayroll], ["payslips", "Payslips", showPayslips],
              ["documents", "Documents", showDocs], ["expenses", "Expenses", showExpenses], ["activity", "Activity", can("employee.read")],
            ].filter(([, , show]) => show).map(([v, l]) => (
              <TabsTrigger key={v as string} value={v as string} className="px-3 text-[13.5px]">{l}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Fact icon={Calendar} label="Joining date" value={formatDate(e.joiningDate)} sub={tenure(e.joiningDate) + " at Ethelius"} />
            <Fact icon={Clock} label="Experience" value={e.experienceYears != null ? `${e.experienceYears} years` : "—"} sub={label(EMPLOYMENT_TYPE, e.employmentType)} />
            <Fact icon={Building2} label="Company" value={current[0]?.project?.company.name ?? "Internal"} sub={current.length > 1 ? `+${current.length - 1} more` : undefined} />
            <Fact icon={Briefcase} label="Project" value={current.map((a) => a.project?.name).join(", ") || "Bench"} sub={current[0] ? `${current[0].role} · ${current[0].allocationPercent}%` : undefined} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <GlassCard className="lg:col-span-2">
              <CardHead title="At a glance" />
              <CardBody>
                <DetailList
                  items={[
                    { label: "Employment type", value: label(EMPLOYMENT_TYPE, e.employmentType) },
                    { label: "Current status", value: <StatusBadge status={e.status} /> },
                    { label: "Current CTC", value: e.currentSalary ? formatMoney(e.currentSalary.annualCtc, "INR", { decimals: 0 }) : null, hidden: !(can("salary.read") || isSelf) },
                    { label: "Reporting manager", value: e.reportingManager ? <Link className="hover:underline" href={`/employees/${e.reportingManager.id}`}>{e.reportingManager.fullName}</Link> : null },
                    { label: "Notice period", value: e.noticePeriodDays != null ? `${e.noticePeriodDays} days` : null },
                    { label: "Exit date", value: e.exitDate ? formatDate(e.exitDate) : null, hidden: !e.exitDate },
                    { label: "Portal access", value: e.user ? `${e.user.role.name} · ${e.user.email}` : "No login" },
                    { label: "Notes", value: e.notes, full: true, hidden: !e.notes },
                  ]}
                />
              </CardBody>
            </GlassCard>
            <GlassCard>
              <CardHead title="Team" description={`${e.directReports.length} direct report${e.directReports.length === 1 ? "" : "s"}`} />
              <CardBody>
                {e.directReports.length ? (
                  <ul className="flex flex-col gap-1">
                    {e.directReports.map((r) => (
                      <li key={r.id}>
                        <Link href={`/employees/${r.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent">
                          <Initials name={r.fullName} size="sm" />
                          <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{r.fullName}</span><span className="block truncate text-[12px] text-muted-foreground">{r.designation}</span></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[13px] text-muted-foreground">No direct reports.</p>}
              </CardBody>
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="employment" className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHead title="Employment" />
            <CardBody>
              <DetailList items={[
                { label: "Employee ID", value: e.employeeCode },
                { label: "Designation", value: e.designation },
                { label: "Department", value: e.department },
                { label: "Employment type", value: label(EMPLOYMENT_TYPE, e.employmentType) },
                { label: "Joining date", value: formatDate(e.joiningDate) },
                { label: "Years of experience", value: e.experienceYears },
                { label: "Work location", value: e.workLocation },
                { label: "Notice period", value: e.noticePeriodDays != null ? `${e.noticePeriodDays} days` : null },
                { label: "Exit date", value: e.exitDate ? formatDate(e.exitDate) : null },
              ]} />
            </CardBody>
          </GlassCard>
          <GlassCard>
            <CardHead title="Personal & statutory" description={e.access.pii ? undefined : "Restricted — visible to HR and finance only."} />
            <CardBody>
              {e.access.pii ? (
                <DetailList items={[
                  { label: "Personal email", value: e.personalEmail },
                  { label: "Date of birth", value: e.dateOfBirth ? formatDate(e.dateOfBirth) : null },
                  { label: "PAN", value: e.pan },
                  { label: "UAN", value: e.uan },
                  { label: "PF account", value: e.pfNumber },
                  { label: "ESIC number", value: e.esiNumber },
                  { label: "Address", value: e.address, full: true },
                  { label: "Emergency contact", value: e.emergencyContactName ? `${e.emergencyContactName}${e.emergencyRelation ? ` (${e.emergencyRelation})` : ""} · ${e.emergencyContactPhone ?? ""}` : null, full: true },
                ]} />
              ) : <p className="text-[13px] text-muted-foreground">You don&apos;t have access to personal or statutory details.</p>}
            </CardBody>
          </GlassCard>
          {e.bankAccounts && <BankAccounts employee={e} />}
        </TabsContent>

        <TabsContent value="project" className="flex flex-col gap-4">
          <GlassCard>
            <CardHead title="Project assignments" description="Current and past work. Ended assignments stay as history."
              action={can("assignment.write") && <Button size="sm" onClick={() => setAssigning("new")}><Plus className="size-4" /> Assign</Button>} />
            <CardBody>
              {!e.assignments.length ? <EmptyState icon={FolderKanban} title="Not assigned yet" description="Assign this employee to a project to track billing and cost." /> : (
                <div className="scroll-thin overflow-x-auto">
                  <table className="w-full min-w-[640px] text-[13.5px]">
                    <thead><tr className="text-left text-[11.5px] tracking-wide text-muted-foreground uppercase">
                      <th className="pb-2 font-semibold">Project</th><th className="pb-2 font-semibold">Role</th><th className="pb-2 font-semibold">Period</th>
                      <th className="pb-2 text-right font-semibold">Allocation</th><th className="pb-2 font-semibold">Status</th><th />
                    </tr></thead>
                    <tbody>
                      {e.assignments.map((a) => (
                        <tr key={a.id} className="border-t border-border">
                          <td className="py-3"><Link href={`/projects/${a.project?.id}`} className="font-semibold hover:underline">{a.project?.name}</Link><p className="text-[12px] text-muted-foreground">{a.project?.company.name}</p></td>
                          <td className="py-3">{a.role}</td>
                          <td className="num py-3 whitespace-nowrap">{formatDate(a.startDate)} – {a.endDate ? formatDate(a.endDate) : "present"}</td>
                          <td className="num py-3 text-right">{a.allocationPercent}%</td>
                          <td className="py-3">{a.isCurrent ? <StatusBadge status="ACTIVE" label="Current" /> : <StatusBadge status={a.status} />}</td>
                          <td className="py-3 text-right">{can("assignment.write") && <Button variant="ghost" size="icon-sm" onClick={() => setAssigning(a)} aria-label="Edit assignment"><Pencil className="size-3.5" /></Button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </GlassCard>
        </TabsContent>

        {(can("salary.read") || isSelf) && <TabsContent value="salary"><SalaryTab employeeId={e.id} canWrite={e.access.salaryWrite} /></TabsContent>}
        {showPayroll && <TabsContent value="payroll"><PayrollMonths employeeId={e.id} /></TabsContent>}
        {showPayslips && <TabsContent value="payslips"><PayslipsTable employeeId={e.id} /></TabsContent>}
        {showDocs && <TabsContent value="documents"><DocumentsTable owner={{ employeeId: e.id }} /></TabsContent>}
        {showExpenses && <TabsContent value="expenses"><ExpensesTable scope={{ employeeId: e.id }} /></TabsContent>}
        {can("employee.read") && <TabsContent value="activity"><EmployeeActivity id={e.id} /></TabsContent>}
      </Tabs>

      <EmployeeFormDrawer open={editing} onOpenChange={setEditing} employee={e} />
      <AssignmentFormDrawer open={!!assigning} onOpenChange={(o) => !o && setAssigning(null)} assignment={assigning === "new" ? null : assigning} preset={{ employeeId: e.id }} />
    </div>
  );
}

function Fact({ icon: Icon, label, value, sub }: { icon: typeof Calendar; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground"><Icon className="size-3.5" /> {label}</p>
      <p className="mt-2 truncate text-[15px] font-semibold">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function EmployeeActivity({ id }: { id: string }) {
  const { data, isLoading } = useApi<AuditRow[]>(`/api/employees/${id}/activity`);
  return (
    <GlassCard>
      <CardHead title="Activity" description="Changes to this employee and their assignments, salary, payroll and documents." />
      <CardBody>{isLoading ? <p className="text-[13px] text-muted-foreground">Loading…</p> : <ActivityFeed items={data ?? []} />}</CardBody>
    </GlassCard>
  );
}

function BankAccounts({ employee: e }: { employee: EmployeeDetail }) {
  const { can } = useSession();
  const { confirm, dialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const form = useForm({ resolver: zodResolver(bankAccountSchema), defaultValues: { bankName: "", accountHolder: e.fullName, accountNumber: "", ifsc: "", branch: "" } });
  const add = useApiMutation((v: unknown) => api.post(`/api/employees/${e.id}/bank-accounts`, v), {
    success: "Bank account added and set as primary", invalidate: [`/api/employees/${e.id}`], onSuccess: () => { setAdding(false); form.reset(); },
  });
  const remove = useApiMutation((accId: string) => api.delete(`/api/employees/${e.id}/bank-accounts/${accId}`), { success: "Bank account archived", invalidate: [`/api/employees/${e.id}`] });

  return (
    <GlassCard className="lg:col-span-2">
      <CardHead title="Bank accounts" description="Salary is credited to the primary account." action={can("employee.bank") && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="size-4" /> Add account</Button>} />
      <CardBody>
        {!e.bankAccounts?.length ? <p className="text-[13px] text-muted-foreground">No bank account on file — payroll can be calculated, but add one before crediting salary.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {e.bankAccounts.map((b) => (
              <div key={b.id} className="flex items-start gap-3 rounded-xl border border-border p-4">
                <span className="grid size-9 place-items-center rounded-xl bg-muted"><Landmark className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{b.bankName} {b.isPrimary && <Pill tone="brand" className="ml-1">Primary</Pill>}</p>
                  <p className="num mt-0.5 text-[13px]">{b.accountNumber}</p>
                  <p className="text-[12px] text-muted-foreground">{b.ifsc}{b.branch ? ` · ${b.branch}` : ""} · {b.accountHolder}</p>
                </div>
                {can("employee.bank") && (
                  <Button variant="ghost" size="icon-sm" aria-label="Archive account" onClick={async () => { if ((await confirm({ title: "Archive this bank account?", description: "Past payroll keeps its reference to it.", destructive: true, confirmLabel: "Archive" })).ok) remove.mutate(b.id); }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardBody>
      <Modal open={adding} onOpenChange={setAdding} title="Add bank account" description="The new account becomes the primary account for salary credits." formId="bank-form" pending={add.isPending}>
        <Form form={form} id="bank-form" onSubmit={(v) => add.mutateAsync(v).catch((err) => applyServerErrors(form, err))}>
          <FormSection>
            <TextField name="bankName" label="Bank" required />
            <TextField name="accountHolder" label="Account holder" required />
            <TextField name="accountNumber" label="Account number" required />
            <TextField name="ifsc" label="IFSC" required />
            <TextField name="branch" label="Branch" full />
          </FormSection>
        </Form>
      </Modal>
      {dialog}
    </GlassCard>
  );
}
