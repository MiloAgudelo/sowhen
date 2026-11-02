# 0012. End-to-end tests with Playwright across browsers, devices and time zones

- **Status:** accepted
- **Date:** 2026-11-01

## Context

sowhen's core promise is correct times in every viewer's zone, on any device. Bugs here are silent:
a grid that's off by an hour still looks fine. The team uses desktop and phones, on Chrome, Edge,
Firefox and Safari.

## Decision

Playwright end-to-end tests are part of v1, run once the code exists.

- **Browsers:** Chromium, Firefox, WebKit (Safari's engine).
- **Viewports and devices:** small phone, large phone, tablet, laptop, wide desktop, using Playwright's
  device presets with touch enabled on mobile. Painting must work by touch and by mouse.
- **Time zones:** each test context sets `timezoneId`. Minimum matrix: `Europe/Warsaw`, `Europe/London`,
  `America/Bogota`, `America/New_York`, `America/Mexico_City`, `Asia/Manila`, `Asia/Kolkata` (+5:30),
  `Asia/Kathmandu` (+5:45), `Pacific/Auckland`.
- **Multi-person scenarios:** several browser contexts in different zones answer the same event, and every
  one of them must agree on which slot is best.
- **Date edge cases:** windows crossing midnight; 24-hour windows; events spanning the 2027 DST changes
  (US Mar 14, EU Mar 28, EU Oct 31, US Nov 7).
- **Behaviour:** create, slug clash, answer, overwrite by name, if-needed brush, best-times ranking with
  duration, admin link actions, expired page, polling merge (others' answers arrive while you paint and
  your draft survives).
- Accessibility checks (axe) on the main screens.

Pure logic (slot generation, ranking, name normalisation) also gets fast unit tests, so most of the
time-zone matrix runs without a browser.

## Consequences

- Full matrix (browsers × devices × zones) is large; CI runs a representative slice per push and the
  full matrix before releases.
- Tests need a local Worker + D1 to run against.
