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
  { id: 'broker-opportunities', branchId: 'broker', title: 'الفرص المشتركة', description: 'الطلبات المناسبة لمعداتك وفرص تقديم العروض' },
  { id: 'broker-reports', branchId: 'broker', title: 'الأرباح والتقارير', description: 'متابعة التقارير المرتبطة بتأجير معداتك' },
  { id: 'broker-settings', branchId: 'broker', title: 'الإعدادات', description: 'إعدادات فرع المؤجر' },
  { id: 'marketplace', branchId: null, title: 'سوق المعدات', description: 'تصفح المعدات والبحث والتصفية للوصول إلى المعدة المناسبة' },
  { id: 'equipment-details', branchId: null, title: 'تفاصيل المعدة', description: 'مواصفات المعدة وتسعيرها وموقعها وتوفرها وخيار المشغل' },
  { id: 'direct-rental', branchId: null, title: 'طلب استئجار مباشر', description: 'مسار الاستئجار بعد اختيار معدة من السوق' },
  { id: 'offer-details', branchId: 'offer', title: 'تفاصيل العرض', description: 'العرض والمعدة والطلب المرتبط به' },
  { id: 'offer-comparison', branchId: 'offer', title: 'مقارنة العروض', description: 'مراجعة العروض المرتبطة باحتياجك قبل الاختيار' },
  { id: 'offer-selection', branchId: 'offer', title: 'اختيار عرض', description: 'الانتقال من العرض المختار إلى الحجز' },
  { id: 'broker-offers', branchId: 'broker', title: 'عروضي', description: 'العروض المقدمة باستخدام معداتك' },
  { id: 'offer-create', branchId: 'broker', title: 'تقديم عرض', description: 'ربط إحدى معداتك بطلب احتياج مناسب' },
  { id: 'broker-bookings', branchId: 'broker', title: 'الحجوزات والعمليات', description: 'الحجوزات المرتبطة بمعداتك ومتابعة تنفيذها' },
  { id: 'bookings', branchId: null, title: 'حجوزاتي', description: 'الحجوزات الناتجة عن الاستئجار المباشر أو اختيار عرض' },
  { id: 'booking-details', branchId: null, title: 'تفاصيل الحجز', description: 'مرجع عملية التأجير وما يرتبط بها من دفع وتنفيذ' },
  { id: 'payments', branchId: null, title: 'المدفوعات والمستحقات', description: 'متابعة المدفوعات ومستحقات التأجير المرتبطة بالحجوزات' },
  { id: 'payment-details', branchId: null, title: 'تفاصيل الدفع', description: 'تفاصيل عملية الدفع المرتبطة بالحجز' },
  { id: 'lessor-payouts', branchId: 'broker', title: 'مستحقات المؤجر', description: 'متابعة المستحقات المرتبطة بتأجير معداتك' },
  { id: 'commission', branchId: null, title: 'عمولة المنصة', description: 'العمولة المرتبطة بمعاملات التأجير' },
  { id: 'refunds', branchId: null, title: 'الاستردادات', description: 'متابعة الاستردادات المرتبطة بعمليات الدفع' },
  { id: 'settlements', branchId: null, title: 'التسويات', description: 'متابعة التسويات المالية المرتبطة بالتأجير' },
  { id: 'execution-details', branchId: 'execution', title: 'تفاصيل التنفيذ', description: 'متابعة تنفيذ الحجز بين المستأجر والمؤجر' },
  { id: 'completion', branchId: 'execution', title: 'إتمام التأجير', description: 'إتمام العملية بعد تنفيذ الحجز' },
  { id: 'documents', branchId: null, title: 'المستندات', description: 'المستندات المرتبطة برحلتك في محور' },
  { id: 'notifications', branchId: null, title: 'الإشعارات', description: 'التحديثات المتعلقة بنشاط حسابك' },
  { id: 'reviews', branchId: null, title: 'التقييمات', description: 'التقييمات المرتبطة بعمليات التأجير المكتملة' },
  { id: 'admin', branchId: null, title: 'الإدارة والتشغيل', description: 'الوصول إلى أعمال الإدارة المتاحة لحسابك' },
  { id: 'admin-equipment', branchId: null, title: 'إدارة المعدات', description: 'مساحة إدارة معدات المنصة' },
  { id: 'admin-transactions', branchId: null, title: 'إدارة المعاملات', description: 'مساحة متابعة معاملات التأجير والتشغيل' },
  { id: 'admin-payments', branchId: null, title: 'إدارة المدفوعات', description: 'مساحة متابعة المدفوعات والمستحقات والتسويات' },
  { id: 'admin-disputes', branchId: null, title: 'النزاعات', description: 'مساحة متابعة النزاعات المرتبطة بالتأجير' },
] as const;

export type Page = typeof PRODUCT_PAGES[number]['id'];
export const getPage = (id: Page) => PRODUCT_PAGES.find(page => page.id === id)!;
export const pageHref = (id: Page) => id ? `#${id}` : '#';
export const PRIMARY_PAGES = ['', 'marketplace', 'request', 'broker', 'offer', 'bookings', 'payments', 'execution', 'client'] as const satisfies readonly Page[];
export const SECTION_PAGES = {
  marketplace: ['marketplace', 'equipment-details', 'direct-rental'],
  request: ['request', 'offer', 'offer-comparison'],
  broker: ['broker-registration', 'equipment', 'broker-management', 'broker-opportunities', 'broker-offers', 'broker-bookings', 'lessor-payouts', 'broker-reports', 'broker-settings'],
  offer: ['offer', 'offer-details', 'offer-comparison', 'offer-selection'],
  bookings: ['bookings', 'booking-details'],
  payments: ['payments', 'payment-details', 'commission', 'lessor-payouts', 'refunds', 'settlements'],
  execution: ['execution', 'execution-details', 'completion', 'reviews'],
  client: ['client', 'notifications', 'documents', 'reviews'],
} as const satisfies Partial<Record<Page, readonly Page[]>>;
export const BROKER_PAGES = SECTION_PAGES.broker.map(id => getPage(id));

const parents: Partial<Record<Page, Page>> = {
  'equipment-details': 'marketplace', 'direct-rental': 'marketplace',
  'broker-registration': 'broker', equipment: 'broker', 'broker-management': 'broker',
  'broker-opportunities': 'broker', 'broker-reports': 'broker', 'broker-settings': 'broker',
  'broker-offers': 'broker', 'offer-create': 'broker-offers', 'broker-bookings': 'broker',
  'lessor-payouts': 'payments', 'offer-details': 'offer', 'offer-comparison': 'offer', 'offer-selection': 'offer',
  'booking-details': 'bookings', 'payment-details': 'payments', commission: 'payments', refunds: 'payments', settlements: 'payments',
  'execution-details': 'execution', completion: 'execution', notifications: 'client', documents: 'client', reviews: 'client',
  admin: 'client', 'admin-requests': 'admin', 'admin-equipment': 'admin', 'admin-transactions': 'admin', 'admin-payments': 'admin', 'admin-disputes': 'admin',
};
export const getParentPage = (page: Page): Page => parents[page] ?? '';
export function getSectionRoot(page: Page): Page {
  if (page === 'admin' || page.startsWith('admin-')) return 'admin';
  let root: Page = page;
  while (parents[root]) root = parents[root]!;
  return root;
}
export function resolvePage(hash: string): Page {
  return PRODUCT_PAGES.find(page => page.id === hash.replace(/^#/, ''))?.id ?? '';
}
