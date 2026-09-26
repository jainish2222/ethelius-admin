"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarCheck, CalendarPlus, Loader2, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { GlassCard } from "@/components/shared/glass-card";
import { MonthPicker } from "@/components/shared/pickers";
import { Initials } from "@/components/shared/person";
import { Pill } from "@/components/shared/status-badge";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { useSession } from "@/components/providers/session";
import { useApi, useApiMutation, useInvalidate } from "@/hooks/use-api";
import { useDebounced } from "@/hooks/use-debounced";
import { api, errorMessage } from "@/lib/api/client";
import { currentMonth, daysInMonth, monthLabel } from "@/lib/dates";

type Att = { id: string | null; workingDays: number; presentDays: number; paidLeave: number; unpaidLeave: number; lopDays: number; holidays: number; overtimeHours: number; leaveBalance: number | null; notes: string | null; paidDays: number };
type Row = { employee: { id: string; fullName: string; employeeCode: string; department: string; joiningDate: string; exitDate: string }; recorded: boolean; attendance: Att };

const FIELDS: { key: keyof Att; label: string; short: string; max: number; step?: number }[] = [
  { key: "workingDays", label: "Working days", short: "Working", max: 31 },
  { key: "presentDays", label: "Present days", short: "Present", max: 31, step: 0.5 },
  { key: "paidLeave", label: "Paid leave", short: "Paid leave", max: 31, step: 0.5 },
  { key: "unpaidLeave", label: "Unpaid leave", short: "Unpaid", max: 31, step: 0.5 },
  { key: "lopDays", label: "Loss-of-pay days", short: "LOP", max: 31, step: 0.5 },
  { key: "holidays", label: "Holidays", short: "Holidays", max: 31 },
  { key: "overtimeHours", label: "Overtime hours", short: "OT hrs", max: 400, step: 0.5 },
  { key: "leaveBalance", label: "Leave balance", short: "Leave bal.", max: 365, step: 0.5 },
];

