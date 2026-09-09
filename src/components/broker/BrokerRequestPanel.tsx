import { useEffect, useState } from 'react';
import { FileText, Info } from 'lucide-react';
import { BrokerRegistration } from './BrokerRegistration';
import { BrokerApiError, brokerRequestApi, type BrokerRequest } from '../../utils/brokerApi';
import { BrokerRequestDetails } from './BrokerRequestDetails';

export function BrokerRequestPanel({ registration = false, onBack, onRegister, onClientLogin }: { registration?: boolean; onBack: () => void; onRegister?: () => void; onClientLogin?: () => void }) {
  const [request, setRequest] = useState<BrokerRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<BrokerApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [resubmitting, setResubmitting] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true); setError(null);
    brokerRequestApi().then(value => { if (current) setRequest(value); }).catch(value => { if (current) setError(value); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [attempt]);
  if (!loading && !error && registration && (!request || (request.status === 'rejected' && resubmitting))) return <BrokerRegistration onBack={onBack} onClientLogin={onClientLogin} />;
  return <section className={registration ? 'branch-panel registration-panel' : ''} data-branch-panel>
    {loading ? <div className="empty-state" role="status"><FileText size={32} /><p>جارٍ تحميل طلب الوسيط…</p></div>
      : error ? <div className="empty-state"><Info size={32} /><p role="alert">{error.message}</p>{error.status === 401 ? <button className="gold-button" onClick={onClientLogin}>تسجيل دخول العميل</button> : <button className="gold-button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button>}</div>
      : request ? <BrokerRequestDetails request={request} />
      : <div className="empty-state"><FileText size={40} /><h3>لا يوجد طلب وسيط في حسابك</h3><p className="muted">سيظهر طلبك هنا بعد إرساله.</p><button className="gold-button" onClick={onRegister}>تسجيل وسيط جديد</button></div>}
    {!loading && !error && registration && request?.status === 'rejected' && <button className="gold-button" onClick={() => setResubmitting(true)}>تقديم طلب جديد</button>}
    <button className="quiet-button" onClick={onBack}>العودة إلى وظائف الوسيط</button>
  </section>;
}
