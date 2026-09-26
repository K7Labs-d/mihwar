# AGENTS.md — MIHWAR

## Project authority
This repository contains MIHWAR (محور), a marketplace for heavy-equipment rental.
Before architectural or product-level changes, read `docs/MIHWAR_MASTER_PRODUCT_BLUEPRINT.md`, `README.md`, and relevant documents under `docs/`. The Master Product Blueprint is the primary product and architecture reference.

## Core rules
- Do not rewrite the project from scratch when the existing implementation can be extended safely.
- Preserve existing working behavior unless the requested change explicitly replaces it.
- Do not introduce fake production data, fake APIs, fake counts, or fabricated success states.
- Prefer real empty states for functionality that has not been implemented.
- Keep large features isolated and reviewable.
- Do not silently expand the scope of a requested change.

## Product sequencing
Respect the approved MIHWAR build order:
1. Lessor foundation — implemented
2. Equipment core — implemented
3. Equipment marketplace — current next milestone
4. Request model evolution
5. Matching
6. Offers
7. Offer comparison and selection
8. Booking
9. Execution
10. Payment / commission / lessor payout
11. Documents
12. Notifications / reviews
13. Admin operations
14. Reports / settlements
15. Production hardening

Do not implement downstream concepts before their required domain foundations exist. No Offers without real Equipment. No Execution or Payment without Booking. Do not model future features as if they already exist.

## Compatibility
Existing `broker` names may remain in routes, tables, permissions, or internal code for backward compatibility. Do not perform a broad `broker -> lessor` rename unless explicitly required. Prefer gradual migration without breaking existing data, routes, or APIs.

## Backend and security
Authorization, ownership, validation, and business rules must be enforced on the backend. Never rely on UI-only permission checks.
Pay special attention to authentication and sessions, ownership boundaries, administrator/reviewer permissions, request tampering, IDOR/access control, CSRF/origin protections, rate limits, SQL safety, concurrency, idempotency, session invalidation, and sensitive data exposure.
Never commit secrets, production databases, SQLite files, backups, session tokens, credentials, or private user data.

## Database and migrations
MIHWAR currently uses SQLite. Existing data must be preserved when changing schema. Prefer additive, explicit migrations. Do not destructively recreate tables or silently discard existing data. Review concurrency and transactional behavior when changing requests, approvals, equipment, or ownership flows.

## Equipment
Equipment is owned by an approved lessor. Preserve ownership enforcement, lessor approval requirements, real persisted data, pricing integrity, availability state, and archived state. Public marketplace APIs must expose only information intended for public equipment discovery and must not expose account credentials, internal approval data, private user information, or administrative fields.

## Frontend
Preserve MIHWAR's current visual identity unless a design change is explicitly requested. Do not redesign unrelated screens while implementing a targeted change. Maintain Arabic and RTL behavior. Check desktop and mobile behavior when UI code changes. Animations should enhance interaction without changing product behavior or causing accessibility or usability regressions.

## Testing
The standard verification command is `npm run check`. It runs TypeScript checks, automated tests, the production build, and smoke verification. Run relevant focused tests during development and `npm run check` before considering a repository-wide change complete. Do not remove regression coverage merely to make a change pass. When fixing a bug, add or update a regression test when practical.

## Code review priorities
Prioritize:
1. security vulnerabilities
2. broken authorization or ownership
3. data loss or migration risk
4. regressions in existing functionality
5. incorrect product/domain sequencing
6. API contract breakage
7. concurrency and persistence issues
8. mobile/RTL/UI regressions
9. missing tests for meaningful behavior changes

Avoid noisy style-only comments unless they reveal a real maintenance or correctness problem.

## Scope discipline
For each meaningful change, determine:
Goal -> Actor -> User Flow -> Domain/Data -> Permissions -> UI States -> Edge Cases -> Tests -> Acceptance Criteria

If requirements conflict with the Master Product Blueprint, call out the conflict instead of silently choosing a new architecture.

## Documentation
Update relevant documentation when a milestone, API contract, database model, operational requirement, or product behavior materially changes. Keep `docs/MIHWAR_MASTER_PRODUCT_BLUEPRINT.md` aligned with completed milestones.
