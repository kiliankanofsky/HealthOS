"use client";

import { Loader2, Send, Sparkles } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { sendDashboardChatMessage } from "@/app/actions";
import { ChatModelPicker } from "@/components/endurance/PlanChat";
import type { DashboardChatMessage } from "@/lib/dashboard/ai-chat";
import { type ChatModel, chatModelLabel } from "@/lib/endurance/ai-models";
import { cn } from "@/lib/utils";

// Ganzheitlicher KI-Chat der Startseite — reduzierte Variante des Plan-Chats
// (keine Werkzeuge, kein Modell-Picker). Die KI kennt über den System-Prompt
// alle aktuellen Daten (Garmin, Plan, Gym, Gewicht, Nutrition).

// Kompaktes Markdown-Styling für Chat-Bubbles (analog PlanChat).
const MD_CLASS =
  "space-y-2 text-sm [&_p]:m-0 [&_strong]:font-semibold [&_em]:italic " +
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 " +
  "[&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold " +
  "[&_a]:underline [&_code]:rounded [&_code]:bg-foreground/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] " +
  "[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-xs " +
  "[&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:px-2 [&_td]:py-1 " +
  "[&_hr]:my-2 [&_hr]:border-border";

const SUGGESTIONS = [
  "Wie ist mein Trainingszustand insgesamt?",
  "Worauf sollte ich heute achten?",
  "Wie läuft meine aktuelle Phase?",
];

export function DashboardChat() {
  const [messages, setMessages] = useState<DashboardChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [chatModel, setChatModel] = useState<ChatModel>("anthropic");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  function send(text: string) {
    const content = text.trim();
    if (content.length === 0 || pending) return;
    setError(null);
    const next: DashboardChatMessage[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages(next);
    setInput("");
    startTransition(async () => {
      const r = await sendDashboardChatMessage(next, chatModel);
      if (!r.ok) {
        setError(r.error ?? "Etwas ist schiefgelaufen.");
        return;
      }
      setMessages([
        ...next,
        { role: "assistant", content: r.reply ?? "Erledigt." },
      ]);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    });
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            Health-Assistent
          </p>
          <ChatModelPicker
            model={chatModel}
            onChange={setChatModel}
            disabled={pending}
          />
        </div>
        {messages.length === 0 && (
          <h3 className="mt-2 font-heading text-2xl font-medium tracking-tight">
            Wie kann ich helfen?
          </h3>
        )}
      </div>

      {messages.length > 0 && (
        <div ref={scrollRef} className="max-h-80 flex-1 space-y-2 overflow-y-auto pr-1">
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
              {m.role === "user" ? (
                m.content
              ) : (
                <div className={MD_CLASS}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content}
                  </ReactMarkdown>
                </div>
              )}
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
        <div className="flex flex-1 flex-col justify-end gap-2">
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
          placeholder="Frage zu Training, Erholung oder Gewicht stellen…"
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
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </button>
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <Sparkles className="size-3.5" />
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Die KI ({chatModelLabel(chatModel)}) kennt deine aktuellen Garmin-,
          Trainings-, Gewichts- und Ernährungsdaten. Plan-Änderungen machst du
          im Endurance-Chat.
        </p>
      )}
    </div>
  );
}
