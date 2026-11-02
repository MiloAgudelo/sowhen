# 0004. Creator-chosen, unique slugs

- **Status:** accepted
- **Date:** 2026-11-01

## Context

Event links should read like a question: `sowhen.uk/comms-weekly`. Options were a creator-chosen
slug, a readable slug with a random suffix (`comms-weekly-k3x9`), or a random-only ID.

## Decision

- The creator chooses the slug. It is **unique across all live events**, first come, first served.
- The create form suggests a slug from the event title and checks availability as the creator types.
  On a clash it proposes an alternative (e.g. `comms-weekly-2`).
- Slugs are lowercase ASCII letters, digits and single hyphens, with length limits. A small reserved
  list (`api`, `new`, `admin`, `assets`, …) protects app routes.
- A slug is freed when its event is deleted.

## Alternatives considered

- **Readable slug + random suffix.** Collision-free and not guessable, but uglier. Left as a possible
  later change; this ADR would be superseded.
- **Random only.** Loses the "reads like a question" quality.

## Consequences

- **Links are guessable.** Anyone who guesses `sowhen.uk/comms-weekly` sees the names and availability
  in it. Accepted for v1: the data is a first name and some free slots. The privacy notice must say
  that anyone with the link can see responses.
- Popular slugs (`team-meeting`) are held until their event expires, which is one more reason to keep
  event lifetime short.
- Slugs are user content in URLs and in the page: they must be validated server-side, not only in the form.
