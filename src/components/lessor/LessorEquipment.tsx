import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, BadgeCheck, ChevronLeft, Pencil, Plus, RefreshCw, Tractor } from 'lucide-react';
import { EquipmentApiError, loadEquipment, loadEquipmentItem, loadLessorProfile, saveEquipment, type EquipmentList, type LessorProfile } from '../../utils/equipmentApi';
import { equipmentCategories, validateEquipmentInput, type Equipment, type EquipmentErrors, type EquipmentInput } from '../../utils/equipmentForm';
import { brokerRequestApi, brokerStatusLabel, type BrokerRequest } from '../../utils/brokerApi';
import { normalizeDigits } from '../../utils/brokerForm';
import { pageHref } from '../../data/productPages';
import './equipment.css';

const dateLabel = (date: string) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
const priceLabel = (halalas: number | null) => halalas === null ? 'غير محدد' : new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 2 }).format(halalas / 100);
const categoryLabel = (value: string) => equipmentCategories.find(item => item.value === value)?.label ?? value;
const failure = (error: unknown) => error instanceof EquipmentApiError ? error : new EquipmentApiError(error instanceof Error ? error.message : 'تعذر إكمال العملية. أعد المحاولة.', Number((error as any)?.status) || 0);
const amountInput = (halalas: number | null) => halalas === null ? '' : (halalas / 100).toFixed(2);
const amountValue = (value: string) => {
  const clean = normalizeDigits(value.trim()).replace('٫', '.');
  if (!clean) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return NaN;
  const [whole, decimal = ''] = clean.split('.');
  return Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
};
function EquipmentState({ item }: { item: Equipment }) {
  const state = item.status === 'archived' ? 'archived' : item.availability;
  return <span className="equipment-state" data-state={state}>{state === 'archived' ? 'مؤرشفة' : state === 'available' ? 'متاحة للتأجير' : 'غير متاحة حاليًا'}</span>;
}

