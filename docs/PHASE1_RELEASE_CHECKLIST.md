# Phase 1 release checklist

## October 2026 Node.js security update

Render's October 23 advisory applies to this application's Node.js build and runtime. The reviewed configuration pins Render and CI to Node.js `24.22.1`; the package engine requires `>=24.22.1 <25`. Dependency versions, application code, migrations, the database path, disk and manual deployment setting are unchanged by this update. References: [Node.js October 21 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases), [Node.js 24.22.1](https://nodejs.org/en/blog/release/v24.22.1), [Render advisory](https://render.com/docs/advisory-emudhra).

The repository does not establish the live service's Node.js version or prove that its disk and backup are healthy. Before approving any merge or deployment:

- In the existing Render service, record the live commit and `node --version` from its Shell (build logs alone do not prove the running process version). Confirm `NODE_VERSION`, any `NODE_OPTIONS` or custom CA settings, `AUTH_DB_PATH` and the actual persistent-disk mount. Render's environment variable takes precedence over repository version files and package engines.
- Confirm the existing SQLite file and its WAL/SHM files are under the mounted disk, with sufficient free space. Do not change the path or create a replacement empty database. The build command only installs dependencies and compiles; the persistent disk is unavailable during build/pre-deploy, while application startup opens SQLite and runs any pending migrations.
- Complete the consistent private SQLite backup and isolated recovery/migration rehearsal below. Record integrity/foreign-key results, migration ledger and before/after counts for accounts, requests, messages and equipment. Test fixtures are not evidence that production has a recoverable backup.
- Compare the live commit with the intended release: even this configuration-only patch could deploy older pending application migrations if production is behind `main`. Do not assume a code-only rollback is compatible with the live schema.
- Leave `autoDeployTrigger: "off"`. A later approved deployment must rebuild with the patched runtime to refresh the native runtime's system CA store; a restart alone is not a rebuild. Expect a brief outage for a disk-backed service. Verify the resulting live Node.js version, commit, health and data persistence before closing the advisory.

## Reviewed implementation

The release extends the existing MIHWAR application; it does not replace it or connect it to Supabase. The application uses the existing Express authentication and SQLite database selected by `AUTH_DB_PATH`.

The September 30 review found and fixed a delegated-administrator UI regression. Request managers now land on `/#admin-requests`; lessor reviewers land on `/#admin-lessors`. Their navigation exposes only permitted workspaces. The owner overview, equipment decisions, users, and audit remain owner-only. Existing server checks remain authoritative. No production privileges have been granted.

Verification: `npm run check` includes 77 passing tests, TypeScript, production builds and HTTP smoke checks. `scripts/verify-phase1-browser.mjs` additionally verifies the existing owner/lessor journeys, 1440/390/320 px layouts, delegated administrator landing pages, owner-page denial and browser Back. It uses a temporary database, never production data.

## Before merging or deploying

1. Authenticate to the **existing** Render service for `K7Labs-d/mihwar`. Verify its current deployment commit, branch, domain, persistent disk, `AUTH_DB_PATH`, and `AUTH_ORIGIN`. `render.yaml` describes manual deployment from `main`, Node 24 and `/var/data/clients.sqlite`, but the actual service must be checked. Do not create a replacement service, disk, or database.
2. Verify a fresh, consistent SQLite backup and its recovery procedure. Use the SQLite backup API (or an equivalent SQLite-aware backup), not a copy of the live `.sqlite` file that omits the WAL. Keep backups private; never commit, publish, or upload them to the repository. Verify `PRAGMA integrity_check` and `PRAGMA foreign_key_check` on the backup. Record its timestamp, schema version and location without exposing records or secrets.
3. Rehearse migration 4 on an isolated private copy with the reviewed application. Verify integrity/foreign keys and preservation of account, request, message and equipment counts. Do not serve that copy publicly or seed test accounts in production.
4. Verify CI for the exact reviewed head, merge only the Phase 1 PR, and deploy that resulting commit through the existing manual Render route. Do not merge unrelated older PRs. No new environment secrets are required for Phase 1.

## Migration and recovery

Migration 4 is additive and executes in a transaction. Existing accounts, requests, equipment and ordinary sessions remain; existing administrator sessions require a fresh administrative login. Existing equipment is deliberately pending review, not automatically approved. Editing an approved item withdraws it from discovery until the current version is approved again.

**Code-only rollback to pre-Phase-1 main is unsafe.** That version rejects a schema ledger containing migration 4. Prefer a reviewed roll-forward fix. If database restoration is necessary, stop writes, preserve the current database for recovery, obtain explicit approval for any loss of post-backup writes, and restore the compatible database together with the matching old application. Do not delete ledger entries, drop tables or remove triggers to force an old application to start. A hosting disk snapshot alone is not evidence of a tested SQLite recovery path.

## Verify the live release

- Render reports the intended commit live; `/api/health` succeeds and the served asset manifest matches the reviewed build
- Anonymous `/#marketplace`, equipment and other platform deep links show the login gate; the marketplace API returns 401
- The existing public domain loads without console/asset errors on desktop and mobile
- Verify an existing user's login/account/request persistence only with authorized credentials; do not invent a production test account or submit fake requests
- Authorized delegated administrators reach their existing workspaces, and owner-only APIs remain inaccessible to them
- Owner dashboard verification requires an existing explicitly authorized owner account. Granting owner permissions is a separate security-sensitive operation; publishing alone does not authorize it

## Current boundaries

Email/password login is implemented. Email ownership verification, password recovery, file/image uploads, OTP, real offers, bookings, disputes and payments are not implemented. The new marketplace is a limited first-phase listing/details view; it returns up to 100 matches and does not persist an item selection across refresh. Older marketplace PR #2 and OTP PR #9 are outside this release.

At review time publication remains blocked on authenticated Render access and verified production backup/migration checks. No production deployment or production database change is claimed by this checklist.
