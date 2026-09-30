import express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { approvedLessorProfile } from './lessorProfiles.ts';

export type PlatformActor = {
  id: string;
  is_platform_admin: number;
  admin_scope: number;
};
export function writeAudit(
  db: DatabaseSync,
  actor: string,
  type: string,
  id: string,
  action: string,
  reason: string | null,
  timestamp: string,
) {
  db.prepare(
    'INSERT INTO admin_audit(actor_id,target_type,target_id,action,reason,created_at) VALUES (?,?,?,?,?,?)',
  ).run(actor, type, id, action, reason, timestamp);
}

// Shared, strict filtering. Values are always bound; table/column choices are server constants.
export function adminFilters(
  req: express.Request,
  statusValues: string[],
  searchable: string[],
  dateColumn: string,
) {
  const q = req.query.q ?? '',
    status = req.query.status ?? 'all',
    from = req.query.from ?? '',
    to = req.query.to ?? '',
    page = req.query.page ?? '1';
  if (
    Object.keys(req.query).some(
      (k) => !['q', 'status', 'from', 'to', 'page'].includes(k),
    ) ||
    [q, status, from, to, page].some((v) => typeof v !== 'string') ||
    String(q).length > 120 ||
    /[\x00-\x1f\x7f]/.test(String(q)) ||
    !['all', ...statusValues].includes(String(status)) ||
    !/^[1-9]\d{0,5}$/.test(String(page))
  )
    return null;
  const date = (v: string) =>
    !v ||
    (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v);
  if (!date(String(from)) || !date(String(to)) || (from && to && from > to))
    return null;
  const clauses: string[] = [],
    params: (string | number)[] = [];
  if (q) {
    clauses.push(
      '(' + searchable.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')',
    );
    const term = '%' + String(q).replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    searchable.forEach(() => params.push(term));
  }
  if (from) {
    clauses.push(`${dateColumn}>=?`);
    params.push(String(from));
  }
  if (to) {
    clauses.push(`${dateColumn}<?`);
    params.push(
      new Date(Date.parse(String(to)) + 86400000).toISOString().slice(0, 10),
    );
  }
  return { clauses, params, status: String(status), page: Number(page) };
}

const equipmentProjection = `SELECT e.id,e.name,e.category,e.description,e.location,e.hourly_rate_halalas,e.daily_rate_halalas,
  e.operator_mode,e.availability,e.status,e.version,e.created_at,e.updated_at,p.display_name AS lessor_name,p.user_id AS owner_id,
  COALESCE(v.status,'pending') AS review_status,v.reason AS rejection_reason,v.decided_at,v.actor_id AS decided_by
  FROM equipment e JOIN lessor_profiles p ON p.id=e.lessor_profile_id
  LEFT JOIN equipment_reviews v ON v.equipment_id=e.id AND v.equipment_version=e.version`;

