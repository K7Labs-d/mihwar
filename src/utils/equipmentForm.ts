export const equipmentCategories = [
  { value: 'excavator', label: 'حفارة' },
  { value: 'crane', label: 'رافعة' },
  { value: 'loader', label: 'شيول' },
  { value: 'bulldozer', label: 'بلدوزر' },
  { value: 'grader', label: 'ممهدة طرق' },
  { value: 'roller', label: 'مدحلة' },
  { value: 'forklift', label: 'رافعة شوكية' },
  { value: 'truck', label: 'شاحنة' },
  { value: 'other', label: 'أخرى' },
] as const;

export type EquipmentInput = {
  name: string;
  category: typeof equipmentCategories[number]['value'];
  description: string;
  location: string;
  hourlyRateHalalas: number | null;
  dailyRateHalalas: number | null;
  operatorMode: 'with_operator' | 'without_operator';
  availability: 'available' | 'unavailable';
  status: 'active' | 'archived';
};
export type Equipment = EquipmentInput & {
  id: string; currency: 'SAR'; version: number; createdAt: string; updatedAt: string;
};
export type EquipmentErrors = Partial<Record<keyof EquipmentInput | 'form', string>>;
const fields = ['name', 'category', 'description', 'location', 'hourlyRateHalalas', 'dailyRateHalalas', 'operatorMode', 'availability', 'status'];

export function validateEquipmentInput(input: unknown): { data?: EquipmentInput; errors: EquipmentErrors } {
  const errors: EquipmentErrors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key))) {
    return { errors: { form: 'أرسل بيانات المعدة فقط؛ المالك والعملة والمعرّف والتواريخ يحددها الخادم.' } };
  }
  const body = input as Record<string, unknown>;
  const text = (key: 'name' | 'description' | 'location', min: number, max: number, label: string) => {
    const raw = body[key];
    const value = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim().normalize('NFC') : '';
    const controls = key === 'description' ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/;
    if (typeof raw !== 'string' || raw.length > max || value.length < min || value.length > max || controls.test(raw)) errors[key] = `${label} من ${min} إلى ${max} حرفًا.`;
    return value;
  };
  const data: EquipmentInput = {
    name: text('name', 3, 120, 'أدخل اسمًا'), category: body.category as EquipmentInput['category'],
    description: text('description', 10, 2000, 'اكتب وصفًا'), location: text('location', 2, 160, 'أدخل موقعًا'),
    hourlyRateHalalas: body.hourlyRateHalalas as number | null, dailyRateHalalas: body.dailyRateHalalas as number | null,
    operatorMode: body.operatorMode as EquipmentInput['operatorMode'], availability: body.availability as EquipmentInput['availability'], status: body.status as EquipmentInput['status'],
  };
  if (!equipmentCategories.some(category => category.value === body.category)) errors.category = 'اختر فئة المعدة.';
  for (const key of ['hourlyRateHalalas', 'dailyRateHalalas'] as const) {
    const price = body[key];
    if (price !== null && (typeof price !== 'number' || !Number.isSafeInteger(price) || price < 1 || price > 100000000)) errors[key] = 'أدخل سعرًا موجبًا حتى 1,000,000 ريال، بدقة هللة واحدة.';
  }
  if (body.hourlyRateHalalas === null && body.dailyRateHalalas === null) errors.hourlyRateHalalas = 'حدد سعر الساعة أو اليوم على الأقل.';
  if (typeof body.operatorMode !== 'string' || !['with_operator', 'without_operator'].includes(body.operatorMode)) errors.operatorMode = 'حدد إن كان السعر مع مشغل أو بدون مشغل.';
  if (typeof body.availability !== 'string' || !['available', 'unavailable'].includes(body.availability)) errors.availability = 'حدد توفر المعدة.';
  if (typeof body.status !== 'string' || !['active', 'archived'].includes(body.status)) errors.status = 'اختر معدة نشطة أو مؤرشفة.';
  return Object.keys(errors).length ? { errors } : { data, errors };
}
