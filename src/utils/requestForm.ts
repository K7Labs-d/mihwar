export type RequestDraft = { title: string; description: string; location: string; quantity: number };
export type RequestErrors = Partial<Record<keyof RequestDraft, string>>;
export const requestLimits = { title: 120, description: 2000, location: 160, quantity: 1000 };

export function validateRequest(input: unknown): { data?: RequestDraft; fieldErrors: RequestErrors; error?: string } {
  const fieldErrors: RequestErrors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !Object.hasOwn(requestLimits, key))) {
    return { fieldErrors, error: 'أرسل بيانات الطلب فقط؛ لا يمكن تحديد المالك أو الحالة أو التواريخ.' };
  }
  const body = input as Record<string, unknown>;
  const text = (key: 'title' | 'description' | 'location', min: number, label: string) => {
    const raw = body[key];
    const value = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim().normalize('NFC') : '';
    const controls = key === 'description' ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/;
    if (typeof raw !== 'string' || raw.length > requestLimits[key] || value.length < min || value.length > requestLimits[key] || controls.test(raw)) {
      fieldErrors[key] = `${label} من ${min} إلى ${requestLimits[key]} حرفًا.`;
    }
    return value;
  };
  const data: RequestDraft = { title: text('title', 3, 'أدخل عنوانًا'), description: text('description', 10, 'اكتب وصفًا'), location: text('location', 2, 'أدخل موقعًا'), quantity: body.quantity as number };
  if (typeof body.quantity !== 'number' || !Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > requestLimits.quantity) {
    fieldErrors.quantity = 'أدخل كمية صحيحة من 1 إلى 1000.';
  }
  return Object.keys(fieldErrors).length ? { fieldErrors, error: 'راجع الحقول الموضحة قبل حفظ الطلب.' } : { data, fieldErrors };
}
