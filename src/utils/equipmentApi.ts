import { validateEquipmentInput, type Equipment, type EquipmentInput, type EquipmentErrors } from './equipmentForm';

export type LessorProfile = { id: string; displayName: string; entity: 'individual' | 'company'; status: 'approved'; createdAt: string; updatedAt: string };
export type EquipmentList = { equipment: Equipment[]; total: number; page: number; pageSize: number };
export class EquipmentApiError extends Error {
  constructor(message: string, public status: number, public fieldErrors: EquipmentErrors = {}) { super(message); }
}

const isEquipment = (value: any): value is Equipment => {
  if (!value || typeof value.id !== 'string' || value.id.length !== 36 || value.currency !== 'SAR' || !Number.isSafeInteger(value.version) || value.version < 1
    || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt))) return false;
  const { id, currency, version, createdAt, updatedAt, ...input } = value;
  return !!validateEquipmentInput(input).data;
};
async function call(path: string, options?: RequestInit) {
  let response: Response;
  try { response = await fetch('/api/client/' + path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), ...options }); }
  catch { throw new EquipmentApiError(options?.method === 'POST' ? 'تعذر تأكيد الحفظ بسبب الاتصال. أعد المحاولة للتحقق من النتيجة.' : 'تعذر تحميل البيانات. تحقق من الاتصال وأعد المحاولة.', 0); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new EquipmentApiError(body?.error || 'تعذر إكمال العملية. أعد المحاولة.', response.status, body?.fieldErrors);
  return body;
}
export async function loadLessorProfile(): Promise<LessorProfile | null> {
  const data = await call('lessor-profile');
  if (data?.profile === null) return null;
  const profile = data?.profile;
  if (!profile || typeof profile.id !== 'string' || typeof profile.displayName !== 'string' || !['individual', 'company'].includes(profile.entity) || profile.status !== 'approved'
    || !Number.isFinite(Date.parse(profile.createdAt)) || !Number.isFinite(Date.parse(profile.updatedAt))) throw new EquipmentApiError('تعذر التحقق من ملف المؤجر. أعد المحاولة.', 0);
  return profile;
}
export async function loadEquipment(page = 1): Promise<EquipmentList> {
  const data = await call('equipment?page=' + page);
  if (!Array.isArray(data?.equipment) || !data.equipment.every(isEquipment) || !Number.isSafeInteger(data.total) || data.total < 0 || data.page !== page || data.pageSize !== 20) throw new EquipmentApiError('تعذر التحقق من قائمة المعدات. أعد المحاولة.', 0);
  return data;
}
export async function loadEquipmentItem(id: string): Promise<Equipment> {
  const data = await call('equipment/' + encodeURIComponent(id));
  if (!isEquipment(data?.equipment) || data.equipment.id !== id) throw new EquipmentApiError('تعذر التحقق من بيانات المعدة. أعد المحاولة.', 0);
  return data.equipment;
}
export async function saveEquipment(input: EquipmentInput, key: string, existing?: { id: string; version: number }): Promise<Equipment> {
  const data = await call('equipment' + (existing ? '/' + encodeURIComponent(existing.id) : ''), {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(!existing ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify(existing ? { ...input, version: existing.version } : input),
  });
  if (!isEquipment(data?.equipment) || (existing && data.equipment.id !== existing.id)) throw new EquipmentApiError('تعذر تأكيد حفظ المعدة. أعد المحاولة للتحقق من النتيجة.', 0);
  return data.equipment;
}