function EquipmentForm({ existing, onSaved, onBack, onReload, onClientLogin }: { existing?: Equipment; onSaved: (item: Equipment) => void; onBack: () => void; onReload: () => void; onClientLogin: () => void }) {
  const [draft, setDraft] = useState({
    name: existing?.name ?? '', category: existing?.category ?? '', description: existing?.description ?? '', location: existing?.location ?? '',
    hourlyRateHalalas: amountInput(existing?.hourlyRateHalalas ?? null), dailyRateHalalas: amountInput(existing?.dailyRateHalalas ?? null),
    operatorMode: existing?.operatorMode ?? 'without_operator', availability: existing?.availability ?? 'available', status: existing?.status ?? 'active',
  });
  const [errors, setErrors] = useState<EquipmentErrors>({});
  const [error, setError] = useState<EquipmentApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const submission = useRef<{ data: string; key: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const update = (key: keyof EquipmentInput, value: string) => {
    setDraft(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setError(null);
    const checked = validateEquipmentInput({ ...draft, hourlyRateHalalas: amountValue(draft.hourlyRateHalalas), dailyRateHalalas: amountValue(draft.dailyRateHalalas) });
    setErrors(checked.errors);
    if (!checked.data) {
      setError(new EquipmentApiError('راجع الحقول المطلوبة قبل الحفظ.', 400));
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const serialized = JSON.stringify(checked.data);
    if (submission.current?.data !== serialized) submission.current = { data: serialized, key: crypto.randomUUID() };
    pending.current = true; setBusy(true);
    try { onSaved(await saveEquipment(checked.data, submission.current.key, existing)); }
    catch (value) { const current = failure(value); setError(current); setErrors(current.fieldErrors); }
    finally { pending.current = false; setBusy(false); }
  }
  const feedback = (key: keyof EquipmentInput) => <p id={`equipment-${key}-error`} className="field-error">{errors[key]}</p>;
  const attributes = (key: keyof EquipmentInput) => ({ id: `equipment-${key}`, name: key, 'aria-invalid': !!errors[key], 'aria-describedby': `equipment-${key}-error` });
  return <form ref={form} className="equipment-form" onSubmit={submit} noValidate aria-busy={busy}>
    <div className="section-summary"><h3 ref={heading} tabIndex={-1}>{existing ? 'تعديل المعدة' : 'إضافة معدة'}</h3><button type="button" className="text-button" onClick={onBack} disabled={busy}><ArrowRight size={16} /> {existing ? 'العودة للتفاصيل' : 'العودة إلى معداتي'}</button></div>
    <p className="muted equipment-intro">أضف كل معدة على حدة، وحدد مواصفاتها والسعر النهائي لتأجيرها.</p>
    {error && <div className="request-error" role="alert"><p>{error.message}</p>{error.status === 401 && <button type="button" className="quiet-button" onClick={onClientLogin}>تسجيل الدخول</button>}{error.status === 409 && existing && <button type="button" className="quiet-button" onClick={onReload}>عرض النسخة المحفوظة</button>}</div>}
    <fieldset disabled={busy} className="broker-fields form-surface">
      <div className="form-field full-field"><label htmlFor="equipment-name">اسم المعدة <span className="required-mark">*</span></label><input {...attributes('name')} required minLength={3} maxLength={120} value={draft.name} onChange={e => update('name', e.target.value)} />{feedback('name')}</div>
      <div className="form-field"><label htmlFor="equipment-category">تصنيف المعدة <span className="required-mark">*</span></label><select {...attributes('category')} required value={draft.category} onChange={e => update('category', e.target.value)}><option value="">اختر التصنيف</option>{equipmentCategories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{feedback('category')}</div>
      <div className="form-field"><label htmlFor="equipment-location">موقع المعدة <span className="required-mark">*</span></label><input {...attributes('location')} required minLength={2} maxLength={160} value={draft.location} onChange={e => update('location', e.target.value)} />{feedback('location')}</div>
      <div className="form-field full-field"><label htmlFor="equipment-description">الوصف والمواصفات <span className="required-mark">*</span></label><textarea {...attributes('description')} required minLength={10} maxLength={2000} rows={4} value={draft.description} onChange={e => update('description', e.target.value)} />{feedback('description')}</div>
      <p className="field-hint full-field" id="equipment-pricing-help">حدد سعر الساعة أو اليوم، أو كليهما، بالريال السعودي. السعر نهائي لخيار المشغل المحدد أدناه؛ اترك السعر الذي لا تقدمه فارغًا.</p>
      {(['hourlyRateHalalas', 'dailyRateHalalas'] as const).map(key => <div className="form-field" key={key}><label htmlFor={`equipment-${key}`}>{key === 'hourlyRateHalalas' ? 'سعر الساعة (ر.س)' : 'سعر اليوم (ر.س)'}</label><input {...attributes(key)} aria-describedby={`equipment-pricing-help equipment-${key}-error`} type="text" inputMode="decimal" dir="ltr" maxLength={10} value={draft[key]} onChange={e => update(key, e.target.value)} />{feedback(key)}</div>)}
      <div className="form-field"><label htmlFor="equipment-operatorMode">المشغل <span className="required-mark">*</span></label><select {...attributes('operatorMode')} value={draft.operatorMode} onChange={e => update('operatorMode', e.target.value)}><option value="without_operator">بدون مشغل</option><option value="with_operator">مع مشغل (ضمن السعر)</option></select>{feedback('operatorMode')}</div>
      <div className="form-field"><label htmlFor="equipment-availability">التوفر الحالي <span className="required-mark">*</span></label><select {...attributes('availability')} value={draft.availability} onChange={e => update('availability', e.target.value)}><option value="available">متاحة للتأجير</option><option value="unavailable">غير متاحة حاليًا</option></select>{feedback('availability')}</div>
      {existing && <div className="form-field full-field"><label htmlFor="equipment-status">حالة المعدة</label><select {...attributes('status')} value={draft.status} onChange={e => update('status', e.target.value)}><option value="active">نشطة ضمن معداتي</option><option value="archived">مؤرشفة</option></select><p className="field-hint">الأرشفة تحفظ بيانات المعدة، ويمكن إعادة تنشيطها لاحقًا.</p>{feedback('status')}</div>}
      <div className="registration-controls full-field"><button className="gold-button" type="submit">{busy ? 'جارٍ حفظ المعدة…' : existing ? 'حفظ التعديلات' : 'حفظ المعدة'}</button><button type="button" className="quiet-button" onClick={onBack}>إلغاء</button></div>
    </fieldset>
    <p className="form-footnote">تُحفظ البيانات عند نجاح الإرسال. مغادرة النموذج قبل الحفظ تلغي التعديلات غير المحفوظة.</p>
  </form>;
}

export function LessorEquipment({ onClientLogin }: { onClientLogin: () => void }) {
  const [view, setView] = useState<'list' | 'detail' | 'create' | 'edit'>('list');
  const [profile, setProfile] = useState<LessorProfile | null>(null);
  const [application, setApplication] = useState<BrokerRequest | null>(null);
  const [list, setList] = useState<EquipmentList | null>(null);
  const [item, setItem] = useState<Equipment | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EquipmentApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [success, setSuccess] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (view === 'create' || view === 'edit') return;
    let active = true;
    setLoading(true); setError(null); setList(null); setItem(null); setApplication(null); setProfile(null);
    async function load() {
      try {
        const currentProfile = await loadLessorProfile();
        if (!active) return;
        setProfile(currentProfile);
        if (!currentProfile) { const request = await brokerRequestApi(); if (active) setApplication(request); }
        else if (view === 'detail' && selectedId) { const equipment = await loadEquipmentItem(selectedId); if (active) setItem(equipment); }
        else { const equipment = await loadEquipment(page); if (active) setList(equipment); }
      } catch (value) { if (active) setError(failure(value)); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [view, selectedId, page, attempt]);
  useEffect(() => { if (!loading) heading.current?.focus({ preventScroll: true }); }, [loading, view]);
  const back = () => { setSuccess(''); setSelectedId(null); setView('list'); };
  const refresh = () => { setSuccess(''); setAttempt(value => value + 1); };
  const detail = (id: string) => { setSuccess(''); setSelectedId(id); setView('detail'); };
  const saved = (equipment: Equipment) => { setSuccess(view === 'edit' ? 'تم حفظ تعديلات المعدة بنجاح.' : 'تم حفظ المعدة وربطها بملفك كمؤجر.'); setSelectedId(equipment.id); setView('detail'); };
  if (view === 'create' || (view === 'edit' && item)) return <EquipmentForm existing={view === 'edit' ? item! : undefined} onSaved={saved} onBack={view === 'edit' ? () => detail(item!.id) : back} onReload={() => { setView('detail'); refresh(); }} onClientLogin={onClientLogin} />;
  return <section className="lessor-equipment" aria-label="معدات المؤجر">
    <div className="section-summary"><h3 ref={heading} tabIndex={-1}>{view === 'detail' ? 'تفاصيل المعدة' : 'ملف المؤجر ومعداته'}</h3><button className="quiet-button" onClick={refresh} disabled={loading}><RefreshCw size={16} /> تحديث</button></div>
    {success && <p className="request-success" role="status">{success}</p>}
    {loading ? <div className="empty-state" role="status"><Tractor size={38} /><p>جارٍ تحميل {view === 'detail' ? 'بيانات المعدة' : 'معداتك'}…</p></div>
      : error ? <div className="empty-state"><Tractor size={38} /><p role="alert">{error.message}</p>{error.status === 401 ? <button className="gold-button" onClick={onClientLogin}>تسجيل الدخول</button> : <button className="quiet-button" onClick={refresh}>إعادة المحاولة</button>}</div>
      : !profile ? <div className="empty-state"><BadgeCheck size={40} /><h3>{application?.status === 'pending' ? 'طلبك قيد المراجعة' : application?.status === 'rejected' ? 'لم يُعتمد طلب التسجيل' : 'ابدأ بالتسجيل كمؤجر'}</h3><p className="muted">{application ? `حالة طلب التسجيل: ${brokerStatusLabel[application.status]}.` : 'يمكنك استخدام حسابك نفسه للاستئجار وتأجير معداتك.'} تُتاح إضافة المعدات بعد اعتماد طلبك.</p>{application?.status === 'rejected' && <p className="muted">{application.rejectionReason}</p>}<a className="gold-button" href={pageHref('broker-registration')}>{application?.status === 'pending' ? 'متابعة طلب التسجيل' : application?.status === 'rejected' ? 'عرض الطلب وإعادة التقديم' : 'التسجيل كمؤجر'}</a></div>
      : <>
        <div className="equipment-profile"><BadgeCheck size={26} /><div><strong>{profile.displayName}</strong><p>مؤجر معتمد · {profile.entity === 'company' ? 'شركة / مؤسسة' : 'فرد'}</p></div></div>
        {item ? <div className="request-details">
          <div className="request-title-row"><h3>{item.name}</h3><EquipmentState item={item} /></div>
          <dl className="equipment-rates"><div className="equipment-rate"><dt>السعر النهائي / الساعة</dt><dd>{priceLabel(item.hourlyRateHalalas)}</dd></div><div className="equipment-rate"><dt>السعر النهائي / اليوم</dt><dd>{priceLabel(item.dailyRateHalalas)}</dd></div></dl>
          <dl className="review-grid"><div><dt>التصنيف</dt><dd>{categoryLabel(item.category)}</dd></div><div><dt>موقع المعدة</dt><dd>{item.location}</dd></div><div className="full-field"><dt>الوصف والمواصفات</dt><dd>{item.description}</dd></div><div><dt>المشغل</dt><dd>{item.operatorMode === 'with_operator' ? 'مع مشغل (ضمن السعر)' : 'بدون مشغل'}</dd></div><div><dt>التوفر الحالي</dt><dd>{item.availability === 'available' ? 'متاحة' : 'غير متاحة'}</dd></div><div><dt>حالة المعدة</dt><dd>{item.status === 'active' ? 'نشطة' : 'مؤرشفة'}</dd></div><div><dt>آخر تحديث</dt><dd><time dateTime={item.updatedAt}>{dateLabel(item.updatedAt)}</time></dd></div><div className="full-field"><dt>معرّف المعدة</dt><dd className="request-id" dir="ltr">{item.id}</dd></div></dl>
          <div className="equipment-detail-actions"><button className="gold-button" onClick={() => { setSuccess(''); setView('edit'); }}><Pencil size={17} /> تعديل البيانات والتوفر</button></div>
        </div> : list && <>
          {list.equipment.length === 0 ? <div className="empty-state"><Tractor size={40} /><h3>{list.total ? 'لا توجد معدات في هذه الصفحة' : 'لم تضف أي معدة بعد'}</h3><p className="muted">أضف معدتك وحدد سعرها وموقعها وتوفرها لتجدها هنا.</p><button className="gold-button" onClick={() => { setSuccess(''); setView('create'); }}><Plus size={17} /> {list.total ? 'إضافة معدة' : 'إضافة أول معدة'}</button></div>
            : <><div className="request-list-controls"><p className="muted">معداتك المحفوظة: {list.total}</p><button className="gold-button" onClick={() => { setSuccess(''); setView('create'); }}><Plus size={17} /> إضافة معدة</button></div><div className="branch-actions">{list.equipment.map(equipment => <button key={equipment.id} className="branch-action equipment-list-item" aria-label={`فتح تفاصيل المعدة: ${equipment.name}`} onClick={() => detail(equipment.id)}><span className="action-icon"><Tractor size={25} /></span><span className="action-copy"><strong>{equipment.name}</strong><small>{categoryLabel(equipment.category)} · {equipment.location}</small><small>{equipment.dailyRateHalalas !== null ? `${priceLabel(equipment.dailyRateHalalas)} / اليوم` : `${priceLabel(equipment.hourlyRateHalalas)} / الساعة`}</small></span><ChevronLeft size={18} /><EquipmentState item={equipment} /></button>)}</div></>}
          {(list.total > list.pageSize || page > 1) && <nav className="request-pagination" aria-label="صفحات المعدات"><button className="quiet-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>السابق</button><span className="muted">الصفحة {page}</span><button className="quiet-button" disabled={page * list.pageSize >= list.total} onClick={() => setPage(value => value + 1)}>التالي</button></nav>}
        </>}
      </>}
    {view === 'detail' && <button className="text-button request-back" onClick={back}><ArrowRight size={17} /> العودة إلى معداتي</button>}
  </section>;
}
