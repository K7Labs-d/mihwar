# Size Assistant — Brand & Web Assets

Find your true size in every brand. This repo holds the brand and marketing
assets for **Size Assistant**, a fit-intelligence tool for online fashion.

All pages are **fully self-contained** single HTML files — fonts are embedded
as base64 data URIs, so there are no external requests. Just open any file in a
browser.

## Files

| File | Description |
|------|-------------|
| `site/landing-en.html` | Landing page (English, LTR) — hero with interactive cross-brand size switcher, features, testimonials, pricing, FAQ. Light/dark aware. |
| `site/landing-ar.html` | Landing page (Arabic, RTL) — full Arabic version with embedded Cairo + Amiri fonts. |
| `site/deck-en.html` | Investor pitch deck (English) — 13 slides incl. innovation stack + B2B ROI, keyboard/click navigation, inline SVG charts. |
| `site/deck-ar.html` | Investor pitch deck (Arabic, RTL) — 13 slides. |
| `site/logo.html` | Logo & brand mark showcase — variations, palette, usage rules, and copy-paste SVG. |
| `site/innovation-en.html` | Interactive innovation showcase (English) — live Fit Twin (sliders), fit heat-map, and a B2B returns-savings predictor. |
| `site/innovation-ar.html` | Interactive innovation showcase (Arabic, RTL). |
| `site/fitiq-atelier.html` | **FITIQ — Atelier Sizing System** (Arabic, RTL, dark + gold): an in-store "Store Mode" landing with a live size-recommendation console (brand + fit → size, confidence gauge, per-zone verdicts), stats, testimonials, per-store pricing, and FAQ. |

## Design system

- **Palette:** Rose `#BE185D` · Pink `#EC4899` · Gold `#D97706` · Ink `#241019` · Blush `#FDF2F8`
- **Type (Latin):** Crimson Pro (display) · Outfit (body)
- **Type (Arabic):** Amiri (display) · Cairo (body)
- **Logo:** a clothing tag turned on point with measurement notches cut into it.

## Notes

- Numbers in the pitch decks (market size, traction) are **illustrative placeholders**
  for demonstration — replace them with real figures before any actual use.
- The pages are theme-aware: they follow the viewer's light/dark preference and
  the in-page theme toggle where present.


## Start here

Open [`index.html`](./index.html) for the unified FITIQ gallery linking all eight experiences.
