# Notes for coding agents

## This is NOT the Next.js you know

This project runs Next.js 16. That version has breaking changes — APIs,
conventions and file structure may all differ from your training data. Read the
relevant guide in `node_modules/next/dist/docs/` before writing any Next code.
Heed deprecation notices.

Two things that trip up agents specifically:

- The request-level auth gate is `src/proxy.ts`, not `middleware.ts`.
- `"use server"` files may only export async functions. Route segment config
  such as `maxDuration` belongs on the `page.tsx`, not in the actions file.

## Read CONTEXT.md first

`CONTEXT.md` is the architecture reference: file index, function inventory,
data model, and a "known quirks" section that will save you from re-discovering
the same three bugs. Keep it current when you restructure something.

## Rules that matter more than they look

**Always query through `getDb()`, never the exported `db`.** The public demo
mode swaps the entire database connection per request. A single query that
imports `db` directly would serve real health data to anonymous visitors. Only
`src/lib/auth.ts` and the migration runner are allowed to use `db`.

**All database access lives in `src/lib/db/queries.ts`.** Pages and components
call those functions; they do not build queries themselves.

**Never edit an existing migration in `drizzle/`.** Drizzle stores a hash in
`meta/_journal.json`. Generate a new one with `npm run db:generate`.

**Never commit real health data** — not in fixtures, not in tests, not in
screenshots. Sample data comes from `src/lib/demo/dataset.ts`, which is a pure
deterministic generator.

## Before you claim to be done

```bash
npm run typecheck
npm run build
npm run lint
```

`npm run build` is mandatory. Next's build type-checks more strictly than
`tsc --noEmit` and has caught errors in `scripts/` that the standalone
typecheck skipped entirely — that failure reached production once already.
