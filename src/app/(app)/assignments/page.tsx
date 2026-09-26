"use client";

import { PageHeader } from "@/components/shared/page-header";
import { AssignmentsTable } from "@/features/assignments/assignments-table";

export default function AssignmentsPage() {
  return (
    <>
      <PageHeader
        title="Assignments"
        description="Who works on which project, at what allocation. Ended assignments are kept, so every employee's project history stays intact."
      />
      <AssignmentsTable />
    </>
  );
}
