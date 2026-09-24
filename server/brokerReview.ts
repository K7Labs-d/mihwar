import express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { publicBrokerRequest, type BrokerRow } from './brokerRequests.ts';
import { createApprovedLessorProfile } from './lessorProfiles.ts';

type Reviewer = { id: string; can_review_brokers: number };
type ReviewRow = BrokerRow & { user_id: string; owner_name: string; owner_email: string; reviewer_name: string | null };
const selection = `SELECT b.*, u.name AS owner_name, u.email AS owner_email, reviewer.name AS reviewer_name
  FROM broker_requests b JOIN client_users u ON u.id=b.user_id LEFT JOIN client_users reviewer ON reviewer.id=b.decided_by`;
const reviewRequest = (row: ReviewRow) => ({
  ...publicBrokerRequest(row), owner: { id: row.user_id, name: row.owner_name, email: row.owner_email },
  decidedBy: row.decided_by ? { id: row.decided_by, name: row.reviewer_name } : null,
});

export function createBrokerReview({ db, userFrom, now }: { db: DatabaseSync; userFrom: (req: express.Request) => Reviewer | undefined; now: () => number }) {
  const router = express.Router();
  router.use((req, res, next) => {
    // Read permission on every request: a grant or revocation affects existing sessions immediately.
    const user = userFrom(req);
    if (!user) return res.status(401).json({ error: 'يرجى تسجيل الدخول.' });
    if (user.can_review_brokers !== 1) return res.status(403).json({ error: 'ليست لديك صلاحية مراجعة طلبات الوسطاء.' });
    res.locals.reviewerId = user.id;
    next();
  });
  const find = (id: string) => db.prepare(selection + ' WHERE b.id=?').get(id) as ReviewRow | undefined;
  router.get('/requests', (req, res) => {
    const status = req.query.status ?? 'all';
    const pageValue = req.query.page ?? '1';
    if (typeof status !== 'string' || !['all', 'pending', 'approved', 'rejected'].includes(status) || typeof pageValue !== 'string' || !/^[1-9]\d{0,5}$/.test(pageValue)) return res.status(400).json({ error: 'مرشح الطلبات أو رقم الصفحة غير صحيح.' });
    const page = Number(pageValue), pageSize = 20;
    const condition = status === 'all' ? '' : ' WHERE b.status=?';
    const parameters = status === 'all' ? [] : [status];
    const total = Number(db.prepare('SELECT COUNT(*) AS n FROM broker_requests b' + condition).get(...parameters)!.n);
    const rows = db.prepare(selection + condition + ' ORDER BY b.created_at DESC, b.rowid DESC LIMIT ? OFFSET ?').all(...parameters, pageSize, (page - 1) * pageSize) as ReviewRow[];
    // List only the data needed to choose a request; identity and contact details are in the protected detail endpoint.
    res.json({ requests: rows.map(row => ({ id: row.id, status: row.status, name: (publicBrokerRequest(row).data).name, createdAt: row.created_at })), page, pageSize, total });
  });
  router.get('/requests/:id', (req, res) => {
    const row = find(req.params.id);
    if (!row) return res.status(404).json({ error: 'طلب الوسيط غير موجود.' });
    res.json({ request: reviewRequest(row), canDecide: row.status === 'pending' && row.user_id !== res.locals.reviewerId });
  });
  router.post('/requests/:id/decision', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['status', 'reason'].includes(key)) || !['approved', 'rejected'].includes(body.status)) return res.status(400).json({ error: 'اختر اعتماد الطلب أو رفضه فقط؛ حقول القرار الأخرى يحددها الخادم.' });
    const reason = typeof body.reason === 'string' ? body.reason.trim().normalize('NFC') : '';
    if ((body.status === 'rejected' && (reason.length < 3 || reason.length > 1000 || /[\x00-\x09\x0b-\x1f\x7f]/.test(reason))) || (body.status === 'approved' && body.reason !== undefined && body.reason !== '')) return res.status(400).json({ error: 'أدخل سبب رفض واضحًا من 3 إلى 1000 حرف. الاعتماد لا يتضمن سبب رفض.' });
    const row = find(req.params.id);
    if (!row) return res.status(404).json({ error: 'طلب الوسيط غير موجود.' });
    const reviewerId = res.locals.reviewerId as string;
    if (row.user_id === reviewerId) return res.status(403).json({ error: 'لا يمكنك مراجعة طلبك الشخصي.' });
    // Decision and durable lessor identity commit together. Exactly one competing decision can win.
    db.exec('BEGIN IMMEDIATE');
    try {
      const updated = db.prepare(`UPDATE broker_requests SET status=?, decided_at=?, decided_by=?, rejection_reason=?
        WHERE id=? AND status='pending' AND user_id<>?`).run(body.status, new Date(now()).toISOString(), reviewerId, body.status === 'rejected' ? reason : null, row.id, reviewerId);
      const current = find(row.id)!;
      if (updated.changes && body.status === 'approved') createApprovedLessorProfile(db, current);
      db.exec('COMMIT');
      if (!updated.changes) return res.status(409).json({ error: 'حُسم هذا الطلب مسبقًا. تم استرجاع القرار المحفوظ.', request: reviewRequest(current), canDecide: false });
      return res.json({ request: reviewRequest(current), canDecide: false });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  return router;
}
