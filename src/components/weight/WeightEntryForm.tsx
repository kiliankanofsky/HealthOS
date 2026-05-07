"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { addWeightEntry, type AddEntryState } from "@/app/weight/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  defaultDate: string;
};

export function WeightEntryForm({ defaultDate }: Props) {
  const [state, action] = useActionState<AddEntryState | undefined, FormData>(
    addWeightEntry,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="date">Datum</Label>
          <Input id="date" name="date" type="date" defaultValue={defaultDate} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="weight">Gewicht (kg)</Label>
          <Input
            id="weight"
            name="weight"
            type="number"
            step="0.1"
            min="0"
            max="500"
            placeholder="z. B. 74.5"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notiz (optional)</Label>
          <Input id="notes" name="notes" type="text" placeholder="z. B. nach dem Lauf" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton />
        {state?.ok && (
          <span className="text-sm text-emerald-600">Gespeichert.</span>
        )}
        {state && !state.ok && state.error && (
          <span className="text-sm text-red-600">{state.error}</span>
        )}
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Speichere…" : "Eintrag speichern"}
    </Button>
  );
}
