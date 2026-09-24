import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FileText, RefreshCw, X } from 'lucide-react';
import { BrokerRequestDetails } from './BrokerRequestDetails';
import { brokerStatusLabel } from '../../utils/brokerApi';
import { loadReviewPage, loadReviewDetail, saveReviewDecision, ReviewApiError, type ReviewDetail, type ReviewPage } from '../../utils/brokerReviewApi';

export function BrokerReviewPanel({ onBack, onClientLogin }: { onBack: () => void; onClientLogin?: () => void }) {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [listing, setListing] = useState<ReviewPage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReviewApiError | null>(null);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [revision, setRevision] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const submitting = useRef(false);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let current = true;
    setLoading(true); setError(null); setMessage(''); setDetail(null); setListing(null); setReason(''); setUncertain(false);
    (selected ? loadReviewDetail(selected).then(value => { if (current) setDetail(value); }) : loadReviewPage(status, page).then(value => { if (current) setListing(value); }))
      .catch(value => { if (current) setError(value); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selected, status, page, revision]);
  useEffect(() => { if (!loading) heading.current?.focus({ preventScroll: true }); }, [loading]);
  const decide = async (decision: 'approved' | 'rejected') => {
    if (!detail?.canDecide || submitting.current || uncertain) return;
    if (decision === 'rejected' && (reason.trim().length < 3 || reason.trim().length > 1000)) {
      setError(new ReviewApiError('أدخل سبب رفض واضحًا من 3 إلى 1000 حرف.', 400)); reasonInput.current?.focus(); return;
    }
    submitting.current = true; setBusy(true); setError(null); setMessage('');
    try {
      const saved = await saveReviewDecision(detail.request.id, decision, reason.trim());
      setDetail(saved); setMessage(decision === 'approved' ? 'تم اعتماد الطلب وحفظ القرار.' : 'تم رفض الطلب وحفظ السبب والقرار.'); setReason('');
    } catch (value) {
      const failure = value instanceof ReviewApiError ? value : new ReviewApiError('تعذر تأكيد حفظ القرار. حدّث الطلب للتحقق من حالته.', 0);
      setError(failure);
      if (failure.current) setDetail(failure.current);
      if (failure.status === 401 || failure.status === 403) { setDetail(null); setListing(null); }
      if (failure.status === 0) setUncertain(true);
    } finally { submitting.current = false; setBusy(false); }
  };
  return <div className="broker-review" aria-busy={loading || busy}>
    <div className="review-title"><h3 ref={heading} tabIndex={-1}>{selected ? 'مراجعة طلب المؤجر' : 'مراجعة جميع طلبات المؤجرين'}</h3><button className="quiet-button" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} /> تحديث</button></div>
    {!selected && <div className="form-field review-filter"><label htmlFor="review-status">حالة الطلبات</label><select id="review-status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">جميع الحالات</option>{Object.entries(brokerStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
    {error && <div className="local-note" role="alert">{error.message}{error.status === 401 && <button className="text-button" onClick={onClientLogin}>تسجيل الدخول</button>}</div>}
    {loading ? <div className="empty-state" role="status">جارٍ تحميل الطلبات…</div>
      : selected && detail ? <>
        <BrokerRequestDetails request={detail.request} message={message} />
        <dl className="review-grid review-account"><div><dt>صاحب الحساب</dt><dd>{detail.request.owner.name}</dd></div><div><dt>بريد الحساب</dt><dd dir="auto">{detail.request.owner.email}</dd></div>{detail.request.decidedBy && <div><dt>اتخذ القرار</dt><dd>{detail.request.decidedBy.name || detail.request.decidedBy.id}</dd></div>}</dl>
        {detail.canDecide ? <fieldset className="broker-fieldset review-decision" disabled={busy || uncertain}>
          <div className="form-field"><label htmlFor="rejection-reason">سبب الرفض (مطلوب عند الرفض)</label><textarea id="rejection-reason" ref={reasonInput} rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></div>
          <p className="form-footnote">بعد حفظ القرار لا يمكن تغييره من هذه اللوحة.</p>
          <div className="registration-controls"><button className="gold-button" onClick={() => decide('approved')}><Check size={18} /> اعتماد الطلب</button><button className="quiet-button reject-button" onClick={() => decide('rejected')}><X size={18} /> رفض الطلب</button></div>
        </fieldset> : detail.request.status === 'pending' && <p className="local-note">لا يمكنك مراجعة طلبك الشخصي.</p>}
        {busy && <p className="muted" role="status">جارٍ حفظ القرار…</p>}
      </>
      : !selected && listing && <>
        <p className="muted" role="status">عدد الطلبات: {listing.total}</p>
        {listing.requests.length ? <div className="branch-actions review-request-list">{listing.requests.map(request => <button key={request.id} className="branch-action" onClick={() => setSelected(request.id)}><FileText size={24} /><span className="action-copy"><strong>{request.name}</strong><small>{new Date(request.createdAt).toLocaleString('ar-SA')}</small></span><span className={`request-badge status-${request.status}`}>{brokerStatusLabel[request.status]}</span></button>)}</div> : <div className="empty-state"><FileText size={36} /><p>لا توجد طلبات بهذه الحالة.</p></div>}
        {listing.total > listing.pageSize && <div className="registration-controls"><button className="quiet-button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>السابق</button><span className="muted">صفحة {page} من {Math.ceil(listing.total / listing.pageSize)}</span><button className="quiet-button" disabled={page * listing.pageSize >= listing.total} onClick={() => setPage(value => value + 1)}>التالي</button></div>}
      </>}
    <button className="quiet-button review-back" disabled={busy} onClick={() => selected ? setSelected(null) : onBack()}><ArrowRight size={17} />{selected ? 'العودة إلى قائمة الطلبات' : 'العودة إلى وظائف المؤجر'}</button>
  </div>;
}
