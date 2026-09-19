import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, Inbox, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { inboxError, loadInbox, loadInboxRequest, requestDate, type InboxList, type InboxRequest } from '../../utils/requestInboxApi';
import type { RequestApiError } from '../../utils/requestApi';
import { RequestConversation } from './RequestConversation';
import './request-inbox.css';

function AccessError({ error, retry }: { error: RequestApiError; retry: () => void }) {
  return <div className="empty-state"><ShieldCheck size={36} /><p role="alert">{error.message}</p>{error.status === 401 ? <a className="gold-button" href="#client">تسجيل الدخول</a> : error.status === 403 ? <a className="quiet-button" href="#client">الانتقال إلى حسابي</a> : <button className="quiet-button" onClick={retry}>إعادة المحاولة</button>}</div>;
}

function RequestDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [request, setRequest] = useState<InboxRequest | null>(null);
  const [error, setError] = useState<RequestApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setRequest(null); setError(null);
    loadInboxRequest(id).then(value => { if (active) setRequest(value); }).catch(failure => { if (active) setError(inboxError(failure)); });
    return () => { active = false; };
  }, [id, attempt]);
  return <>
    <button className="text-button request-back" onClick={onBack}><ArrowRight size={17} /> العودة إلى صندوق الطلبات</button>
    {error ? <AccessError error={error} retry={() => setAttempt(value => value + 1)} /> : !request ? <p role="status" className="muted">جارٍ تحميل تفاصيل الطلب…</p> : <>
      <section className="inbox-detail-card"><p className="eyebrow">تفاصيل الطلب</p><h2>{request.title}</h2>
        <dl className="review-grid">
          <div><dt>العميل</dt><dd>{request.customer.name}</dd></div><div><dt>بريد الحساب</dt><dd dir="ltr" className="inbox-email">{request.customer.email}</dd></div>
          <div><dt>الموقع</dt><dd>{request.location}</dd></div><div><dt>الكمية</dt><dd>{request.quantity}</dd></div>
          <div className="full-field"><dt>وصف الاحتياج</dt><dd className="request-description">{request.description}</dd></div>
          <div><dt>تاريخ الاستلام</dt><dd>{requestDate(request.createdAt)}</dd></div><div><dt>معرّف الطلب</dt><dd dir="ltr" className="request-id">{request.id}</dd></div>
        </dl>
      </section>
      <RequestConversation key={id} requestId={id} admin onAccessLost={issue => { setError(issue); setRequest(null); }} />
    </>}
  </>;
}

export function AdminRequests() {
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [list, setList] = useState<InboxList | null>(null);
  const [error, setError] = useState<RequestApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (selected) return;
    let active = true, pending = false;
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try { const data = await loadInbox(page, filter, query); if (active) { setList(data); setError(null); } }
      catch (failure) { if (active) { setError(inboxError(failure)); setList(null); } }
      finally { pending = false; if (active) setLoading(false); }
    }
    setLoading(true); setList(null); setError(null); void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    const focus = () => void refresh(); window.addEventListener('focus', focus);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [selected, page, filter, query, attempt]);

  return <div className="admin-requests">
    <div className="inbox-heading"><div><p className="eyebrow"><ShieldCheck size={15} /> إدارة محور</p><h1>صندوق الطلبات</h1><p className="muted">استقبل احتياج العميل وتابع المحادثة معه في مكان واحد.</p></div>{!selected && <button className="quiet-button" disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} /> تحديث الطلبات</button>}</div>
    {selected ? <RequestDetail key={selected} id={selected} onBack={() => setSelected(null)} /> : <>
      {list && <div className="inbox-stats" aria-label="ملخص الطلبات"><div><span>كل الطلبات</span><strong>{list.stats.total}</strong></div><div><span>بانتظار رد الإدارة</span><strong>{list.stats.unanswered}</strong></div><div><span>تم رد الإدارة</span><strong>{list.stats.answered}</strong></div></div>}
      <form className="inbox-filters" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setPage(1); setAttempt(value => value + 1); }}>
        <div className="inbox-search"><label htmlFor="inbox-search">البحث في الطلبات</label><div><input id="inbox-search" type="search" maxLength={120} placeholder="عنوان الطلب، العميل، الموقع أو المعرّف" value={search} onChange={event => setSearch(event.target.value)} /><button className="quiet-button" type="submit"><Search size={17} /> بحث</button></div></div>
        <div><label htmlFor="inbox-filter">حالة المتابعة</label><select id="inbox-filter" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="all">كل الطلبات</option><option value="unanswered">بانتظار رد الإدارة</option><option value="answered">تم رد الإدارة</option></select></div>
      </form>
      {loading ? <div className="empty-state" role="status"><Inbox size={36} /><p>جارٍ تحميل الطلبات…</p></div> : error ? <AccessError error={error} retry={() => setAttempt(value => value + 1)} /> : list && <>
        <div className="inbox-results"><p className="muted">{list.total} طلب مطابق</p><span className="muted">تحديث تلقائي كل 15 ثانية</span></div>
        {!list.requests.length ? <div className="empty-state"><Inbox size={40} /><h2>{query || filter !== 'all' ? 'لا توجد طلبات مطابقة' : 'لا توجد طلبات في هذه الصفحة'}</h2><p className="muted">{query || filter !== 'all' ? 'جرّب تغيير البحث أو حالة المتابعة.' : 'ستظهر طلبات العملاء هنا بعد إرسالها.'}</p></div> : <div className="inbox-list">{list.requests.map(request => <button className="inbox-item" key={request.id} onClick={() => setSelected(request.id)} aria-label={'فتح الطلب: ' + request.title}>
          <div className="inbox-item-copy"><strong>{request.title}</strong><span>{request.customer.name} · {request.location} · الكمية {request.quantity}</span><time dateTime={request.lastMessageAt ?? request.createdAt}>{requestDate(request.lastMessageAt ?? request.createdAt)}</time></div>
          <span className={'inbox-badge ' + (request.waitingFor === 'admin' ? 'needs-reply' : '')}>{request.waitingFor === 'admin' ? 'بانتظار رد الإدارة' : 'تم رد الإدارة'}</span><ChevronLeft size={18} />
        </button>)}</div>}
        {(list.total > 20 || page > 1) && <nav className="request-pagination" aria-label="صفحات صندوق الطلبات"><button className="quiet-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>السابق</button><span>الصفحة {page}</span><button className="quiet-button" disabled={page * 20 >= list.total} onClick={() => setPage(value => value + 1)}>التالي</button></nav>}
      </>}
    </>}
  </div>;
}
