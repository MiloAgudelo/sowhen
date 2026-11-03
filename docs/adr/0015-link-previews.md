# 0015. Link previews (Open Graph) for Slack and chat apps

- **Status:** accepted
- **Date:** 2026-11-02
- Moves "Open Graph previews" from "Later" into scope (amends ADR 0014).

## Context

The team shares event links in Slack, WhatsApp and Teams. A bare URL gives no hint of what it is.
Chat apps read Open Graph / Twitter Card tags from the HTML of the link, without running JavaScript,
so the tags must be in the HTML the server returns. ADR 0010 already routes `/<slug>` through the
Worker for this reason.

## Decision

- The Worker serves the HTML for every page route (`/`, `/privacy`, `/<slug>`, `/<slug>/admin`): it
  reads `index.html` from the assets binding and injects tags with `HTMLRewriter`. Static files
  (`/assets/*`, `/hero/*`, `/og/*`, fonts, favicon) keep going straight to the asset server.
- **Every page:** `og:site_name` "sowhen", `og:type`, `og:url` (canonical `https://sowhen.uk/...`),
  `og:image` + `twitter:card=summary_large_image` pointing at one **static, branded image**
  `/og/sowhen.png` (1200×630, the hero photo under a red overlay with the wordmark and tagline),
  plus `og:image:alt`.
- **Event pages:** `og:title` = the event title; `og:description` = the dates in the creator zone and
  how many people have answered, e.g. "Tue 10 – Fri 14 Nov (Warsaw time) · 4 people have answered ·
  Paint when you're free; everyone sees their own time zone." **No names** in previews: chat apps
  cache unfurls outside our 30-day deletion (ADR 0008).
- **Admin pages:** generic tags only and `noindex`; the secret is in the fragment, which never reaches
  the server anyway.
- **Unknown or expired slugs:** generic tags, same as the home page (never says which, ADR 0008).
- HTML responses carry a short cache (`Cache-Control: public, max-age=60`) so previews stay fresh
  without hitting D1 for every crawler hit; `/api` stays `no-store`.
- Event and admin pages get `robots` `noindex`: event links are meant to be shared,
  not searched.

## Alternatives considered

- **A generated image per event** (title and dates drawn into the PNG). Nicer, but needs an image
  renderer in the Worker (Satori + resvg WebAssembly, a few MB, new dependencies) or a paid service.
  Possible later; this ADR would be amended.
- **Client-side tags only.** Chat crawlers don't run JavaScript, so they'd never see them.

## Consequences

- Every page navigation now runs the Worker (still within free-tier limits; static assets don't).
- Event titles appear in chat previews, cached by the chat app. The privacy notice says so.

## Amendment (2026-11-02)

Events now get their own preview image, drawn by the creator's browser: see ADR 0018. The static
image stays as the fallback and for every other page.
