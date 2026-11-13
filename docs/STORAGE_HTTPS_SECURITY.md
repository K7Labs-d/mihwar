# SQLite storage and HTTPS protection

These changes preserve the existing SQLite database and schema. There is no new user/role migration, database replacement, cloud resource, or production data operation.

## Storage boundary

- `server/database.ts` is shared by the application and the three operator permission commands. The database directory must be dedicated, owned by the process user, and outside `dist`, `public`, `src`, and `dist-server`. Shared roots such as `/tmp`, the project root, and the home directory cannot be used directly as the database directory.
- POSIX directory permissions are tightened to `0700`; database, WAL, SHM and rollback-journal files to `0600`. Existing contents are preserved. New databases are created exclusively with mode `0600` before SQLite opens them. SQLite inherits that mode for new WAL/SHM files. Existing symbolic links, hard links, non-regular database files and storage owned by another UID are rejected.
- The storage directory is assumed to be controlled by the service account. A process with that same UID or root can still read the database. Windows deployments need equivalent NTFS ACLs configured by the operator; POSIX modes do not establish Windows isolation.
- File hardening deliberately avoids opening/closing existing SQLite files outside SQLite itself: doing that can release another connection's POSIX locks. Transactions, WAL and the existing ownership/authorization checks remain active.
- Connections disable extension loading and set `trusted_schema=OFF`. Writable connections enable `secure_delete`. This does not erase historical WAL contents, previous disk snapshots, or backups.
- Vite blocks data/backups directories and SQLite/database extensions and sidecars. The production server serves only built frontend assets; operator commands and backups have no public HTTP endpoint. Keep custom database filenames outside development-served trees as well.

This is filesystem isolation and safer operation, **not SQLite page encryption**. Disk encryption, encrypted independent backups and key access must be verified at the hosting/storage layer. Do not claim encryption from permissions or password hashing.

## Verified backup

Run on the existing server as its service account, using the correct existing source:

```sh
AUTH_DB_PATH=/var/data/clients.sqlite node scripts/backup-database.mjs /var/data/backups
```

The command opens the existing source read-only, uses Node's SQLite backup API to include committed WAL data, creates a uniquely named owner-only backup, and checks `PRAGMA integrity_check` and `PRAGMA foreign_key_check`. Only successful verification produces a success JSON with the path and check results. Failure removes the incomplete backup; it never recreates a missing source or overwrites an earlier backup. No account data or credentials are printed.

For recovery rehearsal, open the generated backup independently on an isolated private copy with the matching application and verify the required records and schema. Automated tests exercise this with synthetic records and committed WAL transactions. They do not certify a production backup.

The command is an on-demand mechanism, not a scheduled backup service. Configure a scheduler under the existing service identity, private retention, encrypted off-host copies and restore monitoring before claiming disaster recovery. A backup on the same Render disk alone cannot survive loss of that disk. Do not commit or publicly upload backups. Restore production only after stopping writes, preserving the current database, and handling compatibility and any post-backup writes under the existing release checklist.

## HTTPS and trusted TLS termination

Render terminates TLS at its edge and forwards HTTP to Node. Keep the Node listener as HTTP behind that TLS proxy; do not install an unrelated certificate inside the app.

Before deploying, set:

```text
HOST=0.0.0.0
AUTH_ORIGIN=https://<the-existing-public-domain>
TRUST_PROXY_CIDRS=<actual-trusted-proxy-IP-or-CIDR>,<another-if-required>
AUTH_DB_PATH=/var/data/clients.sqlite
```

The existing Blueprint still derives `AUTH_ORIGIN` from `RENDER_EXTERNAL_URL` when appropriate. `TRUST_PROXY_CIDRS` is a newly required operator setting for HTTPS. Determine the immediate proxy peers and allowed ingress paths from the actual provider topology; do not guess private ranges or use all of the internet, a numeric hop count, or `trust proxy=true`. No production proxy addresses have been discovered or configured by this patch. Invalid or missing settings fail startup before opening the application database.

The allowlist is compiled using Node's IP matcher, including explicit IPv4-mapped IPv6 behavior. Express trusts forwarded protocol and IP information only along that verified chain. The trusted last proxy must overwrite incoming `X-Forwarded-Proto` with one authoritative `https` or `http` value. Multiple/ambiguous protocol values are rejected. This also prevents all clients sharing a proxy from unintentionally sharing the socket-IP login limit once the real topology is configured.

For configured public HTTPS origins:

- Unencrypted `GET`/`HEAD` requests receive `308` to the configured origin, preserving path/query. User-supplied Host/forwarded-host cannot change the redirect destination.
- Unencrypted `POST`/`PUT`/`PATCH`/`DELETE` requests receive `403` before authentication, body parsing or writes. Redirecting an already-sent password cannot undo its exposure; clients must start on HTTPS.
- Accepted HTTPS requests receive `Strict-Transport-Security: max-age=31536000`. `includeSubDomains` and preload are intentionally omitted because unrelated subdomain TLS has not been verified.
- Session cookies remain HttpOnly, SameSite and Secure under HTTPS. Public HTTP origins are not accepted.
- Local HTTP requires a loopback binding, loopback socket and localhost/loopback Host. Local testing and `npm start` on loopback remain supported.

## Release checks on the existing service

1. Confirm the existing Render workspace/service, current commit, public domain, disk and source database. Take a verified backup and rehearse recovery before the release. Set actual trusted proxy peers before deploying this code; otherwise the service fails closed.
2. Deploy the reviewed commit on the existing service. Do not recreate its disk or account database.
3. Verify TLS certificate validity and HTTP-to-HTTPS behavior at the edge, then HTTPS `/api/health`, frontend assets, HSTS and Secure session cookies. Ensure no redirect loop. The host health check must reach the intended HTTPS/proxy path.
4. Verify actual peer addresses and client-IP separation, spoofed forwarded headers, existing account/session/request persistence, private file permissions including WAL/SHM, and inaccessible database/backup URLs. Do not create fake production users or requests for this check.

Validation in the development workspace covers file permissions, preservation, backup/restore with WAL, rejection of invalid backups/paths, proxy spoofing, redirects, denied HTTP writes and HSTS. It does not establish that the public deployment already has the correct settings or certificate.
