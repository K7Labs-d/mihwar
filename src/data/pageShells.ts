import type { Page } from './productPages';

export type ShellIcon = 'equipment' | 'offers' | 'booking' | 'payment' | 'execution' | 'documents' | 'notifications' | 'reviews';
type PageShellDefinition = {
  section: string;
  icon: ShellIcon;
  emptyTitle: string;
  description: string;
  journey: readonly Page[];
  related: readonly Page[];
};

// These paths describe the blueprint's navigation, never a saved transaction or its progress.
const directJourney = ['marketplace', 'equipment-details', 'direct-rental', 'booking-details'] as const;
const requestJourney = ['request', 'offer', 'offer-comparison', 'offer-selection', 'booking-details'] as const;
const lessorJourney = ['equipment', 'broker-opportunities', 'offer-create', 'broker-offers', 'broker-bookings'] as const;
const bookingJourney = ['bookings', 'booking-details', 'payment-details', 'execution-details', 'completion', 'reviews'] as const;
const paymentJourney = ['payments', 'payment-details', 'commission', 'lessor-payouts', 'settlements'] as const;

// TODO(marketplace): integrate the reviewed public equipment contract and record-specific routes.
// Equipment owned by the signed-in lessor remains managed by the existing /#equipment page.
export const PAGE_SHELLS = {
  marketplace: {
    section: 'سوق المعدات', icon: 'equipment', emptyTitle: 'تصفح المعدات قيد الإكمال',
    description: 'لم يُفعّل عرض معدات المؤجرين في السوق بعد. البحث والتصفية سيصبحان متاحين عند اكتمال ربط السوق بالمعدات الفعلية.',
    journey: directJourney, related: ['request', 'equipment', 'broker'],
  },
  'equipment-details': {
    section: 'سوق المعدات', icon: 'equipment', emptyTitle: 'تفاصيل معدات السوق غير متاحة بعد',
    description: 'هذه الصفحة غير مرتبطة بمعدة محددة بعد. عرض المواصفات والأسعار والتوفر هنا يعتمد على اكتمال تصفح السوق وربط صفحة التفاصيل بالمعدة.',
    journey: directJourney, related: ['marketplace', 'equipment'],
  },
  // TODO(direct-rental): define duration/operator input, availability checks and the Booking contract.
  'direct-rental': {
    section: 'الاستئجار المباشر', icon: 'booking', emptyTitle: 'طلب الاستئجار المباشر قيد الإكمال',
    description: 'لم يُفعّل ربط المعدة بالمدة وخيار المشغل وطلب الاستئجار بعد. استعراض هذه الصفحة لا ينشئ طلبًا أو حجزًا.',
    journey: directJourney, related: ['marketplace', 'request', 'bookings'],
  },
  // TODO(offers): define Request + Equipment offer records, ownership, comparison and acceptance.
  // No fields, calculated prices, selection state or mutation are inferred in this shell.
  'offer-details': {
    section: 'العروض', icon: 'offers', emptyTitle: 'تفاصيل العرض قيد الإكمال',
    description: 'هذه الصفحة غير مرتبطة بعرض محفوظ بعد. عرض تفاصيله يتطلب ربطه بطلب احتياج ومعدة مملوكة لمؤجر معتمد.',
    journey: requestJourney, related: ['offer', 'offer-comparison', 'broker-offers'],
  },
  'offer-comparison': {
    section: 'العروض المستلمة', icon: 'offers', emptyTitle: 'مقارنة العروض غير متاحة بعد',
    description: 'لم يُفعّل استقبال العروض المرتبطة بطلبك ومقارنتها بعد. لا توجد هنا عروض أو أسعار جرى جلبها للمقارنة.',
    journey: requestJourney, related: ['offer', 'offer-details', 'request'],
  },
  'offer-selection': {
    section: 'العروض المستلمة', icon: 'offers', emptyTitle: 'اختيار العرض قيد الإكمال',
    description: 'لم يُفعّل اختيار عرض محفوظ وتحويله إلى حجز بعد. التنقل إلى هذه الصفحة لا يعني قبول عرض أو تأكيد حجز.',
    journey: requestJourney, related: ['offer-comparison', 'offer-details', 'bookings'],
  },
  'broker-offers': {
    section: 'تأجير معداتي', icon: 'offers', emptyTitle: 'متابعة عروض المؤجر قيد الإكمال',
    description: 'لم يُفعّل إنشاء العروض ومتابعتها بعد. ستعتمد هذه الرحلة على ربط طلبات الاحتياج بمعداتك وأسعارها المسجلة.',
    journey: lessorJourney, related: ['broker', 'equipment', 'offer-details'],
  },
  'offer-create': {
    section: 'تأجير معداتي', icon: 'offers', emptyTitle: 'تقديم عرض قيد الإكمال',
    description: 'لم يُفعّل اختيار معدة من معداتك لتقديمها لطلب مناسب بعد. يمكنك إدارة معداتك الحالية، بينما إرسال العروض غير متاح في هذه الصفحة.',
    journey: lessorJourney, related: ['equipment', 'broker-opportunities', 'broker-offers'],
  },
  // TODO(bookings): define Booking identity, permitted actors/actions and the two source paths.
  'broker-bookings': {
    section: 'تأجير معداتي', icon: 'booking', emptyTitle: 'متابعة حجوزات المؤجر قيد الإكمال',
    description: 'لم يُفعّل إنشاء الحجوزات وربطها بمعدات المؤجر بعد. هذه الصفحة لا تجلب حجوزات أو عمليات فعلية في الوقت الحالي.',
    journey: lessorJourney, related: ['booking-details', 'execution', 'lessor-payouts', 'broker'],
  },
  bookings: {
    section: 'حجوزاتي', icon: 'booking', emptyTitle: 'متابعة الحجوزات قيد الإكمال',
    description: 'لم يُفعّل إنشاء الحجوزات من الاستئجار المباشر أو العروض المقبولة بعد. لا تُعرض هنا قائمة حجوزات جرى جلبها من حسابك.',
    journey: bookingJourney, related: ['marketplace', 'request', 'broker-bookings'],
  },
  'booking-details': {
    section: 'حجوزاتي', icon: 'booking', emptyTitle: 'تفاصيل الحجز غير متاحة بعد',
    description: 'هذه الصفحة غير مرتبطة بحجز محفوظ بعد. الحجز سيكون المرجع الذي يجمع المعدة ومسار الاستئجار والدفع والتنفيذ.',
    journey: bookingJourney, related: ['direct-rental', 'offer-selection', 'broker-bookings', 'documents'],
  },
  // TODO(payments): approve collection, commission, payout, settlement and refund contracts/policies.
  // No provider, fees, totals, eligibility, timing or financial permissions have been specified here.
  payments: {
    section: 'المدفوعات والمستحقات', icon: 'payment', emptyTitle: 'متابعة المدفوعات قيد الإكمال',
    description: 'لم يُفعّل تحصيل المدفوعات داخل محور وربطها بالحجوزات بعد. لا توجد في هذه الصفحة مبالغ أو عمليات دفع جرى جلبها.',
    journey: paymentJourney, related: ['bookings', 'lessor-payouts', 'refunds'],
  },
  'payment-details': {
    section: 'المدفوعات والمستحقات', icon: 'payment', emptyTitle: 'تفاصيل الدفع غير متاحة بعد',
    description: 'هذه الصفحة غير مرتبطة بعملية دفع محفوظة. عرض المبلغ وتفاصيل التحصيل يتطلب حجزًا فعليًا وتفعيل الدفع داخل المنصة.',
    journey: paymentJourney, related: ['booking-details', 'payments', 'refunds'],
  },
  'lessor-payouts': {
    section: 'المدفوعات والمستحقات', icon: 'payment', emptyTitle: 'مستحقات المؤجر قيد الإكمال',
    description: 'لم يُفعّل احتساب مستحقات المؤجر وفصلها عن عمولة المنصة بعد. لا يُعرض هنا رصيد متاح أو موعد تحويل.',
    journey: paymentJourney, related: ['broker-bookings', 'broker-reports', 'settlements'],
  },
  settlements: {
    section: 'المدفوعات والمستحقات', icon: 'payment', emptyTitle: 'التسويات قيد الإكمال',
    description: 'لم يُفعّل ربط التسويات بالمدفوعات ومستحقات المؤجرين بعد. عرض التسويات يعتمد على اكتمال دورة الحجز والدفع.',
    journey: paymentJourney, related: ['payments', 'lessor-payouts', 'broker-reports'],
  },
  commission: {
    section: 'المدفوعات والمستحقات', icon: 'payment', emptyTitle: 'تفاصيل عمولة المنصة قيد الإكمال',
    description: 'لم يُفعّل احتساب عمولة محور وربطها بالمعاملة بعد. لا تحدد هذه الصفحة نسبة عمولة أو مبلغًا مستقطعًا.',
    journey: paymentJourney, related: ['payment-details', 'lessor-payouts'],
  },
  refunds: {
    section: 'المدفوعات والمستحقات', icon: 'payment', emptyTitle: 'الاستردادات قيد الإكمال',
    description: 'لم يُفعّل طلب الاسترداد ومتابعته بعد. سيعتمد على عملية دفع فعلية وسياسة استرداد معتمدة؛ لا تنشئ هذه الصفحة طلب استرداد.',
    journey: ['bookings', 'payment-details', 'refunds'], related: ['payments', 'settlements'],
  },
  // TODO(execution): specify the Booking-backed lifecycle and actors for each transition/evidence.
  'execution-details': {
    section: 'التنفيذ', icon: 'execution', emptyTitle: 'تفاصيل التنفيذ قيد الإكمال',
    description: 'هذه الصفحة غير مرتبطة بتنفيذ حجز محفوظ بعد. تأكيد العمل وبدؤه ومتابعته وإتمامه تتطلب اكتمال ربط التنفيذ بالحجز.',
    journey: bookingJourney, related: ['execution', 'broker-bookings', 'documents'],
  },
  completion: {
    section: 'التنفيذ', icon: 'execution', emptyTitle: 'إتمام التأجير قيد الإكمال',
    description: 'لم يُفعّل إتمام العمل وإغلاق الحجز بعد. استعراض هذه الخطوة لا يسجل إتمامًا ولا يغيّر حالة أي عملية.',
    journey: bookingJourney, related: ['execution-details', 'documents', 'reviews'],
  },
  // TODO(documents): define document types, owning records, access rules, storage and verification.
  documents: {
    section: 'المستندات', icon: 'documents', emptyTitle: 'المستندات قيد الإكمال',
    description: 'لم يُفعّل رفع المستندات أو التحقق منها وربطها بالرحلة بعد. لا تُعرض هنا ملفات محفوظة أو مستندات جرى جلبها من حسابك.',
    journey: ['client', 'documents'], related: ['broker', 'bookings', 'execution'],
  },
  // TODO(notifications): define supported events, recipient ownership, delivery and read-state API.
  notifications: {
    section: 'الحساب', icon: 'notifications', emptyTitle: 'الإشعارات قيد الإكمال',
    description: 'لم يُفعّل تجميع إشعارات الحساب وعرضها بعد. يمكنك متابعة الطلبات والردود الحالية من صفحة طلباتي.',
    journey: ['client', 'notifications'], related: ['request', 'broker-offers', 'bookings'],
  },
  // TODO(reviews): define eligibility, reviewed subject, allowed fields and moderation after completion.
  reviews: {
    section: 'التقييمات', icon: 'reviews', emptyTitle: 'التقييم بعد التأجير قيد الإكمال',
    description: 'لم يُفعّل ربط التقييم بإتمام التأجير بعد. لا تُعرض تقييمات أو متوسطات، ولا يمكن إرسال تقييم من هذه الصفحة.',
    journey: bookingJourney, related: ['completion', 'bookings', 'client'],
  },
} as const satisfies Record<string, PageShellDefinition>;

export type ShellPage = keyof typeof PAGE_SHELLS;
export function isShellPage(page: Page): page is ShellPage {
  return Object.hasOwn(PAGE_SHELLS, page);
}
