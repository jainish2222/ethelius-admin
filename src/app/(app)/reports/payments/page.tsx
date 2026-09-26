"use client";

import { PageHeader } from "@/components/shared/page-header";
import { PaymentsTable } from "@/features/payments/payments-table";

export default function PaymentReportPage() {
  return (
    <>
      <PageHeader eyebrow="Reports" title="Payments" description="Every client payment with its reference, what it settled, TDS withheld, and the amount that reached the bank." />
      <PaymentsTable endpoint="/api/reports/payments" exportKey="report-payments" showSummary />
    </>
  );
}
