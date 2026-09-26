"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Local open/closed state that starts open when the URL carries `?flag=1`
 * (so shortcuts like /payments?new=1 open the form), and strips the flag from the URL once read.
 */
export function useQueryFlag(flag = "new") {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(() => params.get(flag) === "1");
  useEffect(() => {
    if (params.get(flag) !== "1") return;
    const next = new URLSearchParams(params);
    next.delete(flag);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [params, flag, router, pathname]);
  return [open, setOpen] as const;
}
