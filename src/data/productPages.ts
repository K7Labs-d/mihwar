// Keep existing route IDs stable while adapting the lessor branch from the blueprint.
export const PRODUCT_PAGES = [
  { id: 'admin-requests', branchId: null, title: 'إدارة الطلبات', description: 'استقبال طلبات العملاء والرد عليها' },
  { id: '', branchId: null, title: 'منظومة محور التفاعلية', description: 'منظومة متكاملة تربط أطراف العملية في مكان واحد' },
  { id: 'request', branchId: 'request', title: 'الطلب', description: 'تنظيم احتياجك ومتابعة طلباتك بين أطراف العملية' },
  { id: 'broker', branchId: 'broker', title: 'تأجير معداتي', description: 'التسجيل كمؤجر وإدارة معداتك من حسابك الحالي' },
  { id: 'offer', branchId: 'offer', title: 'العرض', description: 'مراجعة العروض المرتبطة بطلباتك ومتابعة تفاصيلها' },
  { id: 'execution', branchId: 'execution', title: 'التنفيذ', description: 'تنسيق خطوات التنفيذ ومتابعتها بين الأطراف' },
  { id: 'client', branchId: 'client', title: 'حسابي', description: 'حساب واحد للاستئجار وتأجير المعدات في محور' },
  { id: 'broker-registration', branchId: 'broker', title: 'التسجيل كمؤجر', description: 'أكمل بياناتك لطلب اعتمادك كمؤجر للمعدات' },
  { id: 'equipment', branchId: 'broker', title: 'معداتـي', description: 'إضافة معداتك وإدارة مواصفاتها وأسعارها وتوفرها' },
  { id: 'broker-management', branchId: 'broker', title: 'طلبات اعتماد المؤجرين', description: 'متابعة طلبك أو مراجعة الطلبات بحسب صلاحية حسابك' },
  { id: 'broker-opportunities', branchId: 'broker', title: 'الفرص المشتركة', description: 'متابعة فرص التعاون مع المؤجرين' },
  { id: 'broker-reports', branchId: 'broker', title: 'الأداء والتقارير', description: 'متابعة أداء المؤجرين' },
  { id: 'broker-settings', branchId: 'broker', title: 'الإعدادات', description: 'إعدادات فرع المؤجر' },
] as const;

export type Page = typeof PRODUCT_PAGES[number]['id'];
export const BROKER_PAGES = PRODUCT_PAGES.filter(page => page.branchId === 'broker' && page.id !== 'broker');
export const getPage = (id: Page) => PRODUCT_PAGES.find(page => page.id === id)!;
export const pageHref = (id: Page) => id ? `#${id}` : '#';
export function resolvePage(hash: string): Page {
  return PRODUCT_PAGES.find(page => page.id === hash.replace(/^#/, ''))?.id ?? '';
}
