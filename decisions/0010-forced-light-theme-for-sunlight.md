# 0010 — Forced light theme for sunlight

**Status:** accepted · 2026-09-21

## Context

Data entry happens outdoors in bright sun, usually wearing sunglasses. This was
stated as a top-tier requirement, not a polish item.

## Decision

Force a light theme (`color-scheme: light`, no dark mode), near-black on near-white,
font weights 600–800, tabular numerals, tap targets ≥ 64 px, and **no colour-only
signalling** — sync state is text plus shape (`✓ Saved` / `⟳ 2 pending`).

## Consequences

- Dark mode is *worse* outdoors, which is counter-intuitive: in direct sun the
  screen competes with ambient light, and a bright background at full brightness
  gives the largest luminance difference. Dark mode washes out to grey.
- Tinted lenses (especially amber and brown) shift hues badly, so a green/amber
  status dot would be unreadable. Text and shape survive.
- 64 px targets are well past the usual 48 px guidance because taps happen with sun
  in your eyes, between loads.
- Contrast sits far above the WCAG AAA 7:1 floor, since the real constraint is glare
  rather than the standard.
- **Not fixable in software:** polarised sunglasses can black out an LCD entirely at
  certain angles. That is a hardware interaction.
