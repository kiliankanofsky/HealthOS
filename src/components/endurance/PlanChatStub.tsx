"use client";

import { Send, Sparkles } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

// Chat-Gerüst für Sprint 4. Die KI-Anbindung folgt in Sprint 5 — hier steht
// bewusst nur die UI, damit das Layout vollständig ist. Senden zeigt einen
// Hinweis statt eine Anfrage abzuschicken.

const SUGGESTIONS = [
  "Verschieb den Long Run auf Sonntag",
  "Mach die Woche etwas lockerer",
  "Ersetze die Intervalle durch einen Tempolauf",
];

export function PlanChatStub() {
  const [value, setValue] = useState("");
  const [note, setNote] = useState<string | null>(null);

  function handleSend() {
    if (value.trim().length === 0) return;
    setNote(
      "Der KI-Chat wird in Sprint 5 verdrahtet — deine Nachricht wurde noch nicht gesendet.",
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setValue(s);
              setNote(null);
            }}
            className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (note) setNote(null);
          }}
          rows={2}
          placeholder="Anpassung an den Plan beschreiben…"
          className={cn(
            "min-h-[2.75rem] flex-1 resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={value.trim().length === 0}
          aria-label="Senden"
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors",
            "hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <Send className="size-4" />
        </button>
      </div>

      {note ? (
        <p className="flex items-center gap-1.5 text-xs text-amber-700">
          <Sparkles className="size-3.5" />
          {note}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Bald: Claude passt deinen Plan im Dialog an (Sprint 5).
        </p>
      )}
    </div>
  );
}
