# 0002. Specific dates first; recurring weekly polls later

- **Status:** accepted
- **Date:** 2026-11-01

## Context

Two kinds of poll are useful: picking a time for a **one-off meeting** on specific dates, and picking
a **recurring weekly slot** ("which weekday and hour works for our weekly call?"). The first real use
for the Jamboree comms team is one-off meetings.

Weekday polls are hard across time zones. In 2027 the US switches to summer time on Mar 14 and the EU
on Mar 28, while Colombia, Mexico and most of Asia don't switch. "Monday 15:00 Warsaw" is 09:00 in
Bogotá in winter and 08:00 in summer, so a weekday has no single correct conversion without a
reference week.

## Decision

v1 supports **specific dates only**.

A recurring mode is a wanted second option, not a rejected idea. The event record carries a `kind`
field (`dates` for now) so a recurring kind can be added without migrating existing events. If it is
built, it is modelled as a "typical week" anchored to the creator zone and a reference week, with a
visible note that local times can shift by an hour around daylight-saving changes.

## Consequences

- For a weekly meeting in v1, people poll a representative week.
- Recurring mode needs its own ADR once its v1-or-later status is settled.
