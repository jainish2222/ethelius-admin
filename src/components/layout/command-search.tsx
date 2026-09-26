"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, FolderKanban, Receipt, ScrollText, Search, UserRound } from "lucide-react";
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { useApi } from "@/hooks/use-api";
import { useDebounced } from "@/hooks/use-debounced";
import { useNavSections } from "./sidebar";

type Hit = { type: string; id: string; title: string; subtitle: string; href: string };
const ICON = { employee: UserRound, company: Building2, project: FolderKanban, invoice: Receipt, payslip: ScrollText } as const;
const GROUP = { employee: "Employees", company: "Companies", project: "Projects", invoice: "Invoices", payslip: "Payslips" } as const;

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const term = useDebounced(q, 200);
  const router = useRouter();
  const sections = useNavSections();
  const { data: hits, isFetching } = useApi<Hit[]>(term.length >= 2 ? "/api/search" : null, { q: term });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const groups = (hits ?? []).reduce<Record<string, Hit[]>>((acc, h) => ((acc[h.type] ??= []).push(h), acc), {});
  const pages = sections.flatMap((s) => s.items).filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass flex h-9 w-full max-w-[420px] items-center gap-2.5 rounded-[11px] px-3 text-left text-[13px] text-muted-foreground shadow-none transition-colors hover:text-foreground"
      >
        <Search className="size-4 shrink-0" strokeWidth={1.8} />
        <span className="flex-1 truncate">Search employees, projects, invoices…</span>
        <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 font-sans text-[10.5px] font-semibold sm:inline">Ctrl K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search records and jump to pages" className="sm:max-w-xl">
        <Command shouldFilter={false}>
        <CommandInput placeholder="Type a name, code or invoice number…" value={q} onValueChange={setQ} />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>{term.length >= 2 ? (isFetching ? "Searching…" : "No matches.") : "Type at least two characters to search records."}</CommandEmpty>
          {Object.entries(groups).map(([type, list]) => (
            <CommandGroup key={type} heading={GROUP[type as keyof typeof GROUP]}>
              {list.map((h) => {
                const Icon = ICON[h.type as keyof typeof ICON] ?? Search;
                return (
                  <CommandItem key={h.type + h.id} value={h.type + h.id} onSelect={() => go(h.href)}>
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="font-medium">{h.title}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{h.subtitle}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
          {pages.length > 0 && (
            <>
              {Object.keys(groups).length > 0 && <CommandSeparator />}
              <CommandGroup heading="Go to">
                {pages.slice(0, 8).map((p) => (
                  <CommandItem key={p.href} value={"page" + p.href} onSelect={() => go(p.href)}>
                    <p.icon className="size-4 text-muted-foreground" /> {p.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
