import { RequestApiError, type ClientRequest } from './requestApi';

export type InboxRequest = ClientRequest & { customer: { name: string; email: string }; waitingFor: 'admin' | 'client'; lastMessageAt: string | null };
export type InboxList = { requests: InboxRequest[]; total: number; page: number; pageSize: number; stats: { total: number; unanswered: number; answered: number } };
export type RequestMessage = { id: string; sequence: number; role: 'admin' | 'client'; body: string; createdAt: string };
export type MessagePage = { messages: RequestMessage[]; hasMore: boolean };
export const requestDate = (date: string) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
export const inboxError = (error: unknown) => error instanceof RequestApiError ? error : new RequestApiError('تعذر الاتصال. أعد المحاولة.', 0);

async function call(path: string, options: RequestInit = {}) {
  let response: Response;
  try { response = await fetch('/api/client/' + path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), ...options }); }
  catch { throw new RequestApiError(options.method === 'POST' ? 'تعذر تأكيد إرسال الرد. أعد المحاولة؛ لن يتكرر الرد عند إعادة الإرسال.' : 'تعذر تحميل البيانات. تحقق من الاتصال وأعد المحاولة.', 0); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new RequestApiError(data?.error || 'تعذر إكمال العملية.', response.status);
  if (!data) throw new RequestApiError('تعذر التحقق من استجابة الخادم.', 0);
  return data;
}
const isMessage = (value: any): value is RequestMessage => !!value && typeof value.id === 'string' && Number.isSafeInteger(value.sequence) && value.sequence > 0 && ['admin', 'client'].includes(value.role) && typeof value.body === 'string' && Number.isFinite(Date.parse(value.createdAt));
const isRequest = (value: any): value is InboxRequest => !!value && typeof value.id === 'string' && ['title', 'description', 'location'].every(key => typeof value[key] === 'string') && Number.isSafeInteger(value.quantity) && typeof value.customer?.name === 'string' && typeof value.customer.email === 'string' && ['admin', 'client'].includes(value.waitingFor) && Number.isFinite(Date.parse(value.createdAt));
export async function loadInbox(page: number, filter: string, query: string): Promise<InboxList> {
  const data = await call('request-inbox?' + new URLSearchParams({ page: String(page), filter, q: query }));
  if (!Array.isArray(data.requests) || !data.requests.every(isRequest) || !Number.isSafeInteger(data.total) || data.total < 0 || data.page !== page || data.pageSize !== 20 || !['total', 'unanswered', 'answered'].every(key => Number.isSafeInteger(data.stats?.[key]) && data.stats[key] >= 0)) throw new RequestApiError('تعذر التحقق من قائمة الطلبات.', 0);
  return data;
}
export async function loadInboxRequest(id: string): Promise<InboxRequest> {
  const data = await call('request-inbox/' + encodeURIComponent(id));
  if (!isRequest(data.request) || data.request.id !== id) throw new RequestApiError('تعذر التحقق من تفاصيل الطلب.', 0);
  return data.request;
}
const threadPath = (id: string, admin: boolean) => (admin ? 'request-inbox/' : 'request-conversations/') + encodeURIComponent(id) + '/messages';
export async function loadMessages(id: string, admin: boolean, cursor?: { before: number } | { after: number }): Promise<MessagePage> {
  const query = cursor ? '?' + new URLSearchParams(Object.entries(cursor).map(([key, value]) => [key, String(value)])) : '';
  const data = await call(threadPath(id, admin) + query);
  if (!Array.isArray(data.messages) || !data.messages.every(isMessage) || typeof data.hasMore !== 'boolean') throw new RequestApiError('تعذر التحقق من الردود.', 0);
  return data;
}
export async function sendMessage(id: string, admin: boolean, body: string, key: string): Promise<RequestMessage> {
  const data = await call(threadPath(id, admin), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ body }) });
  if (!isMessage(data.message)) throw new RequestApiError('تعذر تأكيد إرسال الرد. أعد المحاولة.', 0);
  return data.message;
}
