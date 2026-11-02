# 0014. v1 scope

- **Status:** accepted
- **Date:** 2026-11-01

## In v1

- **Create an event:** title, slug (ADR 0004), creator zone, specific dates (non-consecutive allowed),
  daily window up to 24 h and crossing midnight (ADR 0001), meeting duration (ADR 0006).
- **Admin link** to edit or delete the event and delete responses (ADR 0007).
- **Respond:** name (overwrite by name, ADR 0005), paint with two brushes (available, if needed) plus
  erase, by touch and mouse.
- **Results:** shared grid with local labels and a visible viewer-zone picker (ADR 0003), heatmap, slot
  detail, best-times list (ADR 0006).
- **Live updates** by polling (ADR 0009).
- **Expiry** cron after 30 days and the generic expired page (ADR 0008).
- **Privacy notice:** what is stored (names, slots), who can see it (anyone with the link), how long (30
  days), where (EU).
- **Visual identity:** WSJ 2027 palette, no logos, one photo on the home page with photographer credit,
  "not official" footer (ADR 0011).
- **Tests:** unit tests for the time logic and the Playwright suite (ADR 0012).

## Later

- Recurring weekly mode (ADR 0002).
- ~~Open Graph previews for Slack.~~ Brought into scope by ADR 0015.
- Spanish and Polish UI.
- Durable Objects live updates.
