import { useEffect, useRef, useState } from 'react';
import { MessageSquare, RefreshCw, Send } from 'lucide-react';
import { inboxError, loadMessages, requestDate, sendMessage, type RequestMessage } from '../../utils/requestInboxApi';
import { applyConversationMessages } from '../../utils/conversationMessages';
import type { RequestApiError } from '../../utils/requestApi';
import './request-inbox.css';

export function RequestConversation({ requestId, admin = false, onAccessLost }: { requestId: string; admin?: boolean; onAccessLost?: (error: RequestApiError) => void }) {
  const [messages, setMessages] = useState<RequestMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [earlier, setEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [error, setError] = useState<RequestApiError | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  const submission = useRef<{ body: string; key: string } | null>(null);
  const alive = useRef(true);
  const latest = useRef(0);
  const accessLost = useRef(onAccessLost);
  accessLost.current = onAccessLost;
  function report(failure: unknown) {
    const issue = inboxError(failure); setError(issue);
    if ([401, 403, 404].includes(issue.status)) {
      setMessages([]); setDraft(''); latest.current = 0; accessLost.current?.(issue);
    }
  }
  const locked = !!error && [401, 403, 404].includes(error.status);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    let active = true, fetching = false;
    async function refresh(initial = false) {
      if (fetching || (!initial && document.hidden)) return;
      fetching = true;
      try {
        const data = await loadMessages(requestId, admin, !initial && latest.current ? { after: latest.current } : undefined);
        if (!active) return;
        setError(null);
        setMessages(current => applyConversationMessages(current, data.messages, initial));
        if (initial || !latest.current) setEarlier(data.hasMore);
        latest.current = Math.max(latest.current, ...data.messages.map(item => item.sequence));
      } catch (failure) {
        if (!active) return;
        report(failure);
      } finally { fetching = false; if (active) setLoading(false); }
    }
    setLoading(true); latest.current = 0; setMessages([]); setEarlier(false);
    void refresh(true);
    const timer = setInterval(() => void refresh(), 15000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [requestId, admin, attempt]);

  async function older() {
    if (loadingEarlier || !messages.length) return;
    setLoadingEarlier(true);
    try {
      const data = await loadMessages(requestId, admin, { before: messages[0].sequence });
      if (!alive.current) return;
      setMessages(current => Array.from(new Map([...data.messages, ...current].map(item => [item.id, item])).values()).sort((a, b) => a.sequence - b.sequence));
      setEarlier(data.hasMore); setError(null);
    } catch (failure) { if (alive.current) report(failure); }
    finally { if (alive.current) setLoadingEarlier(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !draft.trim()) return;
    const body = draft.trim();
    if (body.length > 2000) return;
    if (submission.current?.body !== body) submission.current = { body, key: crypto.randomUUID() };
    pending.current = true; setSending(true); setError(null); setNotice('');
    try {
      const message = await sendMessage(requestId, admin, body, submission.current.key);
      if (!alive.current) return;
      // Don't move the polling cursor here: another party may have replied before this message.
      setMessages(current => applyConversationMessages(current, [message]));
      setDraft(''); submission.current = null;
      setNotice(admin ? 'تم إرسال الرد وحفظه. يظهر الآن للعميل داخل طلبه.' : 'تم إرسال رسالتك إلى إدارة محور.');
    } catch (failure) { if (alive.current) report(failure); }
    finally { pending.current = false; if (alive.current) setSending(false); }
  }
  return <section className="request-conversation" aria-label="الردود والمتابعة">
    <div className="section-summary"><h3><MessageSquare size={20} /> الردود والمتابعة</h3><button type="button" className="quiet-button" disabled={loading || sending} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15} /> تحديث الردود</button></div>
    <p className="muted">{admin ? 'ردودك تصل للعميل داخل هذا الطلب.' : 'تواصل مع إدارة محور وتابع ردودها هنا.'} تُحدّث المحادثة تلقائيًا أثناء فتحها.</p>
    {error && <div className="request-error" role="alert"><p>{error.message}</p>{error.status === 401 && <a className="quiet-button" href="#client">تسجيل الدخول</a>}{!locked && <button className="text-button" onClick={() => setAttempt(value => value + 1)}>إعادة تحميل الردود</button>}</div>}
    {loading ? <p role="status" className="muted">جارٍ تحميل الردود…</p> : !locked && <>
      {earlier && <button className="quiet-button" disabled={loadingEarlier} onClick={older}>{loadingEarlier ? 'جارٍ التحميل…' : 'عرض رسائل أقدم'}</button>}
      {!messages.length ? <div className="conversation-empty"><MessageSquare size={28} /><p>لا توجد ردود بعد.</p></div> : <ol className="conversation-messages" aria-label="سجل الرسائل">{messages.map(message => <li key={message.id} className={'conversation-message from-' + message.role}>
        <div className="message-meta"><strong>{message.role === 'admin' ? 'إدارة محور' : 'العميل'}</strong><time dateTime={message.createdAt}>{requestDate(message.createdAt)}</time></div><p>{message.body}</p>
      </li>)}</ol>}
    </>}
    {notice && <p className="request-success" role="status">{notice}</p>}
    <form onSubmit={submit} className="conversation-form">
      <label htmlFor={'reply-' + requestId}>{admin ? 'رد الإدارة على العميل' : 'رسالتك إلى الإدارة'}</label>
      <textarea id={'reply-' + requestId} required maxLength={2000} rows={4} value={draft} disabled={sending || locked || loading} onChange={event => { setDraft(event.target.value); setNotice(''); }} placeholder={admin ? 'اكتب ردًا واضحًا بشأن الطلب…' : 'أضف توضيحًا أو اسأل عن طلبك…'} />
      <div className="reply-footer"><span className="muted">{draft.length} / 2000</span><button className="gold-button" disabled={sending || locked || loading || !draft.trim()} type="submit"><Send size={16} />{sending ? 'جارٍ الإرسال…' : 'إرسال الرد'}</button></div>
    </form>
  </section>;
}
