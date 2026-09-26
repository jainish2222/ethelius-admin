"use client";

import { useId } from "react";
import {
  Controller, FormProvider, useFormContext, type FieldValues, type Path, type SubmitHandler, type UseFormReturn,
} from "react-hook-form";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api/client";
import type { Option } from "@/lib/constants";
import { Combobox, CurrencyInput, DatePicker, MonthPicker, type ComboOption } from "./pickers";

/** Form wrapper: provides RHF context and renders a <form> other components can target by id. */
export function Form<TIn extends FieldValues, TOut extends FieldValues>({
  form, id, onSubmit, children, className,
}: { form: UseFormReturn<TIn, unknown, TOut>; id: string; onSubmit: SubmitHandler<TOut>; children: React.ReactNode; className?: string }) {
  return (
    <FormProvider {...form}>
      <form id={id} noValidate onSubmit={form.handleSubmit(onSubmit)} className={cn("flex flex-col gap-6", className)}>
        {children}
      </form>
    </FormProvider>
  );
}

/** Copies field errors from a 422 response onto the form so they show inline. Returns true if any were applied. */
export function applyServerErrors<T extends FieldValues>(form: UseFormReturn<T, unknown, FieldValues>, err: unknown) {
  if (!(err instanceof ApiError) || !err.fields) return false;
  let applied = false;
  for (const [name, message] of Object.entries(err.fields)) {
    form.setError(name as Path<T>, { type: "server", message });
    applied = true;
  }
  return applied;
}

