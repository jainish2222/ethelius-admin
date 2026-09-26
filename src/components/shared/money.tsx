import { cn } from "cn";
import { formatCompact, formatMoney } from "@/lib/money";

/** A money amount in tabular figures. `null` renders a quiet dash. */
export function Money({
  value, currency, compact, className, tone, decimals,
}: { value: number | null | undefined; currency?: string | null; compact?: boolean; decimals?: 0 | 2; className?: string; tone?: "muted" | "danger" | "success" | "warning" }) {
  if (value == null) return <span className="text-muted-foreground/60">—</span>;
  return (
    <span
      className={cn(
        "num whitespace-nowrap",
        tone === "muted" && "text-muted-foreground",
        tone === "danger" && "text-danger",
        tone === "success" && "text-success",
        tone === "warning" && "text-warning",
        className,
      )}
      title={compact ? formatMoney(value, currency) : undefined}
    >
      {compact ? formatCompact(value, currency) : formatMoney(value, currency, { decimals })}
    </span>
  );
}
