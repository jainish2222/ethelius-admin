"use client";

import type { Filter } from "@/components/shared/data-table";
import { useCompanyOptions, useProjectOptions } from "@/hooks/use-api";

/** Month range + company + project filters shared by the reports. */
export function useReportFilters(opts: { months?: boolean; project?: boolean } = {}): Filter[] {
  const companies = useCompanyOptions();
  const projects = useProjectOptions(opts.project !== false);
  const f: Filter[] = [];
  if (opts.months !== false) {
    f.push({ type: "month", key: "fromMonth", label: "From month" }, { type: "month", key: "toMonth", label: "To month" });
  }
  f.push({ type: "combo", key: "companyId", label: "Company", options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })) });
  if (opts.project !== false) f.push({ type: "combo", key: "projectId", label: "Project", options: (projects.data ?? []).map((p) => ({ value: p.id, label: p.name, description: p.company.name })) });
  return f;
}
