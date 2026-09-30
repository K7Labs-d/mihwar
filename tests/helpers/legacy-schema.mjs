// Only disposable fixture databases may be downgraded to simulate an installed old release.
import assert from 'node:assert/strict';
export const legacyUsers = 'id,name,email,password_hash,created_at,can_review_brokers,can_manage_requests';
export const legacySessions = 'token_hash,user_id,expires_at';
export function removePhase1Schema(db, filename) {
  assert.ok(filename.includes('mahwar-') && filename.startsWith('/tmp/'));
  db.exec(`DROP TRIGGER broker_decision_authority; DROP TRIGGER equipment_approved_owner_insert; DROP TRIGGER equipment_approved_owner_update;
    DROP TABLE equipment_reviews; DROP TABLE admin_audit; DROP TABLE visitor_days;
    ALTER TABLE client_users DROP COLUMN selected_role; ALTER TABLE client_users DROP COLUMN is_platform_admin;
    ALTER TABLE client_sessions DROP COLUMN admin_scope;
    DELETE FROM schema_migrations WHERE version=4;`);
}