export function createAdminOperations({
  db,
  userFrom,
  now,
}: {
  db: DatabaseSync;
  userFrom: (req: express.Request) => PlatformActor | undefined;
  now: () => number;
}) {
  const router = express.Router();
  router.use((req, res, next) => {
    const actor = userFrom(req);
    if (!actor)
      return res.status(401).json({ error: 'سجّل الدخول من بوابة الإدارة.' });
    if (actor.is_platform_admin !== 1 || actor.admin_scope !== 1)
      return res
        .status(403)
        .json({ error: 'هذه اللوحة خاصة بمالك المنصة. يلزم دخول الإدارة.' });
    res.locals.actor = actor;
    next();
  });
  router.get('/overview', (req, res) => {
    const filters = adminFilters(req, [], [], 'created_at');
    if (!filters || req.query.q || req.query.status || req.query.page)
      return res.status(400).json({ error: 'الفترة غير صحيحة.' });
    const count = (table: string, extra = '', column = 'created_at') => {
      const clauses = filters.clauses.map((c) =>
        c.replaceAll('created_at', column),
      );
      if (extra) clauses.push(extra);
      return Number(
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM ${table}${clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''}`,
          )
          .get(...filters.params)!.n,
      );
    };
    db.exec('BEGIN');
    try {
      const visitWhere = filters.clauses.map((c) =>
        c.replaceAll('created_at', 'day'),
      );
      const visitors = Number(
        db
          .prepare(
            `SELECT COUNT(DISTINCT visitor_hash) AS n FROM visitor_days${visitWhere.length ? ' WHERE ' + visitWhere.join(' AND ') : ''}`,
          )
          .get(...filters.params)!.n,
      );
      const stats = {
        visitors,
        users: count('client_users'),
        requests: count('client_requests'),
        newRequests: count(
          'client_requests r',
          'NOT EXISTS(SELECT 1 FROM request_messages m WHERE m.request_id=r.id)',
          'r.created_at',
        ),
        waitingRequests: count(
          'client_requests r',
          "COALESCE((SELECT author_role FROM request_messages m WHERE m.request_id=r.id ORDER BY sequence DESC LIMIT 1),'client')='client'",
          'r.created_at',
        ),
        pendingLessors: count('broker_requests', "status='pending'"),
        pendingEquipment: count(
          'equipment e',
          "status='active' AND NOT EXISTS(SELECT 1 FROM equipment_reviews v WHERE v.equipment_id=e.id AND v.equipment_version=e.version)",
          'e.created_at',
        ),
        bookings: null,
        disputes: null,
        cancellations: null,
      };
      db.exec('COMMIT');
      return res.json({
        stats,
        visitorDefinition:
          'متصفحات فريدة بواسطة ملف تعريف ارتباط منذ بدء القياس؛ ليست عدد الأشخاص ولا زيارات تاريخية.',
        measuredSince: db
          .prepare('SELECT MIN(day) AS day FROM visitor_days')
          .get()!.day,
      });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  router.get('/equipment', (req, res) => {
    const f = adminFilters(
      req,
      ['pending', 'approved', 'rejected', 'archived'],
      ['e.name', 'p.display_name', 'e.location'],
      'e.created_at',
    );
    if (!f) return res.status(400).json({ error: 'خيارات التصفية غير صحيحة.' });
    if (f.status === 'archived') f.clauses.push("e.status='archived'");
    else if (f.status !== 'all') {
      f.clauses.push("COALESCE(v.status,'pending')=? AND e.status='active'");
      f.params.push(f.status);
    }
    const where = f.clauses.length ? ' WHERE ' + f.clauses.join(' AND ') : '';
    const total = Number(
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM (' + equipmentProjection + where + ')',
        )
        .get(...f.params)!.n,
    );
    const items = db
      .prepare(
        equipmentProjection +
          where +
          ' ORDER BY e.created_at DESC,e.id DESC LIMIT 20 OFFSET ?',
      )
      .all(...f.params, (f.page - 1) * 20);
    res.json({ items, total, page: f.page, pageSize: 20 });
  });
  router.get('/equipment/:id', (req, res) => {
    const item = db
      .prepare(equipmentProjection + ' WHERE e.id=?')
      .get(req.params.id);
    if (!item) return res.status(404).json({ error: 'المعدة غير موجودة.' });
    res.json({ item });
  });
  router.post('/equipment/:id/decision', (req, res) => {
    const b = req.body;
    if (
      !b ||
      Object.keys(b).some(
        (k) => !['status', 'reason', 'version'].includes(k),
      ) ||
      !['approved', 'rejected'].includes(b.status) ||
      !Number.isSafeInteger(b.version) ||
      b.version < 1
    )
      return res.status(400).json({ error: 'بيانات القرار غير صحيحة.' });
    const reason =
      typeof b.reason === 'string' ? b.reason.trim().normalize('NFC') : '';
    if (
      (b.status === 'rejected' &&
        (reason.length < 3 ||
          reason.length > 1000 ||
          /[\x00-\x09\x0b-\x1f\x7f]/.test(reason))) ||
      (b.status === 'approved' && b.reason !== undefined && b.reason !== '')
    )
      return res
        .status(400)
        .json({ error: 'أدخل سبب الرفض من 3 إلى 1000 حرف.' });
    db.exec('BEGIN IMMEDIATE');
    try {
      const item = db
        .prepare(equipmentProjection + ' WHERE e.id=?')
        .get(req.params.id);
      if (!item) {
        db.exec('ROLLBACK');
        return res.status(404).json({ error: 'المعدة غير موجودة.' });
      }
      if (item.owner_id === res.locals.actor.id) {
        db.exec('ROLLBACK');
        return res
          .status(403)
          .json({ error: 'لا يمكنك مراجعة معدتك الشخصية.' });
      }
      if (
        item.version !== b.version ||
        item.review_status !== 'pending' ||
        item.status !== 'active'
      ) {
        db.exec('ROLLBACK');
        return res
          .status(409)
          .json({
            error: 'تغيّرت المعدة أو حُسمت مراجعتها. أعد فتح التفاصيل.',
          });
      }
      if (!approvedLessorProfile(db, String(item.owner_id))) {
        db.exec('ROLLBACK');
        return res.status(409).json({ error: 'ملف المؤجر غير معتمد.' });
      }
      const at = new Date(now()).toISOString();
      db.prepare(
        'INSERT INTO equipment_reviews(equipment_id,equipment_version,status,reason,actor_id,decided_at) VALUES (?,?,?,?,?,?)',
      ).run(
        item.id,
        b.version,
        b.status,
        b.status === 'rejected' ? reason : null,
        res.locals.actor.id,
        at,
      );
      writeAudit(
        db,
        res.locals.actor.id,
        'equipment',
        String(item.id),
        b.status,
        b.status === 'rejected' ? reason : null,
        at,
      );
      db.exec('COMMIT');
      res.json({
        item: db
          .prepare(equipmentProjection + ' WHERE e.id=?')
          .get(req.params.id),
      });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  router.get('/users', (req, res) => {
    const f = adminFilters(
      req,
      ['renter', 'lessor', 'admin'],
      ['u.name', 'u.email'],
      'u.created_at',
    );
    if (!f) return res.status(400).json({ error: 'خيارات التصفية غير صحيحة.' });
    if (f.status !== 'all') {
      f.clauses.push(
        f.status === 'admin' ? 'u.is_platform_admin=1' : 'u.selected_role=?',
      );
      if (f.status !== 'admin') f.params.push(f.status);
    }
    const where = f.clauses.length ? ' WHERE ' + f.clauses.join(' AND ') : '';
    const total = Number(
      db
        .prepare('SELECT COUNT(*) AS n FROM client_users u' + where)
        .get(...f.params)!.n,
    );
    const items = db
      .prepare(
        `SELECT u.id,u.name,u.email,u.created_at,u.selected_role,u.is_platform_admin,u.can_review_brokers,u.can_manage_requests,
      (SELECT status FROM broker_requests b WHERE b.user_id=u.id ORDER BY created_at DESC,rowid DESC LIMIT 1) AS lessor_status
      FROM client_users u${where} ORDER BY u.created_at DESC,u.id DESC LIMIT 20 OFFSET ?`,
      )
      .all(...f.params, (f.page - 1) * 20);
    res.json({ items, total, page: f.page, pageSize: 20 });
  });
  router.get('/audit', (req, res) => {
    const f = adminFilters(
      req,
      ['approved', 'rejected'],
      ['a.target_id', 'u.name', 'a.reason'],
      'a.created_at',
    );
    if (!f) return res.status(400).json({ error: 'خيارات التصفية غير صحيحة.' });
    if (f.status !== 'all') {
      f.clauses.push('a.action=?');
      f.params.push(f.status);
    }
    const where = f.clauses.length ? ' WHERE ' + f.clauses.join(' AND ') : '';
    const source = ' FROM admin_audit a JOIN client_users u ON u.id=a.actor_id';
    const total = Number(
      db.prepare('SELECT COUNT(*) AS n' + source + where).get(...f.params)!.n,
    );
    res.json({
      items: db
        .prepare(
          'SELECT a.*,u.name AS actor_name' +
            source +
            where +
            ' ORDER BY a.sequence DESC LIMIT 20 OFFSET ?',
        )
        .all(...f.params, (f.page - 1) * 20),
      total,
      page: f.page,
      pageSize: 20,
    });
  });
  return router;
}
