# 0019 — Linking to the winds app, not embedding or merging it

**Status:** accepted · 2026-09-30

## Context

A sibling app, [winds.skydive-athens.com](https://winds.skydive-athens.com), shows
winds aloft and weather for the same airfield. The crew want it one tap from the
Ground header, without being thrown out into a browser mid-shift.

Both apps declare `scope: "/"` on their own subdomain, so each one's scope is
exactly its own origin and the other is always *out of scope*. That single
manifest field is the whole constraint: it decides which URLs open the installed
app from Android, and which URLs get ejected from inside it.

Three options were considered.

## Decision

**A plain link with `target="_blank"`.** What happens then depends on the device,
and both outcomes are wanted:

| On the phone | Result |
|---|---|
| Winds **installed** | Android opens the **winds app** — its WebAPK claims that scope |
| Winds **not installed** | Chrome opens a **Custom Tab** over Ground, with its own close button |
| Desktop browser | A new tab |

In none of them is Ground replaced, which is the property that matters. It costs
one element and needs no branching.

```tsx
<a class="hdr__wx" href="https://winds.skydive-athens.com/" target="_blank" rel="noopener">
```

The link is in `Header.tsx`, which `App.tsx` renders, so it appears on Today and
Reports without being written twice.

## Consequences and reasoning

- **Ground keeps running underneath.** A Custom Tab is layered, not a navigation,
  so Preact state, the IndexedDB session and any unsent sync queue survive. This
  is the opposite of the CSV link hibernated in
  ADR-0018, which *was* a navigation and
  dropped the user back on Today.
- **`target="_blank"` also covers the uninstalled case.** In a plain browser tab a
  same-tab link would navigate away from Ground entirely; a new context does not.
  `rel="noopener"` keeps the opened page from touching `window.opener`.
- **It does open the installed winds app, where one is installed.** *(Corrected
  2026-09-30 by observation on a real device: this ADR first predicted a Custom
  Tab in every case. That was wrong.)* A WebAPK registers **verified Android
  intent filters for its whole scope**, so `winds.skydive-athens.com/*` already
  resolves to the installed winds app — the hand-off needs no `intent://` URI.
  The Custom Tab is the **fallback**, not the rule: it is what a phone without
  winds installed gets, and what a desktop browser gets. Both outcomes are fine,
  which is why the link needs no branching.
- **A Custom Tab shares Chrome's profile**, so cookies and storage for the winds
  origin are the same ones the installed winds app uses. If winds ever gets the
  same crew password, the session carries over and nobody signs in twice.
- **An `iframe` was rejected.** Both origins are ours, so `frame-ancestors` could
  allow it — but a framed PWA loses its Service Worker, offline behaviour,
  installability and push, all of which are per-origin. It would also be a second
  rendering path to maintain forever, for a worse result than Chrome gives free.
- **Merging onto one origin was rejected.** Cloudflare routes the most specific
  pattern first, so `ground.skydive-athens.com/winds/*` could reach the `sd-winds`
  Worker while keeping two repos — and navigation would then be in-scope and
  seamless. It was rejected because it collapses two installed apps into one:
  one icon, one scope, one name. The separation is deliberate.
- **The winds mark is copied into this repo**, not hot-linked. The header must
  render with no network; a cross-origin image would be a blank square offline.
  `assets/src/winds-logo.png` needs re-copying when that app's branding changes.
- **The label is two fixed lines and can never become three.** `nowrap` on both,
  the arrow positioned outside the flow, and below 350 px the button takes a row
  of its own — measured, not assumed: at 320 px the text is 110 px wide in a
  94 px box without that rule.
- **12 px is below the 15 px floor** [ADR-0010](0010-forced-light-theme-for-sunlight.md)
  sets, and is used only under 380 px so the label fits. It steps up to 13 px the
  moment there is room. A supporting label on a link out is a weaker case than a
  figure the crew read in sunlight, but it is a real exception and is recorded here.
