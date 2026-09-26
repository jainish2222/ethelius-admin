"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Banknote, Check, Paperclip, Pencil, Plus, Receipt, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, right, type Filter } from "@/components/shared/data-table";
import { Drawer } from "@/components/shared/overlays";
import { applyServerErrors, ComboField, CurrencyField, DateField, Form, FormSection, SelectField, TextareaField } from "@/components/shared/form-field";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { useApiMutation, useEmployeeOptions, useInvalidate, useProjectOptions } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api/client";
import { EXPENSE_STATUS, EXPENSE_TYPE, Options, label } from "@/lib/constants";
import { formatDate, todayDateOnly } from "@/lib/dates";
import { expenseSchema, type ExpenseInput } from "@/validations/business";
import type { ExpenseRow } from "@/types";

type Summary = Record<string, { amount: number; count: number }>;

export function ExpensesTable({ scope, showSummary, extraFilters = [] }: { scope?: { employeeId?: string; projectId?: string }; showSummary?: boolean; extraFilters?: Filter[] }) {
  const { can, user } = useSession();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<ExpenseRow | "new" | null>(null);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidate();
  const approver = can("expense.approve");
  const canSubmit = can("expense.write") || (can("self.view") && !!user.employeeId);

  const decide = useApiMutation(
    ({ id, action, reason }: { id: string; action: "approve" | "reject" | "pay"; reason?: string }) =>
      api.post(`/api/expenses/${id}/decision`, { action, reason, paidDate: action === "pay" ? todayDateOnly() : undefined }),
    { success: (_r, v) => ({ approve: "Expense approved", reject: "Expense rejected", pay: "Marked as paid" })[v.action], invalidate: ["/api/expenses", "/api/projects", "/api/reports"] },
  );
  const archive = useApiMutation((id: string) => api.delete(`/api/expenses/${id}`), { success: "Expense archived", invalidate: ["/api/expenses"] });

  const uploadReceipt = async (file: File) => {
    if (!receiptFor) return;
    const fd = new FormData();
    fd.set("file", file);
    try {
      await api.post(`/api/expenses/${receiptFor}/receipt`, fd);
      toast.success("Receipt attached");
      await invalidate("/api/expenses");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setReceiptFor(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const columns = useMemo<ColumnDef<ExpenseRow, unknown>[]>(() => [
    { id: "date", header: "Date", cell: ({ row }) => <span className="num whitespace-nowrap">{formatDate(row.original.date)}</span> },
    {
      id: "description", header: "Expense", enableSorting: false,
      cell: ({ row: { original: e } }) => (
        <div className="max-w-[320px] min-w-0">
          <p className="truncate font-medium">{e.description}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {label(EXPENSE_TYPE, e.type)}
            {e.hasReceipt && <> · <a href={`/api/expenses/${e.id}/receipt`} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline" onClick={(ev) => ev.stopPropagation()}>receipt</a></>}
            {e.rejectionReason && ` · ${e.rejectionReason}`}
          </p>
        </div>
      ),
    },
    ...(scope?.employeeId ? [] : [{ id: "employee", header: "Employee", cell: ({ row }: { row: { original: ExpenseRow } }) => <span className="text-[13px]">{row.original.employee?.fullName ?? "—"}</span> }]),
    ...(scope?.projectId ? [] : [{
      id: "project", header: "Project",
      cell: ({ row }: { row: { original: ExpenseRow } }) => row.original.project
        ? <div className="min-w-0"><p className="truncate text-[13px] font-medium">{row.original.project.name}</p><p className="truncate text-[12px] text-muted-foreground">{row.original.project.company.name}</p></div>
        : <span className="text-[12.5px] text-muted-foreground">Internal</span>,
    }]),
    { id: "amount", header: "Amount", meta: right, cell: ({ row }) => <Money value={row.original.amount} currency={row.original.currency} className="font-semibold" /> },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ], [scope]);

  return (
    <>
      <DataTable<ExpenseRow, Summary>
        endpoint="/api/expenses"
        exportKey={can("expense.read") ? "expenses" : undefined}
        params={scope}
        syncFromUrl={!scope}
        columns={columns}
        defaultSort={{ id: "date", desc: true }}
        searchPlaceholder="Search description, employee or project…"
        filters={[
          { type: "select", key: "status", label: "Status", options: Options.expenseStatus },
          { type: "select", key: "type", label: "Type", options: Options.expenseType },
          ...extraFilters,
          { type: "dateRange", from: "from", to: "to", label: "Date" },
        ]}
        summary={showSummary ? (s, loading) => (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {(["PENDING", "APPROVED", "PAID", "REJECTED"] as const).map((k) => (
              <StatCard key={k} label={label(EXPENSE_STATUS, k)} loading={loading}
                value={<Money value={s?.[k]?.amount ?? 0} compact />} hint={`${s?.[k]?.count ?? 0} expense${s?.[k]?.count === 1 ? "" : "s"}`}
                tone={k === "PENDING" ? "warning" : k === "REJECTED" ? "danger" : k === "PAID" ? "success" : "info"} />
            ))}
          </div>
        ) : undefined}
        toolbar={canSubmit && <Button className="h-9 rounded-[10px]" onClick={() => setEditing("new")}><Plus className="size-4" /> Add expense</Button>}
        rowActions={() => [
          { label: "Approve", icon: Check, hidden: (r) => !approver || r.status !== "PENDING", onSelect: (r) => decide.mutate({ id: r.id, action: "approve" }) },
          {
            label: "Reject", icon: X, hidden: (r) => !approver || r.status !== "PENDING",
            onSelect: async (r) => {
              const res = await confirm({ title: "Reject this expense?", description: r.description, confirmLabel: "Reject", destructive: true, reason: { label: "Reason (shared with the submitter)", required: true } });
              if (res.ok) decide.mutate({ id: r.id, action: "reject", reason: res.reason });
            },
          },
          { label: "Mark paid", icon: Banknote, hidden: (r) => !approver || r.status !== "APPROVED", onSelect: (r) => decide.mutate({ id: r.id, action: "pay" }) },
          { label: "Edit", icon: Pencil, hidden: (r) => r.status !== "PENDING", onSelect: (r) => setEditing(r), separatorBefore: true },
          { label: "Attach receipt", icon: Paperclip, hidden: (r) => r.status === "PAID", onSelect: (r) => { setReceiptFor(r.id); setTimeout(() => fileRef.current?.click()); } },
          {
            label: "Archive", icon: Archive, destructive: true, separatorBefore: true, hidden: (r) => r.status === "PAID",
            onSelect: async (r) => { if ((await confirm({ title: "Archive this expense?", confirmLabel: "Archive", destructive: true })).ok) archive.mutate(r.id); },
          },
        ]}
        empty={{ icon: Receipt, title: "No expenses", description: "Travel, software and other costs claimed against projects show up here." }}
      />
      <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => e.target.files?.[0] && uploadReceipt(e.target.files[0])} />
      <ExpenseFormDrawer value={editing} onClose={() => setEditing(null)} preset={scope} />
      {dialog}
    </>
  );
}

function ExpenseFormDrawer({ value, onClose, preset }: { value: ExpenseRow | "new" | null; onClose: () => void; preset?: { employeeId?: string; projectId?: string } }) {
  const { can, user } = useSession();
  const editing = value && value !== "new" ? value : null;
  const admin = can("expense.write");
  const employees = useEmployeeOptions(false, !!value && admin);
  const projects = useProjectOptions(!!value);
  const empty: ExpenseInput = {
    employeeId: preset?.employeeId ?? (admin ? null : user.employeeId), projectId: preset?.projectId ?? null, type: "TRAVEL", amount: 0, currency: "INR", date: todayDateOnly(), description: "",
  };
  const form = useForm({ resolver: zodResolver(expenseSchema), defaultValues: empty });
  useEffect(() => {
    if (!value) return;
    form.reset(editing ? {
      employeeId: editing.employeeId, projectId: editing.projectId, type: editing.type as ExpenseInput["type"], amount: editing.amount,
      currency: editing.currency as ExpenseInput["currency"], date: editing.date, description: editing.description,
    } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const save = useApiMutation((v: unknown) => (editing ? api.put(`/api/expenses/${editing.id}`, v) : api.post("/api/expenses", v)), {
    success: editing ? "Expense updated" : "Expense submitted for approval", invalidate: ["/api/expenses"], onSuccess: onClose,
  });

  return (
    <Drawer open={!!value} onOpenChange={(o) => !o && onClose()} title={editing ? "Edit expense" : "Add expense"} description="Approved and paid expenses count towards project cost." formId="expense-form" pending={save.isPending} submitLabel={editing ? "Save" : "Submit"}>
      <Form form={form} id="expense-form" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
        <FormSection>
          {admin && (
            <ComboField name="employeeId" label="Employee" clearable disabled={!!preset?.employeeId} full
              options={(employees.data ?? []).map((e) => ({ value: e.id, label: e.fullName, description: e.employeeCode }))} />
          )}
          <ComboField name="projectId" label="Project" clearable disabled={!!preset?.projectId} full placeholder="Internal (no project)"
            options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name, description: p.company.name }))} />
          <SelectField name="type" label="Type" options={Options.expenseType} required />
          <DateField name="date" label="Date" required />
          <CurrencyField name="amount" label="Amount" required />
          <SelectField name="currency" label="Currency" options={["INR", "USD", "EUR", "GBP", "AED"].map((c) => ({ value: c, label: c }))} />
          <TextareaField name="description" label="Description" rows={3} required />
        </FormSection>
        <p className="text-[12px] text-muted-foreground">Attach the receipt from the row menu after saving.</p>
      </Form>
    </Drawer>
  );
}
