"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { Table2, BarChart3 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { formatCompact, formatMoney } from "@/lib/money";
import { monthLabel, monthShort } from "@/lib/dates";

/*
 * Chart conventions (validated palette, see globals.css --chart-1 / --chart-2):
 *   bars ≤ 24px with 4px rounded data ends, 2px gap between neighbours; lines 2px; area wash ~10%;
 *   hairline solid horizontal grid; text always in text tokens, never the series colour;
 *   a legend for ≥ 2 series; hover tooltip on every chart; a table view for screen readers and print.
 */

const AXIS = { fontSize: 11.5, fill: "var(--chart-axis)" };
const GRID = "var(--chart-grid)";

function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="glass-strong min-w-[180px] rounded-xl px-3.5 py-2.5 text-[12.5px]">
      <p className="mb-1.5 font-semibold">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-5 py-0.5">
          <span className="flex items-center gap-2 text-muted-foreground">
            {r.color && <span className="size-2.5 rounded-[3px]" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="num font-semibold text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function ViewToggle({ table, onChange }: { table: boolean; onChange: (v: boolean) => void }) {
  return (
    <Button variant="ghost" size="xs" onClick={() => onChange(!table)} className="text-muted-foreground" aria-pressed={table}>
      {table ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
      {table ? "Chart" : "Table"}
    </Button>
  );
}

function DataTableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="scroll-thin max-h-[260px] overflow-auto">
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-0 bg-surface-2">
          <tr>{head.map((h, i) => <th key={h} className={cn("py-2 font-semibold text-muted-foreground", i ? "text-right" : "text-left")}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => <td key={j} className={cn("num py-1.5", j ? "text-right" : "text-left")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────── Invoiced vs received (grouped columns, 2 series) ───────────

export function RevenueChart({ data, height = 260 }: { data: { month: string; invoiced: number; received: number }[]; height?: number }) {
  const [table, setTable] = useState(false);
  const series = [
    { key: "invoiced", label: "Invoiced", color: "var(--chart-1)" },
    { key: "received", label: "Received", color: "var(--chart-2)" },
  ] as const;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
        <ViewToggle table={table} onChange={setTable} />
      </div>
      {table ? (
        <DataTableView head={["Month", "Invoiced", "Received"]} rows={data.map((d) => [monthLabel(d.month, "short"), formatMoney(d.invoiced), formatMoney(d.received)])} />
      ) : (
        <div style={{ height }} role="img" aria-label="Monthly invoiced versus received">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={monthShort} tick={AXIS} axisLine={false} tickLine={false} dy={6} />
              <YAxis tickFormatter={(v) => formatCompact(v)} tick={AXIS} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                cursor={{ fill: "var(--accent)" }}
                content={(p: TooltipContentProps<ValueType, NameType>) =>
                  p.active && p.payload?.length ? (
                    <TooltipCard
                      title={monthLabel(String(p.label))}
                      rows={[
                        ...series.map((s) => ({ label: s.label, value: formatMoney(Number(p.payload!.find((x) => x.dataKey === s.key)?.value ?? 0)), color: s.color })),
                        { label: "Gap", value: formatMoney(Number(p.payload[0]?.payload.invoiced ?? 0) - Number(p.payload[0]?.payload.received ?? 0)) },
                      ]}
                    />
                  ) : null
                }
              />
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={24} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─────────── Single-series trend (area) ───────────

export function TrendChart({
  data, label, height = 260, color = "var(--chart-2)",
}: { data: { month: string; value: number }[]; label: string; height?: number; color?: string }) {
  const [table, setTable] = useState(false);
  const last = [...data].reverse().find((d) => d.value > 0);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          {last ? <>Latest <span className="num font-semibold text-foreground">{formatMoney(last.value, "INR", { decimals: 0 })}</span> · {monthLabel(last.month, "short")}</> : "No data yet"}
        </p>
        <ViewToggle table={table} onChange={setTable} />
      </div>
      {table ? (
        <DataTableView head={["Month", label]} rows={data.map((d) => [monthLabel(d.month, "short"), formatMoney(d.value)])} />
      ) : (
        <div style={{ height }} role="img" aria-label={label}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={monthShort} tick={AXIS} axisLine={false} tickLine={false} dy={6} />
              <YAxis tickFormatter={(v) => formatCompact(v)} tick={AXIS} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
                content={(p: TooltipContentProps<ValueType, NameType>) =>
                  p.active && p.payload?.length ? <TooltipCard title={monthLabel(String(p.label))} rows={[{ label, value: formatMoney(Number(p.payload[0].value)), color }]} /> : null
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={color}
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--surface-2)", fill: color }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─────────── Ranked horizontal bars (single series, value at the tip) ───────────

export function RankBars({
  data, max = 8, color = "var(--chart-2)", hrefFor,
}: { data: { id: string; name: string; value: number; sub?: string }[]; max?: number; color?: string; hrefFor?: (id: string) => string }) {
  const top = data.slice(0, max);
  const rest = data.slice(max);
  const rows = rest.length ? [...top, { id: "_other", name: `Other (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0) }] : top;
  const peak = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="py-10 text-center text-[13px] text-muted-foreground">No invoiced revenue in this period yet.</p>;
  return (
    <ul className="flex flex-col gap-3" aria-label="Ranked values">
      {rows.map((r) => {
        const label = (
          <span className="truncate text-[13px] font-medium">{r.name}</span>
        );
        return (
          <li key={r.id} className="group grid grid-cols-[minmax(0,150px)_1fr_auto] items-center gap-3 sm:grid-cols-[minmax(0,190px)_1fr_auto]" title={`${r.name}: ${formatMoney(r.value)}`}>
            {hrefFor && r.id !== "_other" ? <Link href={hrefFor(r.id)} className="truncate hover:underline">{label}</Link> : label}
            <div className="h-3 overflow-hidden rounded-[4px] bg-muted">
              <div
                className="h-full rounded-r-[4px] transition-[width] duration-500 group-hover:opacity-85"
                style={{ width: `${Math.max((r.value / peak) * 100, 1.5)}%`, background: r.id === "_other" ? "var(--chart-axis)" : color }}
              />
            </div>
            <span className="num w-16 text-right text-[12.5px] font-semibold">{formatCompact(r.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}
