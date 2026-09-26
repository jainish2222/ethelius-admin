"use client";

import { useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, BadgeCheck, Download, Eye, FileText, FileUp, ShieldAlert, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Filter } from "@/components/shared/data-table";
import { Modal } from "@/components/shared/overlays";
import { Combobox, DatePicker } from "@/components/shared/pickers";
import { Pill, StatusBadge } from "@/components/shared/status-badge";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useSession } from "@/components/providers/session";
import { useApiMutation, useCompanyOptions, useEmployeeOptions, useInvalidate, useProjectOptions } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api/client";
import { DOCUMENT_TYPE, Options, SENSITIVE_DOCUMENT_TYPES, label } from "@/lib/constants";
import { formatDate, todayDateOnly } from "@/lib/dates";
import { download } from "@/lib/download";
import type { DocumentRow } from "@/types";

const EMPLOYEE_TYPES = ["RESUME", "OFFER_LETTER", "EMPLOYMENT_AGREEMENT", "ID_PROOF", "PAN", "BANK_PROOF", "EXPERIENCE_LETTER", "RELIEVING_LETTER", "OTHER"];
const BUSINESS_TYPES = ["CONTRACT", "PURCHASE_ORDER", "OTHER"];

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

type Owner = { employeeId?: string; companyId?: string; projectId?: string };

export function DocumentsTable({ owner, showOwner = !owner, filters: extra = [], canUpload }: { owner?: Owner; showOwner?: boolean; filters?: Filter[]; canUpload?: boolean }) {
  const { can, user } = useSession();
  const { confirm, dialog } = useConfirm();
  const [uploading, setUploading] = useState(false);
  const write = can("document.write");
  const allowUpload = canUpload ?? (write || (!!owner?.employeeId && owner.employeeId === user.employeeId));

  const verify = useApiMutation(({ id, verified }: { id: string; verified: boolean }) => api.patch(`/api/documents/${id}`, { verified }), {
    success: (_r, v) => (v.verified ? "Marked verified" : "Verification removed"), invalidate: ["/api/documents"],
  });
  const archive = useApiMutation((id: string) => api.delete(`/api/documents/${id}`), { success: "Document archived", invalidate: ["/api/documents"] });

  const columns = useMemo<ColumnDef<DocumentRow, unknown>[]>(() => {
    const cols: ColumnDef<DocumentRow, unknown>[] = [
      {
        id: "title", header: "Document",
        cell: ({ row: { original: d } }) => (
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><FileText className="size-4" /></span>
            <div className="min-w-0">
              <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="block truncate font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>{d.title}</a>
              <p className="truncate text-[12px] text-muted-foreground">{d.fileName} · {kb(d.size)}</p>
            </div>
          </div>
        ),
      },
      {
        id: "type", header: "Type",
        cell: ({ row: { original: d } }) => (
          <span className="flex items-center gap-1.5 text-[13px]">
            {label(DOCUMENT_TYPE, d.type)}
            {(SENSITIVE_DOCUMENT_TYPES as readonly string[]).includes(d.type) && <ShieldAlert className="size-3.5 text-warning" aria-label="Sensitive" />}
          </span>
        ),
      },
    ];
    if (showOwner) {
      cols.push({
        id: "owner", header: "Belongs to", enableSorting: false,
        cell: ({ row: { original: d } }) => (
          <span className="text-[13px]">
            {d.employee ? d.employee.fullName : d.company ? d.company.name : d.project?.name}
            <Pill className="ml-2">{d.employee ? "Employee" : d.company ? "Company" : "Project"}</Pill>
          </span>
        ),
      });
    }
    cols.push(
      { id: "uploadedAt", header: "Uploaded", cell: ({ row }) => <span className="num whitespace-nowrap text-[13px]">{formatDate(row.original.uploadedAt)}</span> },
      {
        id: "expiryDate", header: "Expiry",
        cell: ({ row: { original: d } }) => d.expiryDate
          ? <span className={cn("num whitespace-nowrap text-[13px]", d.expiryDate < todayDateOnly() && "font-semibold text-danger")}>{formatDate(d.expiryDate)}</span>
          : <span className="text-muted-foreground/60">—</span>,
      },
      { id: "verified", header: "Status", enableSorting: false, cell: ({ row }) => <StatusBadge status={row.original.verified ? "VERIFIED" : "UNVERIFIED"} /> },
    );
    return cols;
  }, [showOwner]);

  const params = { employeeId: owner?.employeeId, companyId: owner?.companyId, projectId: owner?.projectId };

  return (
    <>
      <DataTable<DocumentRow>
        endpoint="/api/documents"
        exportKey={can("document.read") ? "documents" : undefined}
        params={params}
        syncFromUrl={!owner}
        columns={columns}
        defaultSort={{ id: "uploadedAt", desc: true }}
        searchPlaceholder="Search documents…"
        filters={[
          { type: "select", key: "type", label: "Type", options: Options.documentType },
          { type: "select", key: "verified", label: "Verification", options: [{ value: "yes", label: "Verified" }, { value: "no", label: "Not verified" }] },
          ...extra,
        ]}
        toolbar={allowUpload && <Button className="h-9 rounded-[10px]" onClick={() => setUploading(true)}><Upload className="size-4" /> Upload</Button>}
        rowActions={(d) => [
          { label: "Open", icon: Eye, onSelect: () => window.open(`/api/documents/${d.id}/file`, "_blank", "noopener") },
          { label: "Download", icon: Download, onSelect: () => download(`/api/documents/${d.id}/file?download=1`) },
          { label: "Mark verified", icon: BadgeCheck, hidden: (r) => !write || r.verified, onSelect: (r) => verify.mutate({ id: r.id, verified: true }) },
          { label: "Remove verification", icon: XCircle, hidden: (r) => !write || !r.verified, onSelect: (r) => verify.mutate({ id: r.id, verified: false }) },
          {
            label: "Archive", icon: Archive, destructive: true, separatorBefore: true, hidden: () => !write,
            onSelect: async (r) => { if ((await confirm({ title: `Archive “${r.title}”?`, description: "The file is kept for audit but hidden from lists.", confirmLabel: "Archive", destructive: true })).ok) archive.mutate(r.id); },
          },
        ]}
        empty={{ icon: FileText, title: "No documents", description: "Offer letters, ID proofs, contracts and other files appear here." }}
      />
      <UploadModal open={uploading} onOpenChange={setUploading} owner={owner} />
      {dialog}
    </>
  );
}

