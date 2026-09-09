import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, FileText, Plus, RefreshCw } from 'lucide-react';
import { loadRequest, loadRequests, saveRequest, RequestApiError, type ClientRequest, type RequestList } from '../../utils/requestApi';
import { requestLimits, validateRequest, type RequestDraft, type RequestErrors } from '../../utils/requestForm';

const dateLabel = (date: string) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
const failure = (error: unknown) => error instanceof RequestApiError ? error : new RequestApiError('تعذر إكمال الطلب. أعد المحاولة.', 0);

function RequestForm({ onSaved, onBack, onClientLogin }: { onSaved: (request: ClientRequest) => void; onBack: () => void; onClientLogin: () => void }) {
  const [draft, setDraft] = useState({ title: '', description: '', location: '', quantity: '1' });
  const [errors, setErrors] = useState<RequestErrors>({});
  const [error, setError] = useState<RequestApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const submission = useRef<{ data: string; key: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setError(null);
    const checked = validateRequest({ ...draft, quantity: Number(draft.quantity) });
    setErrors(checked.fieldErrors);
    if (!checked.data) {
      setError(new RequestApiError(checked.error!, 400, checked.fieldErrors));
      form.current?.querySelector<HTMLElement>('[name="' + Object.keys(checked.fieldErrors)[0] + '"]')?.focus();
      return;
    }
    const data = JSON.stringify(checked.data);
    // Keep the same key for an unchanged retry, including an ambiguous network failure.
    if (submission.current?.data !== data) submission.current = { data, key: crypto.randomUUID() };
    pending.current = true; setBusy(true);
    try { onSaved(await saveRequest(checked.data, submission.current.key)); }
    catch (error) { const current = failure(error); setError(current); setErrors(current.fieldErrors); }
    finally { pending.current = false; setBusy(false); }
  }
  const update = (key: keyof RequestDraft, value: string) => { setDraft(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined })); };
  return <form ref={form} onSubmit={submit} noValidate className="request-form">
    <div className="section-summary"><h3 ref={heading} tabIndex={-1}>إنشاء طلب جديد</h3><button type="button" className="text-button" onClick={onBack} disabled={busy}><ArrowRight size={16} /> العودة إلى طلباتي</button></div>
    <p className="muted request-intro">صف احتياجك وحدد موقعه والكمية المطلوبة.</p>
    {error && <div className="request-error" role="alert"><p>{error.message}</p>{error.status === 401 && <button type="button" className="quiet-button" onClick={onClientLogin}>تسجيل دخول العميل</button>}</div>}
    <fieldset disabled={busy} className="broker-fields form-surface">
      <div className="form-field full-field"><label htmlFor="request-title">عنوان الطلب <span className="required-mark">*</span></label><input id="request-title" name="title" value={draft.title} onChange={event => update('title', event.target.value)} required minLength={3} maxLength={requestLimits.title} aria-invalid={!!errors.title} aria-describedby="request-title-error" /><p id="request-title-error" className="field-error">{errors.title}</p></div>
      <div className="form-field full-field"><label htmlFor="request-description">وصف الاحتياج <span className="required-mark">*</span></label><p className="field-hint" id="request-description-help">اذكر ما تحتاجه والمواصفات المهمة، وأي مدة أو موعد مطلوب.</p><textarea id="request-description" name="description" rows={5} value={draft.description} onChange={event => update('description', event.target.value)} required minLength={10} maxLength={requestLimits.description} aria-invalid={!!errors.description} aria-describedby="request-description-help request-description-error" /><p id="request-description-error" className="field-error">{errors.description}</p></div>
      <div className="form-field"><label htmlFor="request-location">موقع الاحتياج <span className="required-mark">*</span></label><input id="request-location" name="location" value={draft.location} onChange={event => update('location', event.target.value)} required minLength={2} maxLength={requestLimits.location} aria-invalid={!!errors.location} aria-describedby="request-location-error" /><p id="request-location-error" className="field-error">{errors.location}</p></div>
      <div className="form-field"><label htmlFor="request-quantity">الكمية <span className="required-mark">*</span></label><input id="request-quantity" name="quantity" type="number" inputMode="numeric" min={1} max={requestLimits.quantity} step={1} value={draft.quantity} onChange={event => update('quantity', event.target.value)} required aria-invalid={!!errors.quantity} aria-describedby="request-quantity-error" /><p id="request-quantity-error" className="field-error">{errors.quantity}</p></div>
      <button className="gold-button full-field" type="submit">{busy ? 'جارٍ حفظ الطلب…' : 'حفظ الطلب'}</button>
    </fieldset>
    <p className="muted request-intro">تُحفظ بيانات الطلب بعد نجاح الإرسال فقط. المسودة غير المرسلة لا تبقى بعد مغادرة الصفحة.</p>
  </form>;
}

