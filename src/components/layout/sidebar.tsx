"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/components/providers/session";
import { NAV, selfNav, type NavSection } from "./nav-config";
import { Monogram, Wordmark } from "./brand";

export function useNavSections(): NavSection[] {
  const { can, user } = useSession();
  const sections = NAV.map((s) => ({ ...s, items: s.items.filter((i) => !i.permission || can(i.permission, "any")) })).filter((s) => s.items.length);
  const mine = selfNav(user.employeeId, (p) => can(p));
  if (mine) sections.splice(sections.length - 1, 0, mine);
  return sections;
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function NavList({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = useNavSections();
  // The most specific match wins (e.g. /reports/payroll over /payroll).
  const activeHref = sections.flatMap((s) => s.items).filter((i) => isActive(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.title}>
          {collapsed ? (
            <div className="mx-auto mb-2 h-px w-6 bg-border" />
          ) : (
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase">{section.title}</p>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = item.href === activeHref;
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-medium transition-colors duration-150",
                    active
                      ? "bg-sidebar-accent text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-brand" aria-hidden />}
                  <item.icon className={cn("size-[17px] shrink-0", active ? "text-brand-ink" : "opacity-80")} strokeWidth={1.8} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar backdrop-blur-xl transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[72px]" : "w-[252px]",
      )}
    >
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "px-5")}>
        <Link href="/dashboard" aria-label="Ethelius dashboard" className="flex items-center gap-2.5">
          {collapsed ? <Monogram /> : (
            <>
              <Wordmark className="h-[19px]" />
              <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Admin</span>
            </>
          )}
        </Link>
      </div>
      <div className={cn("scroll-thin flex-1 overflow-y-auto pb-4", collapsed ? "px-3" : "px-3")}>
        <NavList collapsed={collapsed} />
      </div>
      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
        </button>
      </div>
    </aside>
  );
}