export function FormSection({ title, description, children, className }: { title?: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("flex flex-col gap-4", className)}>
      {title && (
        <legend className="mb-1">
          <span className="text-[13px] font-semibold">{title}</span>
          {description && <span className="mt-0.5 block text-[12px] text-muted-foreground">{description}</span>}
        </legend>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

type Base = { name: string; label: string; hint?: React.ReactNode; className?: string; full?: boolean; required?: boolean; disabled?: boolean };

function Shell({ id, label, hint, error, className, full, required, children }: { id: string; label: string; hint?: React.ReactNode; error?: string; className?: string; full?: boolean; required?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", full && "sm:col-span-2", className)}>
      <Label htmlFor={id} className="text-[12.5px] font-medium text-foreground/85">
        {label}
        {required && <span className="text-danger" aria-hidden>*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[12px] font-medium text-danger" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function useField(name: string) {
  const { control, formState } = useFormContext();
  const parts = name.split(".");
  let err: unknown = formState.errors;
  for (const p of parts) err = (err as Record<string, unknown> | undefined)?.[p];
  return { control, error: (err as { message?: string } | undefined)?.message };
}

const inputCls = "h-9 rounded-[10px] text-[13.5px]";

export function TextField({ type = "text", placeholder, autoComplete, ...p }: Base & { type?: string; placeholder?: string; autoComplete?: string }) {
  const id = useId();
  const { control, error } = useField(p.name);
  return (
    <Shell id={id} {...p} error={error}>
      <Controller
        control={control}
        name={p.name}
        render={({ field }) => (
          <Input
            id={id}
            type={type}
            placeholder={placeholder}
            autoComplete={autoComplete}
            disabled={p.disabled}
            className={inputCls}
            aria-invalid={!!error || undefined}
            {...field}
            value={field.value ?? ""}
          />
        )}
      />
    </Shell>
  );
}

export function NumberField({ placeholder, step = "any", min, max, suffix, ...p }: Base & { placeholder?: string; step?: string; min?: number; max?: number; suffix?: string }) {
  const id = useId();
  const { control, error } = useField(p.name);
  return (
    <Shell id={id} {...p} error={error}>
      <Controller
        control={control}
        name={p.name}
        render={({ field }) => (
          <div className="relative">
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              step={step}
              min={min}
              max={max}
              placeholder={placeholder}
              disabled={p.disabled}
              className={cn(inputCls, "num", suffix && "pr-10")}
              aria-invalid={!!error || undefined}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.valueAsNumber)}
            />
            {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12.5px] text-muted-foreground">{suffix}</span>}
          </div>
        )}
      />
    </Shell>
  );
}

export function TextareaField({ placeholder, rows = 3, ...p }: Base & { placeholder?: string; rows?: number }) {
  const id = useId();
  const { control, error } = useField(p.name);
  return (
    <Shell id={id} {...p} full={p.full ?? true} error={error}>
      <Controller
        control={control}
        name={p.name}
        render={({ field }) => <Textarea id={id} rows={rows} placeholder={placeholder} className="rounded-[10px] text-[13.5px]" aria-invalid={!!error || undefined} {...field} value={field.value ?? ""} />}
      />
    </Shell>
  );
}

const NONE = "__none__";

export function SelectField({ options, placeholder = "Select", allowEmpty, onValueChange, ...p }: Base & { options: Option[]; placeholder?: string; allowEmpty?: string; onValueChange?: (v: string) => void }) {
  const id = useId();
  const { control, error } = useField(p.name);
  return (
    <Shell id={id} {...p} error={error}>
      <Controller
        control={control}
        name={p.name}
        render={({ field }) => (
          <Select
            value={field.value ? String(field.value) : allowEmpty ? NONE : ""}
            onValueChange={(v) => {
              const val = v === NONE ? null : v;
              field.onChange(val);
              onValueChange?.(v === NONE ? "" : v);
            }}
            disabled={p.disabled}
          >
            <SelectTrigger id={id} className={cn(inputCls, "w-full")} aria-invalid={!!error || undefined}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent position="popper">
              {allowEmpty && <SelectItem value={NONE}>{allowEmpty}</SelectItem>}
              {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      />
    </Shell>
  );
}

export function ComboField({ options, placeholder, loading, clearable, onValueChange, ...p }: Base & { options: ComboOption[]; placeholder?: string; loading?: boolean; clearable?: boolean; onValueChange?: (v: string | null) => void }) {
  const id = useId();
  const { control, error } = useField(p.name);
  return (
    <Shell id={id} {...p} error={error}>
      <Controller
        control={control}
        name={p.name}
        render={({ field }) => (
          <Combobox
            id={id}
            value={field.value}
            onChange={(v) => { field.onChange(v); onValueChange?.(v); }}
            options={options}
            placeholder={placeholder}
            loading={loading}
            clearable={clearable}
            disabled={p.disabled}
            invalid={!!error}
          />
        )}
      />
    </Shell>
  );
}

export function DateField({ clearable, ...p }: Base & { clearable?: boolean }) {
  const id = useId();
  const { control, error } = useField(p.name);
  return (
    <Shell id={id} {...p} error={error}>
      <Controller
        control={control}
        name={p.name}
        render={({ field }) => <DatePicker id={id} value={field.value} onChange={(v) => field.onChange(v ?? "")} invalid={!!error} clearable={clearable} disabled={p.disabled} />}
      />
    </Shell>
  );
}

export function MonthField({ clearable, ...p }: Base & { clearable?: boolean }) {
  const id = useId();
  const { control, error } = useField(p.name);
  return (
    <Shell id={id} {...p} error={error}>
      <Controller
        control={control}
        name={p.name}
        render={({ field }) => <MonthPicker id={id} value={field.value} onChange={(v) => field.onChange(v ?? "")} invalid={!!error} clearable={clearable} />}
      />
    </Shell>
  );
}

export function CurrencyField({ currency = "INR", ...p }: Base & { currency?: string }) {
  const id = useId();
  const { control, error } = useField(p.name);
  return (
    <Shell id={id} {...p} error={error}>
      <Controller
        control={control}
        name={p.name}
        render={({ field }) => (
          <CurrencyInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} currency={currency} invalid={!!error} disabled={p.disabled} />
        )}
      />
    </Shell>
  );
}

export function SwitchField({ name, label, hint, className, full }: Base) {
  const id = useId();
  const { control } = useFormContext();
  return (
    <div className={cn("flex items-start justify-between gap-4 rounded-xl border border-border px-3.5 py-3", full && "sm:col-span-2", className)}>
      <div>
        <Label htmlFor={id} className="text-[13px] font-medium">{label}</Label>
        {hint && <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>}
      </div>
      <Controller control={control} name={name} render={({ field }) => <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} />} />
    </div>
  );
}
