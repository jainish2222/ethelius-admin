"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Lock, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar, NavList, isActive, useNavSections } from "./sidebar";
import { NAV } from "./nav-config";
import { EmptyState } from "@/components/shared/states";
import { CommandSearch } from "./command-search";
import { NotificationsBell } from "./notifications-bell";
import { ThemeSwitcher } from "./theme-switcher";
import { UserMenu } from "./user-menu";
import { Wordmark } from "./brand";
import { useStoredFlag } from "@/hooks/use-client-state";

const KEY = "ethelius-sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useStoredFlag(KEY);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggle = () => setCollapsed(!collapsed);

  return (
    <div className="flex min-h-dvh">
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] bg-surface-2 p-0 sm:max-w-[280px]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 items-center px-5">
            <Wordmark />
          </div>
          <div className="scroll-thin overflow-y-auto px-3 pb-6">
            <NavList onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Button variant="ghost" size="icon" className="size-9 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu className="size-5" />
            </Button>
            <div className="lg:hidden">
              <Wordmark className="h-[17px]" />
            </div>
            <div className="hidden flex-1 sm:block">
              <CommandSearch />
            </div>
            <div className="ml-auto flex items-center gap-1">
              <div className="sm:hidden">
                <CommandSearchCompact />
              </div>
              <NotificationsBell />
              <ThemeSwitcher />
              <div className="mx-1.5 h-6 w-px bg-border" />
              <UserMenu />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>
    </div>
  );
}

/** On phones the search bar collapses to an icon that opens the same palette. */
function CommandSearchCompact() {
  return (
    <div className="[&>button]:size-9 [&>button]:justify-center [&>button]:p-0 [&>button>span]:hidden [&>button>kbd]:hidden">
      <CommandSearch />
    </div>
  );
}

/**
 * Shows a friendly "no access" state for sections the role can't open, instead of a page full of
 * failed requests. The API enforces the same permissions regardless.
 */
function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const visible = useNavSections().flatMap((s) => s.items);
  const allowed = visible.some((i) => isActive(pathname, i.href));
  const known = NAV.flatMap((s) => s.items).some((i) => isActive(pathname, i.href));
  if (allowed || !known) return <>{children}</>;
  return (
    <EmptyState
      icon={Lock}
      title="You don't have access to this page"
      description="Your role doesn't include this area. Ask an administrator if you need it."
      action={<Button asChild variant="outline"><Link href="/">Go to my home page</Link></Button>}
      className="py-24"
    />
  );
}
