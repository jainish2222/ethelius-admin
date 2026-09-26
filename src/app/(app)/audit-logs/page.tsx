"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Modal } from "@/components/shared/overlays";
import { Pill } from "@/components/shared/status-badge";
import { useApi } from "@/hooks/use-api";
import { describeAudit } from "@/features/activity/describe";
import { formatDateTime } from "@/lib/dates";

type Log = {
  id: string; action: string; entity: string; entityId: string | null; userName: string | null; ip: string | null; userAgent: string | null;
  createdAt: string; oldValue: Record<string, unknown> | null; newValue: Record<string, unknown> | null;
};

export default function AuditLogsPage() {
  const [open, setOpen] = useState<Log | null>(null);
  const meta = useApi<{ entities: string[] }>("/api/audit-logs", { pageSize: 1 });

  const columns = useMemo<ColumnDef<Log, unknown>[]>(() => [
    { id: "createdAt", header: "When", cell: ({ row }) => <span className="num whitespace-nowrap text-[12.5px]">{formatDateTime(row.original.createdAt)}</span> },
    { id: "user", header: "User", cell: ({ row }) => <span className="font-medium">{row.original.userName ?? "System"}</span> },
    {
      id: "action", header: "Action",
      cell: ({ row: { original: l } }) => (
        <div className="min-w-0 max-w-[360px]">
          <p className="truncate font-medium">{describeAudit({ ...l, newValue: l.newValue }).text}</p>
          <p className="truncate font-mono text-[11.5px] text-muted-foreground">{l.action}</p>
        </div>
      ),
    },
    { id: "entity", header: "Entity", enableSorting: false, cell: ({ row }) => <Pill>{row.original.entity}</Pill> },
    { id: "ip", header: "IP", enableSorting: false, cell: ({ row }) => <span className="font-mono text-[12px] text-muted-foreground">{row.original.ip ?? "—"}</span> },
  ], []);

  return (
    <>
      <PageHeader title="Audit logs" description="Every important change — who did it, when, from where, and exactly what changed. Entries cannot be edited or deleted." />
      <DataTable<Log>
        endpoint="/api/audit-logs"
        exportKey="audit-logs"
        columns={columns}
        defaultSort={{ id: "createdAt", desc: true }}
        defaultPageSize={50}
        compact
        searchPlaceholder="Search action, user or record ID…"
        onRowClick={setOpen}
        filters={[
          { type: "select", key: "entity", label: "Entity", options: (meta.data?.entities ?? []).map((e) => ({ value: e, label: e })) },
          { type: "select", key: "action", label: "Area", options: ["auth", "employee", "salary", "assignment", "invoice", "payment", "payroll", "payslip", "document", "expense", "user", "role", "settings", "export"].map((a) => ({ value: a + ".", label: a[0].toUpperCase() + a.slice(1) })) },
          { type: "dateRange", from: "from", to: "to", label: "Date" },
        ]}
        empty={{ icon: ScrollText, title: "No audit entries" }}
      />
      <Modal open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open ? describeAudit(open).text : ""} description={open ? `${open.userName ?? "System"} · ${formatDateTime(open.createdAt)}${open.ip ? ` · ${open.ip}` : ""}` : undefined} className="sm:max-w-[720px]">
        {open && (
          <div className="grid gap-4 text-[12.5px]">
            <div className="flex flex-wrap gap-2"><Pill>{open.entity}</Pill>{open.entityId && <Pill className="font-mono">{open.entityId}</Pill>}<Pill className="font-mono">{open.action}</Pill></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <JsonBlock title="Before" value={open.oldValue} />
              <JsonBlock title="After" value={open.newValue} />
            </div>
            {open.userAgent && <p className="text-[11.5px] break-all text-muted-foreground">{open.userAgent}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      <pre className="scroll-thin max-h-[320px] overflow-auto rounded-xl border border-border bg-muted p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}