export default function AttendancePage() {
  const search = useSearchParams();
  const { can } = useSession();
  const write = can("attendance.write");
  const [month, setMonth] = useState(search.get("month") ?? currentMonth());
  const [q, setQ] = useState("");
  const term = useDebounced(q, 250);
  const { data, isLoading, error, refetch } = useApi<Row[]>("/api/attendance", { month, q: term });
  const [edits, setEdits] = useState<Record<string, Partial<Att>>>({});
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidate();

  const prefill = useApiMutation(() => api.post<{ created: number }>("/api/attendance/prefill", { month }), {
    invalidate: ["/api/attendance", "/api/payroll"],
    success: (r) => (r.created ? `Full-month attendance recorded for ${r.created} employee${r.created === 1 ? "" : "s"}` : "Everyone already has attendance for this month"),
  });

  const rows = data ?? [];
  const merged = (r: Row) => ({ ...r.attendance, ...edits[r.employee.id] });
  const dirty = Object.keys(edits);
  const recorded = rows.filter((r) => r.recorded).length;
  const totals = useMemo(() => rows.reduce((t, r) => ({ lop: t.lop + Number(merged(r).lopDays || 0), ot: t.ot + Number(merged(r).overtimeHours || 0) }), { lop: 0, ot: 0 }), [rows, edits]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, key: keyof Att, v: string) => setEdits((e) => ({ ...e, [id]: { ...e[id], [key]: v === "" ? "" : Number(v) } as Partial<Att> }));

  const saveAll = async () => {
    setSaving(true);
    let ok = 0;
    for (const id of dirty) {
      const r = rows.find((x) => x.employee.id === id);
      if (!r) continue;
      const a = merged(r);
      try {
        await api.put("/api/attendance", {
          employeeId: id, month, workingDays: a.workingDays, presentDays: a.presentDays, paidLeave: a.paidLeave, unpaidLeave: a.unpaidLeave,
          lopDays: a.lopDays, holidays: a.holidays, overtimeHours: a.overtimeHours, leaveBalance: a.leaveBalance ?? undefined, notes: a.notes,
        });
        ok++;
        setEdits((e) => { const n = { ...e }; delete n[id]; return n; });
      } catch (e) {
        toast.error(`${r.employee.fullName}: ${errorMessage(e)}`);
      }
    }
    setSaving(false);
    await invalidate("/api/attendance", "/api/payroll");
    if (ok) toast.success(`Attendance saved for ${ok} employee${ok === 1 ? "" : "s"}. Recalculate payroll to apply it.`);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance"
        description="Monthly inputs for payroll. Paid days = working days − loss-of-pay days; earnings are pro-rated on that."
        className="mb-0 lg:mb-0"
        actions={
          <>
            <div className="w-[190px]"><MonthPicker value={month} onChange={(v) => { if (v) { setMonth(v); setEdits({}); } }} /></div>
            {write && <Button variant="outline" onClick={() => prefill.mutate()} disabled={prefill.isPending}><CalendarPlus className="size-4" /> Prefill full month</Button>}
            {write && <Button onClick={saveAll} disabled={!dirty.length || saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save {dirty.length ? `(${dirty.length})` : ""}</Button>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Tile label="Employees this month" value={rows.length} />
        <Tile label="Attendance recorded" value={`${recorded}/${rows.length}`} tone={recorded < rows.length ? "warning" : "success"} />
        <Tile label="Loss-of-pay days" value={totals.lop} />
        <Tile label="Overtime hours" value={totals.ot} />
      </div>

      <GlassCard className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3 sm:p-4">
          <div className="relative w-full sm:max-w-[280px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee…" className="h-9 rounded-[10px] pl-9" aria-label="Search employees" />
          </div>
          <p className="text-[12.5px] text-muted-foreground">{monthLabel(month)} · {daysInMonth(month)} calendar days. Rows without a record use the full month automatically.</p>
          {can("payroll.read") && <Button variant="ghost" size="sm" className="ml-auto" asChild><Link href={`/payroll?month=${month}`}>Open payroll →</Link></Button>}
        </div>
        {error ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> : isLoading ? (
          <div className="p-4"><Skeleton className="h-72 rounded-xl" /></div>
        ) : !rows.length ? (
          <EmptyState icon={CalendarCheck} title="Nobody on the books this month" />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[1040px] text-[13px]">
              <thead>
                <tr className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2.5 text-left font-semibold">Employee</th>
                  {FIELDS.map((f) => <th key={f.key} className="px-1.5 py-2.5 text-center font-semibold" title={f.label}>{f.short}</th>)}
                  <th className="px-4 py-2.5 text-right font-semibold">Paid days</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const a = merged(r);
                  const isDirty = !!edits[r.employee.id];
                  const paid = Number(a.workingDays || 0) - Number(a.lopDays || 0);
                  return (
                    <tr key={r.employee.id} className={cn("border-t border-border", isDirty && "bg-brand-soft/30")}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2.5">
                          <Initials name={r.employee.fullName} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{r.employee.fullName}</p>
                            <p className="truncate text-[11.5px] text-muted-foreground">{r.employee.employeeCode} · {r.employee.department}{!r.recorded && <Pill className="ml-1.5 h-4 px-1.5 text-[10px]">Default</Pill>}</p>
                          </div>
                        </div>
                      </td>
                      {FIELDS.map((f) => (
                        <td key={f.key} className="px-1.5 py-2">
                          <Input
                            type="number" inputMode="decimal" min={0} max={f.max} step={f.step ?? 1}
                            value={(a[f.key] as number | null | "") ?? ""}
                            onChange={(e) => set(r.employee.id, f.key, e.target.value)}
                            disabled={!write}
                            aria-label={`${f.label} for ${r.employee.fullName}`}
                            className={cn("num h-8 w-[74px] rounded-lg px-2 text-center text-[13px]", f.key === "lopDays" && Number(a.lopDays) > 0 && "border-warning/60 text-warning")}
                          />
                        </td>
                      ))}
                      <td className="num px-4 py-2 text-right font-semibold">{paid}<span className="text-muted-foreground">/{a.workingDays}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warning" | "success" }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-[12.5px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("num mt-2 text-[22px] font-bold", tone === "warning" && "text-warning", tone === "success" && "text-success")}>{value}</p>
    </div>
  );
}
