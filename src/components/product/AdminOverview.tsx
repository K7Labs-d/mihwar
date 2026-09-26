import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ClipboardList, Construction, Handshake, ShieldCheck, UsersRound, Wallet } from 'lucide-react';
import { getPage, pageHref, type Page } from '../../data/productPages';

type Permissions = { reviewBrokers: boolean; manageRequests: boolean };
type Access = { status: 'loading' | 'anonymous' | 'denied' | 'error' } | { status: 'ready'; permissions: Permissions };
const futureSections = {
  'admin-equipment': { icon: Construction, description: 'أدوات الإشراف على معدات المؤجرين قيد الإكمال. لا توجد إجراءات إدارية متاحة في هذه الصفحة بعد.' },
  'admin-transactions': { icon: Handshake, description: 'متابعة معاملات التأجير قيد الإكمال، وسترتبط بالحجوزات عند تفعيل دورتها.' },
  'admin-payments': { icon: Wallet, description: 'متابعة المدفوعات والمستحقات قيد الإكمال. لا توجد عمليات تحصيل أو تسوية متاحة هنا بعد.' },
  'admin-disputes': { icon: ShieldCheck, description: 'استقبال النزاعات ومتابعتها قيد الإكمال. لا تتوفر إجراءات لفتح نزاع أو حسمه في هذه الصفحة بعد.' },
} as const;

export function AdminOverview({ page }: { page: Page }) {
  const [access, setAccess] = useState<Access>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    setAccess({ status: 'loading' });
    fetch('/api/client/me', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (response.status === 401) { if (active) setAccess({ status: 'anonymous' }); return; }
        if (!response.ok) throw new Error('Could not verify account.');
        const data = await response.json();
        if (typeof data?.user?.id !== 'string' || !data.user.id) throw new Error('Invalid account response.');
        const permissions = { reviewBrokers: data.user.permissions?.reviewBrokers === true, manageRequests: data.user.permissions?.manageRequests === true };
        if (active) setAccess(permissions.reviewBrokers || permissions.manageRequests ? { status: 'ready', permissions } : { status: 'denied' });
      })
      .catch(() => { if (active) setAccess({ status: 'error' }); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt, page]);

  const definition = getPage(page);
  const section = Object.hasOwn(futureSections, page) ? futureSections[page as keyof typeof futureSections] : null;
  const Icon = section?.icon ?? ShieldCheck;
  const realDestinations = access.status === 'ready' ? [
    ...(access.permissions.manageRequests ? [{ page: 'admin-requests' as const, icon: ClipboardList, description: 'استقبال طلبات العملاء وقراءة المحادثات والرد عليها.' }] : []),
    ...(access.permissions.reviewBrokers ? [{ page: 'broker-management' as const, icon: UsersRound, description: 'مراجعة طلبات اعتماد المؤجرين واتخاذ القرار.' }] : []),
  ] : [];

  return <section className="product-page" dir="rtl">
    <nav className="related-pages" aria-label="العودة من الإدارة">
      <a className="quiet-button" href={pageHref(page === 'admin' ? 'client' : 'admin')}><ArrowRight size={17} aria-hidden="true" />{page === 'admin' ? 'العودة إلى حسابي' : 'العودة إلى الإدارة'}</a>
      <a className="quiet-button" href={pageHref('')}>العودة إلى محور</a>
    </nav>
    <header className="product-page-header">
      <p className="eyebrow">الإدارة والتشغيل</p>
      <h1>{definition.title}</h1>
      <p className="muted">{definition.description}</p>
    </header>
    <div className="product-surface">
      {access.status === 'loading' && <p className="empty-state" role="status">جارٍ التحقق من صلاحيات الحساب…</p>}
      {access.status === 'error' && <div className="empty-state"><ShieldCheck size={36} aria-hidden="true" /><h2>تعذر التحقق من الحساب</h2><p className="muted" role="alert">تحقق من الاتصال ثم أعد المحاولة.</p><button type="button" className="quiet-button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div>}
      {access.status === 'anonymous' && <div className="empty-state"><ShieldCheck size={36} aria-hidden="true" /><h2>سجّل الدخول للمتابعة</h2><p className="muted">الدخول إلى الإدارة متاح للحسابات التي تملك صلاحية مراجعة المؤجرين أو إدارة الطلبات.</p><a className="gold-button" href={pageHref('client')}>تسجيل الدخول</a></div>}
      {access.status === 'denied' && <div className="empty-state"><ShieldCheck size={36} aria-hidden="true" /><h2>الإدارة غير متاحة لهذا الحساب</h2><p className="muted">حسابك لا يملك صلاحية مراجعة المؤجرين أو إدارة الطلبات.</p><a className="quiet-button" href={pageHref('client')}>العودة إلى حسابي</a></div>}
      {access.status === 'ready' && <>
        {section ? <div className="empty-state"><Icon size={38} aria-hidden="true" /><span className="feature-status">الميزة قيد الإكمال</span><h2>{definition.title} قيد الإكمال</h2><p className="muted">{section.description}</p></div> : <>
          <div className="section-summary"><h2>الأعمال المتاحة لحسابك</h2></div>
          <nav className="branch-actions" aria-label="الأعمال الإدارية المتاحة">
            {realDestinations.map(({ page: id, icon: DestinationIcon, description }) => <a key={id} className="branch-action" href={pageHref(id)}><span className="action-icon"><DestinationIcon size={25} aria-hidden="true" /></span><span className="action-copy"><strong>{getPage(id).title}</strong><small>{description}</small></span><ArrowLeft size={19} aria-hidden="true" /></a>)}
          </nav>
        </>}
        {/* TODO: Define and enforce each future operation's server permission before adding data or actions. Existing permissions only expose this shell. */}
        <nav className="related-pages" aria-label="أقسام الإدارة قيد الإكمال">
          {(Object.keys(futureSections) as (keyof typeof futureSections)[]).map(id => <a key={id} className="quiet-button" href={pageHref(id)} aria-current={page === id ? 'page' : undefined}>{getPage(id).title}<span className="feature-status">قيد الإكمال</span></a>)}
        </nav>
        {section && <nav className="related-pages" aria-label="الانتقال إلى الأعمال المتاحة">{realDestinations.map(({ page: id }) => <a key={id} className="quiet-button" href={pageHref(id)}>{getPage(id).title}<ArrowLeft size={16} aria-hidden="true" /></a>)}</nav>}
      </>}
    </div>
  </section>;
}
