"use client";

import { PageHeader } from "@/components/shared/page-header";
import { InvoicesTable } from "@/features/invoices/invoices-table";

export default function InvoicesPage() {
  return (
    <>
      <PageHeader
        title="Invoices"
        description="Every invoice raised to clients. Status updates itself from the payments recorded against it."
      />
      <InvoicesTable />
    </>
  );
}
