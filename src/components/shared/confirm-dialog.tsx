"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Options = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Ask for a reason (e.g. rejecting an expense); the promise resolves to it. */
  reason?: { label: string; required?: boolean; placeholder?: string };
};

type Result = { ok: boolean; reason?: string };

/**
 * Promise-based confirmation: `const { ok } = await confirm({ … })`.
 * Render the returned `dialog` element once in the component.
 */
export function useConfirm() {
  const [opts, setOpts] = useState<Options | null>(null);
  const [reason, setReason] = useState("");
  const resolver = useRef<(r: Result) => void>(null);

  const confirm = useCallback((o: Options) => {
    setReason("");
    setOpts(o);
    return new Promise<Result>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (r: Result) => {
    resolver.current?.(r);
    resolver.current = null;
    setOpts(null);
  };

  const blocked = !!opts?.reason?.required && !reason.trim();

  const dialog = (
    <AlertDialog open={!!opts} onOpenChange={(o) => !o && close({ ok: false })}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          {opts?.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {opts?.reason && (
          <div className="grid gap-2">
            <Label htmlFor="confirm-reason">{opts.reason.label}</Label>
            <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={opts.reason.placeholder} rows={3} autoFocus />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant={opts?.destructive ? "destructive" : "default"} disabled={blocked} onClick={() => close({ ok: true, reason: reason.trim() || undefined })}>
            {opts?.confirmLabel ?? "Confirm"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}

/** Standalone confirm button for simple destructive actions. */
export function ConfirmButton({
  children, onConfirm, pending, ...opts
}: Options & { children: React.ReactNode; onConfirm: () => void; pending?: boolean }) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <Button
        variant={opts.destructive ? "destructive" : "outline"}
        disabled={pending}
        onClick={async () => {
          if ((await confirm(opts)).ok) onConfirm();
        }}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {children}
      </Button>
      {dialog}
    </>
  );
}
