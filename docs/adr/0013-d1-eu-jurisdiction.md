# 0013. One D1 database in the EU jurisdiction, managed with `cf`

- **Status:** accepted
- **Date:** 2026-11-01

## Context

The data is tiny (events and responses) and has no cross-event queries. The team is partly in the EU and
GDPR applies. Everything lives on the MiloAgudelo Cloudflare account, managed with the `cf` CLI.

## Decision

- One **D1** database, created with `cf d1 create --jurisdiction eu`, so it runs and stores data only
  in the EU. Read replication stays **off** (ADR 0009 relies on read-after-write).
- Schema changes are numbered SQL migrations applied with `cf d1 migrations apply`.
- The project uses `cf`'s own setup (`cloudflare.config.ts` + `@cloudflare/vite-plugin`): `cf dev`
  locally, `cf deploy` to ship. No `wrangler` CLI and no `wrangler.jsonc`.

## Alternatives considered

- **A Durable Object per event** (embedded SQLite, WebSockets). Better for live updates, more code.
  Remains the upgrade path; the SQL would carry over.
- **Convex.** Built-in real-time, but an extra service outside Cloudflare and outside the EU pin.

## Consequences

- Every read and write from the Americas or Asia makes a round trip to the EU (roughly 100–150 ms extra).
  With 15-second polling nobody notices.
- Free-tier limits are far above the expected use.