export function UploadModal({ open, onOpenChange, owner }: { open: boolean; onOpenChange: (o: boolean) => void; owner?: Owner }) {
  const { can } = useSession();
  const fixed = !!owner;
  const [kind, setKind] = useState<"employee" | "company" | "project">(owner?.companyId ? "company" : owner?.projectId ? "project" : "employee");
  const [target, setTarget] = useState<string | null>(null);
  const [type, setType] = useState<string>("");
  const [title, setTitle] = useState("");
  const [expiry, setExpiry] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const employees = useEmployeeOptions(true, open && !fixed && kind === "employee");
  const companies = useCompanyOptions(open && !fixed && kind === "company");
  const projects = useProjectOptions(open && !fixed && kind === "project");
  const pii = can("employee.pii");
  const invalidate = useInvalidate();

  const types = (kind === "employee" ? EMPLOYEE_TYPES : BUSINESS_TYPES).filter((t) => pii || !(SENSITIVE_DOCUMENT_TYPES as readonly string[]).includes(t));
  const ownerId = owner?.employeeId ?? owner?.companyId ?? owner?.projectId ?? target;

  const reset = () => { setTarget(null); setType(""); setTitle(""); setExpiry(null); setNotes(""); setFile(null); };

  const submit = async () => {
    if (!file || !type || !ownerId) return toast.error("Choose who it belongs to, the type, and a file.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("type", type);
      fd.set("title", title);
      if (expiry) fd.set("expiryDate", expiry);
      if (notes) fd.set("notes", notes);
      fd.set(kind === "employee" ? "employeeId" : kind === "company" ? "companyId" : "projectId", ownerId);
      await api.post("/api/documents", fd);
      toast.success("Document uploaded");
      reset();
      onOpenChange(false);
      await invalidate("/api/documents");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}
      title="Upload document"
      description="PDF, image or Word file up to 10 MB. Stored privately — only people with access can open it."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Uploading…" : "Upload"}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {!fixed && (
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">Belongs to</Label>
            <div className="inline-flex w-fit rounded-xl border border-border bg-muted p-1">
              {(["employee", "company", "project"] as const).map((k) => (
                <button key={k} type="button" onClick={() => { setKind(k); setTarget(null); setType(""); }}
                  className={cn("h-7 rounded-lg px-3 text-[12.5px] font-medium capitalize", kind === k ? "bg-surface-2 shadow-sm" : "text-muted-foreground")}>{k}</button>
              ))}
            </div>
            <Combobox
              value={target}
              onChange={setTarget}
              placeholder={`Choose ${kind}`}
              options={
                kind === "employee" ? (employees.data ?? []).map((e) => ({ value: e.id, label: e.fullName, description: e.employeeCode }))
                  : kind === "company" ? (companies.data ?? []).map((c) => ({ value: c.id, label: c.name }))
                    : (projects.data ?? []).map((p) => ({ value: p.id, label: p.name, description: p.company.name }))
              }
            />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">Document type</Label>
            <Select value={type} onValueChange={(v) => { setType(v); if (!title) setTitle(label(DOCUMENT_TYPE, v)); }}>
              <SelectTrigger className="h-9 w-full rounded-[10px]"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent position="popper">{types.map((t) => <SelectItem key={t} value={t}>{label(DOCUMENT_TYPE, t)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">Expiry date</Label>
            <DatePicker value={expiry} onChange={setExpiry} clearable placeholder="Optional" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="doc-title" className="text-[12.5px]">Title</Label>
          <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 rounded-[10px]" />
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
          className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-7 text-center transition-colors hover:border-brand/60 hover:bg-brand-soft/30"
        >
          <FileUp className="size-6 text-muted-foreground" />
          {file ? <span className="text-[13px] font-semibold">{file.name} <span className="font-normal text-muted-foreground">· {kb(file.size)}</span></span>
            : <span className="text-[13px] text-muted-foreground">Drop a file here or <span className="font-semibold text-foreground">browse</span></span>}
        </button>
        <input ref={inputRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div className="grid gap-1.5">
          <Label htmlFor="doc-notes" className="text-[12.5px]">Notes</Label>
          <Textarea id="doc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
