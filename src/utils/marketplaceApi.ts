import { validateEquipmentInput, type EquipmentInput } from './equipmentForm';

export type PublicEquipment = Omit<EquipmentInput, 'status'> & {
  id: string; currency: 'SAR'; createdAt: string; updatedAt: string;
  lessor: { displayName: string; entity: 'individual' | 'company' };
};
export type MarketplaceList = { equipment: PublicEquipment[]; page: number; pageSize: number; total: number };
export class MarketplaceApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const isEquipment = (value: any): value is PublicEquipment => !!value && /^[a-f0-9-]{36}$/i.test(value.id) && value.currency === 'SAR'
  && typeof value.lessor?.displayName === 'string' && ['individual', 'company'].includes(value.lessor.entity)
  && Number.isFinite(Date.parse(value.createdAt)) && Number.isFinite(Date.parse(value.updatedAt))
  && !!validateEquipmentInput({ name: value.name, category: value.category, description: value.description, location: value.location,
    hourlyRateHalalas: value.hourlyRateHalalas, dailyRateHalalas: value.dailyRateHalalas, operatorMode: value.operatorMode,
    availability: value.availability, status: 'active' }).data;

async function read(path: string, signal: AbortSignal) {
  let response: Response;
  try { response = await fetch('/api/marketplace/equipment' + path, { cache: 'no-store', signal }); }
  catch (error) {
    if (signal.aborted && signal.reason?.name === 'AbortError') throw error;
    throw new MarketplaceApiError('تعذر الاتصال بسوق المعدات. تحقق من الاتصال وأعد المحاولة.', 0);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new MarketplaceApiError(body?.error || 'تعذر تحميل المعدات. أعد المحاولة.', response.status);
  return body;
}
export async function browseEquipment(query: string, signal: AbortSignal): Promise<MarketplaceList> {
  const data = await read(query ? '?' + query : '', signal);
  if (!Array.isArray(data?.equipment) || !data.equipment.every(isEquipment) || !Number.isSafeInteger(data.total) || data.total < 0
    || !Number.isSafeInteger(data.page) || data.page < 1 || data.pageSize !== 20) throw new MarketplaceApiError('تعذر التحقق من نتائج البحث. أعد المحاولة.', 0);
  return data;
}
export async function browseEquipmentDetail(id: string, signal: AbortSignal): Promise<PublicEquipment> {
  const data = await read('/' + encodeURIComponent(id), signal);
  if (!isEquipment(data?.equipment) || data.equipment.id !== id) throw new MarketplaceApiError('تعذر التحقق من تفاصيل المعدة. أعد المحاولة.', 0);
  return data.equipment;
}
export function marketplaceHref(query = '', id?: string) {
  return '#marketplace' + (id ? '/' + encodeURIComponent(id) : '') + (query ? '?' + query : '');
}
export function marketplaceLocation(hash: string) {
  const [path, ...queryParts] = hash.replace(/^#/, '').split('?');
  const rawId = path.startsWith('marketplace/') ? path.slice('marketplace/'.length) : '';
  let id = rawId;
  try { id = decodeURIComponent(rawId); } catch { /* The detail API returns not found for malformed IDs. */ }
  return { id, query: queryParts.join('?') };
}
