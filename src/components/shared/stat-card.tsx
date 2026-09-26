import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tone } from "./status-badge";

const ICON_TONE: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-muted-foreground",
  brand: "bg-brand-soft text-brand-ink",
};

export function StatCard({
  label, value, hint, icon: Icon, tone = "neutral", href, loading, className, emphasis,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  href?: string;
  loading?: boolean;
  className?: string;
  /** Draws the value in the danger/warning tone for figures that need attention. */
  emphasis?: "danger" | "warning";
}) {
  const body = (
    <div className={cn("glass group relative flex h-full flex-col gap-3 rounded-2xl p-4 transition-all duration-200 sm:p-5", href && "hover:-translate-y-px hover:border-foreground/15", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("grid size-8 place-items-center rounded-[10px]", ICON_TONE[tone])}>
            <Icon className="size-4" strokeWidth={1.9} />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <p className={cn("num text-[24px] leading-none font-bold tracking-[-0.03em] sm:text-[26px]", emphasis === "danger" && "text-danger", emphasis === "warning" && "text-warning")}>{value}</p>
      )}
      {hint && <div className="text-[12px] text-muted-foreground">{hint}</div>}
      {href && <ArrowUpRight className="absolute right-4 bottom-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
    </div>
  );
  return href ? <Link href={href} className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4", className)}>{children}</div>;
}
