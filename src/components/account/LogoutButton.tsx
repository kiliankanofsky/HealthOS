"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await authClient.signOut();
    // refresh() reicht nicht: /account rendert je nach Session anders.
    router.push("/account");
    router.refresh();
  }

  return (
    <Button variant="destructive" onClick={handleLogout} disabled={pending}>
      <LogOut data-icon="inline-start" />
      {pending ? "Wird abgemeldet …" : "Abmelden"}
    </Button>
  );
}
