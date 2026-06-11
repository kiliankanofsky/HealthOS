import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// Alle Better-Auth-Endpunkte (Sign-in, Sign-up, Sign-out, Session, …)
// unter /api/auth/*.
export const { GET, POST } = toNextJsHandler(auth.handler);
