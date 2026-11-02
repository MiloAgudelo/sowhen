# 0011. Look like the WSJ 2027 brand, without its logos

- **Status:** accepted
- **Date:** 2026-11-01

## Context

The first users are the WSJ 2027 communications team. sowhen should feel at home next to Jamboree
materials, but it is not an official Jamboree product and must not use the Jamboree or WOSM logos.

Source: WOSM brand site, Events → World Scout Jamboree → 26th World Scout Jamboree - Poland 2027
(`brand.scout.org/document/56`), read 2026-11-01. It links to the host's knowledge base
(`knowledge.wsj2027.pl`, HOC space) for colours, typography and logos.

## Decision

**Colours.** The WSJ 2027 palette:

| Name | Hex | RGB |
|---|---|---|
| Red | `#D6303C` | 214, 48, 60 |
| Violet | `#5D2F88` | 93, 47, 136 |
| Green | `#87A428` | 135, 164, 40 |
| Blue | `#36A1C3` | 54, 161, 195 |
| Orange | `#EF7D00` | 239, 125, 0 |
| Pink | `#E58795` | 229, 135, 149 |

- **Red** is sowhen's primary colour (amended 2026-11-02; it was violet). This is a design choice, not a ranking taken from the guide.
- The **heatmap** uses a single-hue ramp of the primary colour, so it reads by lightness and works for colour-blind
  viewers. "If needed" is shown lighter or hatched, never by hue alone.
- The other colours are decoration only (patterns, accents, illustrations), as the brand guide intends.
  All text and UI states must meet WCAG AA contrast; several palette colours (green, orange, pink, blue)
  fail as text on white and are not used for text.

**No logos.** Neither the WSJ 2027 logo nor the World Scout emblem appear anywhere. The guide says
"Never reproduce or adapt the 26th World Scout Jamboree's logo"; sowhen doesn't.

**Typography.** The brand's typefaces are Galano Grotesque / Galano Grotesque Alt (Fontfabric, a
commercial licence) and Bravely Script (made for the event). There is no Galano webfont licence, so
sowhen uses a **free (OFL) geometric sans with a similar feel, self-hosted**. The exact face is picked
during design.

**Imagery.** At most one photo, on the home/create page, never on the event grid (the grid needs the
space, and a photo there slows mobile). Candidate source: the WOSM Photo Library
(`brand.scout.org/document/82`), which carries a legal notice to comply with. No WSJ 2027 photos exist
yet (the event is in 2027); a photo from a previous World Scout Jamboree stands in. The photographer is
credited on the page; Camilo supplies the credit format.

Decorative patrol-sign or brushstroke shapes in the palette colours may be used as background accents,
drawn for sowhen rather than copied from Jamboree artwork.

## Consequences

- shadcn/ui theme tokens are set from this palette (ADR 0010).
- The footer says "Not an official World Scout Jamboree tool" to avoid implying endorsement.

## Photo chosen (2026-11-02)

`LM_KISCSummer_InternationalEvening_20260719-15` from the WOSM Photo Library: Scouts seen from behind,
arms over each other's shoulders, facing national flags and the Alps at Kandersteg International Scout
Centre (no faces, many flags). The library's legal notice allows non-commercial use with credit. The
credit shown is the asset's own copyright notice: **© Kandersteg International Scout Centre / Leonor Moura**
(`src/lib/hero.ts`).

## Amendment (2026-11-02): red instead of violet

Camilo asked for red, the colour people associate with the Jamboree. The primary colour is now brand
red `#D6303C` (white text on it is 4.8:1, AA), with a single-hue red ramp for tints, the home-page
overlay, the heatmap and the link-preview image. Neutrals moved from a violet tint to a warm one.
Destructive actions use a darker crimson (`#9B1824`) so a delete button doesn't look like a primary
one; they are also labelled and confirmed. Violet stays in the palette as decoration only.
