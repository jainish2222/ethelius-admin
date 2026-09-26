"use client";

import { Loader2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Common = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Form id to submit from the footer button. */
  formId?: string;
  submitLabel?: string;
  pending?: boolean;
  footer?: React.ReactNode;
  className?: string;
};

function Footer({ formId, submitLabel, pending, onCancel, footer }: { formId?: string; submitLabel?: string; pending?: boolean; onCancel: () => void; footer?: React.ReactNode }) {
  if (footer) return <>{footer}</>;
  if (!formId) return null;
  return (
    <>
      <Button variant="outline" type="button" onClick={onCancel}>Cancel</Button>
      <Button type="submit" form={formId} disabled={pending} className="min-w-28">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {submitLabel ?? "Save"}
      </Button>
    </>
  );
}

/** Right-hand drawer for create/edit forms. */
export function Drawer({ open, onOpenChange, title, description, children, formId, submitLabel, pending, footer, className, wide }: Common & { wide?: boolean }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn("flex w-full flex-col gap-0 bg-surface-2 p-0 sm:max-w-[560px]", wide && "sm:max-w-[760px]", className)}>
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="text-[17px] font-semibold tracking-[-0.01em]">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {(formId || footer) && (
          <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-6 py-4">
            <Footer formId={formId} submitLabel={submitLabel} pending={pending} onCancel={() => onOpenChange(false)} footer={footer} />
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Centered dialog for short forms and focused tasks. */
export function Modal({ open, onOpenChange, title, description, children, formId, submitLabel, pending, footer, className }: Common) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("bg-surface-2 sm:max-w-[520px]", className)}>
        <DialogHeader>
          <DialogTitle className="text-[17px] font-semibold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="scroll-thin max-h-[65vh] overflow-y-auto">{children}</div>
        {(formId || footer) && (
          <DialogFooter>
            <Footer formId={formId} submitLabel={submitLabel} pending={pending} onCancel={() => onOpenChange(false)} footer={footer} />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
