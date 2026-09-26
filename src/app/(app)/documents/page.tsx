"use client";

import { PageHeader } from "@/components/shared/page-header";
import { useSession } from "@/components/providers/session";
import { DocumentsTable } from "@/features/documents/documents";

export default function DocumentsPage() {
  const { can, user } = useSession();
  const self = !can("document.read");
  return (
    <>
      <PageHeader
        title={self ? "My documents" : "Documents"}
        description={self
          ? "Your offer letter, ID proofs and other records. Upload anything HR has asked you for."
          : "Employee records, client contracts and project paperwork — stored privately and served only to people with access."}
      />
      <DocumentsTable
        owner={self && user.employeeId ? { employeeId: user.employeeId } : undefined}
        filters={self ? [] : [
          { type: "select", key: "owner", label: "Owner", options: [{ value: "employee", label: "Employees" }, { value: "company", label: "Companies" }, { value: "project", label: "Projects" }] },
          { type: "select", key: "expiring", label: "Expiry", options: [{ value: "true", label: "Expiring in 60 days" }] },
        ]}
      />
    </>
  );
}
