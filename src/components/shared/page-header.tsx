import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "cn";
import { DocTitle } from "./doc-title";

export function PageHeader({
  title, description, actions, back, eyebrow, className, children, docTitle,
}: {
  title: React.ReactNode;
  /** Browser tab title when it should differ from the heading. */
  docTitle?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  eyebrow?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 lg:mb-8", className)}>
      <DocTitle title={docTitle ?? (typeof title === "string" ? title : null)} />
      {back && (
        <Link href={back.href} className="-ml-1 inline-flex w-fit items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1.5 text-[12px] font-semibold tracking-wide text-brand-ink uppercase">{eyebrow}</div>}
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.025em] sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-[14px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
