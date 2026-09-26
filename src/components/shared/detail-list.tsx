import { cn } from "cn";

export type DetailItem = { label: string; value: React.ReactNode; hidden?: boolean; full?: boolean };

/** Label/value grid for detail pages. Empty values render a quiet dash. */
export function DetailList({ items, columns = 2, className }: { items: DetailItem[]; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cn("grid gap-x-8 gap-y-4", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.filter((i) => !i.hidden).map((i) => (
        <div key={i.label} className={cn("min-w-0", i.full && "sm:col-span-full")}>
          <dt className="text-[12px] font-medium text-muted-foreground">{i.label}</dt>
          <dd className="mt-1 text-[13.5px] font-medium break-words">
            {i.value === null || i.value === undefined || i.value === "" ? <span className="text-muted-foreground/60">—</span> : i.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
