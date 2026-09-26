import { StatusBadge } from "@/components/shared/status-badge";
import { formatCompact, formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/dates";
import type { MonthHistory } from "@/types";

/** "Jan ₹5L Paid · Feb ₹5L Paid · Mar ₹3L Partial" — invoiced vs received per billing month. */
export function MonthHistoryList({ rows, limit = 12 }: { rows: MonthHistory[]; limit?: number }) {
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-muted-foreground">No invoices issued yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.slice(0, limit).map((r) => {
        const pct = r.invoiced ? Math.min(100, (r.received / r.invoiced) * 100) : 0;
        return (
          <li key={r.month} className="grid grid-cols-[88px_1fr_auto] items-center gap-4 py-3 sm:grid-cols-[110px_1fr_120px_110px]">
            <span className="text-[13px] font-semibold">{monthLabel(r.month, "short")}</span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="num font-medium" title={formatMoney(r.received)}>{formatCompact(r.received)} <span className="text-muted-foreground">of {formatCompact(r.invoiced)}</span></span>
                {r.outstanding > 0.5 && <span className="num text-[12px] text-muted-foreground">{formatCompact(r.outstanding)} due</span>}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-[var(--chart-2)]" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="num hidden text-right text-[13px] font-semibold sm:block">{formatMoney(r.invoiced, "INR", { decimals: 0 })}</span>
            <span className="text-right"><StatusBadge status={r.status} /></span>
          </li>
        );
      })}
    </ul>
  );
}
