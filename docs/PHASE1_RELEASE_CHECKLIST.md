# Phase 1 release checklist

Deployment target correction: MIHWAR runs on Khalid's existing server. The retained `render.yaml` does not identify the active hosting environment. Use the existing server's process manager, TLS ingress and database paths; Render workspace access is not a release prerequisite.

## Reviewed implementation

The release extends the existing MIHWAR application; it does not replace it or connect it to Supabase. The application uses the existing Express authentication and SQLite database selected by `AUTH_DB_PATH`.

The September 30 review found and fixed a delegated-administrator UI regression. Request managers now land on `/#admin-requests`; lessor reviewers land on `/#admin-lessors`. Their navigation exposes only permitted workspaces. The owner overview, equipment decisions, users, and audit remain owner-only. Existing server checks remain authoritative. No production privileges have been granted.

Verification: `npm run check` includes 77 passing tests, TypeScript, production builds and HTTP smoke checks. `scripts/verify-phase1-browser.mjs` additionally verifies the existing owner/lessor journeys, 1440/390/320 px layouts, delegated administrator landing pages, owner-page denial and browser Back. It uses a temporary database, never production data.

## Before merging or deploying

1. Authenticate to the **existing server** running `K7Labs-d/mihwar`. Verify its application directory, current deployment commit and branch, Node version, process manager/service user, domain, TLS proxy, data disk, `AUTH_DB_PATH`, and `AUTH_ORIGIN`. Do not infer these from `render.yaml`, and do not replace the server, disk or database. For the storage/HTTPS hardening release, also configure verified proxy peers in `TRUST_PROXY_CIDRS` as described in `STORAGE_HTTPS_SECURITY.md`.
2. Verify a fresh, consistent SQLite backup and its recovery procedure. Use the SQLite backup API (or an equivalent SQLite-aware backup), not a copy of the live `.sqlite` file that omits the WAL. Keep backups private; never commit, publish, or upload them to the repository. Verify `PRAGMA integrity_check` and `PRAGMA foreign_key_check` on the backup. Record its timestamp, schema version and location without exposing records or secrets.
3. Rehearse migration 4 on an isolated private copy with the reviewed application. Verify integrity/foreign keys and preservation of account, request, message and equipment counts. Do not serve that copy publicly or seed test accounts in production.
4. Verify CI for the exact reviewed head, merge only the intended PR when authorized, and deploy that resulting commit through the existing server's release procedure when authorized. Do not merge unrelated older PRs. No new environment secrets are required for Phase 1; storage/HTTPS hardening separately requires the proxy configuration documented above.

## Migration and recovery

Migration 4 is additive and executes in a transaction. Existing accounts, requests, equipment and ordinary sessions remain; existing administrator sessions require a fresh administrative login. Existing equipment is deliberately pending review, not automatically approved. Editing an approved item withdraws it from discovery until the current version is approved again.

**Code-only rollback to pre-Phase-1 main is unsafe.** That version rejects a schema ledger containing migration 4. Prefer a reviewed roll-forward fix. If database restoration is necessary, stop writes, preserve the current database for recovery, obtain explicit approval for any loss of post-backup writes, and restore the compatible database together with the matching old application. Do not delete ledger entries, drop tables or remove triggers to force an old application to start. A hosting disk snapshot alone is not evidence of a tested SQLite recovery path.

## Verify the live release

- The server's running process uses the intended commit; HTTPS `/api/health` succeeds and the served asset manifest matches the reviewed build
- Anonymous `/#marketplace`, equipment and other platform deep links show the login gate; the marketplace API returns 401
- The existing public domain loads without console/asset errors on desktop and mobile
- Verify an existing user's login/account/request persistence only with authorized credentials; do not invent a production test account or submit fake requests
- Authorized delegated administrators reach their existing workspaces, and owner-only APIs remain inaccessible to them
- Owner dashboard verification requires an existing explicitly authorized owner account. Granting owner permissions is a separate security-sensitive operation; publishing alone does not authorize it

## Current boundaries

Email/password login is implemented. Email ownership verification, password recovery, file/image uploads, OTP, real offers, bookings, disputes and payments are not implemented. The new marketplace is a limited first-phase listing/details view; it returns up to 100 matches and does not persist an item selection across refresh. Older marketplace PR #2 and OTP PR #9 are outside this release.

Production readiness remains unverified until the actual server's runtime, HTTPS/proxy configuration and backup/migration checks have been inspected. No production deployment or production database change is claimed by this checklist.
