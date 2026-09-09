// Only sections already present in the wheel and the broker branch belong here.
export const PRODUCT_PAGES = [
  { id: '', branchId: null, title: 'منظومة محور التفاعلية', description: 'منظومة متكاملة تربط أطراف العملية في مكان واحد' },
  { id: 'request', branchId: 'request', title: 'الطلب', description: 'تنظيم احتياجك ومتابعة طلباتك بين أطراف العملية' },
  { id: 'broker', branchId: 'broker', title: 'الوسيط', description: 'تسجيل بيانات الوسطاء والوصول إلى وظائف هذا الفرع من مكان واحد' },
  { id: 'offer', branchId: 'offer', title: 'العرض', description: 'مراجعة العروض المرتبطة بطلباتك ومتابعة تفاصيلها' },
  { id: 'execution', branchId: 'execution', title: 'التنفيذ', description: 'تنسيق خطوات التنفيذ ومتابعتها بين الأطراف' },
  { id: 'client', branchId: 'client', title: 'حساب العميل', description: 'تسجيل الدخول أو إنشاء حساب في محور' },
  { id: 'broker-registration', branchId: 'broker', title: 'تسجيل وسيط جديد', description: 'إضافة بيانات وسيط جديد إلى المنظومة' },
  { id: 'broker-management', branchId: 'broker', title: 'إدارة الوسطاء', description: 'متابعة طلبات الوسطاء وحالتها بحسب صلاحية حسابك' },
  { id: 'broker-opportunities', branchId: 'broker', title: 'الفرص المشتركة', description: 'متابعة فرص التعاون مع الوسطاء' },
  { id: 'broker-reports', branchId: 'broker', title: 'الأداء والتقارير', description: 'متابعة أداء الوسطاء' },
  { id: 'broker-settings', branchId: 'broker', title: 'الإعدادات', description: 'إعدادات فرع الوسيط' },
] as const;

export type Page = typeof PRODUCT_PAGES[number]['id'];
export const BROKER_PAGES = PRODUCT_PAGES.filter(page => page.id.startsWith('broker-'));
export const getPage = (id: Page) => PRODUCT_PAGES.find(page => page.id === id)!;
export const pageHref = (id: Page) => id ? `#${id}` : '#';
export function resolvePage(hash: string): Page {
  return PRODUCT_PAGES.find(page => page.id === hash.replace(/^#/, ''))?.id ?? '';
}
