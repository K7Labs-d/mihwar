import express from 'express';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

type Actor = { id: string; can_manage_requests: number };
type RequestRow = { id: string; user_id: string; title: string; description: string; location: string; quantity: number; status: string; created_at: string; updated_at: string; customer_name: string; customer_email: string; last_role: string | null; last_message_at: string | null };
type MessageRow = { sequence: number; id: string; author_role: 'admin' | 'client'; body: string; created_at: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const projection = `SELECT r.*, u.name AS customer_name, u.email AS customer_email,
  (SELECT author_role FROM request_messages WHERE request_id=r.id ORDER BY sequence DESC LIMIT 1) AS last_role,
  (SELECT created_at FROM request_messages WHERE request_id=r.id ORDER BY sequence DESC LIMIT 1) AS last_message_at
  FROM client_requests r JOIN client_users u ON u.id=r.user_id`;
const waiting = "COALESCE((SELECT author_role FROM request_messages WHERE request_id=r.id ORDER BY sequence DESC LIMIT 1),'client')";
const publicRequest = (row: RequestRow) => ({
  id: row.id, title: row.title, description: row.description, location: row.location, quantity: row.quantity,
  status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  lastMessageAt: row.last_message_at, waitingFor: row.last_role === 'admin' ? 'client' : 'admin',
  customer: { name: row.customer_name, email: row.customer_email },
});
const publicMessage = (row: MessageRow) => ({ sequence: row.sequence, id: row.id, role: row.author_role, body: row.body, createdAt: row.created_at });
const parseQuery = (url: string, allowed: string[]) => {
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of new URLSearchParams(url.split('?')[1] ?? '')) {
    if (!allowed.includes(key) || Object.hasOwn(result, key)) return null;
    result[key] = value;
  }
  return result;
};

