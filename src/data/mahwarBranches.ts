/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MahwarBranch, StepDefinition } from '../types/mahwar';

export const MAHWAR_BRANCHES: MahwarBranch[] = [
  {
    id: 'request',
    number: 1,
    label: 'الطلب',
    badge: '1',
    iconName: 'file-text',
    angle: -90, // 12 o'clock
    cardTitle: 'ابدأ بطلبك',
    cardSubtitle: 'حدد احتياجك بكل سهولة',
    cardDescription: 'مساحة لتنظيم احتياجك ومتابعة طلباتك بين أطراف العملية.',
    colorAccent: '#f59e0b',
  },
  {
    id: 'broker',
    number: 2,
    label: 'الوسيط',
    iconName: 'users',
    angle: -18, // ~2 o'clock
    cardTitle: 'الوسيط',
    cardSubtitle: 'إدارة علاقات الوسطاء وتوسيع الفرص المشتركة',
    cardDescription: 'تسجيل بيانات الوسطاء والوصول إلى وظائف هذا الفرع من مكان واحد.',
    colorAccent: '#fbbf24',
  },
  {
    id: 'offer',
    number: 3,
    label: 'العرض',
    iconName: 'clipboard-check',
    angle: 54, // ~4 o'clock
    cardTitle: 'متابعة العروض',
    cardSubtitle: 'تنظيم العروض المرتبطة بطلباتك',
    cardDescription: 'مساحة لعرض تفاصيل العروض ومراجعتها بين الأطراف.',
    colorAccent: '#f97316',
  },
  {
    id: 'execution',
    number: 4,
    label: 'التنفيذ',
    iconName: 'settings',
    angle: 126, // ~8 o'clock
    cardTitle: 'متابعة التنفيذ',
    cardSubtitle: 'تنسيق خطوات التنفيذ بين الأطراف',
    cardDescription: 'مساحة لمتابعة خطوات العملية وما يرتبط بها من تفاصيل.',
    colorAccent: '#f59e0b',
  },
  {
    id: 'client',
    number: 5,
    label: 'العميل',
    iconName: 'user',
    angle: 198, // ~10 o'clock
    cardTitle: 'حساب العميل',
    cardSubtitle: 'تسجيل الدخول أو إنشاء حساب',
    cardDescription: 'ادخل إلى حسابك باستخدام بريدك الإلكتروني وكلمة المرور، أو أنشئ حسابًا جديدًا في محور.',
    colorAccent: '#d97706',
  },
];

export const MAHWAR_STEPS: StepDefinition[] = [
  {
    step: '01',
    title: 'الحالة الافتراضية',
    description: 'يظهر المحور مغلق بانتظار تفاعل المستخدم',
    targetState: 'closed',
  },
  {
    step: '02',
    title: 'لحظة الضغط',
    description: 'تأثير بصري يوحي بالضغط الفعلي على زر',
    targetState: 'pressing',
  },
  {
    step: '03',
    title: 'صوت وفك القفل',
    description: 'يتم تشغيل صوت "فك القفل" مع حركة فتح واقعية',
    targetState: 'unlocking',
  },
  {
    step: '04',
    title: 'ظهور الفروع',
    description: 'تفتح الفروع بسلاسة مع حركة دائرية جذابة',
    targetState: 'open',
  },
  {
    step: '05',
    title: 'التفاعل مع الفروع',
    description: 'تظهر لوحة وظائف الفرع عند اختياره',
    targetState: 'branch_hover',
  },
  {
    step: '06',
    title: 'إغلاق المحور',
    description: 'يمكن إغلاق المحور عبر المركز أو زر الإغلاق',
    targetState: 'closing',
  },
];
