"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage, type ListResponse, type Params } from "@/lib/api/client";

/** GET with caching. The URL plus params form the cache key. */
export function useApi<T>(url: string | null, params?: Params, opts?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: [url, params ?? {}],
    queryFn: () => api.get<T>(url!, params),
    enabled: !!url && (opts?.enabled ?? true),
    placeholderData: keepPreviousData,
    refetchInterval: opts?.refetchInterval,
  });
}

export function useList<T, S = unknown>(url: string, params: Params) {
  return useApi<ListResponse<T> & { summary?: S }>(url, params);
}

type MutateOpts<TVars, TRes> = {
  /** Toast shown on success; a function receives the response. */
  success?: string | ((res: TRes, vars: TVars) => string);
  /** URL prefixes whose cached queries should refresh afterwards. */
  invalidate?: string[];
  onSuccess?: (res: TRes, vars: TVars) => void;
  /** Suppress the error toast (e.g. forms showing field errors inline). */
  quietError?: boolean;
};

/**
 * Wraps a write call with toasts and cache invalidation. Invalidation matches on the
 * URL prefix, so `invalidate: ["/api/payroll"]` refreshes lists, summaries and details.
 */
export function useApiMutation<TVars = void, TRes = unknown>(fn: (vars: TVars) => Promise<TRes>, opts: MutateOpts<TVars, TRes> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (res, vars) => {
      if (opts.invalidate?.length) {
        await qc.invalidateQueries({
          predicate: (q) => {
            const key = q.queryKey[0];
            return typeof key === "string" && opts.invalidate!.some((p) => key.startsWith(p));
          },
        });
      }
      const msg = typeof opts.success === "function" ? opts.success(res, vars) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(res, vars);
    },
    onError: (e) => {
      if (!opts.quietError) toast.error(errorMessage(e));
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...prefixes: string[]) =>
    qc.invalidateQueries({
      predicate: (q: { queryKey: QueryKey }) => typeof q.queryKey[0] === "string" && prefixes.some((p) => (q.queryKey[0] as string).startsWith(p)),
    });
}

// ── picker data ──

export type EmployeeOption = { id: string; fullName: string; employeeCode: string; designation: string; department: string };
export type CompanyOption = { id: string; name: string; currency: string; paymentTerms: string; customPaymentDays: number | null; status: string };
export type ProjectOption = {
  id: string; name: string; code: string; status: string; companyId: string; currency: string; billingType: string;
  monthlyBillingAmount: number | null; taxPercent: number; paymentTerms: string; customPaymentDays: number | null; company: { name: string };
};

export const useEmployeeOptions = (all = false, enabled = true) =>
  useApi<EmployeeOption[]>("/api/employees/options", all ? { all: "true" } : undefined, { enabled });
export const useCompanyOptions = (enabled = true) => useApi<CompanyOption[]>("/api/companies/options", undefined, { enabled });
export const useProjectOptions = (enabled = true) => useApi<ProjectOption[]>("/api/projects/options", undefined, { enabled });
