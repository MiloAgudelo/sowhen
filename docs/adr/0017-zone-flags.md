# 0017. Country flags next to time zones

- **Status:** accepted
- **Date:** 2026-11-02

## Context

The team is spread over many countries. A flag next to each time zone makes the picker faster to scan
than city names alone ("Bogotá", "Warsaw"), and lets people search by country ("Colombia").

## Decision

- **Zone → country** comes from tzdb's `zone.tab`, turned into `src/lib/zone-countries.ts` by
  `scripts/flags.mjs`. Zones are canonicalised first (ADR 0016). UTC and `Etc/*` have no country and
  show a globe.
- **Images, not emoji.** Windows has no flag emoji (it shows two letters). Flags come from
  `flag-icons` (MIT). Some of its SVGs are over 100 kB (coats of arms), so the script renders each one
  to a 40×30 WebP (~1 kB, 224 kB for all 247) in `public/flags/`. They load only when shown, and the
  JavaScript bundle doesn't grow.
- **Where:** the picker's trigger, every row of the list, and the "Times in …" control on the event
  page. The flag is decorative (`alt=""`); the city name and offset stay the accessible text.
- **Search** also matches the English country name (`Intl.DisplayNames`).
- `/flags/*` is served by the asset server directly. `hero` and `flags` become reserved slugs, so that
  `/<slug>/admin` can never fall under a static folder.

## Consequences

- A flag is a country, not a time zone: one country can span several zones (the US, Brazil, Russia), and
  the flag doesn't tell them apart; the city and offset do.
- Re-run `node scripts/flags.mjs` when tzdb adds or moves a zone.
