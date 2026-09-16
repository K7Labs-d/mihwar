import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, MapPin, Search, Tractor } from 'lucide-react';
import { equipmentCategories } from '../../utils/equipmentForm';
import { normalizeDigits } from '../../utils/brokerForm';
import { browseEquipment, browseEquipmentDetail, marketplaceHref, marketplaceLocation, MarketplaceApiError, type MarketplaceList, type PublicEquipment } from '../../utils/marketplaceApi';
import './marketplace.css';

const price = (value: number | null) => value === null ? 'غير محدد' : new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 2 }).format(value / 100);
const category = (value: string) => equipmentCategories.find(item => item.value === value)?.label ?? value;
const operator = (value: string) => value === 'with_operator' ? 'مع مشغل (ضمن السعر)' : 'بدون مشغل';
const amount = (raw: string) => {
  const value = normalizeDigits(raw.trim()).replace('٫', '.');
  if (!value) return undefined;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) return NaN;
  const [whole, decimals = ''] = value.split('.');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
};
function Availability({ item }: { item: PublicEquipment }) {
  return <span className="marketplace-availability" data-available={item.availability === 'available'}>{item.availability === 'available' ? 'متاحة للتأجير' : 'غير متاحة حاليًا'}</span>;
}
function Prices({ item }: { item: PublicEquipment }) {
  return <dl className="marketplace-card-prices"><div><dt>سعر الساعة</dt><dd>{price(item.hourlyRateHalalas)}</dd></div><div><dt>سعر اليوم</dt><dd>{price(item.dailyRateHalalas)}</dd></div></dl>;
}

function SearchForm({ query, onSearch }: { query: string; onSearch: (query: string) => void }) {
  const parameters = new URLSearchParams(query);
  const initial = (key: string, fallback = '') => parameters.get(key) ?? fallback;
  const rateInput = (key: string) => parameters.has(key) ? String(Number(parameters.get(key)) / 100) : '';
  const [draft, setDraft] = useState({ q: initial('q'), category: initial('category'), location: initial('location'), operatorMode: initial('operatorMode'), availability: initial('availability'), rateUnit: initial('rateUnit', 'day'), min: rateInput('minRateHalalas'), max: rateInput('maxRateHalalas'), sort: initial('sort', 'newest') });
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const update = (key: keyof typeof draft, value: string) => { setDraft(current => ({ ...current, [key]: value })); setError(''); };
  function submit(event: FormEvent) {
    event.preventDefault();
    const min = amount(draft.min), max = amount(draft.max);
    if ([min, max].some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 100000000)) || (min !== undefined && max !== undefined && min > max)) {
      setError('أدخل سعرًا صحيحًا من 0 إلى 1,000,000 ر.س بمنزلتين عشريتين كحد أقصى، واجعل الحد الأعلى أكبر من أو يساوي الحد الأدنى.');
      form.current?.querySelector<HTMLInputElement>('#marketplace-min')?.focus();
      return;
    }
    const next = new URLSearchParams();
    for (const key of ['q', 'category', 'location', 'operatorMode', 'availability', 'rateUnit', 'sort'] as const) if (draft[key].trim()) next.set(key, draft[key].trim());
    if (min !== undefined) next.set('minRateHalalas', String(min));
    if (max !== undefined) next.set('maxRateHalalas', String(max));
    onSearch(next.toString());
  }
  return <form ref={form} className="marketplace-search" role="search" onSubmit={submit}>
    <div className="marketplace-filters">
      <div className="form-field marketplace-query"><label htmlFor="marketplace-q">ابحث عن معدة</label><input id="marketplace-q" type="search" value={draft.q} onChange={e => update('q', e.target.value)} maxLength={100} placeholder="اسم المعدة أو مواصفاتها" /></div>
      <div className="form-field"><label htmlFor="marketplace-category">التصنيف</label><select id="marketplace-category" value={draft.category} onChange={e => update('category', e.target.value)}><option value="">كل التصنيفات</option>{equipmentCategories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
      <div className="form-field marketplace-location-filter"><label htmlFor="marketplace-location">الموقع</label><input id="marketplace-location" value={draft.location} onChange={e => update('location', e.target.value)} maxLength={160} placeholder="ابحث في موقع المعدة" /></div>
      <div className="form-field"><label htmlFor="marketplace-operator">المشغل</label><select id="marketplace-operator" value={draft.operatorMode} onChange={e => update('operatorMode', e.target.value)}><option value="">كل الخيارات</option><option value="with_operator">مع مشغل</option><option value="without_operator">بدون مشغل</option></select></div>
      <div className="form-field"><label htmlFor="marketplace-availability">التوفر</label><select id="marketplace-availability" value={draft.availability} onChange={e => update('availability', e.target.value)}><option value="">كل المعدات النشطة</option><option value="available">متاحة للتأجير</option><option value="unavailable">غير متاحة حاليًا</option></select></div>
      <div className="form-field"><label htmlFor="marketplace-rate-unit">وحدة السعر</label><select id="marketplace-rate-unit" value={draft.rateUnit} onChange={e => update('rateUnit', e.target.value)}><option value="day">لليوم</option><option value="hour">للساعة</option></select></div>
      <div className="form-field"><label htmlFor="marketplace-sort">ترتيب النتائج</label><select id="marketplace-sort" value={draft.sort} onChange={e => update('sort', e.target.value)}><option value="newest">الأحدث</option><option value="price_asc">السعر: الأقل أولًا</option><option value="price_desc">السعر: الأعلى أولًا</option></select></div>
      {(['min', 'max'] as const).map(key => <div className="form-field" key={key}><label htmlFor={`marketplace-${key}`}>{key === 'min' ? 'أقل سعر (ر.س)' : 'أعلى سعر (ر.س)'}</label><input id={`marketplace-${key}`} value={draft[key]} onChange={e => update(key, e.target.value)} type="text" inputMode="decimal" dir="ltr" maxLength={10} aria-invalid={!!error} aria-describedby="marketplace-price-help marketplace-price-error" /></div>)}
      <p id="marketplace-price-help" className="muted marketplace-price-help">تصفية السعر وترتيبه بحسب وحدة الساعة أو اليوم المختارة. المعدات التي لم يُحدد لها سعر بهذه الوحدة لا تظهر عند تصفية السعر أو ترتيبه.</p>
    </div>
    {error && <p id="marketplace-price-error" role="alert" className="field-error">{error}</p>}
    <div className="marketplace-filter-actions"><button type="submit" className="gold-button"><Search size={17} /> بحث وتصفية</button><button type="button" className="quiet-button" onClick={() => { setDraft({ q: '', category: '', location: '', operatorMode: '', availability: '', rateUnit: 'day', min: '', max: '', sort: 'newest' }); setError(''); onSearch(''); }}>مسح الفلاتر</button></div>
  </form>;
}