export function createRequestInbox({ db, userFrom, now }: { db: DatabaseSync; userFrom: (req: express.Request) => Actor | undefined; now: () => number }) {
  // Additive schema: existing request status, ownership and content remain unchanged.
  db.exec(`CREATE TABLE IF NOT EXISTS request_messages (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    request_id TEXT NOT NULL REFERENCES client_requests(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES client_users(id),
    author_role TEXT NOT NULL CHECK(author_role IN ('admin','client')),
    body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),
    created_at TEXT NOT NULL,
    submission_key TEXT NOT NULL,
    UNIQUE(request_id,author_id,submission_key)
  );
  CREATE INDEX IF NOT EXISTS request_messages_thread ON request_messages(request_id,sequence);`);

  function buildRouter(admin: boolean) {
    const router = express.Router();
    router.use((req, res, next) => {
      const user = userFrom(req);
      if (!user) return res.status(401).json({ error: 'سجّل الدخول لعرض الطلبات والردود.' });
      if (admin && user.can_manage_requests !== 1) return res.status(403).json({ error: 'هذا الحساب لا يملك صلاحية إدارة الطلبات.' });
      res.locals.actor = user;
      next();
    });
    if (admin) {
      router.get('/', (req, res) => {
        const query = parseQuery(req.originalUrl, ['page', 'filter', 'q']);
        const page = query?.page ?? '1', filter = query?.filter ?? 'all', q = (query?.q ?? '').trim();
        if (!query || !/^[1-9]\d{0,5}$/.test(page) || !['all', 'unanswered', 'answered'].includes(filter) || q.length > 120 || /[\x00-\x1f\x7f]/.test(q)) return res.status(400).json({ error: 'خيارات البحث أو الصفحة غير صحيحة.' });
        const clauses: string[] = [], params: string[] = [];
        if (filter !== 'all') clauses.push(`${waiting}='${filter === 'answered' ? 'admin' : 'client'}'`);
        if (q) {
          clauses.push("(r.title LIKE ? ESCAPE '\\' OR r.id LIKE ? ESCAPE '\\' OR r.location LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')");
          const match = '%' + q.replace(/[\\%_]/g, character => '\\' + character) + '%';
          params.push(match, match, match, match, match);
        }
        const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
        db.exec('BEGIN');
        try {
          const stats = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN ${waiting}='client' THEN 1 ELSE 0 END),0) AS unanswered FROM client_requests r`).get() as { total: number; unanswered: number };
          const total = Number(db.prepare('SELECT COUNT(*) AS n FROM client_requests r JOIN client_users u ON u.id=r.user_id' + where).get(...params)!.n);
          const rows = db.prepare(projection + where + ' ORDER BY COALESCE(last_message_at,r.created_at) DESC,r.id DESC LIMIT 20 OFFSET ?').all(...params, (Number(page) - 1) * 20) as RequestRow[];
          db.exec('COMMIT');
          return res.json({ requests: rows.map(publicRequest), total, page: Number(page), pageSize: 20, stats: { ...stats, answered: stats.total - stats.unanswered } });
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      });
    }
    router.use('/:id', (req, res, next) => {
      const row = uuid.test(req.params.id) ? db.prepare(projection + ' WHERE r.id=?').get(req.params.id) as RequestRow | undefined : undefined;
      if (!row || (!admin && row.user_id !== res.locals.actor.id)) return res.status(404).json({ error: 'الطلب غير موجود أو غير متاح لحسابك.' });
      res.locals.request = row;
      next();
    });
    if (admin) router.get('/:id', (_req, res) => res.json({ request: publicRequest(res.locals.request) }));
    router.get('/:id/messages', (req, res) => {
      const query = parseQuery(req.originalUrl, ['before', 'after']);
      const cursor = query?.before ?? query?.after;
      if (!query || (query.before !== undefined && query.after !== undefined) || (cursor !== undefined && (!/^[1-9]\d{0,15}$/.test(cursor) || !Number.isSafeInteger(Number(cursor))))) return res.status(400).json({ error: 'موضع الرسائل غير صالح.' });
      const after = query.after !== undefined;
      const rows = db.prepare(`SELECT sequence,id,author_role,body,created_at FROM request_messages WHERE request_id=?${cursor ? ` AND sequence ${after ? '>' : '<'} ?` : ''} ORDER BY sequence ${after ? 'ASC' : 'DESC'} LIMIT 51`).all(res.locals.request.id, ...(cursor ? [Number(cursor)] : [])) as MessageRow[];
      const more = rows.length > 50;
      const messages = rows.slice(0, 50);
      if (!after) messages.reverse();
      return res.json({ messages: messages.map(publicMessage), hasMore: more });
    });
    router.post('/:id/messages', (req, res) => {
      const data: unknown = req.body;
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 1 || !Object.hasOwn(data, 'body')) return res.status(400).json({ error: 'أرسل نص الرد فقط.' });
      const body = (data as { body: unknown }).body;
      if (typeof body !== 'string' || !body.trim() || body.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body)) return res.status(400).json({ error: 'اكتب ردًا من حرف واحد إلى 2000 حرف.' });
      const key = req.get('Idempotency-Key');
      if (!key || !uuid.test(key)) return res.status(400).json({ error: 'معرّف الإرسال غير صالح. أعد فتح الطلب.' });
      const requestId = res.locals.request.id, actorId = res.locals.actor.id, role = admin ? 'admin' : 'client';
      // Safe retry is checked before the write limit. Failed responses can always be recovered.
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = db.prepare('SELECT * FROM request_messages WHERE request_id=? AND author_id=? AND submission_key=?').get(requestId, actorId, key) as MessageRow | undefined;
        if (existing) {
          db.exec('COMMIT');
          return existing.body === body.trim() && existing.author_role === role
            ? res.json({ message: publicMessage(existing) })
            : res.status(409).json({ error: 'استُخدم معرّف الإرسال لرد مختلف. حدّث الصفحة قبل إرسال رد جديد.' });
        }
        const recent = Number(db.prepare('SELECT COUNT(*) AS n FROM request_messages WHERE author_id=? AND created_at>?').get(actorId, new Date(now() - 60000).toISOString())!.n);
        if (recent >= 20) { db.exec('COMMIT'); res.set('Retry-After', '60'); return res.status(429).json({ error: 'أرسلت عدة ردود متتالية. انتظر دقيقة ثم أعد المحاولة.' }); }
        const saved = db.prepare('INSERT INTO request_messages(id,request_id,author_id,author_role,body,created_at,submission_key) VALUES (?,?,?,?,?,?,?) RETURNING *').get(randomUUID(), requestId, actorId, role, body.trim(), new Date(now()).toISOString(), key) as MessageRow;
        db.exec('COMMIT');
        return res.status(201).json({ message: publicMessage(saved) });
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
    router.all('/:id/messages', (_req, res) => res.set('Allow', 'GET, POST').status(405).json({ error: 'تعديل الردود وحذفها غير متاح.' }));
    router.use((_req, res) => res.status(404).json({ error: 'المسار غير موجود.' }));
    return router;
  }
  return { adminRouter: buildRouter(true), clientRouter: buildRouter(false) };
}
