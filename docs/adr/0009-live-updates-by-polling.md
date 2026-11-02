# 0009. Live updates by cheap, in-place polling

- **Status:** accepted
- **Date:** 2026-11-01

## Context

The earlier leaning was "refresh the page to see changes". The goal now is that other people's answers
appear on their own, without reloading the page and without the viewer noticing anything except the
grid updating. This must stay cheap: Cloudflare Workers and D1 free tiers, no Durable Objects.

## Decision

- The event carries a **version** (a counter or `updated_at`) that changes on every write to the event
  or any of its responses.
- While the tab is **visible**, the page polls every **15 seconds**, sending the version it already has
  explicitly (header or `?v=`; this is not browser HTTP caching, since responses are `no-store`).
  If nothing changed, the Worker answers `304 Not Modified` after reading one row. If something changed,
  it returns the full event and its responses, and the page swaps them into state. **No page reload.**
- Polling **pauses when the tab is hidden** (`visibilitychange`) and runs immediately when it becomes
  visible again. After about 10 minutes without user input it backs off to 60 seconds.
- The page also refetches right after the viewer saves.
- **Incoming data never overwrites the response you are editing.** Only other people's responses are
  replaced; your unsaved painting stays as it is.
- Reads use `Cache-Control: no-store`. D1 read replication stays off, so a read after a write always
  sees the write.

## Alternatives considered

- **Refresh only.** Zero cost, but people leave tabs open and make decisions on stale heatmaps.
- **Durable Objects with WebSockets.** True real time, more moving parts. Not needed at this scale; can
  supersede this ADR later. The SQL stays nearly the same if events move into a Durable Object.

## Consequences

- Rough cost: 10 people with the tab visible for an hour is about 2,400 requests, most of them one-row
  `304`s. Well inside free-tier limits for the team's usage.
- Changes from others appear within about 15 seconds, which is enough for scheduling.
- The client needs a merge step (others' responses replaced, own draft kept). Tests must cover it.