function EquipmentCard({ item, query }: { item: PublicEquipment; query: string }) {
  return <a href={marketplaceHref(query, item.id)} className="marketplace-card" aria-label={`تفاصيل ${item.name}`}>
    <div className="marketplace-card-top"><span className="marketplace-category"><Tractor size={20} aria-hidden="true" />{category(item.category)}</span><Availability item={item} /></div>
    <h3>{item.name}</h3><p className="marketplace-location"><MapPin size={15} aria-hidden="true" />{item.location}</p><p className="marketplace-owner">المؤجر: {item.lessor.displayName}</p>
    <Prices item={item} /><div className="marketplace-card-footer"><span>{operator(item.operatorMode)}</span><span>عرض التفاصيل <ArrowLeft size={15} aria-hidden="true" /></span></div>
  </a>;
}
function EquipmentDetails({ item, query }: { item: PublicEquipment; query: string }) {
  return <><a href={marketplaceHref(query)} className="text-button"><ArrowRight size={17} /> العودة إلى نتائج البحث</a><div className="marketplace-detail">
    <section className="marketplace-detail-main"><div className="marketplace-card-top"><span className="marketplace-category"><Tractor size={23} />{category(item.category)}</span><Availability item={item} /></div>
      <h1>{item.name}</h1><p className="marketplace-location"><MapPin size={17} />{item.location}</p><p className="marketplace-detail-description">{item.description}</p>
      <dl className="review-grid"><div><dt>التصنيف</dt><dd>{category(item.category)}</dd></div><div><dt>المشغل</dt><dd>{operator(item.operatorMode)}</dd></div><div><dt>المؤجر</dt><dd>{item.lessor.displayName}</dd></div><div><dt>نوع المؤجر</dt><dd>{item.lessor.entity === 'company' ? 'شركة' : 'فرد'}</dd></div></dl>
    </section>
    <aside className="marketplace-detail-side" aria-label="أسعار المعدة والخطوة التالية"><h2>أسعار التأجير</h2><Prices item={item} /><p className="muted">الأسعار النهائية التي حددها المؤجر لخيار {item.operatorMode === 'with_operator' ? 'مع مشغل' : 'بدون مشغل'}.</p><p className="muted">التوفر المعروض يحدده المؤجر، ولا يؤكد حجز موعد.</p>
      <p className="field-hint mt-5">الحجز المباشر قيد الإكمال. يمكنك حاليًا نشر طلب احتياج مستقل من قسم الطلب.</p><a href="#request" className="gold-button">نشر طلب احتياج <ArrowLeft size={16} /></a>
    </aside>
  </div></>;
}

