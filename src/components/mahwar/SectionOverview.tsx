import { ArrowLeft, ClipboardCheck, FileText, Settings, Handshake, ChartNoAxesColumn } from 'lucide-react';
import { getPage, pageHref, type Page } from '../../data/productPages';

const sections = {
  offer: { icon: ClipboardCheck, heading: 'العروض المرتبطة بطلباتك', empty: 'لا توجد عروض للعرض بعد', description: 'استقبال العروض ومراجعة تفاصيلها قيد الإكمال. ستظهر هنا العروض الخاصة بطلباتك عند تفعيل الميزة.', columns: ['العرض', 'الطلب المرتبط', 'الحالة'], related: ['request', 'execution'] },
  execution: { icon: Settings, heading: 'خطوات التنفيذ', empty: 'لا توجد عمليات تنفيذ للعرض بعد', description: 'متابعة تقدم العمل قيد الإكمال. ستظهر خطوات تنفيذ طلباتك هنا عند تفعيل الميزة.', columns: ['العملية', 'الخطوة الحالية', 'الحالة'], related: ['offer', 'request'] },
  'broker-opportunities': { icon: Handshake, heading: 'فرص التعاون', empty: 'لا توجد فرص مشتركة للعرض بعد', description: 'إتاحة فرص التعاون وربطها بالمؤجرين قيد الإكمال. تسجيل مؤجر لا ينشئ فرصة تعاون تلقائيًا.', columns: ['الفرصة', 'المؤجر', 'الحالة'], related: ['broker-management', 'broker-registration'] },
  'broker-reports': { icon: ChartNoAxesColumn, heading: 'تقارير أداء المؤجرين', empty: 'لا توجد تقارير أداء متاحة بعد', description: 'حساب مؤشرات الأداء وإعداد التقارير قيد الإكمال. يمكنك الآن متابعة حالة طلبات المؤجرين من طلبات الاعتماد.', columns: ['التقرير', 'الفترة', 'الحالة'], related: ['broker-management', 'broker-opportunities'] },
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
    <nav className="related-pages" aria-label="أقسام مرتبطة">
      {section.related.map(id => <a key={id} className="quiet-button" href={pageHref(id)}>{getPage(id).title}<ArrowLeft size={16} aria-hidden="true" /></a>)}
    </nav>
  </div>;
}
