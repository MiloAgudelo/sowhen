# sowhen — context

A small, no-account group scheduling tool at **sowhen.uk**. People open a link, type a name, paint
the times they're free, and see where everyone overlaps — each person in their own time zone.

## Purpose

Built first for the World Scout Jamboree 2027 communications team: international, works in English,
spread across Europe (incl. Poland), the Americas and possibly Asia. when2meet is the baseline; it
handles time zones badly, looks dated and is weak on mobile. sowhen's core promise is that **every
viewer sees the grid in their own time zone**.

## Constraints (given, not up for debate)

- English UI first. Docs in English.
- No accounts, no email addresses.
- Hosted on Cloudflare, on the personal MiloAgudelo account (the one that owns `sowhen.uk`), not Forjel.
- Cloudflare is managed with the `cf` CLI, never `wrangler`.
- GDPR-minimal: store only what scheduling needs.
- D1 can be pinned to the EU: `cf d1 create --jurisdiction eu` (verified 2026-11-01; choices are `eu`, `fedramp`, `us`).

## Glossary

_Terms are added here as they are resolved. Use them consistently in code, UI copy and docs._

| Term | Meaning |
|---|---|
| **Event** | One scheduling poll, reached by one link. |
| **Creator** | The person who made the event. |
| **Creator zone** | The IANA time zone the creator defined the event in (e.g. `Europe/Warsaw`). |
| **Viewer zone** | The time zone a person sees the grid in. Defaults to their browser's zone. |
| **Event dates** | The specific calendar dates (in the creator zone) the event covers. |
| **Daily window** | The start and end time, in the creator zone, applied to every event date. Up to 24 hours. |
| **Slot** | A 30-minute block, identified by its UTC start instant. The unit of availability. |
| **Grid** | Event dates as columns, slots as rows. The same shape for every viewer. |
| **Next-day marker** | The "+1" on a row label whose viewer-local time has crossed midnight relative to the column's date. |
| **Slug** | The creator-chosen, unique path of an event (`sowhen.uk/<slug>`). |
| **Response** | One person's availability for one event, identified by their normalised name. |
| **Availability** | The state of a slot in a response: **available**, **if needed**, or **unavailable** (default). |
| **Heatmap** | The grid shaded by how many people are available (if needed counts less). |
| **Best times** | The ranked list of slot ranges with the most availability. |
| **Kind** | Whether an event is on specific dates (`dates`, v1) or a recurring week (future). |
| **Meeting duration** | How long the meeting will be (30 min–2 h, default 1 h). Filters best times. |
| **Admin link** | The private link (`/<slug>/admin#<secret>`) that lets the creator edit or delete the event. |
| **Version** | A value on the event that changes on every write; polling compares it to skip unchanged data. |

## Leaning, not yet decided

Carried over from an earlier conversation. Each becomes an ADR only after it has been challenged and confirmed.

- ~~No accounts: link + name, edit token in localStorage.~~ Settled by ADR 0005: no response token; name is the key.
- ~~Cloudflare Worker + D1 in the `eu` jurisdiction.~~ ADR 0013 (refresh-only replaced by polling, ADR 0009).
- ~~Times stored in UTC, converted in the browser.~~ ADR 0001. ~~One row per person per event.~~ ADR 0005. ~~Heatmap computed in the browser.~~ ADR 0006.
- ~~Readable slugs (`sowhen.uk/comms-weekly`).~~ Settled by ADR 0004.
- ~~Later: Open Graph tags so links unfurl in Slack.~~ Deferred in ADR 0014.

## Open questions

- [x] Time-zone model: see ADR 0001.
- [x] Specific dates vs days of the week: dates first, recurring later (ADR 0002). Whether recurring makes v1 is a scope question.
- [x] Slot size: 30 minutes (ADR 0001).
- [x] Grid shape: shared grid, local labels (ADR 0003).
- [x] Window crossing the creator's midnight: allowed (ADR 0001).
- [x] Slug policy: creator-chosen, unique (ADR 0004). Anyone with the link sees responses.
- [x] Response identity: name, overwrite allowed (ADR 0005).
- [x] Availability states and best time (ADR 0006).
- [x] Who can edit or delete the event: admin link (ADR 0007).
- [x] Meeting duration: optional, default 1 h (ADR 0006).
- [x] Event lifetime: 30 days after the last date, generic expired page (ADR 0008).
- [x] Live updates: in-place polling (ADR 0009).
- [x] Frontend stack: Vite + React + TS + shadcn/ui, one Worker (ADR 0010).
- [x] Testing: Playwright, all engines, devices and a time-zone matrix (ADR 0012).
- [x] Visual identity (ADR 0011). Still to come from Camilo: the photographer credit format.
- [x] D1 in the `eu` jurisdiction, managed with `cf` (ADR 0013).
- [x] v1 scope (ADR 0014).

## Decisions

See [`docs/adr/`](docs/adr/).
