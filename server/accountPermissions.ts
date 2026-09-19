import type { DatabaseSync } from 'node:sqlite';

function ensurePermission(db: DatabaseSync, name: 'can_review_brokers' | 'can_manage_requests') {
  db.exec('BEGIN IMMEDIATE');
  try {
    const columns = db.prepare('PRAGMA table_info(client_users)').all();
    if (!columns.some(column => column.name === name)) {
      db.exec(`ALTER TABLE client_users ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 0 CHECK (${name} IN (0,1))`);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export const ensureBrokerReviewPermission = (db: DatabaseSync) => ensurePermission(db, 'can_review_brokers');
export const ensureRequestManagementPermission = (db: DatabaseSync) => ensurePermission(db, 'can_manage_requests');
