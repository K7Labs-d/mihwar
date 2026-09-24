import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Users, ArrowRight, ArrowLeft, Check, Upload, Info, Pencil } from 'lucide-react';
import { emptyBrokerDraft, validateBrokerStep, workValues, type BrokerDraft, type BrokerErrors } from '../../utils/brokerForm';
import { BrokerApiError, brokerRequestApi, type BrokerRequest } from '../../utils/brokerApi';
import { BrokerRequestDetails } from './BrokerRequestDetails';

const steps = ['بيانات المؤجر', 'مجال العمل', 'المستندات', 'المراجعة والإرسال'];

export function BrokerRegistration({ onBack, onClientLogin }: { onBack: () => void; onClientLogin?: () => void }) {
  const [draft, setDraft] = useState<BrokerDraft>({ ...emptyBrokerDraft });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<BrokerErrors>({});
  const [saved, setSaved] = useState<BrokerRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<BrokerApiError | null>(null);
  const [notice, setNotice] = useState('');
  const submitted = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 1000px)').matches) heading.current?.scrollIntoView({ block: 'start' });
  }, [step, saved]);

  const change = (key: keyof BrokerDraft, value: string) => {
    setDraft(old => ({ ...old, [key]: value }));
    setErrors(old => ({ ...old, [key]: undefined, ...(key === 'entity' ? { identity: undefined, commercial: undefined } : {}) }));
  };
  const goTo = (next: number) => { if (!submitted.current) { setErrors({}); setStep(next); } };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitted.current) return;
    const nextErrors = step === 3 ? { ...validateBrokerStep(draft, 0), ...validateBrokerStep(draft, 1) } : validateBrokerStep(draft, step);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (step < 3) goTo(step + 1);
    else {
      submitted.current = true; setBusy(true); setSaveError(null);
      try {
        const request = await brokerRequestApi(draft);
        setSaved(request); setNotice('تم إرسال طلبك وحفظه بنجاح.');
      } catch (error) {
        const failure = error instanceof BrokerApiError ? error : new BrokerApiError('تعذر إكمال الطلب. أعد المحاولة.', 0);
        if (failure.status === 409 && failure.request) { setSaved(failure.request); setNotice(failure.message); }
        else {
          setSaveError(failure);
          if (failure.fieldErrors) {
            setErrors(failure.fieldErrors);
            setStep(Object.keys(failure.fieldErrors).some(key => !['domains', 'regions'].includes(key)) ? 0 : 1);
          }
        }
      } finally { submitted.current = false; setBusy(false); }
    }
  };
  const field = (key: keyof BrokerDraft, title: string, options: { type?: string; required?: boolean; maxLength?: number; dir?: 'ltr' | 'rtl'; placeholder?: string; autoComplete?: string } = {}) => <div className={`form-field ${key === 'address' ? 'full-field' : ''}`}>
    <label htmlFor={`broker-${key}`}>{title}{options.required && <span className="required-mark" aria-hidden="true"> *</span>}</label>
    <input id={`broker-${key}`} name={key} value={draft[key]} onChange={event => change(key, event.target.value)} type={options.type ?? 'text'} required={options.required} maxLength={options.maxLength ?? 80} dir={options.dir} placeholder={options.placeholder} autoComplete={options.autoComplete ?? 'off'} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `error-${key}` : undefined} />
    {errors[key] && <p className="field-error" id={`error-${key}`}>{errors[key]}</p>}
  </div>;

  if (saved) return <section className="branch-panel registration-panel" data-branch-panel>
    <h2 ref={heading} tabIndex={-1} className="sr-only">طلب تسجيل المؤجر المحفوظ</h2>
    <BrokerRequestDetails request={saved} message={notice} />
    <button className="gold-button" onClick={onBack}><ArrowRight size={18} /> العودة إلى المؤجر</button>
  </section>;

  return <section className="branch-panel registration-panel" aria-labelledby="registration-heading" data-branch-panel>
    <div className="panel-title"><Users size={38} /><div><h2 id="registration-heading" ref={heading} tabIndex={-1}>إضافة مؤجر جديد</h2><p>{steps[step]} <span className="step-count">— الخطوة {step + 1} من 4</span></p></div></div>
    <ol className="registration-steps" aria-label="خطوات تسجيل المؤجر">{steps.map((title, index) => <li key={title} className={index === step ? 'current' : index < step ? 'done' : ''}><button type="button" disabled={index > step} aria-current={index === step ? 'step' : undefined} onClick={() => goTo(index)}><span className="step-number">{index < step ? <Check size={15} /> : index + 1}</span><span>{title}</span></button></li>)}</ol>
    <form ref={form} onSubmit={submit} noValidate aria-busy={busy}>
      <fieldset disabled={busy} className="broker-fieldset">
      <div className="form-surface">
        <h3>{step === 0 ? 'البيانات الأساسية' : steps[step]}</h3>
        {step === 0 && <div className="broker-fields">
          <div className="form-field"><label htmlFor="broker-entity">نوع الجهة <span className="required-mark">*</span></label><select id="broker-entity" value={draft.entity} onChange={event => change('entity', event.target.value)}><option value="individual">فرد</option><option value="company">شركة / مؤسسة</option></select></div>
          {field('name', 'اسم المؤجر', { required: true, placeholder: 'أدخل اسم المؤجر', autoComplete: 'name' })}
          {draft.entity === 'individual' ? field('identity', 'رقم الهوية / الإقامة', { required: true, maxLength: 10, dir: 'ltr' }) : field('commercial', 'رقم السجل التجاري', { required: true, maxLength: 10, dir: 'ltr' })}
          {field('phone', 'رقم الجوال', { required: true, type: 'tel', dir: 'ltr', placeholder: '05XXXXXXXX', maxLength: 20, autoComplete: 'tel' })}
          {field('email', 'البريد الإلكتروني', { required: true, type: 'email', dir: 'ltr', maxLength: 254, autoComplete: 'email' })}
          {field('address', 'العنوان (اختياري)', { maxLength: 250, placeholder: 'أدخل العنوان', autoComplete: 'street-address' })}
        </div>}
        {step === 1 && <div className="broker-fields">{(['domains', 'regions'] as const).map(key => <div className="form-field" key={key}><label htmlFor={`broker-${key}`}>{key === 'domains' ? 'مجالات العمل' : 'مناطق العمل'} <span className="required-mark">*</span></label><p className="field-hint" id={`hint-${key}`}>اكتب {key === 'domains' ? 'كل مجال' : 'كل منطقة'} في سطر مستقل، حتى 10 قيم.</p><textarea id={`broker-${key}`} value={draft[key]} onChange={event => change(key, event.target.value)} rows={5} maxLength={610} required aria-invalid={Boolean(errors[key])} aria-describedby={`hint-${key}${errors[key] ? ` error-${key}` : ''}`} />{errors[key] && <p className="field-error" id={`error-${key}`}>{errors[key]}</p>}<div className="value-tags">{workValues(draft[key]).map(value => <span key={value}>{value}</span>)}</div></div>)}</div>}
        {step === 2 && <div>
          <div className="document-picker documents-unavailable" aria-disabled="true"><Upload size={32} /><strong>رفع المستندات غير متاح حاليًا</strong><span>يمكنك متابعة إرسال بيانات الطلب دون مستندات.</span></div>
          <p className="local-note"><Info size={18} /> لا يتم اختيار أو رفع أي ملف في هذه المرحلة. ستُحفظ بيانات النموذج فقط.</p>
        </div>}
        {step === 3 && <div className="review-content">
          <div className="review-title"><h4>بيانات المؤجر</h4><button type="button" className="text-button" onClick={() => goTo(0)}><Pencil size={15} /> تعديل البيانات</button></div>
          <dl className="review-grid">{[
            ['نوع الجهة', draft.entity === 'individual' ? 'فرد' : 'شركة / مؤسسة'], ['اسم المؤجر', draft.name],
            [draft.entity === 'individual' ? 'رقم الهوية / الإقامة' : 'رقم السجل التجاري', draft.entity === 'individual' ? draft.identity : draft.commercial],
            ['رقم الجوال', draft.phone], ['البريد الإلكتروني', draft.email], ['العنوان', draft.address || 'لم يُضف'],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}</dl>
          <div className="review-title"><h4>مجال العمل</h4><button type="button" className="text-button" onClick={() => goTo(1)}><Pencil size={15} /> تعديل مجال العمل</button></div>
          <dl className="review-grid"><div><dt>مجالات العمل</dt><dd>{workValues(draft.domains).join('، ')}</dd></div><div><dt>مناطق العمل</dt><dd>{workValues(draft.regions).join('، ')}</dd></div></dl>
          <div className="review-title"><h4>المستندات</h4><button type="button" className="text-button" onClick={() => goTo(2)}><Pencil size={15} /> تعديل المستندات</button></div>
          <p className="muted">لم تُرفق مستندات؛ الرفع غير متاح حاليًا.</p>
          <p className="local-note"><Info size={18} /> عند الإرسال سيُحفظ الطلب في حسابك بحالة «قيد المراجعة». لن يتم اعتماد المؤجر تلقائيًا.</p>
        </div>}
      </div>
      <div className="registration-controls"><button className="gold-button" type="submit">{busy ? 'جارٍ حفظ الطلب…' : step === 3 ? 'إرسال طلب التسجيل' : 'الخطوة التالية'}{step === 3 ? <Check size={18} /> : <ArrowLeft size={18} />}</button>{step > 0 && <button className="quiet-button" type="button" onClick={() => goTo(step - 1)}><ArrowRight size={17} /> السابق</button>}<button className="text-button cancel-button" type="button" onClick={onBack}>إلغاء</button></div>
      </fieldset>
      {saveError && <div role="alert"><p className="field-error">{saveError.message}</p>{saveError.status === 401 && <button type="button" className="quiet-button" onClick={onClientLogin}>تسجيل الدخول مجددًا</button>}</div>}
      <p className="form-footnote">تُحفظ البيانات بعد تأكيد الإرسال فقط. المسودة غير المرسلة لا تبقى بعد مغادرة الصفحة.</p>
    </form>
  </section>;
}
