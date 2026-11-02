# 0005. Responses are keyed by name; typing a name lets you edit that response

- **Status:** accepted
- **Date:** 2026-11-01

## Context

There are no accounts. A response must be editable later, possibly from another device. The options
were: (a) the name is the key, and typing an existing name lets you overwrite that response, as in
when2meet; (b) a secret token is the key, with a personal edit link for other devices; (c) an
optional password per response.

The audience is a small, trusting team. Losing access to your own response (new phone, cleared
browser, private tab) is a more likely problem than someone maliciously editing another person's.

## Decision

- A response is identified by **(event, name)**. One response per name per event.
- Entering a name that already exists **opens that response for editing**. Saving overwrites it.
- Names are compared **normalised**: trimmed, inner whitespace collapsed, case-insensitive (Unicode
  case folding), so "anna " and "Anna" are the same person. The name as first typed is what's shown.
- The browser remembers the name you used for each event (localStorage) only so it can pre-fill it.
  It is a convenience, not a credential. There is no response token.
- Anyone who can edit a response can delete it.

## Alternatives considered

- **Token as identity + personal edit link.** Protects against impersonation, but adds a link people
  must keep, and a dead end when they don't.
- **Optional password.** Friction for little gain in a trusting team.

## Consequences

- Anyone with the event link can change or delete anyone's response. Acceptable for the intended
  audience; revisit (and supersede this ADR) if sowhen is used by open, untrusted groups.
- Two different people with the same name must tell themselves apart ("Anna K", "Anna M"). The name
  field should show when a typed name matches an existing response ("You're editing Anna's response"),
  so nobody overwrites a namesake by accident.
- Two people saving the same name at the same moment: last write wins. Acceptable.
- No secret is stored per response, which keeps the data model GDPR-minimal.
