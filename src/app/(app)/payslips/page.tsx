"use client";

import { PageHeader } from "@/components/shared/page-header";
import { useSession } from "@/components/providers/session";
import { PayslipsTable } from "@/features/payslips/payslips-table";

export default function PayslipsPage() {
  const { can, user } = useSession();
  const self = !can("payslip.read");
  return (
    <>
      <PageHeader
        title={self ? "My payslips" : "Payslips"}
        description={self ? "Your monthly salary slips. Download or print any month." : "Every issued payslip, frozen at the moment it was generated. Preview, download, print or email them."}
      />
      <PayslipsTable employeeId={self ? user.employeeId ?? undefined : undefined} />
    </>
  );
}
