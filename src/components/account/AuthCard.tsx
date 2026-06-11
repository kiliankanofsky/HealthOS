"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { authClient } from "@/lib/auth-client";

type Mode = "login" | "register";

// Anmelden/Registrieren auf /account. `allowSignUp` kommt vom Server:
// true nur solange noch kein Konto existiert (Single-User-App — die
// Daten sind nicht pro Nutzer getrennt, siehe Hook in lib/auth.ts).
export function AuthCard({ allowSignUp }: { allowSignUp: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(allowSignUp ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result =
      mode === "register"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(translateAuthError(result.error.code, result.error.message));
      setPending(false);
      return;
    }

    // Eingeloggt (Registrierung meldet automatisch an) → zur Übersicht.
    router.push("/");
    router.refresh();
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-border/60 bg-card p-6">
      {allowSignUp && (
        <div className="mb-6 flex justify-center">
          <SegmentedControl
            options={[
              { value: "register", label: "Registrieren" },
              { value: "login", label: "Anmelden" },
            ]}
            value={mode}
            onChange={(value) => {
              setMode(value);
              setError(null);
            }}
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "register" && (
          <div className="space-y-1.5">
            <Label htmlFor="auth-name">Name</Label>
            <Input
              id="auth-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="auth-email">E-Mail</Label>
          <Input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="auth-password">Passwort</Label>
          <Input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
          {mode === "register" && (
            <p className="text-xs text-muted-foreground">
              Mindestens 8 Zeichen.
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending
            ? "Bitte warten …"
            : mode === "register"
              ? "Konto erstellen"
              : "Anmelden"}
        </Button>
      </form>

      {!allowSignUp && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Registrierung ist deaktiviert — es existiert bereits ein Konto.
        </p>
      )}
    </div>
  );
}

// Better-Auth-Fehler kommen auf Englisch — die häufigen übersetzen wir,
// alles andere zeigt die Original-Message (z.B. unsere deutsche
// Registrierungs-Sperre aus lib/auth.ts).
function translateAuthError(code: string | undefined, message: string | undefined) {
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-Mail oder Passwort ist falsch.";
    case "USER_ALREADY_EXISTS":
      return "Für diese E-Mail existiert bereits ein Konto.";
    case "PASSWORD_TOO_SHORT":
      return "Das Passwort ist zu kurz (mindestens 8 Zeichen).";
    case "PASSWORD_TOO_LONG":
      return "Das Passwort ist zu lang.";
    case "INVALID_EMAIL":
      return "Bitte eine gültige E-Mail-Adresse eingeben.";
    default:
      return message ?? "Etwas ist schiefgelaufen — bitte erneut versuchen.";
  }
}
