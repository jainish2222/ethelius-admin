"use client";

import Link from "next/link";
import {
  AlertTriangle, BadgeIndianRupee, Bell, BriefcaseBusiness, CalendarClock, CheckCheck, FileCheck2, UserMinus, UserPlus, Wallet, type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { relativeTime } from "@/lib/dates";

type Notification = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

const ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  INVOICE_OVERDUE: { icon: AlertTriangle, tone: "text-danger bg-danger-soft" },
  PAYMENT_RECEIVED: { icon: BadgeIndianRupee, tone: "text-success bg-success-soft" },
  PARTIAL_PAYMENT: { icon: BadgeIndianRupee, tone: "text-warning bg-warning-soft" },
  CONTRACT_EXPIRING: { icon: CalendarClock, tone: "text-warning bg-warning-soft" },
  PROJECT_ENDING: { icon: BriefcaseBusiness, tone: "text-info bg-info-soft" },
  EMPLOYEE_JOINING: { icon: UserPlus, tone: "text-success bg-success-soft" },
  EMPLOYEE_LEAVING: { icon: UserMinus, tone: "text-warning bg-warning-soft" },
  PAYROLL_PENDING_APPROVAL: { icon: Wallet, tone: "text-info bg-info-soft" },
  PAYSLIP_GENERATED: { icon: FileCheck2, tone: "text-success bg-success-soft" },
};

export function NotificationsBell() {
  const { data } = useApi<{ items: Notification[]; unread: number }>("/api/notifications", undefined, { refetchInterval: 60_000 });
  const markAll = useApiMutation(() => api.post("/api/notifications", { ids: "all" }), { invalidate: ["/api/notifications"] });
  const markOne = useApiMutation((id: string) => api.post("/api/notifications", { ids: [id] }), { invalidate: ["/api/notifications"] });
  const unread = data?.unread ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9 rounded-[10px]" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell className="size-[18px]" strokeWidth={1.8} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] leading-4 font-bold text-brand-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] max-w-[calc(100vw-24px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">{unread ? `${unread} unread` : "You're all caught up"}</p>
          </div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[420px]">
          {!data?.items.length ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto mb-3 size-6 opacity-40" /> Nothing new. Alerts about payments, payroll and contracts land here.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((n) => {
                const meta = ICONS[n.type] ?? { icon: Bell, tone: "text-muted-foreground bg-muted" };
                const content = (
                  <div className={cn("flex gap-3 px-4 py-3 transition-colors hover:bg-accent", !n.readAt && "bg-brand-soft/40")}>
                    <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", meta.tone)}>
                      <meta.icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[13px] leading-snug", !n.readAt ? "font-semibold" : "font-medium text-muted-foreground")}>{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground/80">{relativeTime(n.createdAt)}</p>
                    </div>
                    {!n.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => !n.readAt && markOne.mutate(n.id)}>{content}</Link>
                    ) : (
                      <button type="button" className="w-full text-left" onClick={() => !n.readAt && markOne.mutate(n.id)}>{content}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
