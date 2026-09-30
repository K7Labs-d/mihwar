# MIHWAR day and night themes

The existing design remains the night theme and the default for new visits. The header toggle switches to a warm off-white day palette on every route, including authentication, role choice, marketplace, account, lessor flows, requests, administration, the wheel and live map.

## Palette and behavior

- Day canvas: `#f5f1e8`, cards: `#fffdf8`, raised surfaces: `#ece6da`
- Primary text: `#282820`, secondary text: `#696659`, text accent: `#855916`
- The original amber `#ffb21a` is retained for primary action fills
- Core text tokens exceed WCAG AA 4.5:1 across day canvas, cards, raised and tinted surfaces. Form edges exceed 3:1 against their input surface
- `mihwar-theme` stores only `light` or `dark` in browser localStorage; it contains no account data and never changes authentication or permissions
- A small head script restores the theme before styles and React render, including the browser theme-color metadata
- OS theme settings do not override the default or the person's explicit choice. Changes in another tab synchronize through storage events
- If storage is blocked, the toggle continues to work for the current page, and a fresh visit defaults to night
- The native toggle works with keyboard Enter/Space, has an Arabic action label and a 44px minimum target. Narrow headers show the icon with the same accessible label
- Theme switching does not remount route content, reset forms or alter wheel/map timelines

All day overrides are opt-in selectors. Night color declarations, API handlers, account logic, SQLite schema, hosting settings and product milestones remain unchanged.

## Verification

Run `npm run check` for TypeScript, automated tests, production build and smoke checks. Theme unit tests cover invalid/missing preferences, pre-paint restoration, blocked storage and metadata.

After building, run `node scripts/verify-theme-browser.mjs` for theme persistence, keyboard operation, cross-tab changes, blocked storage, form preservation, system preferences, navigation, contrast and responsive login screenshots. Set `PLAYWRIGHT_MODULE` to an external Playwright module when needed; set `MIHWAR_BROWSER_PATH` to a Chromium executable or `MIHWAR_CHROMIUM_MODULE` to the existing supported serverless Chromium module. No browser dependency is added to the application.

The broader account/admin workflow can be checked in either palette with `node scripts/verify-phase1-browser.mjs`. Set `MIHWAR_TEST_THEME=light` for day, omit it for night, and set `MIHWAR_BROWSER_ARTIFACTS` to a separate output directory for each run. This uses disposable local SQLite fixtures only.

Run `node scripts/verify-theme-scenes.mjs` to reproduce wheel and live-map desktop/mobile checks and screenshots in both palettes. It intercepts only the local presentation's authentication/visit calls with explicit UI fixtures and never touches production.

Recorded validation: 93 automated tests, TypeScript, build and smoke passed; 33 full-flow browser checks in each palette passed; 14 theme/contrast checks and eight desktop/mobile scene combinations passed with no browser errors. Baseline night login content below the header was pixel-identical to main. Chromium was tested; physical Safari/iOS remains untested.

Visual approval precedes merge or production deployment. A branch or draft PR is not a deployment.
