import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";
import { Wordmark } from "@/components/layout/brand";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSession()) redirect(next?.startsWith("/") && !next.startsWith("//") ? next : "/");

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-brand/15 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-[0.18]"
          style={{
            backgroundImage: "linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at 50% 30%, black, transparent 70%)",
          }}
        />
      </div>

      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Wordmark className="h-7" />
          <p className="text-[13px] font-medium text-muted-foreground">Admin &amp; payroll portal</p>
        </div>
        <div className="glass rounded-3xl p-7 sm:p-8">
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">Welcome back</h1>
          <p className="mt-1 mb-6 text-[13.5px] text-muted-foreground">Sign in with your Ethelius account.</p>
          <LoginForm next={next} showDemo={process.env.NODE_ENV !== "production"} />
        </div>
        <p className="mt-6 text-center text-[12px] text-muted-foreground">Access is logged. Contact your administrator if you need an account.</p>
      </div>
    </div>
  );
}
