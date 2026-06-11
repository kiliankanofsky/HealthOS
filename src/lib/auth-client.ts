"use client";

import { createAuthClient } from "better-auth/react";

// Client-Seite von Better Auth (Hooks + Sign-in/up/out-Methoden).
// Kein baseURL nötig — Auth-Server läuft same-origin unter /api/auth.
export const authClient = createAuthClient();
