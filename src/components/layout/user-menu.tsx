"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/components/providers/session";
import { api } from "@/lib/api/client";
import { Initials } from "@/components/shared/person";

export function UserMenu() {
  const { user } = useSession();
  const router = useRouter();

  const signOut = async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      toast.success("Signed out");
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2.5 rounded-[11px] py-1 pr-2 pl-1 transition-colors hover:bg-accent" aria-label="Account menu">
          <Initials name={user.name} photo={user.employeeId && user.hasPhoto ? `/api/employees/${user.employeeId}/photo` : null} size="sm" />
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-[13px] font-semibold">{user.name}</span>
            <span className="block text-[11px] text-muted-foreground">{user.roleName}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {user.employeeId && (
            <DropdownMenuItem asChild>
              <Link href={`/employees/${user.employeeId}`}><UserRound className="size-4" /> My profile</Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href="/settings"><Settings className="size-4" /> Settings</Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} variant="destructive">
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
