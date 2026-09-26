"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Pencil, Plus, Save } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { CardBody, CardHead, GlassCard } from "@/components/shared/glass-card";
import { Drawer } from "@/components/shared/overlays";
import { applyServerErrors, ComboField, Form, FormSection, SelectField, SwitchField, TextField } from "@/components/shared/form-field";
import { Initials } from "@/components/shared/person";
import { Pill, StatusBadge } from "@/components/shared/status-badge";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { useApi, useApiMutation, useEmployeeOptions } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { relativeTime } from "@/lib/dates";
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions";
import { userCreateSchema, userUpdateSchema } from "@/validations/system";

type User = {
  id: string; name: string; email: string; isActive: boolean; lastLoginAt: string | null; locked: boolean; failedLogins: number;
  role: { key: RoleKey; name: string }; employee: { id: string; fullName: string; employeeCode: string } | null;
};
type Roles = {
  roles: { id: string; key: RoleKey; name: string; description: string | null; users: number; permissions: string[] }[];
  catalogue: { key: string; module: string; description: string }[];
};

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as RoleKey[]).map((k) => ({ value: k, label: ROLE_LABELS[k] }));

export default function UsersPage() {
  const users = useApi<User[]>("/api/users");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Who can sign in, and what each role is allowed to see and do. Salary, bank and PAN data are only visible to roles granted them."
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add user</Button>}
      />
      <Tabs defaultValue="users" className="gap-5">
        <TabsList variant="line" className="h-10 gap-1 border-b border-border">
          <TabsTrigger value="users" className="px-3">Users</TabsTrigger>
          <TabsTrigger value="roles" className="px-3">Roles & permissions</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <GlassCard className="overflow-hidden">
            {users.isLoading ? <div className="p-4"><Skeleton className="h-64 rounded-xl" /></div> : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[760px] text-[13.5px]">
                  <thead><tr className="text-left text-[11.5px] tracking-wide text-muted-foreground uppercase">
                    <th className="px-4 py-2.5 font-semibold">User</th><th className="px-4 py-2.5 font-semibold">Role</th><th className="px-4 py-2.5 font-semibold">Employee record</th>
                    <th className="px-4 py-2.5 font-semibold">Last sign-in</th><th className="px-4 py-2.5 font-semibold">Status</th><th />
                  </tr></thead>
                  <tbody>
                    {(users.data ?? []).map((u) => (
                      <tr key={u.id} className="border-t border-border">
                        <td className="px-4 py-3"><div className="flex items-center gap-3"><Initials name={u.name} size="sm" /><div><p className="font-semibold">{u.name}</p><p className="text-[12px] text-muted-foreground">{u.email}</p></div></div></td>
                        <td className="px-4 py-3"><Pill tone={u.role.key === "SUPER_ADMIN" ? "brand" : "neutral"}>{u.role.name}</Pill></td>
                        <td className="px-4 py-3 text-[13px]">{u.employee ? `${u.employee.fullName} · ${u.employee.employeeCode}` : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">{u.lastLoginAt ? relativeTime(u.lastLoginAt) : "Never"}</td>
                        <td className="px-4 py-3">{u.locked ? <StatusBadge status="FAILED" label="Locked" /> : <StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} />}</td>
                        <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon-sm" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}><Pencil className="size-3.5" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </TabsContent>
        <TabsContent value="roles"><RoleMatrix /></TabsContent>
      </Tabs>
      <UserDrawer value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function UserDrawer({ value, onClose }: { value: User | "new" | null; onClose: () => void }) {
  const { user: me } = useSession();
  const editing = value && value !== "new" ? value : null;
  const employees = useEmployeeOptions(true, !!value);
  // One form serves create and edit; the schema switches with the mode.
  const form = useForm<Record<string, unknown>>({ resolver: zodResolver(editing ? userUpdateSchema : userCreateSchema) as unknown as Resolver<Record<string, unknown>> });
  useEffect(() => {
    if (!value) return;
    form.reset(editing
      ? { name: editing.name, role: editing.role.key, employeeId: editing.employee?.id ?? null, isActive: editing.isActive, password: "" }
      : { name: "", email: "", role: "EMPLOYEE", employeeId: null, password: "", isActive: true });
  }, [value, editing, form]);

  const save = useApiMutation((v: unknown) => (editing ? api.put(`/api/users/${editing.id}`, v) : api.post("/api/users", v)), {
    success: editing ? "User updated" : "User created — share the password with them securely", invalidate: ["/api/users", "/api/roles"], onSuccess: onClose,
  });

  return (
    <Drawer open={!!value} onOpenChange={(o) => !o && onClose()} title={editing ? `Edit ${editing.name}` : "Add user"}
      description={editing ? "Changing the role, password or deactivating signs the user out everywhere." : "Employee accounts must be linked to an employee record so they only see their own data."}
      formId="user-form" pending={save.isPending} submitLabel={editing ? "Save" : "Create user"}>
      <Form form={form} id="user-form" onSubmit={(v) => save.mutateAsync(v).catch((e) => applyServerErrors(form, e))}>
        <FormSection>
          <TextField name="name" label="Name" required full />
          {!editing && <TextField name="email" label="Email" type="email" required full autoComplete="off" />}
          <SelectField name="role" label="Role" options={ROLE_OPTIONS} required disabled={editing?.id === me.id} />
          <ComboField name="employeeId" label="Linked employee" clearable placeholder="None" options={(employees.data ?? []).map((e) => ({ value: e.id, label: e.fullName, description: e.employeeCode }))} />
          <TextField name="password" label={editing ? "Reset password" : "Password"} type="password" required={!editing} full autoComplete="new-password" hint="At least 10 characters with letters and numbers" />
          <SwitchField name="isActive" label="Active" hint="Inactive users cannot sign in" full />
        </FormSection>
        {editing?.locked && <p className="flex items-center gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning"><Lock className="size-4" /> Locked after failed sign-ins. Resetting the password unlocks it.</p>}
      </Form>
    </Drawer>
  );
}

function RoleMatrix() {
  const { data, isLoading } = useApi<Roles>("/api/roles");
  // Only unsaved edits live in state; everything else reads straight from the server data.
  const [edits, setEdits] = useState<Partial<Record<RoleKey, Set<string>>>>({});
  const { confirm, dialog } = useConfirm();
  const modules = useMemo(() => {
    const m = new Map<string, Roles["catalogue"]>();
    for (const p of data?.catalogue ?? []) m.set(p.module, [...(m.get(p.module) ?? []), p]);
    return [...m.entries()];
  }, [data]);
  const save = useApiMutation(({ key, permissions }: { key: RoleKey; permissions: string[] }) => api.put(`/api/roles/${key}`, { permissions }), {
    success: (_r, v) => `${ROLE_LABELS[v.key]} permissions saved`, invalidate: ["/api/roles"],
    onSuccess: (_r, v) => setEdits((e) => { const n = { ...e }; delete n[v.key]; return n; }),
  });
  if (isLoading || !data) return <Skeleton className="h-96 rounded-2xl" />;

  const granted = (key: RoleKey) => edits[key] ?? new Set(data.roles.find((r) => r.key === key)!.permissions);
  const changed = (key: RoleKey) => {
    const orig = data.roles.find((r) => r.key === key)!.permissions;
    const cur = granted(key);
    return orig.length !== cur.size || orig.some((p) => !cur.has(p));
  };

  return (
    <GlassCard className="overflow-hidden">
      <CardHead title="Permission matrix" description="Super admin always has everything. Changes apply at each user's next request." />
      <CardBody className="p-0">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th className="px-5 py-3 text-left text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">Permission</th>
                {data.roles.map((r) => (
                  <th key={r.key} className="px-3 py-3 text-center">
                    <p className="text-[12.5px] font-semibold">{r.name}</p>
                    <p className="text-[11px] font-normal text-muted-foreground">{r.users} user{r.users === 1 ? "" : "s"}</p>
                    {r.key !== "SUPER_ADMIN" && changed(r.key) && (
                      <Button size="xs" className="mt-1.5" disabled={save.isPending}
                        onClick={async () => { if ((await confirm({ title: `Save ${r.name} permissions?`, description: "Everyone with this role gains or loses access immediately.", confirmLabel: "Save" })).ok) save.mutate({ key: r.key, permissions: [...granted(r.key)] }); }}>
                        <Save className="size-3" /> Save
                      </Button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map(([module, perms]) => (
                <Fragment key={module}>
                  <tr><td colSpan={data.roles.length + 1} className="bg-muted/60 px-5 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{module}</td></tr>
                  {perms.map((p) => (
                    <tr key={p.key} className="border-t border-border">
                      <td className="px-5 py-2.5"><p className="font-medium">{p.description}</p><p className="font-mono text-[11px] text-muted-foreground">{p.key}</p></td>
                      {data.roles.map((r) => {
                        const on = granted(r.key).has(p.key);
                        const fixed = r.key === "SUPER_ADMIN";
                        return (
                          <td key={r.key} className={cn("px-3 py-2.5 text-center", fixed && "opacity-60")}>
                            <Checkbox checked={fixed || on} disabled={fixed} aria-label={`${r.name}: ${p.description}`}
                              onCheckedChange={(v) => setEdits((e) => { const n = new Set(granted(r.key)); if (v) n.add(p.key); else n.delete(p.key); return { ...e, [r.key]: n }; })} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
      {dialog}
    </GlassCard>
  );
}
