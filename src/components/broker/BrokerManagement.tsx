import { useEffect, useState } from 'react';
import { BrokerRequestPanel } from './BrokerRequestPanel';
import { BrokerReviewPanel } from './BrokerReviewPanel';

export function BrokerManagement({ onBack, onRegister, onClientLogin }: { onBack: () => void; onRegister: () => void; onClientLogin?: () => void }) {
  const [reviewer, setReviewer] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setReviewer(null); setError('');
    fetch('/api/client/me', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) })
      .then(async response => {
        if (response.status === 401) { if (active) setReviewer(false); return; }
        if (!response.ok) throw new Error('تعذر التحقق من الحساب.');
        const data = await response.json();
        if (active) setReviewer(data.user?.permissions?.reviewBrokers === true);
      }).catch(() => { if (active) setError('تعذر تحميل بيانات الحساب. تحقق من الاتصال وأعد المحاولة.'); });
    return () => { active = false; };
  }, [attempt]);
  if (error) return <div className="empty-state"><p role="alert">{error}</p><button className="quiet-button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button><button className="text-button" onClick={onBack}>العودة إلى الوسيط</button></div>;
  if (reviewer === null) return <p className="empty-state" role="status">جارٍ التحقق من صلاحية الحساب…</p>;
  return reviewer ? <BrokerReviewPanel onBack={onBack} onClientLogin={onClientLogin} /> : <><h3 className="review-title">طلب الوسيط الخاص بي</h3><BrokerRequestPanel onBack={onBack} onRegister={onRegister} onClientLogin={onClientLogin} /></>;
}
