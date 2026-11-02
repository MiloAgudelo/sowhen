# 0010. Vite + React + TypeScript + shadcn/ui, served by one Worker

- **Status:** accepted
- **Date:** 2026-11-01

## Context

The app has two main screens (create event, event grid) plus an admin view. The hard part is a custom
drag-to-paint grid with two brushes, touch support and local-time labels.

## Decision

- **Vite + React + TypeScript** for the frontend. It's the stack already used in Pilas.
- **shadcn/ui** (with Tailwind) for all standard UI (buttons, inputs, dialogs, popovers, date picker,
  time-zone picker, toasts), so components look and behave consistently. The **grid is custom**: no
  component library covers paint-to-select over time slots.
- **One Cloudflare Worker** serves the static assets, the JSON API under `/api/`, and the HTML for
  `/<slug>`. Serving that HTML from the Worker keeps the door open to injecting Open Graph tags for
  Slack previews later without changing the architecture.
- **Time-zone maths:** the `Intl` API plus a **Temporal polyfill**. As of March 2026 Safari had no
  confirmed release date for Temporal (secondary source; to re-check when implementing), so the
  polyfill ships until Safari supports it natively.
- Deployed with the `cf` CLI on the MiloAgudelo Cloudflare account.

## Alternatives considered

- **Preact.** Lighter, but the gain is small for an app this size and React matches existing experience.
- **A meta-framework (Next/vinext, Remix).** More than two screens need. SSR isn't required: the Worker
  can inject the few tags that matter.

## Consequences

- shadcn components are copied into the repo and themed with the WSJ 2027 palette (ADR 0011).
- The polyfill adds bundle weight; check its size and lazy-load if needed.
