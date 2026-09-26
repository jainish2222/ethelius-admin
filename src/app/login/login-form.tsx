"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api/client";
import { loginSchema } from "@/validations/system";

const DEMO = [
  { email: "admin@ethelius.com", role: "Super admin" },
  { email: "rohan.desai@ethelius.com", role: "Finance" },
  { email: "priya.shah@ethelius.com", role: "HR" },
  { email: "meera.pillai@ethelius.com", role: "Project manager" },
  { email: "jainish.koladiya@ethelius.com", role: "Employee" },
];

export function LoginForm({ next, showDemo }: { next?: string; showDemo?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "", remember: true } });
  const { register, handleSubmit, formState, setValue } = form;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post("/api/auth/login", values);
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="email" className="text-[12.5px]">Work email</Label>
        <Input id="email" type="email" autoComplete="username" placeholder="you@ethelius.com" className="h-10 rounded-[11px]" aria-invalid={!!formState.errors.email || undefined} {...register("email")} />
        {formState.errors.email && <p className="text-[12px] text-danger">{formState.errors.email.message}</p>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password" className="text-[12.5px]">Password</Label>
        <div className="relative">
          <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" className="h-10 rounded-[11px] pr-10" aria-invalid={!!formState.errors.password || undefined} {...register("password")} />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {formState.errors.password && <p className="text-[12px] text-danger">{formState.errors.password.message}</p>}
      </div>
      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Checkbox defaultChecked onCheckedChange={(v) => setValue("remember", !!v)} /> Keep me signed in for 14 days
      </label>
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger">{error}</p>}
      <Button type="submit" size="lg" className="mt-1 h-11 rounded-[12px] text-[14px] font-semibold" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <>Sign in <ArrowRight className="size-4" /></>}
      </Button>

      {showDemo && (
        <div className="mt-3 rounded-2xl border border-dashed border-border p-3.5">
          <p className="mb-2 text-[12px] text-muted-foreground">
            <span className="font-semibold tracking-wide uppercase">Demo accounts</span> · password <code className="font-mono font-semibold text-foreground">Ethelius@2026</code>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => { setValue("email", d.email); setValue("password", "Ethelius@2026"); }}
                className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium transition-colors hover:border-brand/60 hover:bg-brand-soft"
              >
                {d.role}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
