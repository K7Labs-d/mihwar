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
  // New migrations are appended below to keep existing ledgers and data intact.
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
  {
    version: 4, name: 'account_roles_admin_review_and_visits',
    apply(db: DatabaseSync) {
      db.exec(`ALTER TABLE client_users ADD COLUMN selected_role TEXT DEFAULT 'renter' CHECK(selected_role IS NULL OR selected_role IN ('renter','lessor'));
        ALTER TABLE client_users ADD COLUMN is_platform_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_platform_admin IN (0,1));
        ALTER TABLE client_sessions ADD COLUMN admin_scope INTEGER NOT NULL DEFAULT 0 CHECK(admin_scope IN (0,1));
        CREATE TABLE equipment_reviews (
          equipment_id TEXT NOT NULL REFERENCES equipment(id), equipment_version INTEGER NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('approved','rejected')),
          reason TEXT, actor_id TEXT NOT NULL REFERENCES client_users(id), decided_at TEXT NOT NULL,
          PRIMARY KEY(equipment_id,equipment_version),
          CHECK((status='rejected' AND length(trim(reason)) BETWEEN 3 AND 1000) OR (status='approved' AND reason IS NULL))
        );
        CREATE TABLE admin_audit (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL REFERENCES client_users(id),
          target_type TEXT NOT NULL, target_id TEXT NOT NULL, action TEXT NOT NULL,
          reason TEXT, created_at TEXT NOT NULL
        );
        CREATE INDEX admin_audit_date ON admin_audit(created_at,sequence);
        CREATE TABLE visitor_days (visitor_hash TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(visitor_hash,day));
        CREATE INDEX visitor_days_date ON visitor_days(day);
        CREATE TRIGGER equipment_approved_owner_insert BEFORE INSERT ON equipment
        WHEN NOT EXISTS(SELECT 1 FROM lessor_profiles p JOIN broker_requests b ON b.id=p.application_id AND b.user_id=p.user_id
          WHERE p.id=NEW.lessor_profile_id AND p.status='approved' AND b.status='approved')
        BEGIN SELECT RAISE(ABORT,'Approved lessor required'); END;
        CREATE TRIGGER equipment_approved_owner_update BEFORE UPDATE ON equipment
        WHEN NEW.lessor_profile_id<>OLD.lessor_profile_id OR NOT EXISTS(SELECT 1 FROM lessor_profiles p JOIN broker_requests b ON b.id=p.application_id AND b.user_id=p.user_id
          WHERE p.id=NEW.lessor_profile_id AND p.status='approved' AND b.status='approved')
        BEGIN SELECT RAISE(ABORT,'Approved lessor required'); END;
        CREATE TRIGGER broker_decision_authority BEFORE UPDATE OF status,decided_at,decided_by,rejection_reason ON broker_requests
        WHEN OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected') OR NEW.decided_by=NEW.user_id
          OR NEW.decided_at IS NULL OR NOT EXISTS(SELECT 1 FROM client_users a WHERE a.id=NEW.decided_by AND a.can_review_brokers=1)
          OR (NEW.status='rejected' AND (NEW.rejection_reason IS NULL OR length(trim(NEW.rejection_reason)) NOT BETWEEN 3 AND 1000))
          OR (NEW.status='approved' AND NEW.rejection_reason IS NOT NULL)
        BEGIN SELECT RAISE(ABORT,'Authorized immutable lessor decision required'); END;
        CREATE TRIGGER admin_audit_no_update BEFORE UPDATE ON admin_audit BEGIN SELECT RAISE(ABORT,'Audit is append only'); END;
        CREATE TRIGGER admin_audit_no_delete BEFORE DELETE ON admin_audit BEGIN SELECT RAISE(ABORT,'Audit is append only'); END;
        CREATE TRIGGER equipment_review_no_update BEFORE UPDATE ON equipment_reviews BEGIN SELECT RAISE(ABORT,'Review is immutable'); END;
        CREATE TRIGGER equipment_review_no_delete BEFORE DELETE ON equipment_reviews BEGIN SELECT RAISE(ABORT,'Review is immutable'); END;
        CREATE TRIGGER equipment_review_authority BEFORE INSERT ON equipment_reviews
        WHEN NOT EXISTS(SELECT 1 FROM client_users a WHERE a.id=NEW.actor_id AND a.is_platform_admin=1)
          OR NOT EXISTS(SELECT 1 FROM equipment e JOIN lessor_profiles p ON p.id=e.lessor_profile_id
            WHERE e.id=NEW.equipment_id AND e.version=NEW.equipment_version AND p.user_id<>NEW.actor_id)
        BEGIN SELECT RAISE(ABORT,'Authorized current review required'); END;`);
      // Infer the selected workspace for existing lessors without granting new privileges.
      db.exec("UPDATE client_users SET selected_role='lessor' WHERE EXISTS(SELECT 1 FROM broker_requests b WHERE b.user_id=client_users.id AND b.status IN ('pending','approved'))");
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
