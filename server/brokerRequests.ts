import express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { emptyBrokerDraft, normalizeDigits, validateBrokerStep, workValues, type BrokerDraft, type BrokerErrors } from '../src/utils/brokerForm.ts';

const limits: Record<keyof BrokerDraft, number> = { entity: 10, name: 80, identity: 10, commercial: 10, phone: 20, email: 254, address: 250, domains: 610, regions: 610 };
export type BrokerRow = { id: string; status: 'pending' | 'approved' | 'rejected'; details: string; created_at: string; decided_at: string | null; decided_by: string | null; rejection_reason: string | null };
export const publicBrokerRequest = (row: BrokerRow) => ({ id: row.id, status: row.status, data: JSON.parse(row.details) as BrokerDraft, createdAt: row.created_at, decidedAt: row.decided_at, rejectionReason: row.rejection_reason });

export function createBrokerRequests({ db, userIdFrom, now }: { db: DatabaseSync; userIdFrom: (req: express.Request) => string | undefined; now: () => number }) {
  db.exec(`CREATE TABLE IF NOT EXISTS broker_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    details TEXT NOT NULL CHECK (json_valid(details)),
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS broker_request_active_user ON broker_requests(user_id) WHERE status IN ('pending','approved');
  CREATE INDEX IF NOT EXISTS broker_request_user_date ON broker_requests(user_id, created_at DESC);`);
  db.exec('BEGIN IMMEDIATE');
  try {
    const columns = db.prepare('PRAGMA table_info(broker_requests)').all();
    for (const [name, definition] of [
      ['decided_at', 'TEXT'], ['decided_by', 'TEXT REFERENCES client_users(id)'], ['rejection_reason', 'TEXT'],
    ]) if (!columns.some(column => column.name === name)) db.exec(`ALTER TABLE broker_requests ADD COLUMN ${name} ${definition}`);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  const active = (userId: string) => db.prepare("SELECT * FROM broker_requests WHERE user_id=? AND status IN ('pending','approved')").get(userId) as BrokerRow | undefined;
  const router = express.Router();
  router.use((req, res, next) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ error: 'يرجى تسجيل الدخول لمتابعة طلب الوسيط.' });
    res.locals.userId = userId;
    next();
  });
  router.get('/', (_req, res) => {
    const userId = res.locals.userId as string;
    const row = active(userId) ?? db.prepare('SELECT * FROM broker_requests WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(userId) as BrokerRow | undefined;
    res.json({ request: row ? publicBrokerRequest(row) : null });
  });
  router.post('/', (req, res) => {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'صيغة بيانات الوسيط غير صحيحة.' });
    const input = body as Record<string, unknown>;
    // Ownership and status come only from the session and server. Files are not accepted here.
    if (Object.keys(input).some(key => !Object.hasOwn(limits, key))) return res.status(400).json({ error: 'أرسل بيانات النموذج فقط. رفع المستندات غير متاح حاليًا.' });
    const draft = { ...emptyBrokerDraft };
    const errors: BrokerErrors = {};
    for (const key of Object.keys(limits) as (keyof BrokerDraft)[]) {
      const value = input[key];
      if (typeof value !== 'string' || value.length > limits[key] || (key === 'domains' || key === 'regions' ? /[\x00-\x09\x0b-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(value)) {
        errors[key] = 'أدخل قيمة نصية صحيحة ضمن الطول المسموح.';
      } else Object.assign(draft, { [key]: value.trim().normalize('NFC') });
    }
    Object.assign(errors, validateBrokerStep(draft, 0), validateBrokerStep(draft, 1));
    if (Object.keys(errors).length) return res.status(400).json({ error: 'راجع الحقول الموضحة قبل إرسال الطلب.', fieldErrors: errors });
    draft.identity = draft.entity === 'individual' ? normalizeDigits(draft.identity) : '';
    draft.commercial = draft.entity === 'company' ? normalizeDigits(draft.commercial) : '';
    draft.phone = '+966' + normalizeDigits(draft.phone).replace(/[\s-]/g, '').slice(-9);
    draft.email = draft.email.toLowerCase();
    draft.domains = workValues(draft.domains).join('\n');
    draft.regions = workValues(draft.regions).join('\n');
    const userId = res.locals.userId as string;
    const row: BrokerRow = { id: randomUUID(), status: 'pending', details: JSON.stringify(draft), created_at: new Date(now()).toISOString(), decided_at: null, decided_by: null, rejection_reason: null };
    // The partial unique index resolves simultaneous submissions atomically.
    const result = db.prepare(`INSERT INTO broker_requests(id,user_id,status,details,created_at) VALUES (?,?,'pending',?,?)
      ON CONFLICT(user_id) WHERE status IN ('pending','approved') DO NOTHING`).run(row.id, userId, row.details, row.created_at);
    if (!result.changes) {
      const existing = active(userId);
      return res.status(409).json({ error: 'لديك طلب قائم بالفعل. تم استرجاعه دون إنشاء طلب آخر.', request: existing ? publicBrokerRequest(existing) : null });
    }
    return res.status(201).json({ request: publicBrokerRequest(row) });
  });
  return router;
}
