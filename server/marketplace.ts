import express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { equipmentCategories, type Equipment } from '../src/utils/equipmentForm.ts';

type PublicEquipmentRow = {
  id: string; name: string; category: Equipment['category']; description: string; location: string;
  hourly_rate_halalas: number | null; daily_rate_halalas: number | null; currency: 'SAR';
  operator_mode: Equipment['operatorMode']; availability: Equipment['availability'];
  created_at: string; updated_at: string; lessor_name: string; lessor_entity: 'individual' | 'company';
};
const publicEquipment = (row: PublicEquipmentRow) => ({
  id: row.id, name: row.name, category: row.category, description: row.description, location: row.location,
  hourlyRateHalalas: row.hourly_rate_halalas, dailyRateHalalas: row.daily_rate_halalas, currency: row.currency,
  operatorMode: row.operator_mode, availability: row.availability, createdAt: row.created_at, updatedAt: row.updated_at,
  lessor: { displayName: row.lessor_name, entity: row.lessor_entity },
});
// Public reads select only declared business fields, never account/application data or write metadata.
const projection = `SELECT e.id,e.name,e.category,e.description,e.location,e.hourly_rate_halalas,e.daily_rate_halalas,
  e.currency,e.operator_mode,e.availability,e.created_at,e.updated_at,p.display_name AS lessor_name,p.entity AS lessor_entity`;
const relation = ` FROM equipment e
  JOIN lessor_profiles p ON p.id=e.lessor_profile_id
  JOIN broker_requests b ON b.id=p.application_id AND b.user_id=p.user_id`;
const eligibility = "e.status='active' AND p.status='approved' AND b.status='approved'";
const queryKeys = new Set(['q', 'category', 'location', 'operatorMode', 'availability', 'rateUnit', 'minRateHalalas', 'maxRateHalalas', 'sort', 'page']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const literalLike = (value: string) => '%' + value.replace(/[\\%_]/g, character => '\\' + character) + '%';

function parseQuery(url: string) {
  const values: Record<string, string> = Object.create(null);
  // Read raw keys before Express's object parser can collapse duplicates or discard special property names.
  const query = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '');
  for (const [key, value] of query) {
    if (!queryKeys.has(key) || Object.hasOwn(values, key) || /[\x00-\x1f\x7f]/.test(value)) return null;
    values[key] = value;
  }
  if ((values.q?.length ?? 0) > 100 || (values.location?.length ?? 0) > 160) return null;
  const q = (values.q ?? '').trim().normalize('NFC');
  const location = (values.location ?? '').trim().normalize('NFC');
  if (q.length > 100 || location.length > 160) return null;
  if (values.category !== undefined && !equipmentCategories.some(category => category.value === values.category)) return null;
  if (values.operatorMode !== undefined && !['with_operator', 'without_operator'].includes(values.operatorMode)) return null;
  if (values.availability !== undefined && !['available', 'unavailable'].includes(values.availability)) return null;
  const rateUnit = values.rateUnit ?? 'day';
  const sort = values.sort ?? 'newest';
  const page = values.page ?? '1';
  if (!['hour', 'day'].includes(rateUnit) || !['newest', 'price_asc', 'price_desc'].includes(sort) || !/^[1-9]\d{0,5}$/.test(page)) return null;
  for (const key of ['minRateHalalas', 'maxRateHalalas']) {
    if (values[key] !== undefined && (!/^(?:0|[1-9]\d{0,8})$/.test(values[key]) || Number(values[key]) > 100000000)) return null;
  }
  const min = values.minRateHalalas === undefined ? undefined : Number(values.minRateHalalas);
  const max = values.maxRateHalalas === undefined ? undefined : Number(values.maxRateHalalas);
  if (min !== undefined && max !== undefined && min > max) return null;
  return { q, location, category: values.category, operatorMode: values.operatorMode, availability: values.availability, rateUnit, sort, page: Number(page), min, max };
}

export function createMarketplace({ db }: { db: DatabaseSync }) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.set('Allow', 'GET, HEAD').status(405).json({ error: 'تصفح المعدات متاح للقراءة فقط.' });
    next();
  });
  router.get('/', (req, res) => {
    const query = parseQuery(req.originalUrl);
    if (!query) return res.status(400).json({ error: 'خيارات البحث أو التصفية غير صحيحة. راجع القيم وحاول مجددًا.' });
    const filters = [eligibility];
    const parameters: (string | number)[] = [];
    if (query.q) {
      filters.push("(e.name LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\')");
      parameters.push(literalLike(query.q), literalLike(query.q));
    }
    if (query.location) {
      filters.push("e.location LIKE ? ESCAPE '\\'");
      parameters.push(literalLike(query.location));
    }
    for (const [column, value] of [['category', query.category], ['operator_mode', query.operatorMode], ['availability', query.availability]]) {
      if (value !== undefined) { filters.push(`e.${column}=?`); parameters.push(value); }
    }
    // Only server-owned allowlisted column names enter SQL. Missing unit prices never become zero.
    const rateColumn = query.rateUnit === 'hour' ? 'e.hourly_rate_halalas' : 'e.daily_rate_halalas';
    if (query.min !== undefined || query.max !== undefined || query.sort !== 'newest') filters.push(rateColumn + ' IS NOT NULL');
    if (query.min !== undefined) { filters.push(rateColumn + '>=?'); parameters.push(query.min); }
    if (query.max !== undefined) { filters.push(rateColumn + '<=?'); parameters.push(query.max); }
    const order = query.sort === 'price_asc' ? rateColumn + ' ASC,e.id DESC' : query.sort === 'price_desc' ? rateColumn + ' DESC,e.id DESC' : 'e.created_at DESC,e.id DESC';
    const where = ' WHERE ' + filters.join(' AND ');
    let total: number;
    let rows: PublicEquipmentRow[];
    // A single read snapshot keeps the count and page consistent with concurrent owner edits.
    db.exec('BEGIN');
    try {
      total = Number(db.prepare('SELECT COUNT(*) AS total' + relation + where).get(...parameters)!.total);
      rows = db.prepare(projection + relation + where + ' ORDER BY ' + order + ' LIMIT 20 OFFSET ?').all(...parameters, (query.page - 1) * 20) as PublicEquipmentRow[];
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return res.json({ equipment: rows.map(publicEquipment), page: query.page, pageSize: 20, total });
  });
  router.get('/:id', (req, res) => {
    // Details have no filter contract, and cannot bypass public eligibility by knowing an equipment ID.
    if (new URLSearchParams(req.originalUrl.split('?')[1] ?? '').size) return res.status(400).json({ error: 'صفحة تفاصيل المعدة لا تقبل خيارات تصفية.' });
    const row = uuid.test(req.params.id) ? db.prepare(projection + relation + ' WHERE ' + eligibility + ' AND e.id=?').get(req.params.id) as PublicEquipmentRow | undefined : undefined;
    return row ? res.json({ equipment: publicEquipment(row) }) : res.status(404).json({ error: 'المعدة غير موجودة أو لم تعد متاحة في السوق.' });
  });
  router.use((_req, res) => res.status(404).json({ error: 'المسار غير موجود.' }));
  router.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'تعذر تحميل المعدات الآن. حاول مرة أخرى.' });
  });
  return router;
}
