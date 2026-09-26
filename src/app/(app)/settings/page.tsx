"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageUp, Loader2, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { CardBody, CardHead, GlassCard } from "@/components/shared/glass-card";
import { Modal } from "@/components/shared/overlays";
import { applyServerErrors, Form, FormSection, NumberField, SelectField, SwitchField, TextField, TextareaField } from "@/components/shared/form-field";
import { Pill, StatusBadge } from "@/components/shared/status-badge";
import { ThemeSegmented } from "@/components/layout/theme-switcher";
import { useSession } from "@/components/providers/session";
import { useApi, useApiMutation, useInvalidate } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api/client";
import { DEDUCTION_CALC, DEDUCTION_CODE, Options, label } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { changePasswordSchema, companyProfileSchema, payslipTemplateSchema, type CompanyProfile, type PayslipTemplate } from "@/validations/system";
import { deductionRuleSchema, type DeductionRuleInput } from "@/validations/salary";

type Settings = { companyProfile: CompanyProfile; payslipTemplate: PayslipTemplate; logo: string; signature: string };
type Rule = { id: string; code: string; name: string; calcType: string; value: number; minGross: number | null; maxGross: number | null; capAmount: number | null; isActive: boolean; description: string | null; sortOrder: number };

export default function SettingsPage() {
  const { can } = useSession();
  const company = can("settings.manage");
  const payslip = can(["settings.manage", "payslip.write"], "any");
  const rules = can(["payroll.read", "settings.manage"], "any");
  return (
    <>
      <PageHeader title="Settings" description="Your account, company details, the payslip template and payroll rules." />
      <Tabs defaultValue="account" className="gap-5">
        <TabsList variant="line" className="h-10 gap-1 border-b border-border">
          <TabsTrigger value="account" className="px-3">Account</TabsTrigger>
          {company && <TabsTrigger value="company" className="px-3">Company</TabsTrigger>}
          {payslip && <TabsTrigger value="payslip" className="px-3">Payslip template</TabsTrigger>}
          {rules && <TabsTrigger value="rules" className="px-3">Payroll rules</TabsTrigger>}
        </TabsList>
        <TabsContent value="account"><AccountSettings /></TabsContent>
        {company && <TabsContent value="company"><CompanySettings /></TabsContent>}
        {payslip && <TabsContent value="payslip"><PayslipSettings /></TabsContent>}
        {rules && <TabsContent value="rules"><RulesSettings /></TabsContent>}
      </Tabs>
    </>
  );
}

function AccountSettings() {
  const { user } = useSession();
  const form = useForm({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: "", newPassword: "" } });
  const save = useApiMutation((v: unknown) => api.post("/api/auth/password", v), { success: "Password changed — other devices were signed out", onSuccess: () => form.reset() });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GlassCard>
        <CardHead title="Profile" />
        <CardBody className="grid gap-3 text-[13.5px]">
          <p><span className="text-muted-foreground">Name</span><br /><span className="font-semibold">{user.name}</span></p>
          <p><span className="text-muted-foreground">Email</span><br /><span className="font-semibold">{user.email}</span></p>
          <p><span className="text-muted-foreground">Role</span><br /><Pill tone="brand">{user.roleName}</Pill></p>
        </CardBody>
      </GlassCard>
      <GlassCard>
        <CardHead title="Appearance" description="Saved on this device." />
        <CardBody><ThemeSegmented /></CardBody>
      </GlassCard>
      <GlassCard className="lg:col-span-2">
        <CardHead title="Change password" description="At least 10 characters, with letters and numbers." action={<Button size="sm" type="submit" form="pw-form" disabled={save.isPending}>Update password</Button>} />
        <CardBody>
          <Form form={form} id="pw-form" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
            <FormSection>
              <TextField name="currentPassword" label="Current password" type="password" autoComplete="current-password" />
              <TextField name="newPassword" label="New password" type="password" autoComplete="new-password" />
            </FormSection>
          </Form>
        </CardBody>
      </GlassCard>
    </div>
  );
}

function CompanySettings() {
  const { data } = useApi<Settings>("/api/settings");
  const form = useForm({ resolver: zodResolver(companyProfileSchema), defaultValues: {} as CompanyProfile });
  useEffect(() => { if (data) form.reset(data.companyProfile); }, [data, form]);
  const save = useApiMutation((v: unknown) => api.put("/api/settings", { section: "company", value: v }), { success: "Company details saved", invalidate: ["/api/settings"] });
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <GlassCard className="lg:col-span-2">
        <CardHead title="Company details" description="Printed on every new payslip." action={<Button size="sm" type="submit" form="company-settings" disabled={save.isPending}><Save className="size-4" /> Save</Button>} />
        <CardBody>
          <Form form={form} id="company-settings" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
            <FormSection>
              <TextField name="name" label="Display name" required hint="Shown as the wordmark on payslips" />
              <TextField name="legalName" label="Legal name" />
              <TextField name="email" label="Payroll email" />
              <TextField name="phone" label="Phone" />
              <TextField name="regNo" label="Company identifier (CIN / GSTIN)" full />
              <TextField name="website" label="Website" />
              <TextareaField name="address" label="Registered address" rows={2} />
            </FormSection>
          </Form>
        </CardBody>
      </GlassCard>
      <ImageSetting kind="logo" title="Logo" description="Shown beside the company name on payslips. PNG with transparency works best." value={data.logo} />
    </div>
  );
}

