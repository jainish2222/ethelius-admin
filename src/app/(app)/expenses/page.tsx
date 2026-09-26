"use client";

import { PageHeader } from "@/components/shared/page-header";
import { useSession } from "@/components/providers/session";
import { ExpensesTable } from "@/features/expenses/expenses";
import { useProjectOptions } from "@/hooks/use-api";

export default function ExpensesPage() {
  const { can, user } = useSession();
  const self = !can("expense.read");
  const projects = useProjectOptions(!self);
  return (
    <>
      <PageHeader
        title={self ? "My expenses" : "Expenses"}
        description={self ? "Claim costs you paid for work. Finance approves and reimburses them." : "Employee and project expenses. Approved and paid expenses count towards project cost."}
      />
      <ExpensesTable
        scope={self && user.employeeId ? { employeeId: user.employeeId } : undefined}
        showSummary={!self}
        extraFilters={self ? [] : [{ type: "combo", key: "projectId", label: "Project", options: (projects.data ?? []).map((p) => ({ value: p.id, label: p.name, description: p.company.name })) }]}
      />
    </>
  );
}
