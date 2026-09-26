"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Landmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, right } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { PersonCell } from "@/components/shared/person";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { BankCreditModal, PAYROLL_INVALIDATE, type CreditTarget } from "@/features/payroll/bank-credit";
import { useInvalidate } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api/client";
import { Options } from "@/lib/constants";
import { formatDate, monthLabel, todayDateOnly } from "@/lib/dates";
import { formatCompact } from "@/lib/money";
import type { PayrollRow } from "@/types";

type Summary = { gross: number; deductions: number; net: number; credited: number };

export default function BankPaymentsPage() {
  const search = useSearchParams();
  const { can } = useSession();
  const write = can("payroll.write");
  const [crediting, setCrediting] = useState<CreditTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();
  const invalidate = useInvalidate();
  const month = search.get("month") ?? undefined;

  const markPaid = async (rows: PayrollRow[], clear: () => void) => {
    const eligible = rows.filter((r) => ["APPROVED", "PROCESSING"].includes(r.status));
    if (!eligible.length) return toast.message("Select approved payroll that hasn't been paid yet.");
    const res = await confirm({
      title: `Mark ${eligible.length} salar${eligible.length === 1 ? "y" : "ies"} as credited today?`,
      description: "Each is recorded as credited for exactly its net salary. Edit a row afterwards if an amount differed.",
      confirmLabel: "Record credits",
      reason: { label: "Batch reference (from the bank upload)", required: true, placeholder: "e.g. SALBATCH-2026-09" },
    });
    if (!res.ok) return;
    setBusy(true);
    let ok = 0;
    for (const r of eligible) {
      try {
        await api.post(`/api/payroll/${r.id}/bank-credit`, {
          actualBankCredit: r.netSalary, bankCreditDate: todayDateOnly(), transactionRef: `${res.reason}-${r.employee.employeeCode}`,
          paymentMode: "Bank transfer (NEFT)", paymentStatus: "PAID",
        });
        ok++;
      } catch (e) {
        toast.error(`${r.employee.fullName}: ${errorMessage(e)}`);
      }
    }
    setBusy(false);
    clear();
    await invalidate(...PAYROLL_INVALIDATE);
    toast.success(`${ok} bank credit${ok === 1 ? "" : "s"} recorded`);
  };

  const columns = useMemo<ColumnDef<PayrollRow, unknown>[]>(() => [
    { id: "employee", header: "Employee", cell: ({ row: { original: p } }) => <PersonCell id={p.employee.id} name={p.employee.fullName} subtitle={p.bankAccount ?? p.employee.employeeCode} /> },
    { id: "month", header: "Month", cell: ({ row }) => <span className="whitespace-nowrap">{monthLabel(row.original.month, "short")}</span> },
    { id: "net", header: "Net salary", meta: right, cell: ({ row }) => <Money value={row.original.netSalary} /> },
    { id: "bankCredit", header: "Actual credit", meta: right, cell: ({ row }) => <Money value={row.original.actualBankCredit} className="font-semibold" /> },
    {
      id: "variance", header: "Difference", enableSorting: false, meta: right,
      cell: ({ row: { original: p } }) => p.variance == null ? <span className="text-muted-foreground/60">—</span> : p.variance === 0
        ? <span className="text-[12.5px] text-success">Matches</span> : <Money value={p.variance} tone="warning" className="font-semibold" />,
    },
    { id: "creditDate", header: "Credit date", cell: ({ row }) => <span className="num whitespace-nowrap">{formatDate(row.original.bankCreditDate) || "—"}</span> },
    { id: "ref", header: "Reference", enableSorting: false, cell: ({ row }) => <span className="num text-[12.5px]">{row.original.transactionRef ?? "—"}</span> },
    { id: "status", header: "Payment", enableSorting: false, cell: ({ row }) => <StatusBadge status={row.original.paymentStatus} /> },
  ], []);

  return (
    <>
      <PageHeader
        title="Bank payments"
        description="Salary credits as they actually happened. The calculated net salary and the amount credited are kept side by side, so any difference is visible."
      />
      <DataTable<PayrollRow, Summary>
        endpoint="/api/payroll"
        exportKey="payroll"
        params={{ status: "APPROVED,PROCESSING,PAID", month }}
        columns={columns}
        defaultSort={{ id: "month", desc: true }}
        searchPlaceholder="Search employee…"
        selectable={write}
        onRowClick={write ? (r) => setCrediting({ ...r }) : undefined}
        filters={[
          { type: "month", key: "month", label: "Month" },
          { type: "select", key: "paymentStatus", label: "Payment", options: Options.salaryPaymentStatus },
          { type: "dateRange", from: "from", to: "to", label: "Credit date" },
        ]}
        summary={(s, loading) => (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
            <StatCard label="Calculated net salary" value={formatCompact(s?.net ?? 0)} loading={loading} tone="info" />
            <StatCard label="Actually credited" value={formatCompact(s?.credited ?? 0)} loading={loading} tone="success" />
            <StatCard label="Not yet credited" value={formatCompact(Math.max((s?.net ?? 0) - (s?.credited ?? 0), 0))} loading={loading} tone="warning" className="col-span-2 xl:col-span-1" />
          </div>
        )}
        bulkActions={(rows, clear) => <Button size="sm" disabled={busy} onClick={() => markPaid(rows, clear)}><Landmark className="size-4" /> Mark credited today</Button>}
        rowActions={() => [{ label: "Record / edit credit", icon: Landmark, hidden: () => !write, onSelect: (r) => setCrediting({ ...r }) }]}
        empty={{ icon: Landmark, title: "No approved payroll", description: "Approve payroll first; its bank credits are recorded here." }}
      />
      <BankCreditModal target={crediting} onClose={() => setCrediting(null)} />
      {dialog}
    </>
  );
}
