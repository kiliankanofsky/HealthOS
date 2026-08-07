# Contributing

Thanks for looking. Set expectations first, so nobody wastes an afternoon:

**This is a personal tool that happens to be public.** It tracks one person's
training and body weight, and design decisions follow from that. I am happy to
receive issues and pull requests, but I make no promise to merge features that
would push the project towards being a product for everyone.

Good contributions: bug fixes, correctness fixes in the analysis code, README
gaps, accessibility, anything that makes a fresh clone work more smoothly.

Please open an issue before starting on something large.

## Setup

```bash
npm install
npm run setup
npm run dev
```

`npm run setup` creates `.env.local`, applies migrations, seeds workout master
data, and builds the demo database. No external accounts needed — click
"Demo mit Beispieldaten starten" on the sign-in page to get a fully populated
app.

Node 20.9 or newer (see `.nvmrc`).

## Before you push

```bash
npm run typecheck
npm run build
npm run lint
```

`npm run build` is not optional: Next's build type-checks more strictly than
`tsc --noEmit` alone and has caught errors that the standalone typecheck
missed.

`npm run lint` currently reports 8 known errors in chart and dialog components
(React Compiler and `setState`-in-effect findings). Those are tracked
separately — please do not let them grow, but you do not need to fix them to
get a PR merged.

## Changing the database schema

```bash
# 1. edit src/lib/db/schema.ts
npm run db:generate     # writes a new file to drizzle/
npm run db:migrate      # applies it to data/health.db
```

Never edit an existing migration in `drizzle/`. Drizzle keeps a hash in
`meta/_journal.json` and a modified migration breaks every existing database.
If a generated migration would drop a column whose data must survive, edit the
generated SQL to copy the data first — `drizzle/0012_*.sql` is the precedent.

Deployments running against Turso need the migration applied manually:

```bash
set -a && source .env.local && set +a && USE_TURSO=1 npm run db:migrate
```

## Conventions

- All database access goes through `src/lib/db/queries.ts`. Do not call
  `db.select()` from a page or component — and use `getDb()`, never the
  exported `db`, or the demo mode will read real data.
- Server Components by default; `"use client"` only where interactivity or
  Recharts requires it.
- Comments and UI strings are German. Documentation aimed at newcomers
  (README, this file, `SECURITY.md`, `.env.example`) is English.
- Commit messages: `type(scope): summary`, imperative, German or English.

## Architecture

`CONTEXT.md` is the full architecture reference — file index, function
inventory, data model, known quirks. It is written in German and kept current
deliberately, both for human contributors and for coding agents working in
this repository. Read it before a non-trivial change.
