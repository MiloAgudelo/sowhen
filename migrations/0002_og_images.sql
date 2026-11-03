-- Per-event link-preview images (ADR 0018). Drawn by the creator's browser, uploaded with the admin
-- secret, served to chat-app crawlers. One row per event; deleted with the event.
-- drawn_title / drawn_dates record what the image shows, so a stale image (the event was edited
-- since) is never served: previews fall back to the static image until it's redrawn.

CREATE TABLE og_images (
  event_slug   TEXT PRIMARY KEY REFERENCES events (slug) ON DELETE CASCADE,
  image        BLOB NOT NULL,                  -- JPEG, 1200×630
  drawn_title  TEXT NOT NULL,
  drawn_dates  TEXT NOT NULL,                  -- events.dates JSON at upload time
  updated_at   TEXT NOT NULL
);
