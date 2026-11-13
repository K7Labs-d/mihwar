# SQLite storage and HTTPS protection

These changes preserve the existing SQLite database and schema. There is no new user/role migration, database replacement, cloud resource, or production data operation.

Deployment target: Khalid's existing server, not Render. The repository's `render.yaml` is retained configuration and does not establish the actual hosting environment. No server address, runtime manager or TLS-proxy topology has been verified by this patch.

## Storage boundary

- `server/database.ts` is shared by the application and the three operator permission commands. The database directory must be dedicated, owned by the process user, and outside `dist`, `public`, `src`, and `dist-server`. Shared roots such as `/tmp`, the project root, and the home directory cannot be used directly as the database directory.
- POSIX directory permissions are tightened to `0700`; database, WAL, SHM and rollback-journal files to `0600`. Existing contents are preserved. New databases are created exclusively with mode `0600` before SQLite opens them. SQLite inherits that mode for new WAL/SHM files. Existing symbolic links, hard links, non-regular database files and storage owned by another UID are rejected.
- The storage directory is assumed to be controlled by the service account. A process with that same UID or root can still read the database. Windows deployments need equivalent NTFS ACLs configured by the operator; POSIX modes do not establish Windows isolation.
- File hardening deliberately avoids opening/closing existing SQLite files outside SQLite itself: doing that can release another connection's POSIX locks. Transactions, WAL and the existing ownership/authorization checks remain active.
- Connections disable extension loading and set `trusted_schema=OFF`. Writable connections enable `secure_delete`. This does not erase historical WAL contents, previous disk snapshots, or backups.
- Vite blocks data/backups directories and SQLite/database extensions and sidecars. The production server serves only built frontend assets; operator commands and backups have no public HTTP endpoint. Keep custom database filenames outside development-served trees as well.

This is filesystem isolation and safer operation, **not SQLite page encryption**. Disk encryption, encrypted independent backups and key access must be verified at the hosting/storage layer. Do not claim encryption from permissions or password hashing.

## Verified backup

Run on the existing server as its unprivileged service account, using the correct existing source. These paths are examples; use the existing `AUTH_DB_PATH` and do not relocate the live database just to match them:

```sh
AUTH_DB_PATH=/srv/mihwar/data/clients.sqlite node scripts/backup-database.mjs /srv/mihwar/backups
```

The command opens the existing source read-only, uses Node's SQLite backup API to include committed WAL data, creates a uniquely named owner-only backup, and checks `PRAGMA integrity_check` and `PRAGMA foreign_key_check`. Only successful verification produces a success JSON with the path and check results. Failure removes the incomplete backup; it never recreates a missing source or overwrites an earlier backup. No account data or credentials are printed.

For recovery rehearsal, open the generated backup independently on an isolated private copy with the matching application and verify the required records and schema. Automated tests exercise this with synthetic records and committed WAL transactions. They do not certify a production backup.

The command is an on-demand mechanism, not a scheduled backup service. Configure a scheduler under the existing service identity, private retention, encrypted off-host copies and restore monitoring before claiming disaster recovery. A backup on the same server/disk alone cannot survive loss of that server/disk. Do not commit or publicly upload backups. Restore production only after stopping writes, preserving the current database, and handling compatibility and any post-backup writes under the existing release checklist.

## HTTPS and trusted TLS termination

The application currently serves HTTP behind a TLS-terminating reverse proxy. On the existing server, verify whether Nginx, Caddy, Traefik or another component already owns HTTPS, certificate renewal and HTTP redirection. Configure that actual component rather than adding a second TLS listener blindly. If Node is exposed directly without TLS termination, this release needs a verified HTTPS ingress setup before public deployment; setting `AUTH_ORIGIN` alone does not install a certificate.

Before deploying, set:

```text
HOST=<private-listener-address-reachable-only-by-the-proxy>
AUTH_ORIGIN=https://<the-existing-public-domain>
TRUST_PROXY_CIDRS=<actual-trusted-proxy-IP-or-CIDR>,<another-if-required>
AUTH_DB_PATH=<existing-private-database-path>
```

Set the variables in the existing process manager's environment (for example systemd, PM2 or the current container configuration); no hosting-platform variable is required. `TRUST_PROXY_CIDRS` is a newly required operator setting for HTTPS. Determine the immediate proxy peers and allowed ingress paths from the actual server topology; do not guess private ranges or use all of the internet, a numeric hop count, or `trust proxy=true`. No production proxy addresses have been discovered or configured by this patch. Invalid or missing settings fail startup before opening the application database.

If the confirmed proxy and Node process run on the same host and the proxy connects over IPv4 loopback, `HOST=127.0.0.1` and `TRUST_PROXY_CIDRS=127.0.0.1/32` are an example of a narrow boundary. Add `::1/128` only if that is an actual ingress peer. For containers or another proxy host, use the verified private network instead. Keep the Node port inaccessible from the public internet, using the existing binding, firewall and container-port controls. Confirm the service UID can access the current database and backups without running the application as root.

The allowlist is compiled using Node's IP matcher, including explicit IPv4-mapped IPv6 behavior. Express trusts forwarded protocol and IP information only along that verified chain. The trusted last proxy must overwrite incoming `X-Forwarded-Proto` with one authoritative `https` or `http` value. Multiple/ambiguous protocol values are rejected. This also prevents all clients sharing a proxy from unintentionally sharing the socket-IP login limit once the real topology is configured.

For configured public HTTPS origins:

- Unencrypted `GET`/`HEAD` requests receive `308` to the configured origin, preserving path/query. User-supplied Host/forwarded-host cannot change the redirect destination.
- Unencrypted `POST`/`PUT`/`PATCH`/`DELETE` requests receive `403` before authentication, body parsing or writes. Redirecting an already-sent password cannot undo its exposure; clients must start on HTTPS.
- Accepted HTTPS requests receive `Strict-Transport-Security: max-age=31536000`. `includeSubDomains` and preload are intentionally omitted because unrelated subdomain TLS has not been verified.
- Session cookies remain HttpOnly, SameSite and Secure under HTTPS. Public HTTP origins are not accepted.
- Local HTTP requires a loopback binding, loopback socket and localhost/loopback Host. Local testing and `npm start` on loopback remain supported.

## Release checks on the existing server

1. Confirm the existing server, application directory and commit, service user/process manager, public domain, TLS proxy, disk and source database. Take a verified backup and rehearse recovery before the release. Set actual trusted proxy peers before deploying this code; otherwise the service fails closed.
2. Deploy the reviewed commit through the existing server's release procedure. Do not replace the server, its data volume or account database. No merge or deployment is authorized by this documentation update.
3. Verify TLS certificate validity, automatic renewal and HTTP-to-HTTPS behavior at the actual proxy, then HTTPS `/api/health`, frontend assets, HSTS and Secure session cookies. Ensure no redirect loop. Existing monitoring must reach the intended HTTPS/proxy path.
4. Verify actual peer addresses and client-IP separation, spoofed forwarded headers, existing account/session/request persistence, private file permissions including WAL/SHM, and inaccessible database/backup URLs. Do not create fake production users or requests for this check.

Validation in the development workspace covers file permissions, preservation, backup/restore with WAL, rejection of invalid backups/paths, proxy spoofing, redirects, denied HTTP writes and HSTS. It does not establish that the public deployment already has the correct settings or certificate.
