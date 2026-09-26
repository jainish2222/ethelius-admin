"use client";

import { useCallback, useSyncExternalStore } from "react";

const noop = () => () => {};

/** False during server render and hydration, true afterwards — without a setState-in-effect. */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

const EVENT = "ethelius:storage";

/** A boolean persisted in localStorage (per device), safe to read during render. */
export function useStoredFlag(key: string, fallback = false) {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb);
    window.addEventListener(EVENT, cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(EVENT, cb);
    };
  }, []);
  const read = () => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v === "1";
    } catch {
      return fallback;
    }
  };
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const set = useCallback((v: boolean) => {
    try {
      localStorage.setItem(key, v ? "1" : "0");
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  return [value, set] as const;
}
