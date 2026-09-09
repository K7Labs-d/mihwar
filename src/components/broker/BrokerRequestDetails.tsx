import { Check, FileText } from 'lucide-react';
import { brokerStatusLabel, type BrokerRequest } from '../../utils/brokerApi';
import { workValues } from '../../utils/brokerForm';

export function BrokerRequestDetails({ request, message }: { request: BrokerRequest; message?: string }) {
  const data = request.data;
  const status = brokerStatusLabel[request.status];
  return <div className="broker-request-details">
    <div className="panel-title"><FileText size={32} /><h3>طلب تسجيل الوسيط</h3></div>
    {message && <p className="local-note" role="status"><Check size={18} />{message}</p>}
    <p className={`local-note request-status status-${request.status}`} role="status">حالة الطلب: <strong>{status}</strong></p>
    <dl className="review-grid">
      {[
        ['رقم الطلب', request.id], ['تاريخ الإرسال', new Date(request.createdAt).toLocaleString('ar-SA')],
        ['نوع الجهة', data.entity === 'individual' ? 'فرد' : 'شركة / مؤسسة'], ['اسم الوسيط', data.name],
        [data.entity === 'individual' ? 'رقم الهوية / الإقامة' : 'رقم السجل التجاري', data.entity === 'individual' ? data.identity : data.commercial],
        ['رقم الجوال', data.phone], ['البريد الإلكتروني', data.email], ['العنوان', data.address || 'لم يُضف'],
        ['مجالات العمل', workValues(data.domains).join('، ')], ['مناطق العمل', workValues(data.regions).join('، ')],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}
    </dl>
    {request.decidedAt && <p className="muted">تاريخ القرار: {new Date(request.decidedAt).toLocaleString('ar-SA')}</p>}
    {request.status === 'rejected' && request.rejectionReason && <div className="local-note rejection-reason"><div><strong>سبب الرفض</strong><p>{request.rejectionReason}</p></div></div>}
    <p className="muted">{request.status === 'pending' ? 'الطلب محفوظ وقيد المراجعة. إرساله لا يعني اعتماد الوسيط.' : request.status === 'approved' ? 'تم اعتماد طلب تسجيل الوسيط.' : 'تم رفض طلب تسجيل الوسيط. يظل الطلب وقرار المراجعة محفوظين.'}</p>
    <p className="form-footnote">لم تُرفق مستندات؛ رفع المستندات غير متاح حاليًا.</p>
  </div>;
}