export function Marketplace() {
  const [location, setLocation] = useState(() => marketplaceLocation(window.location.hash));
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{ key: string; list?: MarketplaceList; item?: PublicEquipment; error?: MarketplaceApiError }>({ key: '' });
  const heading = useRef<HTMLDivElement>(null);
  const key = location.id ? 'detail:' + location.id : 'list:' + location.query;
  useEffect(() => {
    const changed = () => setLocation(marketplaceLocation(window.location.hash));
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException('انتهت مهلة الاتصال', 'TimeoutError')), 15000);
    let active = true;
    setState({ key });
    heading.current?.focus({ preventScroll: true });
    const fetchData = async () => {
      try {
        const result = location.id ? { item: await browseEquipmentDetail(location.id, controller.signal) } : { list: await browseEquipment(location.query, controller.signal) };
        if (active) setState({ key, ...result });
      } catch (value) {
        if (active) setState({ key, error: value instanceof MarketplaceApiError ? value : new MarketplaceApiError('تعذر تحميل المعدات. أعد المحاولة.', 0) });
      } finally { clearTimeout(timeout); }
    };
    void fetchData();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [key, reload]);
  const current = state.key === key ? state : { key };
  const loading = !current.list && !current.item && !current.error;
  const search = (query: string) => { const href = marketplaceHref(query); if (window.location.hash === href) setReload(value => value + 1); else window.location.hash = href; };
  const toPage = (page: number) => { const query = new URLSearchParams(location.query); query.set('page', String(page)); search(query.toString()); };
  const list = current.list;
  return <div className="marketplace" ref={heading} tabIndex={-1}>
    {!location.id && <><div className="marketplace-heading"><div><p className="eyebrow">اختر المعدة المناسبة لاحتياجك</p><h1>سوق <em>المعدات</em></h1><p className="muted">تصفح معدات المؤجرين المعتمدين، ومواصفاتها وأسعارها وتوفرها الحالي.</p></div><a href="#equipment" className="quiet-button">إدارة معداتي</a></div><SearchForm key={location.query} query={location.query} onSearch={search} /></>}
    {loading && <p role="status" className="empty-state muted">جارٍ تحميل {location.id ? 'تفاصيل المعدة' : 'المعدات'}…</p>}
    {current.error && <div className="empty-state marketplace-empty mt-6" role="alert"><h2>{current.error.status === 404 ? 'المعدة غير متاحة في السوق' : 'تعذر تحميل المعدات'}</h2><p className="muted">{current.error.message}</p>{location.id && <a href={marketplaceHref(location.query)} className="quiet-button">العودة إلى نتائج البحث</a>}{current.error.status !== 404 && <button className="quiet-button" onClick={() => setReload(value => value + 1)}>إعادة المحاولة</button>}</div>}
    {current.item && <EquipmentDetails item={current.item} query={location.query} />}
    {list && <><div className="marketplace-results-heading"><h2>المعدات المنشورة <span className="muted">({new Intl.NumberFormat('ar-SA').format(list.total)})</span></h2><button className="text-button" onClick={() => setReload(value => value + 1)}>تحديث النتائج</button></div>
      {list.equipment.length ? <div className="marketplace-grid">{list.equipment.map(item => <EquipmentCard key={item.id} item={item} query={location.query} />)}</div> : <div className="empty-state marketplace-empty"><Tractor size={38} aria-hidden="true" /><h2>{list.total > 0 ? 'لا توجد نتائج في هذه الصفحة' : location.query ? 'لا توجد معدات تطابق بحثك' : 'لا توجد معدات منشورة بعد'}</h2><p className="muted">{location.query ? 'غيّر خيارات البحث أو امسح الفلاتر للاطلاع على المعدات المنشورة.' : 'ستظهر هنا المعدات التي يضيفها المؤجرون المعتمدون.'}</p>{location.query ? <button className="quiet-button" onClick={() => search('')}>عرض كل المعدات</button> : <a href="#broker" className="quiet-button">تأجير معداتي</a>}</div>}
      {(list.total > list.pageSize || list.page > 1) && <nav className="request-pagination" aria-label="صفحات المعدات"><button className="quiet-button" disabled={list.page <= 1} onClick={() => toPage(list.page - 1)}><ArrowRight size={15} /> السابق</button><span className="muted">الصفحة {new Intl.NumberFormat('ar-SA').format(list.page)}</span><button className="quiet-button" disabled={list.page * list.pageSize >= list.total} onClick={() => toPage(list.page + 1)}>التالي <ArrowLeft size={15} /></button></nav>}
    </>}
  </div>;
}