export function ClientRequests({ onClientLogin }: { onClientLogin: () => void }) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<RequestList | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [request, setRequest] = useState<ClientRequest | null>(null);
  const [error, setError] = useState<RequestApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [success, setSuccess] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (view === 'create') return;
    let active = true;
    setLoading(true); setError(null); setList(null); setRequest(null);
    const operation = view === 'detail' && selectedId ? loadRequest(selectedId).then(value => { if (active) setRequest(value); }) : loadRequests(page).then(value => { if (active) setList(value); });
    operation.catch(error => { if (active) setError(failure(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [view, selectedId, page, attempt]);
  useEffect(() => { if (!loading) heading.current?.focus({ preventScroll: true }); }, [loading, view]);
  const back = () => { setSuccess(''); setView('list'); setSelectedId(null); };
  const create = () => { setSuccess(''); setView('create'); };
  if (view === 'create') return <RequestForm onSaved={saved => { setSuccess('تم حفظ طلبك بنجاح.'); setSelectedId(saved.id); setView('detail'); }} onBack={back} onClientLogin={onClientLogin} />;
  return <section className="client-requests" aria-label="طلبات الحساب">
    <div className="section-summary"><h3 ref={heading} tabIndex={-1}>{view === 'detail' ? 'تفاصيل الطلب' : 'طلباتك'}</h3><button className="quiet-button" disabled={loading} onClick={() => { setSuccess(''); setAttempt(value => value + 1); }}><RefreshCw size={16} /> تحديث</button></div>
    {success && <p className="request-success" role="status">{success}</p>}
    {loading ? <div className="empty-state" role="status"><FileText size={38} /><p>جارٍ تحميل {view === 'detail' ? 'تفاصيل الطلب' : 'طلباتك'}…</p></div>
      : error ? <div className="empty-state"><FileText size={38} /><p role="alert">{error.message}</p>{error.status === 401 ? <button className="gold-button" onClick={onClientLogin}>تسجيل دخول العميل</button> : <button className="quiet-button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button>}</div>
      : request ? <div className="request-details">
        <div className="request-title-row"><h3>{request.title}</h3><span className="request-status">مفتوح</span></div>
        <dl className="review-grid">
          <div className="full-field"><dt>معرّف الطلب</dt><dd className="request-id" dir="ltr">{request.id}</dd></div>
          <div className="full-field"><dt>وصف الاحتياج</dt><dd className="request-description">{request.description}</dd></div>
          <div><dt>موقع الاحتياج</dt><dd>{request.location}</dd></div><div><dt>الكمية</dt><dd>{request.quantity}</dd></div>
          <div><dt>تاريخ الإنشاء</dt><dd><time dateTime={request.createdAt}>{dateLabel(request.createdAt)}</time></dd></div><div><dt>آخر تحديث</dt><dd><time dateTime={request.updatedAt}>{dateLabel(request.updatedAt)}</time></dd></div>
        </dl>
      </div> : list && <>
        {list.requests.length === 0 ? <div className="empty-state"><FileText size={38} /><h3>{list.total ? 'لا توجد طلبات في هذه الصفحة' : 'لا توجد طلبات للعرض بعد'}</h3><p className="muted">{list.total ? 'ارجع إلى الصفحة السابقة لعرض طلباتك.' : 'ابدأ بتحديد احتياجك. ستجد طلباتك وحالتها هنا بعد حفظها.'}</p><button className="gold-button" onClick={create}><Plus size={18} />{list.total ? 'إنشاء طلب جديد' : 'إنشاء أول طلب'}</button></div>
          : <><div className="request-list-controls"><p className="muted">طلباتك المحفوظة: {list.total}</p><button className="gold-button" onClick={create}><Plus size={18} /> إنشاء طلب جديد</button></div><div className="branch-actions">{list.requests.map(item => <button key={item.id} className="branch-action request-list-item" onClick={() => { setSuccess(''); setSelectedId(item.id); setView('detail'); }} aria-label={'فتح تفاصيل الطلب: ' + item.title}><span className="action-icon"><FileText size={24} /></span><span className="action-copy"><strong>{item.title}</strong><small>{item.location} · الكمية: {item.quantity}</small><small><time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time></small></span><span className="request-status">مفتوح</span><ChevronLeft size={18} /></button>)}</div></>}
        {(list.total > list.pageSize || page > 1) && <nav className="request-pagination" aria-label="صفحات الطلبات"><button className="quiet-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>السابق</button><span className="muted">الصفحة {page}</span><button className="quiet-button" disabled={page * list.pageSize >= list.total} onClick={() => setPage(value => value + 1)}>التالي</button></nav>}
      </>}
    {view === 'detail' && <button className="text-button request-back" onClick={back}><ArrowRight size={17} /> العودة إلى طلباتي</button>}
  </section>;
}
