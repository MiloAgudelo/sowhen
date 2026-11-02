# 0001. Event time model: creator's dates and daily window, stored as UTC slots

- **Status:** accepted
- **Date:** 2026-11-01

## Context

sowhen exists because when2meet handles time zones badly. The first users are spread across
Europe (Poland), the Americas and possibly Asia, and every viewer must see the grid in their own
time zone. The model must say what the creator defines, what is stored, and what each viewer sees.

## Decision

- The **creator** picks:
  - a **creator zone**: an IANA time zone, defaulted from the browser (e.g. `Europe/Warsaw`);
  - a set of **event dates**: specific calendar dates in the creator zone. They need not be
    consecutive (Mon, Wed, Fri is fine), so the picker selects individual dates, not only a range;
  - a **daily window**: a start and end time in the creator zone, applied to every event date.
    Any window is allowed, up to the full 24 hours. A window may **cross the creator's midnight**
    (e.g. 20:00–02:00): it then runs into the next day, and those slots belong to the date on which
    the window started.
- The window is cut into **slots** of a fixed **30 minutes**.
- Each slot is stored and transmitted as a **UTC instant** (its start). The server never converts
  time zones; the browser converts slots into the **viewer zone** for display.
- The slot list is derived from (dates, window, creator zone) once, when the event is created, using
  the creator zone's real offsets on each date. Daylight-saving changes inside the event are therefore
  handled at creation time, not guessed at display time.

## Alternatives considered

- **Respondents extend the window themselves.** More flexible, but the grid would stop being the same
  for everyone and the heatmap would mix slots some people were never offered. A wide or 24-hour
  window covers the same need while keeping one shared grid.
- **15-minute slots.** Double the taps on mobile for little gain. 60-minute slots can't represent
  half-hour meetings. 30 minutes also lines up exactly with UTC+5:30 (India). UTC+5:45 (Nepal)
  viewers see rows at :15/:45, which is accepted.
- **Store local times plus a zone and convert on read.** Moves DST logic to every reader and makes
  the heatmap depend on conversion code agreeing everywhere. UTC instants make overlap a set
  intersection.

## Consequences

- The creator's window caps what others can offer. The create form must make that clear and make a
  wide or 24-hour window easy to pick.
- A 24-hour window is 48 rows per day. The grid UI has to stay usable at that size, especially on
  mobile: e.g. scroll to the viewer's morning on load, and let viewers collapse their night hours.
  This is a design requirement, not optional polish.
- **A DST day in the creator zone changes the window's length.** On 2027-03-28 a Warsaw day has 23
  hours: a 24-hour window gives 46 slots, not 48, and a 01:00–04:00 window gives 4, not 6. On
  2027-10-31 it's the reverse. The generated slot list is the truth: the grid must never invent or drop
  slots to stay rectangular. How a shorter or longer column is drawn (gap, placeholder cells) is left to
  the grid design.
- Slot size is fixed at 30 minutes in v1. If it ever becomes configurable, it must be stored on the event.
