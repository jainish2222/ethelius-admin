"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Download, Eye, Mail, Printer, ScrollText } from "lucide-react";
import { DataTable, right } from "@/components/shared/data-table";
import { PersonCell } from "@/components/shared/person";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { formatDate, formatDateTime, monthLabel } from "@/lib/dates";
import { download } from "@/lib/download";
import type { PayslipRow } from "@/types";

export function PayslipsTable({ employeeId }: { employeeId?: string }) {
  const { can } = useSession();
  const { confirm, dialog } = useConfirm();
  const admin = can("payslip.write");
  const email = useApiMutation((id: string) => api.post<{ to: string }>(`/api/payslips/${id}/email`), { success: (r) => `Payslip emailed to ${r.to}`, invalidate: ["/api/payslips"] });
  const archive = useApiMutation((id: string) => api.delete(`/api/payslips/${id}`), { success: "Payslip archived", invalidate: ["/api/payslips"] });

  const columns = useMemo<ColumnDef<PayslipRow, unknown>[]>(() => [
    { id: "payslipNumber", header: "Payslip", cell: ({ row }) => <span className="num font-semibold">{row.original.payslipNumber}</span> },
    { id: "month", header: "Pay period", cell: ({ row }) => <span className="whitespace-nowrap">{monthLabel(row.original.month)}</span> },
    ...(employeeId ? [] : [{
      id: "employee", header: "Employee",
      cell: ({ row: { original: p } }: { row: { original: PayslipRow } }) => <PersonCell id={p.employee.id} name={p.employee.fullName} subtitle={p.employee.employeeCode} />,
    }]),
    { id: "net", header: "Net salary", enableSorting: false, meta: right, cell: ({ row }) => <Money value={row.original.payroll.netSalary} className="font-semibold" /> },
    {
      id: "credit", header: "Bank credit", enableSorting: false,
      cell: ({ row: { original: p } }) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={p.payroll.paymentStatus} />
          {p.payroll.bankCreditDate && <span className="num text-[12px] text-muted-foreground">{formatDate(p.payroll.bankCreditDate)}</span>}
        </div>
      ),
    },
    { id: "generatedAt", header: "Generated", cell: ({ row }) => <span className="text-[12.5px] text-muted-foreground">{formatDateTime(row.original.generatedAt)}</span> },
    ...(admin ? [{
      id: "emailed", header: "Emailed", enableSorting: false,
      cell: ({ row: { original: p } }: { row: { original: PayslipRow } }) => p.emailedAt
        ? <span className="text-[12.5px]" title={p.emailedTo ?? ""}>{formatDate(p.emailedAt)}</span>
        : <span className="text-[12.5px] text-muted-foreground">Not sent</span>,
    }] : []),
  ], [employeeId, admin]);

  return (
    <>
      <DataTable<PayslipRow>
        endpoint="/api/payslips"
        exportKey={can("payslip.read") ? "payslips" : undefined}
        params={{ employeeId }}
        syncFromUrl={!employeeId}
        columns={columns}
        defaultSort={{ id: "month", desc: true }}
        searchPlaceholder="Search payslip number or employee…"
        rowHref={(p) => `/payslips/${p.id}`}
        filters={[
          { type: "month", key: "month", label: "Pay period" },
          ...(admin ? [{ type: "select" as const, key: "emailed", label: "Email", options: [{ value: "yes", label: "Emailed" }, { value: "no", label: "Not emailed" }] }] : []),
        ]}
        rowActions={() => [
          { label: "Preview", icon: Eye, href: (r) => `/payslips/${r.id}` },
          { label: "Download PDF", icon: Download, onSelect: (r) => download(`/api/payslips/${r.id}/pdf?download=1`) },
          { label: "Print", icon: Printer, href: (r) => `/payslips/${r.id}?print=1` },
          { label: "Email", icon: Mail, hidden: () => !admin, onSelect: (r) => email.mutate(r.id) },
          {
            label: "Archive", icon: Archive, destructive: true, separatorBefore: true, hidden: () => !admin,
            onSelect: async (r) => { if ((await confirm({ title: `Archive ${r.payslipNumber}?`, description: "It can be regenerated from the payroll record.", confirmLabel: "Archive", destructive: true })).ok) archive.mutate(r.id); },
          },
        ]}
        empty={{ icon: ScrollText, title: "No payslips yet", description: "Payslips appear here once payroll is approved and generated." }}
      />
      {dialog}
    </>
  );
}
