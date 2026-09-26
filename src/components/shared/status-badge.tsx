import { cn } from "cn";
import { STATUS_LABELS } from "@/lib/constants";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

const TONE_BY_STATUS: Record<string, Tone> = {
  ACTIVE: "success", PAID: "success", RECEIVED: "success", RECONCILED: "success", APPROVED: "success", COMPLETED: "neutral", VERIFIED: "success",
  PENDING: "warning", PARTIAL: "warning", PARTIALLY_PAID: "warning", ON_NOTICE: "warning", ON_HOLD: "warning", PLANNED: "info", PLANNING: "info",
  OVERDUE: "danger", FAILED: "danger", REJECTED: "danger", CANCELLED: "neutral",
  SENT: "info", CALCULATED: "info", PROCESSING: "info",
  DRAFT: "neutral", INACTIVE: "neutral", RESIGNED: "neutral", RELIEVED: "neutral", ENDED: "neutral", UNBILLED: "neutral", UNVERIFIED: "neutral",
};

const TONES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-neutral",
  brand: "bg-brand-soft text-brand-ink",
};

/** Status pill: always a dot plus a text label, so state never depends on colour alone. */
export function StatusBadge({ status, label, tone, className }: { status: string; label?: string; tone?: Tone; className?: string }) {
  const t = tone ?? TONE_BY_STATUS[status] ?? "neutral";
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold whitespace-nowrap", TONES[t], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label ?? STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-[11.5px] font-semibold whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}
