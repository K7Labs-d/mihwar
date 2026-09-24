import type { DatabaseSync } from 'node:sqlite';
import { createApprovedLessorProfile, readLessorIdentity, type ApprovedApplication } from './lessorProfiles.ts';

function reconcileApprovedProfiles(db: DatabaseSync): string[] {
  const missing = db.prepare(`SELECT b.id,b.user_id,b.details,b.created_at,b.decided_at FROM broker_requests b
    WHERE b.status='approved' AND NOT EXISTS (
      SELECT 1 FROM lessor_profiles p WHERE p.application_id=b.id AND p.user_id=b.user_id
    )`).all() as ApprovedApplication[];
  const deferred: string[] = [];
  for (const row of missing) {
    // Preserve invalid legacy applications verbatim. Do not invent a replacement name or approval.
    // Only known identity validation failures are deferred; storage/constraint errors still roll back.
    if (!readLessorIdentity(row.details)) deferred.push(row.id);
    else createApprovedLessorProfile(db, row);
  }
  return deferred;
}

// Existing account/application bootstraps remain intact. All new product schema changes are numbered.
const migrations = [
  {
    version: 1, name: 'lessor_profiles',
    apply(db: DatabaseSync) {
      db.exec(`CREATE UNIQUE INDEX broker_request_identity_owner ON broker_requests(id,user_id);
        CREATE TABLE lessor_profiles (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL UNIQUE REFERENCES client_users(id) ON DELETE RESTRICT,
          application_id TEXT NOT NULL UNIQUE REFERENCES broker_requests(id) ON DELETE RESTRICT,
          display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 2 AND 80),
          entity TEXT NOT NULL CHECK(entity IN ('individual','company')),
          status TEXT NOT NULL CHECK(status='approved'),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(application_id,user_id) REFERENCES broker_requests(id,user_id) ON DELETE RESTRICT
        );`);
      reconcileApprovedProfiles(db);
    },
  },
  {
    version: 2, name: 'equipment_core',
    apply(db: DatabaseSync) {
      db.exec(`CREATE TABLE equipment (
        id TEXT PRIMARY KEY,
        lessor_profile_id TEXT NOT NULL REFERENCES lessor_profiles(id) ON DELETE RESTRICT,
        name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 3 AND 120),
        category TEXT NOT NULL CHECK(category IN ('excavator','crane','loader','bulldozer','grader','roller','forklift','truck','other')),
        description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 10 AND 2000),
        location TEXT NOT NULL CHECK(length(trim(location)) BETWEEN 2 AND 160),
        hourly_rate_halalas INTEGER CHECK(hourly_rate_halalas IS NULL OR (typeof(hourly_rate_halalas)='integer' AND hourly_rate_halalas BETWEEN 1 AND 100000000)),
        daily_rate_halalas INTEGER CHECK(daily_rate_halalas IS NULL OR (typeof(daily_rate_halalas)='integer' AND daily_rate_halalas BETWEEN 1 AND 100000000)),
        currency TEXT NOT NULL DEFAULT 'SAR' CHECK(currency='SAR'),
        operator_mode TEXT NOT NULL CHECK(operator_mode IN ('with_operator','without_operator')),
        availability TEXT NOT NULL CHECK(availability IN ('available','unavailable')),
        status TEXT NOT NULL CHECK(status IN ('active','archived')),
        version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(version)='integer' AND version BETWEEN 1 AND 2147483647),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        submission_key TEXT NOT NULL,
        submission_payload TEXT NOT NULL CHECK(json_valid(submission_payload)),
        CHECK(hourly_rate_halalas IS NOT NULL OR daily_rate_halalas IS NOT NULL),
        UNIQUE(lessor_profile_id,submission_key)
      );
      CREATE INDEX equipment_lessor_date ON equipment(lessor_profile_id,created_at DESC,id DESC);`);
    },
  },
  {
    version: 3, name: 'reconcile_approved_lessor_profiles',
    apply(db: DatabaseSync) {
      // Older releases could approve applications after migrations 1/2 had already run.
      // Preserve existing profiles and audit history; create only the missing approved identities.
      reconcileApprovedProfiles(db);
    },
  },
];

export function runProductMigrations(db: DatabaseSync, now: () => number = Date.now) {
  // The lock covers the ledger check too, so simultaneous server starts cannot apply a migration twice.
  db.exec('BEGIN IMMEDIATE');
  let deferred: string[] = [];
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL);`);
    const applied = db.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all();
    for (let index = 0; index < applied.length; index++) {
      const row = applied[index];
      const known = migrations[index];
      if (!known || row.version !== known.version || row.name !== known.name) throw new Error('Unsupported product schema migration history. Use the matching application version.');
    }
    for (const migration of migrations.slice(applied.length)) {
      migration.apply(db);
      db.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES (?,?,?)').run(migration.version, migration.name, new Date(now()).toISOString());
    }
    // Revisit deferred identities after an authorized correction without rerunning numbered migrations.
    deferred = reconcileApprovedProfiles(db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  if (deferred.length) console.warn('LESSOR_IDENTITY_REQUIRES_CORRECTION: approved applications awaiting identity correction:', deferred.join(', '));
}
