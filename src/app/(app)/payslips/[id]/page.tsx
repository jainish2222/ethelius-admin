"use client";

import { DocTitle } from "@/components/shared/doc-title";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Download, Loader2, Mail, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardBody, CardHead, GlassCard } from "@/components/shared/glass-card";
import { DetailList } from "@/components/shared/detail-list";
import { Modal } from "@/components/shared/overlays";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { formatDateTime, monthLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

type Slip = {
  id: string; payslipNumber: string; month: string; generatedAt: string; emailedAt: string | null; emailedTo: string | null; payrollId: string;
  employee: { id: string; fullName: string; employeeCode: string; officialEmail: string | null; personalEmail: string | null };
  payroll: { id: string; status: string; paymentStatus: string; netSalary: number };
  generatedBy: { name: string } | null; net: number; gross: number; totalDeductions: number;
};

export default function PayslipPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const { can } = useSession();
  const { data: s, isLoading, error, refetch } = useApi<Slip>(`/api/payslips/${id}`);
  const frame = useRef<HTMLIFrameElement>(null);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [to, setTo] = useState("");
  const { confirm, dialog } = useConfirm();
  const admin = can("payslip.write");

  const print = () => frame.current?.contentWindow?.print();
  const autoPrinted = useRef(false);
  useEffect(() => {
    if (loaded && search.get("print") === "1" && !autoPrinted.current) { autoPrinted.current = true; setTimeout(print, 400); }
  }, [loaded, search]);

  const email = useApiMutation(() => api.post<{ to: string }>(`/api/payslips/${id}/email`, { to: to || undefined }), {
    success: (r) => `Payslip emailed to ${r.to}`, invalidate: ["/api/payslips"], onSuccess: () => setEmailOpen(false),
  });
  const regenerate = useApiMutation(() => api.post("/api/payslips", { payrollIds: [s!.payrollId], regenerate: true }), {
    success: "Payslip regenerated with current company and template settings", invalidate: ["/api/payslips"], onSuccess: () => { setLoaded(false); setVersion((v) => v + 1); },
  });

  if (isLoading) return <LoadingState rows={1} />;
  if (error || !s) return <ErrorState message={error ? (error as Error).message : "Payslip not found."} onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <DocTitle title={s.payslipNumber} />
      <Link href="/payslips" className="-mb-2 w-fit text-[13px] font-medium text-muted-foreground hover:text-foreground">← Payslips</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold tracking-wide text-brand-ink uppercase">{monthLabel(s.month)}</p>
          <h1 className="num mt-1 text-[26px] font-bold tracking-[-0.025em]">{s.payslipNumber}</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            {can("employee.read") ? <Link href={`/employees/${s.employee.id}`} className="hover:text-foreground">{s.employee.fullName}</Link> : s.employee.fullName} · {s.employee.employeeCode}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={print} disabled={!loaded}><Printer className="size-4" /> Print</Button>
          <Button variant="outline" asChild><a href={`/api/payslips/${s.id}/pdf?download=1`}><Download className="size-4" /> Download PDF</a></Button>
          {admin && <Button variant="outline" onClick={() => { setTo(s.employee.officialEmail ?? s.employee.personalEmail ?? ""); setEmailOpen(true); }}><Mail className="size-4" /> Email</Button>}
          {admin && (
            <Button variant="ghost" disabled={regenerate.isPending} onClick={async () => {
              if ((await confirm({ title: "Regenerate this payslip?", description: "It keeps its number but is rebuilt from the payroll with today's company details and template. The previous PDF is replaced.", confirmLabel: "Regenerate" })).ok) regenerate.mutate();
            }}>
              {regenerate.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Regenerate
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <GlassCard className="overflow-hidden p-0">
          <div className="relative bg-[#EDF1EF]">
            {!loaded && <div className="absolute inset-0 grid place-items-center text-[13px] text-[#66766F]"><Loader2 className="size-5 animate-spin" /></div>}
            <iframe
              key={version}
              ref={frame}
              title={`Payslip ${s.payslipNumber}`}
              src={`/api/payslips/${s.id}/html?v=${version}`}
              onLoad={() => setLoaded(true)}
              className="block h-[1180px] w-full max-sm:h-[640px]"
            />
          </div>
        </GlassCard>
        <div className="flex flex-col gap-4">
          <GlassCard>
            <CardHead title="Summary" />
            <CardBody>
              <DetailList columns={1} items={[
                { label: "Gross earnings", value: formatMoney(s.gross) },
                { label: "Total deductions", value: formatMoney(s.totalDeductions) },
                { label: "Net pay", value: <span className="num text-[18px] font-bold">{formatMoney(s.net)}</span> },
                { label: "Payment", value: <StatusBadge status={s.payroll.paymentStatus} /> },
              ]} />
            </CardBody>
          </GlassCard>
          <GlassCard>
            <CardHead title="Record" />
            <CardBody>
              <DetailList columns={1} items={[
                { label: "Generated", value: `${formatDateTime(s.generatedAt)}${s.generatedBy ? ` · ${s.generatedBy.name}` : ""}` },
                { label: "Emailed", value: s.emailedAt ? `${formatDateTime(s.emailedAt)} · ${s.emailedTo}` : "Not yet" },
                { label: "Payroll", value: can("payroll.read") ? <Link href={`/payroll/${s.payroll.id}`} className="hover:underline">Open payroll record</Link> : null, hidden: !can("payroll.read") },
              ]} />
              <p className="mt-4 text-[12px] text-muted-foreground">An issued payslip is frozen: later changes to the employee or company don&apos;t alter it unless you regenerate it.</p>
            </CardBody>
          </GlassCard>
        </div>
      </div>

      <Modal
        open={emailOpen}
        onOpenChange={setEmailOpen}
        title="Email payslip"
        description="The PDF is attached to the email."
        footer={<><Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button><Button onClick={() => email.mutate()} disabled={email.isPending || !to}>{email.isPending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Send</Button></>}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="to" className="text-[12.5px]">Send to</Label>
          <Input id="to" type="email" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-[10px]" />
        </div>
      </Modal>
      {dialog}
    </div>
  );
}
