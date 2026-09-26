import { ArrowLeft, ClipboardCheck, FileText, Settings, Handshake, ChartNoAxesColumn } from 'lucide-react';
import { getPage, pageHref, type Page } from '../../data/productPages';

const sections = {
  offer: { icon: ClipboardCheck, heading: 'العروض المرتبطة بطلباتك', empty: 'لا توجد بيانات عروض متاحة للعرض بعد', description: 'استقبال العروض ومراجعة تفاصيلها قيد الإكمال. يمكنك استعراض صفحات الرحلة دون اختيار عرض فعلي.', columns: ['العرض', 'الطلب المرتبط', 'الحالة'], related: ['request', 'offer-details', 'offer-comparison', 'offer-selection'] },
  execution: { icon: Settings, heading: 'خطوات التنفيذ', empty: 'لا توجد بيانات تنفيذ متاحة للعرض بعد', description: 'ربط التنفيذ بالحجز ومتابعة تقدمه قيد الإكمال. الصفحات التالية لاستعراض الرحلة فقط.', columns: ['العملية', 'الخطوة الحالية', 'الحالة'], related: ['bookings', 'execution-details', 'completion', 'reviews'] },
  'broker-opportunities': { icon: Handshake, heading: 'الطلبات المناسبة لمعداتك', empty: 'لا توجد بيانات فرص متاحة للعرض بعد', description: 'مطابقة احتياجات المستأجرين مع معداتك قيد الإكمال؛ لا تُعرض طلبات العملاء الخاصة هنا.', columns: [], related: ['equipment', 'offer-create', 'broker-offers'] },
  'broker-reports': { icon: ChartNoAxesColumn, heading: 'الأرباح والتقارير', empty: 'لا توجد بيانات تقارير متاحة للعرض بعد', description: 'ربط تقارير التأجير بالحجوزات والمستحقات قيد الإكمال. لا تُحسب أرباح أو إحصاءات قبل توفر بيانات فعلية.', columns: [], related: ['broker-bookings', 'lessor-payouts', 'settlements'] },
  'broker-settings': { icon: Settings, heading: 'إعدادات فرع المؤجر', empty: 'لا توجد إعدادات متاحة للتعديل بعد', description: 'إعدادات فرع المؤجر قيد الإكمال. بيانات حسابك متاحة في حسابي، وحالة طلبك في طلبات الاعتماد.', columns: [], related: ['client', 'broker-management'] },
} satisfies Record<string, { icon: typeof FileText; heading: string; empty: string; description: string; columns: string[]; related: Page[] }>;

export type OverviewPage = keyof typeof sections;
export function isOverviewPage(page: Page): page is OverviewPage { return Object.hasOwn(sections, page); }

export function SectionOverview({ page }: { page: OverviewPage }) {
  const section = sections[page];
  const Icon = section.icon;
  return <div className="section-overview">
    <div className="section-summary"><h3>{section.heading}</h3><span className="feature-status">الميزة قيد الإكمال</span></div>
    {section.columns.length > 0 ? <div className="section-table-wrap"><table className="section-table">
      <caption className="sr-only">{section.heading} — الميزة قيد الإكمال</caption>
      <thead><tr>{section.columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
      <tbody><tr><td colSpan={section.columns.length}><div className="empty-state"><Icon size={38} aria-hidden="true" /><h3>{section.empty}</h3><p className="muted">{section.description}</p></div></td></tr></tbody>
    </table></div> : <div className="empty-state settings-empty"><Icon size={38} aria-hidden="true" /><h3>{section.empty}</h3><p className="muted">{section.description}</p></div>}
    <nav className="related-pages" aria-label="استعراض الصفحات المرتبطة">
      {section.related.map(id => <a key={id} className="quiet-button" href={pageHref(id)}>{getPage(id).title}<ArrowLeft size={16} aria-hidden="true" /></a>)}
    </nav>
  </div>;
}
