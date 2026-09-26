"use client";

import { useEffect } from "react";

/** Sets the browser tab title for client-rendered pages. */
export function DocTitle({ title }: { title?: string | null }) {
  useEffect(() => {
    if (title) document.title = `${title} · Ethelius Admin`;
  }, [title]);
  return null;
}