function ImageSetting({ kind, title, description, value }: { kind: "logo" | "signature"; title: string; description: string; value: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", file);
      await api.post("/api/settings/images", fd);
      await invalidate("/api/settings");
      toast.success(`${title} updated`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = useApiMutation(() => api.delete(`/api/settings/images?kind=${kind}`), { success: `${title} removed`, invalidate: ["/api/settings"] });
  return (
    <GlassCard>
      <CardHead title={title} description={description} />
      <CardBody className="flex flex-col gap-3">
        <div className="grid h-28 place-items-center rounded-xl border border-dashed border-border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value ? <img src={value} alt={title} className="max-h-20 max-w-[80%] object-contain" /> : <span className="text-[12.5px] text-[#66766F]">None</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={busy}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImageUp className="size-3.5" />} Upload</Button>
          {value && <Button variant="ghost" size="sm" onClick={() => remove.mutate()}><Trash2 className="size-3.5" /> Remove</Button>}
        </div>
        <input ref={ref} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </CardBody>
    </GlassCard>
  );
}

const DEFAULT_TEMPLATE: PayslipTemplate = {
  accent: "#0B6B52", mint: "#B8F3E5", ink: "#0E1A16", showAttendance: true, showStatutory: true, showBank: true, maskAccount: true, showSignature: true,
  signedBy: "For ethelius — authorised signatory", footerNote: "This slip is generated by the payroll system and is valid without a signature. Keep it for your records.", numberPrefix: "PAY",
};

function PayslipSettings() {
  const { data } = useApi<Settings>("/api/settings");
  const form = useForm({ resolver: zodResolver(payslipTemplateSchema), defaultValues: DEFAULT_TEMPLATE as PayslipTemplate });
  useEffect(() => { if (data) form.reset(data.payslipTemplate); }, [data, form]);
  const values = useWatch({ control: form.control }) as PayslipTemplate;
  const [html, setHtml] = useState<string>("");

  // Live preview: re-render sample data with the unsaved template (debounced).
  const key = JSON.stringify(values);
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(async () => {
      const parsed = payslipTemplateSchema.safeParse(values);
      if (!parsed.success) return;
      const res = await fetch("/api/settings/payslip-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (res.ok) setHtml(await res.text());
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data]);

  const save = useApiMutation((v: unknown) => api.put("/api/settings", { section: "payslip", value: v }), { success: "Payslip template saved — new and regenerated payslips will use it", invalidate: ["/api/settings"] });
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
      <div className="flex flex-col gap-4">
        <GlassCard>
          <CardHead title="Template" description="Issued payslips keep the look they were generated with." action={
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => form.reset(DEFAULT_TEMPLATE)} aria-label="Restore defaults" title="Restore the original design"><RotateCcw className="size-3.5" /></Button>
              <Button size="sm" type="submit" form="payslip-settings" disabled={save.isPending}><Save className="size-4" /> Save</Button>
            </div>
          } />
          <CardBody>
            <Form form={form} id="payslip-settings" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))} className="gap-4">
              <div className="grid grid-cols-3 gap-3">
                {(["accent", "mint", "ink"] as const).map((k) => (
                  <div key={k} className="grid gap-1.5">
                    <Label className="text-[12px] capitalize">{k === "accent" ? "Accent" : k === "mint" ? "Highlight" : "Ink"}</Label>
                    <label className="flex h-9 items-center gap-2 rounded-[10px] border border-input px-2">
                      <input type="color" value={values[k] ?? "#000000"} onChange={(e) => form.setValue(k, e.target.value, { shouldDirty: true })} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                      <span className="font-mono text-[11.5px]">{values[k]}</span>
                    </label>
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                <SwitchField name="showAttendance" label="Attendance strip" />
                <SwitchField name="showStatutory" label="Statutory details (PAN, UAN, PF)" />
                <SwitchField name="showBank" label="Bank details" />
                <SwitchField name="maskAccount" label="Hide all but the last four account digits" />
                <SwitchField name="showSignature" label="Signature line" />
              </div>
              <TextField name="signedBy" label="Signed by" />
              <TextareaField name="footerNote" label="Footer note" rows={2} />
              <TextField name="numberPrefix" label="Payslip number prefix" hint={`Numbers look like ${values.numberPrefix || "PAY"}-2026-09-EMP001`} />
            </Form>
          </CardBody>
        </GlassCard>
        <ImageSetting kind="signature" title="Signature image" description="Sits on the signature line. Scanned JPGs are blended into the paper." value={data.signature} />
      </div>
      <GlassCard className="overflow-hidden">
        <CardHead title="Live preview" description="Sample data, current company details." />
        <div className="bg-[#EDF1EF]">
          {html ? <iframe title="Payslip template preview" srcDoc={html} className="block h-[1180px] w-full" /> : <div className="grid h-[600px] place-items-center"><Loader2 className="size-5 animate-spin text-[#66766F]" /></div>}
        </div>
      </GlassCard>
    </div>
  );
}

function RulesSettings() {
  const { can } = useSession();
  const edit = can("payroll.approve");
  const { data, isLoading } = useApi<Rule[]>("/api/deduction-rules");
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  return (
    <GlassCard>
      <CardHead
        title="Statutory deduction rules"
        description="Applied whenever payroll is calculated. Per-employee amounts such as TDS or loan recovery live on each employee's Salary tab."
        action={edit && <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> Add rule</Button>}
      />
      <CardBody>
        {isLoading ? <Skeleton className="h-40 rounded-xl" /> : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13.5px]">
              <thead><tr className="text-left text-[11.5px] tracking-wide text-muted-foreground uppercase">
                <th className="pb-2 font-semibold">Rule</th><th className="pb-2 font-semibold">Calculation</th><th className="pb-2 font-semibold">Applies when</th><th className="pb-2 font-semibold">Cap</th><th className="pb-2 font-semibold">Status</th><th />
              </tr></thead>
              <tbody>
                {(data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-3"><p className="font-semibold">{r.name}</p><p className="text-[12px] text-muted-foreground">{label(DEDUCTION_CODE, r.code)}{r.description ? ` · ${r.description}` : ""}</p></td>
                    <td className="py-3">{r.calcType === "FIXED" ? formatMoney(r.value, "INR", { decimals: 0 }) : r.calcType === "MANUAL" ? "Per employee" : `${r.value}% ${r.calcType === "PERCENT_OF_BASIC" ? "of basic" : "of gross"}`}</td>
                    <td className="py-3 text-[13px] text-muted-foreground">
                      {r.minGross != null && `gross ≥ ${formatMoney(r.minGross, "INR", { decimals: 0 })}`}{r.minGross != null && r.maxGross != null && " and "}{r.maxGross != null && `gross ≤ ${formatMoney(r.maxGross, "INR", { decimals: 0 })}`}{r.minGross == null && r.maxGross == null && "Always"}
                    </td>
                    <td className="num py-3">{r.capAmount != null ? formatMoney(r.capAmount, "INR", { decimals: 0 }) : "—"}</td>
                    <td className="py-3"><StatusBadge status={r.isActive ? "ACTIVE" : "INACTIVE"} /></td>
                    <td className="py-3 text-right">{edit && <Button variant="ghost" size="icon-sm" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}><Pencil className="size-3.5" /></Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
      <RuleModal value={editing} onClose={() => setEditing(null)} />
    </GlassCard>
  );
}

function RuleModal({ value, onClose }: { value: Rule | "new" | null; onClose: () => void }) {
  const editing = value && value !== "new" ? value : null;
  const empty: DeductionRuleInput = { code: "OTHER", name: "", calcType: "FIXED", value: 0, minGross: null, maxGross: null, capAmount: null, isActive: true, description: "", sortOrder: 10 };
  const form = useForm({ resolver: zodResolver(deductionRuleSchema), defaultValues: empty });
  useEffect(() => { if (value) form.reset(editing ? { ...editing, code: editing.code as DeductionRuleInput["code"], calcType: editing.calcType as DeductionRuleInput["calcType"], description: editing.description ?? "" } : empty); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const calc = useWatch({ control: form.control, name: "calcType" });
  const save = useApiMutation((v: unknown) => (editing ? api.put(`/api/deduction-rules/${editing.id}`, v) : api.post("/api/deduction-rules", v)), {
    success: "Rule saved — recalculate draft payroll to apply it", invalidate: ["/api/deduction-rules"], onSuccess: onClose,
  });
  return (
    <Modal open={!!value} onOpenChange={(o) => !o && onClose()} title={editing ? `Edit ${editing.name}` : "Add deduction rule"} formId="rule-form" pending={save.isPending}>
      <Form form={form} id="rule-form" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
        <FormSection>
          <TextField name="name" label="Label on payslip" required full />
          <SelectField name="code" label="Type" options={Options.deductionCode} />
          <SelectField name="calcType" label="Calculation" options={Object.entries(DEDUCTION_CALC).map(([v, l]) => ({ value: v, label: l }))} />
          {calc !== "MANUAL" && <NumberField name="value" label={calc === "FIXED" ? "Amount (₹)" : "Percentage"} step="0.01" min={0} suffix={calc === "FIXED" ? undefined : "%"} />}
          <NumberField name="capAmount" label="Maximum per month" min={0} hint="Optional cap" />
          <NumberField name="minGross" label="Only when gross ≥" min={0} />
          <NumberField name="maxGross" label="Only when gross ≤" min={0} />
          <NumberField name="sortOrder" label="Order on payslip" step="1" />
          <SwitchField name="isActive" label="Active" />
          <TextareaField name="description" label="Notes" rows={2} />
        </FormSection>
      </Form>
    </Modal>
  );
}
