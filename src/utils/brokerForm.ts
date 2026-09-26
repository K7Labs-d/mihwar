export type BrokerDraft = {
  entity: 'individual' | 'company'; name: string; identity: string; commercial: string;
  phone: string; email: string; address: string; domains: string; regions: string;
};
export type BrokerErrors = Partial<Record<keyof BrokerDraft | 'documents', string>>;
export const emptyBrokerDraft: BrokerDraft = { entity: 'individual', name: '', identity: '', commercial: '', phone: '', email: '', address: '', domains: '', regions: '' };
export const normalizeDigits = (value: string) => value.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= '۰' ? 1776 : 1632)));
export const workValues = (value: string) => [...new Set(value.split(/[\n,،]/).map(item => item.trim()).filter(Boolean))];
export function isValidBrokerName(value: string): boolean {
  const normalized = value.trim().normalize('NFC');
  // Match SQLite's minimum in Unicode code points, after the exact normalization used for storage.
  // Retain the existing UTF-16 upper bound and reject malformed text rather than changing it on write.
  return [...normalized].length >= 2 && value.length <= 80 && normalized.length <= 80
    && !/[\x00-\x1f\x7f]/.test(value) && !/[\uD800-\uDFFF]/u.test(value);
}
export function validateBrokerStep(draft: BrokerDraft, step: number): BrokerErrors {
  const errors: BrokerErrors = {};
  if (step === 0) {
    if (!['individual', 'company'].includes(draft.entity)) errors.entity = 'اختر نوع الجهة.';
    if (!isValidBrokerName(draft.name)) errors.name = 'أدخل اسمًا من حرفين إلى 80 حرفًا.';
    if (draft.entity === 'individual' && !/^[12]\d{9}$/.test(normalizeDigits(draft.identity.trim()))) errors.identity = 'أدخل رقم هوية أو إقامة من 10 أرقام يبدأ بـ1 أو 2.';
    if (draft.entity === 'company' && !/^\d{10}$/.test(normalizeDigits(draft.commercial.trim()))) errors.commercial = 'أدخل رقم سجل تجاري من 10 أرقام.';
    if (!/^(?:\+966|00966|966|0)?5\d{8}$/.test(normalizeDigits(draft.phone).replace(/[\s-]/g, ''))) errors.phone = 'أدخل رقم جوال سعودي صحيحًا، مثل 05XXXXXXXX.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) || draft.email.trim().length > 254) errors.email = 'أدخل بريدًا إلكترونيًا صحيحًا.';
    if (draft.address.length > 250) errors.address = 'العنوان لا يتجاوز 250 حرفًا.';
  }
  if (step === 1) for (const key of ['domains', 'regions'] as const) {
    const values = workValues(draft[key]);
    if (!values.length) errors[key] = key === 'domains' ? 'أضف مجال عمل واحدًا على الأقل.' : 'أضف منطقة عمل واحدة على الأقل.';
    else if (values.length > 10 || values.some(value => value.length > 60)) errors[key] = 'أدخل حتى 10 قيم، لا تتجاوز كل منها 60 حرفًا.';
  }
  return errors;
}
export function validateBrokerDocuments(files: { name: string; size: number }[]): string | undefined {
  if (files.length > 5) return 'يمكن اختيار 5 مستندات كحد أقصى.';
  if (files.some(file => !/\.(pdf|png|jpe?g)$/i.test(file.name))) return 'اختر مستند PDF أو صورة PNG أو JPG.';
  if (files.some(file => file.size === 0 || file.size > 10 * 1024 * 1024)) return 'يجب أن يكون الملف غير فارغ وحجمه لا يتجاوز 10 MB.';
}
