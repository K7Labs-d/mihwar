import express from 'express';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { validateEquipmentInput, type Equipment, type EquipmentInput } from '../src/utils/equipmentForm.ts';
import { approvedLessorProfile } from './lessorProfiles.ts';

type EquipmentRow = {
  id: string; name: string; category: Equipment['category']; description: string; location: string;
  hourly_rate_halalas: number | null; daily_rate_halalas: number | null; currency: 'SAR';
  operator_mode: Equipment['operatorMode']; availability: Equipment['availability']; status: Equipment['status'];
  version: number; created_at: string; updated_at: string; submission_payload: string;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const publicEquipment = (row: EquipmentRow): Equipment => ({
  id: row.id, name: row.name, category: row.category, description: row.description, location: row.location,
  hourlyRateHalalas: row.hourly_rate_halalas, dailyRateHalalas: row.daily_rate_halalas, currency: row.currency,
  operatorMode: row.operator_mode, availability: row.availability, status: row.status,
  version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
});
const businessValues = (data: EquipmentInput) => [data.name, data.category, data.description, data.location, data.hourlyRateHalalas, data.dailyRateHalalas, data.operatorMode, data.availability, data.status];
const missing = (res: express.Response) => res.status(404).json({ error: 'المعدة غير موجودة أو غير متاحة لحسابك.' });

export function createEquipment({ db, userIdFrom, now }: { db: DatabaseSync; userIdFrom: (req: express.Request) => string | undefined; now: () => number }) {
  const router = express.Router();
  router.use((req, res, next) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ error: 'سجّل الدخول لإدارة معداتك.' });
    const profile = approvedLessorProfile(db, userId);
    if (!profile) return res.status(403).json({ error: 'إدارة المعدات متاحة بعد اعتماد طلبك كمؤجر.' });
    res.locals.lessorId = profile.id;
    next();
  });
  const find = (id: string, lessorId: string) => uuid.test(id) ? db.prepare('SELECT * FROM equipment WHERE id=? AND lessor_profile_id=?').get(id, lessorId) as EquipmentRow | undefined : undefined;
  router.get('/', (req, res) => {
    const page = req.query.page ?? '1';
    if (Object.keys(req.query).some(key => key !== 'page') || typeof page !== 'string' || !/^[1-9]\d{0,5}$/.test(page)) return res.status(400).json({ error: 'رقم الصفحة غير صالح.' });
    const lessorId = res.locals.lessorId as string;
    const total = Number(db.prepare('SELECT COUNT(*) AS total FROM equipment WHERE lessor_profile_id=?').get(lessorId)!.total);
    const rows = db.prepare('SELECT * FROM equipment WHERE lessor_profile_id=? ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?').all(lessorId, (Number(page) - 1) * 20) as EquipmentRow[];
    return res.json({ equipment: rows.map(publicEquipment), page: Number(page), pageSize: 20, total });
  });
  router.get('/:id', (req, res) => {
    const row = find(req.params.id, res.locals.lessorId);
    return row ? res.json({ equipment: publicEquipment(row) }) : missing(res);
  });
  router.post('/', (req, res) => {
    const validated = validateEquipmentInput(req.body);
    if (!validated.data) return res.status(400).json({ error: validated.errors.form ?? 'راجع بيانات المعدة قبل الحفظ.', fieldErrors: validated.errors });
    const key = req.get('Idempotency-Key');
    if (!key || !uuid.test(key)) return res.status(400).json({ error: 'معرّف الإرسال غير صالح. افتح نموذج إضافة معدة وأعد المحاولة.' });
    const data = validated.data;
    const lessorId = res.locals.lessorId as string;
    const timestamp = new Date(now()).toISOString();
    const payload = JSON.stringify(data);
    db.exec('BEGIN IMMEDIATE');
    try {
      const inserted = db.prepare(`INSERT INTO equipment(id,lessor_profile_id,name,category,description,location,hourly_rate_halalas,daily_rate_halalas,operator_mode,availability,status,created_at,updated_at,submission_key,submission_payload)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(lessor_profile_id,submission_key) DO NOTHING`).run(randomUUID(), lessorId, ...businessValues(data), timestamp, timestamp, key, payload);
      const saved = db.prepare('SELECT * FROM equipment WHERE lessor_profile_id=? AND submission_key=?').get(lessorId, key) as EquipmentRow;
      // Compare the original submission, not edited fields: retrying after an edit must not create a second asset.
      const conflict = saved.submission_payload !== payload;
      db.exec('COMMIT');
      if (conflict) return res.status(409).json({ error: 'استُخدم معرّف الإرسال لمعدة ببيانات مختلفة. افتح نموذج إضافة جديدًا.' });
      return res.status(inserted.changes ? 201 : 200).json({ equipment: publicEquipment(saved) });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  router.post('/:id', (req, res) => {
    const lessorId = res.locals.lessorId as string;
    if (!find(req.params.id, lessorId)) return missing(res);
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'صيغة بيانات المعدة غير صحيحة.' });
    const { version, ...input } = body as Record<string, unknown>;
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1 || version > 2147483646) return res.status(400).json({ error: 'نسخة المعدة غير صالحة. أعد فتح التفاصيل.' });
    const validated = validateEquipmentInput(input);
    if (!validated.data) return res.status(400).json({ error: validated.errors.form ?? 'راجع بيانات المعدة قبل الحفظ.', fieldErrors: validated.errors });
    // Ownership and the version are included in the write, so competing edits cannot overwrite each other.
    const row = db.prepare(`UPDATE equipment SET name=?,category=?,description=?,location=?,hourly_rate_halalas=?,daily_rate_halalas=?,operator_mode=?,availability=?,status=?,version=version+1,updated_at=?
      WHERE id=? AND lessor_profile_id=? AND version=? RETURNING *`).get(...businessValues(validated.data), new Date(now()).toISOString(), req.params.id, lessorId, version) as EquipmentRow | undefined;
    if (!row) return res.status(409).json({ error: 'عُدّلت المعدة من جلسة أخرى. أعد فتح التفاصيل ثم راجع تعديلك.' });
    return res.json({ equipment: publicEquipment(row) });
  });
  router.all('/', (_req, res) => res.set('Allow', 'GET, POST').status(405).json({ error: 'هذا الإجراء غير متاح.' }));
  router.all('/:id', (_req, res) => res.set('Allow', 'GET, POST').status(405).json({ error: 'يمكن تعديل المعدة أو أرشفتها، ولا يتاح حذفها.' }));
  return router;
}
