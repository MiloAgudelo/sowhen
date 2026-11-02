# 0003. Everyone sees the same grid shape; only the labels are local

- **Status:** accepted
- **Date:** 2026-11-01

## Context

A creator's day does not line up with every viewer's day. "Nov 10, 09:00–18:00 Warsaw" is
Nov 10 16:00 to Nov 11 01:00 in Manila. The grid can be laid out by the event's days or by each
viewer's own calendar days.

## Decision

- **Columns are event dates.** Every viewer sees the same rectangular grid: same number of columns,
  same number of rows, same cell for the same slot.
- **The viewer zone is visible and switchable.** The event page always shows which zone the grid is in
  ("Times in Bogotá (UTC−5)") and lets the viewer pick another one. It defaults to the browser's zone, and
  the choice is remembered locally.
- **Labels are local.** Row labels show times in the viewer zone. When a column's slots cross the
  viewer's midnight, the times after it carry a **next-day marker** ("+1"). Column headers show the
  viewer-local date on which that column's first slot falls.
- **Daylight-saving shifts inside an event.** If the offset between viewer zone and creator zone
  changes partway through the event, row labels differ between columns. The grid then labels times per
  column (or per cell) and shows a notice such as "Your local times shift by 1h from Mar 28".

## Alternatives considered

- **Columns are the viewer's calendar days.** Truer to each viewer's calendar, but a 5-day event can
  render as 6 broken columns that differ per viewer, and the shapes stop matching between people.

## Consequences

- "Third column, fifth row" means the same slot for everyone, which helps when the team discusses
  options in Slack or on a call.
- The grid component must support per-column row labels for the DST case, even if it is rare.
- Columns on a DST day in the creator zone can be shorter or longer than the others (see ADR 0001).
- The creator zone's own labels are always available (e.g. a toggle or a tooltip), so people can say
  "15:00 Warsaw time" when they talk about a slot.
