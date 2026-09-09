import type { RequestDraft, RequestErrors } from './requestForm';

export type ClientRequest = RequestDraft & { id: string; status: 'open'; createdAt: string; updatedAt: string };
export type RequestList = { requests: ClientRequest[]; total: number; page: number; pageSize: number };
export class RequestApiError extends Error {
  constructor(message: string, public status: number, public fieldErrors: RequestErrors = {}) { super(message); }
}
const isRequest = (value: any): value is ClientRequest => !!value && typeof value.id === 'string' && value.id.length === 36 && value.status === 'open'
  && ['title', 'description', 'location'].every(key => typeof value[key] === 'string') && Number.isSafeInteger(value.quantity)
  && Number.isFinite(Date.parse(value.createdAt)) && Number.isFinite(Date.parse(value.updatedAt));
async function call(path: string, options?: RequestInit) {
  let response: Response;
  try { response = await fetch('/api/client/requests' + path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), ...options }); }
  catch { throw new RequestApiError(options?.method === 'POST' ? 'تعذر تأكيد الحفظ بسبب الاتصال. أعد المحاولة؛ لن يتكرر الطلب عند إعادة الإرسال.' : 'تعذر تحميل الطلبات. تحقق من الاتصال وأعد المحاولة.', 0); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new RequestApiError(body?.error || 'تعذر إكمال الطلب. أعد المحاولة.', response.status, body?.fieldErrors);
  return body;
}
export async function loadRequests(page = 1): Promise<RequestList> {
  const data = await call('?page=' + page);
  if (!Array.isArray(data?.requests) || !data.requests.every(isRequest) || !Number.isSafeInteger(data.total) || data.total < 0 || data.page !== page || data.pageSize !== 20) throw new RequestApiError('تعذر التحقق من قائمة الطلبات. أعد المحاولة.', 0);
  return data;
}
export async function loadRequest(id: string): Promise<ClientRequest> {
  const data = await call('/' + encodeURIComponent(id));
  if (!isRequest(data?.request) || data.request.id !== id) throw new RequestApiError('تعذر التحقق من تفاصيل الطلب. أعد المحاولة.', 0);
  return data.request;
}
export async function saveRequest(draft: RequestDraft, key: string): Promise<ClientRequest> {
  const data = await call('', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(draft) });
  if (!isRequest(data?.request)) throw new RequestApiError('تعذر تأكيد الحفظ. أعد المحاولة للتحقق من الطلب.', 0);
  return data.request;
}
