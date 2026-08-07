# Security

## Reporting a vulnerability

Please report security issues privately through GitHub's
[security advisory form](https://github.com/kiliankanofsky/HealthOS/security/advisories/new)
rather than a public issue. I usually respond within a week.

This is a personal project maintained in spare time — there is no SLA and no
bug bounty. That said, anything that could expose someone's health data is
taken seriously.

## Threat model you should know about before self-hosting

HealthOS was built for exactly one person. That assumption is baked into the
design, and it has consequences:

**Health data is not partitioned by user.** There is no `userId` column on the
weight, nutrition, training or metrics tables. Anyone who can sign in sees
everything. To prevent this from becoming a footgun, registration closes
permanently after the first account is created (`databaseHooks.user.create.before`
in `src/lib/auth.ts`). Do not "just add another user" — add row-level ownership
first.

**Everything behind the sign-in page is protected by a single proxy.**
`src/proxy.ts` validates the session on every request and redirects to
`/account` otherwise. Exempt: `/account`, `/api/*` and static files. The cron
endpoint `/api/cron/sync` authenticates itself with a bearer token
(`CRON_SECRET`); if that variable is unset, the endpoint rejects everything.

**The public demo mode is a separate database, not a filter.** With the demo
cookie set, `getDb()` (`src/lib/db/index.ts`) returns a connection to an
entirely different database containing generated sample data. Real data is
never queried, filtered or redacted — it is simply not reachable on that
connection. If `TURSO_DEMO_DATABASE_URL` is unset in a hosted deployment, the
demo mode is off altogether and the cookie is ignored by the proxy.

**Third-party credentials live in environment variables.** Garmin username and
password, the FDDB session cookie, and API keys are read from the environment
and never written to disk. Garmin OAuth tokens are cached in the `garmin_tokens`
table of your own database.

## What this project does not do

- No telemetry, analytics, or third-party tracking of any kind.
- No outbound requests except to the services you explicitly configure
  (Google Sheets, Garmin Connect, fddb.info, Anthropic/OpenRouter).
- No data leaves your database unless you enable the AI features, which send a
  summarised German-language context block to the model provider.

## Cost exposure if you expose the demo publicly

The AI features spend money on your API key. In demo mode they share a global
hourly budget (`DEMO_AI_CALLS_PER_HOUR` in `src/lib/demo/ai-budget.ts`,
default 40) so an anonymous visitor cannot drain your account. This is a
safety net, not a substitute for a spend limit configured with your API
provider.
