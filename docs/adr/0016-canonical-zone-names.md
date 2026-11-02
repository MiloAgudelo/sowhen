# 0016. Store and show canonical time-zone names

- **Status:** accepted
- **Date:** 2026-11-02

## Context

Browsers disagree on time-zone names. Chromium reports old IANA aliases such as `Asia/Katmandu`,
`Asia/Calcutta`, `Europe/Kiev` and `Asia/Saigon`; Firefox and Safari report `Asia/Kathmandu`,
`Asia/Kolkata`, `Europe/Kyiv`, `Asia/Ho_Chi_Minh`. Aliases are valid and compute the same times, but
an event created in Chromium stored `Asia/Katmandu`, and search and display had to special-case it.

## Decision

- One function in `src/domain`, `canonicalZone(zone)`, maps known aliases to their current IANA name
  and leaves everything else unchanged. Its alias table lives in the domain, and `src/lib/zones.ts`
  uses it instead of its own map.
- The browser canonicalises the creator zone and the viewer zone as soon as it reads them.
- The Worker canonicalises `creatorZone` on create (after validating it), so stored events always use
  the current name, whatever browser created them.
- Existing events are not migrated: aliases still compute correctly, and every display path goes
  through `canonicalZone`.

## Consequences

- The alias table must be kept up to date when IANA renames a zone (rare; a unit test lists the
  covered aliases).
