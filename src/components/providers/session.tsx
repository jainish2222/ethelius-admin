"use client";

import { createContext, useContext, useMemo } from "react";
import { can, type Permission, type RoleKey } from "@/lib/permissions";

export type ClientSession = {
  user: { id: string; name: string; email: string; role: RoleKey; roleName: string; employeeId: string | null; hasPhoto: boolean };
  permissions: string[];
};

type Ctx = ClientSession & { can: (p: Permission | Permission[], mode?: "all" | "any") => boolean };

const SessionContext = createContext<Ctx | null>(null);

/**
 * The signed-in user and their permissions, resolved on the server in the app layout.
 * Used only to shape the UI; every API call is authorised again on the server.
 */
export function SessionProvider({ session, children }: { session: ClientSession; children: React.ReactNode }) {
  const value = useMemo<Ctx>(() => {
    const set = new Set(session.permissions);
    return { ...session, can: (p, mode = "all") => can(set, p, mode) };
  }, [session]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
