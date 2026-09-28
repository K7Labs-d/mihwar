# MIHWAR Live Map — interactive presentation layer

## Scope and limits
The existing `/#live-map` route now presents a finite interactive simulation: request pulse, expanding search radius, sequential candidates, drawn connections, then Transaction DNA. Black and champagne gold remain the visual language. This is not the equipment marketplace milestone and does not add Matching, Offers, Booking, Execution, Payment, API endpoints, database changes, or production data. All fixtures and geography are explicitly illustrative; no live market metrics or real equipment positions are claimed.

## Behavior
- `liveMapSimulation.ts` supplies deterministic, isolated fixtures and pure scene/filter functions.
- `useLiveMapTimeline.ts` drives one six-second scene, stops at the end, cancels animation frames on unmount, and respects document visibility and reduced-motion preferences.
- Time Machine supports play, pause, replay and actual state rewind; it is not a cosmetic time label.
- Only type-compatible, available fixture equipment becomes a candidate. A separate unmatched request exercises the empty-result state.
- Lines are rendered only when both endpoints are visible. Operations mode exposes additional unmatched and illustrative execution filters without performing transactions.
- On narrow map containers the detail panel is a compact bottom sheet; on wide containers it is a side panel. Node space is reserved so the collapsed sheet does not block signals.
- The sheet supports drag up/down, keyboard expansion, close, Escape and focus restoration. Expanded details are scrollable.
- SVG positioning applies to explicit geography/network layers only; interface icons retain their own small dimensions.
- The page uses a route-scoped shell modifier; other routes keep their existing navigation and styling.

## Verification
Run `npm run check` for TypeScript, Node tests, production build and smoke verification. The completed run passed all 69 tests, including 10 Live Map regression tests.
The browser verification script exercises stage order, rewind, pause/replay, sheet gestures and keyboard interaction, filters, empty states, icon sizing, and reduced motion. It checks 320px, 390px, 920px and 1440px viewports for overflow and blocked node hit targets. Verified with installed Chrome through Playwright; this does not replace a physical iPhone/Safari test.

## Reproduce browser checks
Start the built application on a dedicated local port with `AUTH_DB_PATH=:memory:`. In another shell set `LIVE_MAP_URL` to that local origin (include the trailing slash), optionally set `LIVE_MAP_ARTIFACTS` to a local output folder, then run `node scripts/verify-live-map-browser.mjs`.
The script loads `playwright` from `PLAYWRIGHT_MODULE` when provided, otherwise from normal module resolution. Keep Playwright in an external tooling directory; no new runtime dependency or lockfile change is required. Chrome is the default browser channel; `BROWSER_CHANNEL` may override it.

## Delivery gate
Review the isolated feature branch and browser evidence before merge. A running localhost preview is not a production deployment. No production deployment or database operation is part of this change.
