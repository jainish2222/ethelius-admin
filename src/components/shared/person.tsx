"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "cn";

const SIZES = { xs: "size-6 text-[10px]", sm: "size-8 text-[11.5px]", md: "size-10 text-[13px]", lg: "size-16 text-[20px]", xl: "size-20 text-[24px]" };

/** Deterministic, calm tint per person so avatars are recognisable without loud colour. */
function tint(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 32% 50% / 0.16)`;
}

export function Initials({ name, photo, size = "md", className }: { name: string; photo?: string | null; size?: keyof typeof SIZES; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-border font-semibold text-foreground/80", SIZES[size], className)}
      style={{ background: tint(name) }}
      aria-hidden
    >
      {initials}
      {photo && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="absolute inset-0 size-full object-cover" onError={() => setFailed(true)} loading="lazy" />
      )}
    </span>
  );
}

export function PersonCell({
  id, name, subtitle, hasPhoto, href,
}: { id?: string; name: string; subtitle?: React.ReactNode; hasPhoto?: boolean; href?: string }) {
  const inner = (
    <span className="flex min-w-0 items-center gap-3">
      <Initials name={name} photo={hasPhoto && id ? `/api/employees/${id}/photo` : null} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-foreground">{name}</span>
        {subtitle && <span className="block truncate text-[12px] text-muted-foreground">{subtitle}</span>}
      </span>
    </span>
  );
  return href ? <Link href={href} onClick={(e) => e.stopPropagation()} className="hover:underline-offset-2">{inner}</Link> : inner;
}
