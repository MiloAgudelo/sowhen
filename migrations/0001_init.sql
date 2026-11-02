-- sowhen schema. See src/shared/types.ts and docs/adr.
-- Only names and slots are personal data (ADR 0013, GDPR-minimal).

CREATE TABLE events (
  slug             TEXT PRIMARY KEY,           -- ADR 0004
  title            TEXT NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'dates',
  creator_zone     TEXT NOT NULL,              -- IANA zone
  dates            TEXT NOT NULL,              -- JSON IsoDate[]
  window_start     TEXT NOT NULL,              -- "HH:MM"
  window_end       TEXT NOT NULL,              -- "HH:MM"
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  columns          TEXT NOT NULL,              -- JSON Column[] (generated at create/patch)
  admin_hash       TEXT NOT NULL,              -- SHA-256 hex of the admin secret (ADR 0007)
  version          INTEGER NOT NULL DEFAULT 1, -- ADR 0009
  created_at       TEXT NOT NULL,
  expires_at       TEXT NOT NULL               -- ADR 0008
);

CREATE INDEX events_expires_at ON events (expires_at);

CREATE TABLE responses (
  event_slug  TEXT NOT NULL REFERENCES events (slug) ON DELETE CASCADE,
  name_key    TEXT NOT NULL,                   -- normalised name (ADR 0005)
  name        TEXT NOT NULL,                   -- display name
  available   TEXT NOT NULL DEFAULT '[]',      -- JSON SlotId[]
  if_needed   TEXT NOT NULL DEFAULT '[]',      -- JSON SlotId[]
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (event_slug, name_key)
);
