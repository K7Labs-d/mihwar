import express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { validateRequest } from '../src/utils/requestForm.ts';

type RequestRow = { id: string; title: string; description: string; location: string; quantity: number; status: 'open'; created_at: string; updated_at: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const publicRequest = (row: RequestRow) => ({ id: row.id, title: row.title, description: row.description, location: row.location, quantity: row.quantity, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at });

export function createClientRequests({ db, userIdFrom, now }: { db: DatabaseSync; userIdFrom: (req: express.Request) => string | undefined; now: () => number }) {
  db.exec(`CREATE TABLE IF NOT EXISTS client_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 120),
    description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 10 AND 2000),
    location TEXT NOT NULL CHECK(length(trim(location)) BETWEEN 2 AND 160),
    quantity INTEGER NOT NULL CHECK(typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 1000),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    submission_key TEXT NOT NULL,
    UNIQUE(user_id, submission_key)
  );
  CREATE INDEX IF NOT EXISTS client_requests_owner_date ON client_requests(user_id, created_at DESC, id DESC);`);
  const router = express.Router();
  router.use((req, res, next) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ error: 'سجّل الدخول لإنشاء طلباتك ومتابعتها.' });
    res.locals.userId = userId;
    next();
  });
  router.get('/', (req, res) => {
    const page = req.query.page ?? '1';
    if (Object.keys(req.query).some(key => key !== 'page') || typeof page !== 'string' || !/^[1-9]\d{0,5}$/.test(page)) return res.status(400).json({ error: 'رقم الصفحة غير صالح.' });
    const userId = res.locals.userId as string;
    const total = Number(db.prepare('SELECT COUNT(*) AS total FROM client_requests WHERE user_id=?').get(userId)!.total);
    const rows = db.prepare('SELECT * FROM client_requests WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ?').all(userId, (Number(page) - 1) * 20) as RequestRow[];
    return res.json({ requests: rows.map(publicRequest), total, page: Number(page), pageSize: 20 });
  });
  router.get('/:id', (req, res) => {
    const row = uuid.test(req.params.id) ? db.prepare('SELECT * FROM client_requests WHERE id=? AND user_id=?').get(req.params.id, res.locals.userId) as RequestRow | undefined : undefined;
    // Missing and foreign-owned IDs have the same response; ownership is never accepted from the client.
    return row ? res.json({ request: publicRequest(row) }) : res.status(404).json({ error: 'الطلب غير موجود أو غير متاح لحسابك.' });
  });
  router.post('/', (req, res) => {
    const validated = validateRequest(req.body);
    if (!validated.data) return res.status(400).json({ error: validated.error, fieldErrors: validated.fieldErrors });
    const key = req.get('Idempotency-Key');
    if (!key || !uuid.test(key)) return res.status(400).json({ error: 'معرّف الإرسال غير صالح. افتح نموذج طلب جديد وأعد المحاولة.' });
    const data = validated.data;
    const userId = res.locals.userId as string;
    const timestamp = new Date(now()).toISOString();
    // A single atomic insert and unique per-account key protect retries and concurrent submissions.
    const inserted = db.prepare(`INSERT INTO client_requests(id,user_id,title,description,location,quantity,status,created_at,updated_at,submission_key)
      VALUES (?,?,?,?,?,?,'open',?,?,?) ON CONFLICT(user_id,submission_key) DO NOTHING`).run(randomUUID(), userId, data.title, data.description, data.location, data.quantity, timestamp, timestamp, key);
    const saved = db.prepare('SELECT * FROM client_requests WHERE user_id=? AND submission_key=?').get(userId, key) as RequestRow;
    if (saved.title !== data.title || saved.description !== data.description || saved.location !== data.location || saved.quantity !== data.quantity) {
      return res.status(409).json({ error: 'استُخدم معرّف الإرسال لطلب مختلف. افتح نموذج طلب جديد.' });
    }
    return res.status(inserted.changes ? 201 : 200).json({ request: publicRequest(saved) });
  });
  router.all('/', (_req, res) => res.set('Allow', 'GET, POST').status(405).json({ error: 'هذا الإجراء غير متاح.' }));
  router.all('/:id', (_req, res) => res.set('Allow', 'GET').status(405).json({ error: 'تعديل الطلبات وحذفها غير متاح حاليًا.' }));
  return router;
}
