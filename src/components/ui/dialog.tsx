"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const Root = DialogPrimitive.Root;
const Trigger = DialogPrimitive.Trigger;
const Portal = DialogPrimitive.Portal;
const Title = DialogPrimitive.Title;
const Description = DialogPrimitive.Description;
const Close = DialogPrimitive.Close;

function Backdrop({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/30 backdrop-blur-sm transition-opacity duration-200",
        "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

// HIG-styled centered modal. Spring-ähnliches Auftauchen über Scale+Opacity.
function Popup({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Popup
      className={cn(
        "fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-32px))]",
        "-translate-x-1/2 -translate-y-1/2",
        "rounded-2xl bg-card text-card-foreground p-6 shadow-2xl ring-1 ring-black/5",
        "transition-all duration-200 ease-out",
        "data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.96]",
        "data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.98]",
        "outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Popup>
  );
}

function Header({
  title,
  description,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 space-y-1 pr-8", className)}>
      <Title className="font-heading text-lg font-semibold tracking-tight">
        {title}
      </Title>
      {description && (
        <Description className="text-sm text-muted-foreground">
          {description}
        </Description>
      )}
    </div>
  );
}

function CloseIconButton({ className }: { className?: string }) {
  return (
    <Close
      aria-label="Schließen"
      className={cn(
        "absolute top-4 right-4 inline-flex size-7 items-center justify-center rounded-full",
        "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    >
      <X className="size-4" />
    </Close>
  );
}

export const Dialog = {
  Root,
  Trigger,
  Portal,
  Backdrop,
  Popup,
  Title,
  Description,
  Close,
  Header,
  CloseIconButton,
};
