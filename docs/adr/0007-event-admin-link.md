# 0007. A private admin link controls the event itself

- **Status:** accepted
- **Date:** 2026-11-01

## Context

Responses are open to anyone with the link (ADR 0005). The event itself is different: changing its
dates or window can remove slots people have already painted, and deleting it removes everyone's
answers. One person's mistake should not cost the whole group.

## Decision

- Creating an event generates an **admin secret**. The creator gets an **admin link**,
  `sowhen.uk/<slug>/admin#<secret>`, shown once with a clear "save this link" step. A copy is kept in
  the creator's localStorage so the same browser recognises them.
- The secret sits in the URL **fragment**, so it is never sent in the request line and never appears in
  logs or `Referer` headers. The browser sends it to the API in a header.
- The server stores only a **hash** of the secret.
- Admin actions: edit title, dates, window and duration; delete any response; delete the event.

## Alternatives considered

- **Anyone can edit the event.** Consistent with ADR 0005, but too destructive by accident.
- **The event can't be edited after creation.** Safe, but a typo in the title or a missing date
  means starting over and re-sending the link.

## Consequences

- A lost admin link can't be recovered: there are no accounts and no email. The event still works and
  still expires on schedule (ADR 0008); only admin actions are lost.
- Editing dates or the window must warn when painted slots would be dropped, and say how many people
  are affected.
