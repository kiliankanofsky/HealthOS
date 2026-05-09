"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteSession } from "@/app/hypertrophy/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type Props = {
  sessionId: number;
  templateSlug: string;
  dateLabel: string;
};

export function DeleteSessionButton({ sessionId, templateSlug, dateLabel }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteSession({ sessionId });
      if (!res.ok) {
        setError(res.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      setOpen(false);
      router.push(`/hypertrophy/${templateSlug}`);
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
        Session löschen
      </Button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.CloseIconButton />
            <Dialog.Header
              title="Session löschen?"
              description={`Die Session vom ${dateLabel} und alle ihre Sätze werden unwiderruflich entfernt.`}
            />

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={handleDelete}
                disabled={pending}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Endgültig löschen
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
