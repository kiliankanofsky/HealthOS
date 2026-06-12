"use client";

import { Check, ChevronDown, Loader2, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { sendPlanChatMessage } from "@/app/endurance/recommendations/actions";
import type { ChatMessage } from "@/lib/endurance/ai-chat";
import { type ChatModel, chatModelLabel } from "@/lib/endurance/ai-models";
import { cn } from "@/lib/utils";

// Kompaktes Markdown-Styling für Chat-Bubbles (ohne @tailwindcss/typography).
const MD_CLASS =
  "space-y-2 text-sm [&_p]:m-0 [&_strong]:font-semibold [&_em]:italic " +
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 " +
  "[&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold " +
  "[&_a]:underline [&_code]:rounded [&_code]:bg-foreground/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] " +
  "[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-xs " +
  "[&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:px-2 [&_td]:py-1 " +
  "[&_hr]:my-2 [&_hr]:border-border";

function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className={MD_CLASS}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

const SUGGESTIONS = [
  "Verschieb den nächsten Long Run auf Sonntag",
  "Mach die nächste Woche etwas lockerer",
  "Wie sieht meine Erholung gerade aus?",
];

type Props = { planId: number };

export function PlanChat({ planId }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [chatModel, setChatModel] = useState<ChatModel>("anthropic");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  function send(text: string) {
    const content = text.trim();
    if (content.length === 0 || pending) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    startTransition(async () => {
      const r = await sendPlanChatMessage(planId, next, chatModel);
      if (!r.ok) {
        setError(r.error ?? "Etwas ist schiefgelaufen.");
        return;
      }
      setMessages([...next, { role: "assistant", content: r.reply ?? "Erledigt." }]);
      // Bei Plan-Änderungen die Server-Daten neu laden → Kalender/Cards aktualisieren.
      if (r.changed) router.refresh();
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Plan-Assistent
        </span>
        <ChatModelPicker model={chatModel} onChange={setChatModel} disabled={pending} />
      </div>

      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="max-h-64 space-y-2 overflow-y-auto pr-1"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[88%] rounded-2xl px-3 py-2 text-sm",
                m.role === "user"
                  ? "ml-auto whitespace-pre-wrap bg-primary text-primary-foreground"
                  : "mr-auto bg-muted text-foreground",
              )}
            >
              {m.role === "user" ? m.content : <ChatMarkdown content={m.content} />}
            </div>
          ))}
          {pending && (
            <div className="mr-auto flex items-center gap-1.5 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              denkt nach…
            </div>
          )}
        </div>
      )}

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => send(s)}
              className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          disabled={pending}
          placeholder="Anpassung beschreiben oder Frage stellen…"
          className={cn(
            "min-h-[2.75rem] flex-1 resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
          )}
        />
        <button
          type="button"
          onClick={() => send(input)}
          disabled={input.trim().length === 0 || pending}
          aria-label="Senden"
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors",
            "hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <Sparkles className="size-3.5" />
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Die KI ({chatModelLabel(chatModel)}) passt deinen Plan direkt an
          (verschieben, ersetzen, anlegen, löschen) und kennt deine letzten
          Erholungsdaten.
        </p>
      )}
    </div>
  );
}

// Modell-Wahl im Tooltip-Stil: schlichter Button (grau bei Hover), Klick öffnet
// die Auswahl zwischen Anthropic (Claude) und dem kostenlosen OpenRouter-Modell.
// Exportiert: auch der Dashboard-Chat (Startseite) nutzt den Picker.
export function ChatModelPicker({
  model,
  onChange,
  disabled,
}: {
  model: ChatModel;
  onChange: (m: ChatModel) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const options: ChatModel[] = ["anthropic", "free"];
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="KI-Modell wählen"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <Sparkles className="size-3" />
        {chatModelLabel(model)}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
            {options.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span>{chatModelLabel(m)}</span>
                {m === model && <Check className="size-3 text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
