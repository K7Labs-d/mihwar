import express from 'express';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

type ApprovedApplication = { id: string; user_id: string; details: string; created_at: string; decided_at: string | null };
type LessorRow = { id: string; display_name: string; entity: 'individual' | 'company'; status: 'approved'; created_at: string; updated_at: string };

// Called inside the migration or review transaction: a profile can never outlive a failed approval.
export function createApprovedLessorProfile(db: DatabaseSync, application: ApprovedApplication) {
  const details: unknown = JSON.parse(application.details);
  const input = details as Record<string, unknown> | null;
  if (!input || typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.trim().length > 80 || /[\x00-\x1f\x7f]/.test(input.name) || typeof input.entity !== 'string' || !['individual', 'company'].includes(input.entity)) {
    throw new Error('Approved lessor application has invalid identity data; migration or decision was rolled back.');
  }
  const timestamp = application.decided_at ?? application.created_at;
  const inserted = db.prepare(`INSERT INTO lessor_profiles(id,user_id,application_id,display_name,entity,status,created_at,updated_at)
    VALUES (?,?,?,?,?,'approved',?,?)`).run(randomUUID(), application.user_id, application.id, input.name.trim().normalize('NFC'), input.entity as string, timestamp, timestamp);
  if (inserted.changes !== 1) throw new Error('Lessor profile was not saved; approval was rolled back.');
}

export function approvedLessorProfile(db: DatabaseSync, userId: string): LessorRow | undefined {
  return db.prepare(`SELECT p.* FROM lessor_profiles p JOIN broker_requests b ON b.id=p.application_id AND b.user_id=p.user_id
    WHERE p.user_id=? AND p.status='approved' AND b.status='approved'`).get(userId) as LessorRow | undefined;
}

export function createLessorProfiles({ db, userIdFrom }: { db: DatabaseSync; userIdFrom: (req: express.Request) => string | undefined }) {
  const router = express.Router();
  router.get('/', (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ error: 'يرجى تسجيل الدخول.' });
    const row = approvedLessorProfile(db, userId);
    return res.json({ profile: row ? { id: row.id, displayName: row.display_name, entity: row.entity, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at } : null });
  });
  router.all('/', (_req, res) => res.set('Allow', 'GET').status(405).json({ error: 'يُنشأ ملف المؤجر من خلال اعتماد طلب التسجيل فقط.' }));
  return router;
}
