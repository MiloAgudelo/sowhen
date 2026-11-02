# 0008. Events are deleted 30 days after their last date

- **Status:** accepted
- **Date:** 2026-11-01

## Context

GDPR-minimal storage means not keeping names and availability longer than they're useful. Creator-chosen
slugs (ADR 0004) also stay taken while their event exists.

## Decision

- A daily **Cron Trigger** on the Worker hard-deletes every event whose last slot ended more than
  **30 days** ago, together with all its responses.
- Nothing is kept after deletion: no tombstone. The slug becomes free.
- An unknown or expired slug shows one generic page: "This event doesn't exist or has expired", with a
  button to create a new one. It does not say which of the two happened.

## Alternatives considered

- **7 days.** Too short for "who was at that meeting?" follow-ups.
- **90 days.** Holds personal data and popular slugs longer for little benefit.
- **Tombstone (slug + deletion date)** to show "This event ended on Nov 14". Nicer, but it keeps a record
  and blocks the slug for no real gain.

## Consequences

- Old links in Slack history lead to the generic page after expiry. That is expected behaviour.
- The privacy notice states the 30-day rule.
- If an event's dates are edited (ADR 0007), its expiry moves with its new last date.
