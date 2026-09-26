import Image from "next/image";
import { cn } from "cn";

/** The Ethelius wordmark: white artwork, inverted to ink on light surfaces. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/ethelius-wordmark.png"
      alt="ethelius"
      width={1633}
      height={326}
      priority
      className={cn("h-5 w-auto invert dark:invert-0", className)}
    />
  );
}

/** Compact mark for the collapsed sidebar. */
export function Monogram({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 place-items-center rounded-[10px] bg-brand text-[17px] font-extrabold leading-none text-brand-foreground shadow-[0_6px_18px_-6px_var(--brand)]",
        className,
      )}
    >
      e
    </span>
  );
}
