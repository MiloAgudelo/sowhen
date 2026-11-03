# 0018. A preview image per event, drawn in the creator's browser

- **Status:** accepted
- **Date:** 2026-11-02
- Amends ADR 0015 ("a generated image per event" was a rejected alternative there).

## Context

Link previews (ADR 0015) already carry each event's title, dates and answer count as text, but every
event showed the same static image. An image with the event's own title and dates makes shared
links easier to tell apart in Slack and WhatsApp.

Drawing a 1200×630 image with the photo on the server (Satori + resvg) takes far more than the
~10 ms of CPU per request that the free Workers plan allows. Camilo chose not to upgrade to Workers
Paid for this.

## Decision

- **The browser draws it.** `src/lib/og-image.ts` draws the image on a canvas: the hero photo under
  the red overlay, the wordmark, the event title (as large as fits in three lines), the dates in the
  creator's zone, the footer and the photo credit. It's a JPEG, ~80–200 kB. The text comes from the
  same `formatDates` as the preview description (`src/shared/preview.ts`). **No names.**
- **Only the admin uploads it.** `PUT /api/events/:slug/og-image` needs the admin secret. The Worker
  checks it's a real JPEG of exactly 1200×630 (reads the SOF marker; HTML or SVG can't pass), at most
  450 kB, and that the `X-Sowhen-Drawn-For` header matches the event's current title and dates.
- **When:** right after creating the event, and whenever the admin page is open and the stored image
  is missing or stale (so events made before this ADR get one the first time their admin opens the
  admin page, and a rename or date change redraws it).
- **Never stale.** The `og_images` row records the title and dates it shows. The event page uses it
  only while they still match; otherwise previews fall back to the static image until it's redrawn.
- **Serving:** `og:image` is `/api/events/:slug/og-image?k=<upload time>`, cached for a day (the
  key changes on every upload). The image is deleted with the event, by the admin's delete, by the
  expiry sweep, and when an expired slug is reused (ADR 0008).

## Consequences

- The image doesn't show the live answer count (the browser can't redraw it on every answer without
  letting anyone upload images). The count stays in the preview text.
- If the creator's browser fails to draw or upload (old browser, offline), the event keeps the static
  image; nothing else breaks.
- Chat apps cache unfurls: an edited event may keep its old preview in a chat until the app refreshes.
