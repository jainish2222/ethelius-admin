"use client";

import { useId, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, ChevronsUpDown, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";
import { formatDate, monthLabel } from "@/lib/dates";

const triggerCls =
  "flex h-9 w-full items-center gap-2 rounded-[10px] border border-input bg-transparent px-3 text-left text-[13.5px] transition-colors outline-none hover:bg-accent/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive data-[invalid=true]:border-destructive disabled:opacity-50 dark:bg-input/20";

const pad = (n: number) => String(n).padStart(2, "0");
const toLocal = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fromLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ───────────── Date ─────────────

export function DatePicker({
  value, onChange, placeholder = "Pick a date", invalid, disabled, clearable, id,
}: { value?: string | null; onChange: (v: string | null) => void; placeholder?: string; invalid?: boolean; disabled?: boolean; clearable?: boolean; id?: string }) {
  const [open, setOpen] = useState(false);
  const selected = value ? toLocal(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" className={triggerCls} data-invalid={invalid || undefined} disabled={disabled}>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn("flex-1 truncate", !value && "text-muted-foreground")}>{value ? formatDate(value) : placeholder}</span>
          {clearable && value && (
            <span role="button" tabIndex={-1} aria-label="Clear date" onClick={(e) => { e.stopPropagation(); onChange(null); }} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={new Date(1960, 0)}
          endMonth={new Date(new Date().getFullYear() + 5, 11)}
          onSelect={(d) => {
            onChange(d ? fromLocal(d) : null);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// ───────────── Month ─────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthPicker({
  value, onChange, placeholder = "Pick a month", invalid, clearable, className, id, size = "default",
}: { value?: string | null; onChange: (v: string | null) => void; placeholder?: string; invalid?: boolean; clearable?: boolean; className?: string; id?: string; size?: "default" | "sm" }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number((value ?? "").slice(0, 4)) || new Date().getFullYear());
  // Opening the picker jumps to the selected value's year.
  const onOpenChange = (o: boolean) => {
    if (o && value) setYear(Number(value.slice(0, 4)));
    setOpen(o);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button id={id} type="button" className={cn(triggerCls, size === "sm" && "h-8 text-[13px]", className)} data-invalid={invalid || undefined}>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn("flex-1 truncate", !value && "text-muted-foreground")}>{value ? monthLabel(value) : placeholder}</span>
          {clearable && value && (
            <span role="button" tabIndex={-1} aria-label="Clear month" onClick={(e) => { e.stopPropagation(); onChange(null); }} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <Button variant="ghost" size="icon-sm" onClick={() => setYear((y) => y - 1)} aria-label="Previous year"><ChevronLeft className="size-4" /></Button>
          <span className="text-sm font-semibold">{year}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setYear((y) => y + 1)} aria-label="Next year"><ChevronRight className="size-4" /></Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((m, i) => {
            const v = `${year}-${pad(i + 1)}`;
            const on = v === value;
            return (
              <button
                key={m}
                type="button"
                onClick={() => { onChange(v); setOpen(false); }}
                className={cn("h-9 rounded-lg text-[13px] font-medium transition-colors", on ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
              >
                {m}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ───────────── Combobox ─────────────

export type ComboOption = { value: string; label: string; description?: string; group?: string };

export function Combobox({
  value, onChange, options, placeholder = "Select…", searchPlaceholder = "Search…", invalid, disabled, clearable, loading, id, className, emptyText = "No matches.",
}: {
  value?: string | null; onChange: (v: string | null) => void; options: ComboOption[]; placeholder?: string; searchPlaceholder?: string;
  invalid?: boolean; disabled?: boolean; clearable?: boolean; loading?: boolean; id?: string; className?: string; emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const current = options.find((o) => o.value === value);
  const groups = useMemo(() => {
    const g = new Map<string, ComboOption[]>();
    for (const o of options) g.set(o.group ?? "", [...(g.get(o.group ?? "") ?? []), o]);
    return [...g.entries()];
  }, [options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" role="combobox" aria-expanded={open} aria-controls={listId} aria-invalid={invalid || undefined} className={cn(triggerCls, className)} disabled={disabled}>
          <span className={cn("flex-1 truncate", !current && "text-muted-foreground")}>
            {current ? current.label : loading ? "Loading…" : placeholder}
            {current?.description && <span className="ml-2 text-[12px] text-muted-foreground">{current.description}</span>}
          </span>
          {clearable && current ? (
            <span role="button" tabIndex={-1} aria-label="Clear" onClick={(e) => { e.stopPropagation(); onChange(null); }} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </span>
          ) : (
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent id={listId} className="w-(--radix-popover-trigger-width) min-w-[260px] p-0" align="start">
        <Command
          filter={(v, search) => {
            const o = options.find((x) => x.value === v);
            const hay = `${o?.label ?? ""} ${o?.description ?? ""}`.toLowerCase();
            return hay.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map(([group, list]) => (
              <CommandGroup key={group || "_"} heading={group || undefined}>
                {list.map((o) => (
                  <CommandItem key={o.value} value={o.value} onSelect={() => { onChange(o.value); setOpen(false); }}>
                    <Check className={cn("size-4", o.value === value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{o.label}</span>
                    {o.description && <span className="ml-auto truncate pl-2 text-[12px] text-muted-foreground">{o.description}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ───────────── Currency ─────────────

const grouped = (n: number, currency: string) =>
  n.toLocaleString(CURRENCIES[currency as CurrencyCode]?.locale ?? "en-IN", { maximumFractionDigits: 2 });

/** Amount input: shows the currency symbol and digit grouping, stores a plain number. */
export function CurrencyInput({
  value, onChange, currency = "INR", invalid, disabled, placeholder = "0", id, onBlur,
}: { value?: number | string | null; onChange: (v: number | "") => void; currency?: string; invalid?: boolean; disabled?: boolean; placeholder?: string; id?: string; onBlur?: () => void }) {
  // While typing, the raw text is shown; otherwise the grouped value derived from props.
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const display = focused ? text : value === "" || value == null || Number.isNaN(Number(value)) ? "" : grouped(Number(value), currency);

  return (
    <div className={cn(triggerCls, "cursor-text px-0 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40")} data-invalid={invalid || undefined}>
      <span className="pl-3 text-[13px] font-medium text-muted-foreground">{CURRENCIES[currency as CurrencyCode]?.symbol.trim() ?? currency}</span>
      <input
        id={id}
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        className="num h-full min-w-0 flex-1 bg-transparent pr-3 text-right outline-none placeholder:text-muted-foreground"
        value={display}
        onFocus={() => {
          setFocused(true);
          setText(value === "" || value == null ? "" : String(value));
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          const clean = raw.split(".").slice(0, 2).map((p, i) => (i === 1 ? p.slice(0, 2) : p)).join(".");
          setText(clean);
          onChange(clean === "" ? "" : Number(clean));
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        aria-invalid={invalid || undefined}
      />
    </div>
  );
}
