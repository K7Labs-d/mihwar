import type { BrokerDraft, BrokerErrors } from './brokerForm';

export type BrokerRequest = { id: string; status: 'pending' | 'approved' | 'rejected'; createdAt: string; data: BrokerDraft; decidedAt: string | null; rejectionReason: string | null };
export const brokerStatusLabel = { pending: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض' };
export class BrokerApiError extends Error {
  status: number;
  fieldErrors?: BrokerErrors;
  request?: BrokerRequest;
  constructor(message: string, status: number, fieldErrors?: BrokerErrors, request?: BrokerRequest) {
    super(message); this.status = status; this.fieldErrors = fieldErrors; this.request = request;
  }
}
export async function brokerRequestApi(draft?: BrokerDraft): Promise<BrokerRequest | null> {
  let response: Response;
  try {
    response = await fetch('/api/client/broker-requests', {
      method: draft ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      ...(draft ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new BrokerApiError(draft ? 'تعذر تأكيد الحفظ بسبب الاتصال. أعد المحاولة؛ لن يُنشأ طلب مكرر إذا كان قد حُفظ.' : 'تعذر تحميل طلبك. تحقق من الاتصال وأعد المحاولة.', 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new BrokerApiError(data?.error || 'تعذر إكمال الطلب. أعد المحاولة.', response.status, data?.fieldErrors, data?.request);
  if (!data || !Object.hasOwn(data, 'request') || (draft && !data.request?.id)) throw new BrokerApiError('تعذر تأكيد بيانات الطلب من الخادم. أعد المحاولة.', 0);
  return data.request;
}
