import { Check } from "lucide-react";
import { cn } from "cn";

export type Step = { label: string; hint?: string; state: "done" | "current" | "todo" };

/** Horizontal workflow: Attendance → Calculate → Review → Approve → Pay → Payslip. */
export function Stepper({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6", className)}>
      {steps.map((s, i) => (
        <li
          key={s.label}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-3 py-2.5",
            s.state === "current" ? "border-brand/50 bg-brand-soft/50" : "border-border",
            s.state === "todo" && "opacity-70",
          )}
          aria-current={s.state === "current" ? "step" : undefined}
        >
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold",
              s.state === "done" && "bg-success-soft text-success",
              s.state === "current" && "bg-brand text-brand-foreground",
              s.state === "todo" && "bg-muted text-muted-foreground",
            )}
          >
            {s.state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{s.label}</span>
            {s.hint && <span className="block truncate text-[11.5px] text-muted-foreground">{s.hint}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
