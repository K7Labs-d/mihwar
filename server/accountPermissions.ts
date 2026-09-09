import type { DatabaseSync } from 'node:sqlite';

// One narrowly scoped permission on existing accounts, not a second identity system.
export function ensureBrokerReviewPermission(db: DatabaseSync) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const columns = db.prepare('PRAGMA table_info(client_users)').all();
    if (!columns.some(column => column.name === 'can_review_brokers')) {
      db.exec('ALTER TABLE client_users ADD COLUMN can_review_brokers INTEGER NOT NULL DEFAULT 0 CHECK (can_review_brokers IN (0,1))');
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
