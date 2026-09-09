import type { BrokerRequest } from './brokerApi';

export type ReviewRequest = BrokerRequest & { owner: { id: string; name: string; email: string }; decidedBy: { id: string; name: string | null } | null };
export type ReviewDetail = { request: ReviewRequest; canDecide: boolean };
export type ReviewPage = { requests: { id: string; status: BrokerRequest['status']; name: string; createdAt: string }[]; page: number; pageSize: number; total: number };
export class ReviewApiError extends Error {
  status: number;
  current?: ReviewDetail;
  constructor(message: string, status: number, current?: ReviewDetail) { super(message); this.status = status; this.current = current; }
}
async function reviewFetch<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/client/broker-review' + path, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
  } catch { throw new ReviewApiError(body ? 'تعذر تأكيد حفظ القرار. حدّث تفاصيل الطلب للتحقق من حالته قبل المحاولة مجددًا.' : 'تعذر تحميل الطلبات. تحقق من الاتصال وأعد المحاولة.', 0); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ReviewApiError(data?.error || 'تعذر إكمال العملية.', response.status, data?.request ? { request: data.request, canDecide: data.canDecide === true } : undefined);
  if (!data) throw new ReviewApiError('تعذر قراءة نتيجة الخادم. حدّث الطلب للتحقق من حالته.', 0);
  return data;
}
export const loadReviewPage = (status: string, page: number) => reviewFetch<ReviewPage>(`/requests?status=${encodeURIComponent(status)}&page=${page}`);
export const loadReviewDetail = (id: string) => reviewFetch<ReviewDetail>('/requests/' + encodeURIComponent(id));
export const saveReviewDecision = (id: string, status: 'approved' | 'rejected', reason: string) => reviewFetch<ReviewDetail>('/requests/' + encodeURIComponent(id) + '/decision', status === 'rejected' ? { status, reason } : { status });
