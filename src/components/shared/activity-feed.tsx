import { cn } from "cn";
import { describeAudit, type AuditRow } from "@/features/activity/describe";
import { formatDateTime, relativeTime } from "@/lib/dates";

const TONE = {
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-neutral-soft text-muted-foreground",
};

export function ActivityFeed({ items, empty = "No activity recorded yet." }: { items: AuditRow[]; empty?: string }) {
  if (!items.length) return <p className="py-8 text-center text-[13px] text-muted-foreground">{empty}</p>;
  return (
    <ol className="relative flex flex-col">
      {items.map((r, i) => {
        const d = describeAudit(r);
        return (
          <li key={r.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 && <span className="absolute top-8 bottom-0 left-[15px] w-px bg-border" aria-hidden />}
            <span className={cn("relative z-[1] grid size-8 shrink-0 place-items-center rounded-full", TONE[d.tone])}>
              <d.icon className="size-[15px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-[13px] leading-snug font-medium">{d.text}</p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground" title={formatDateTime(r.createdAt)}>
                {r.userName ?? "System"} · {relativeTime(r.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
