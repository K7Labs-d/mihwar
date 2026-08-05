/* ==========================================================================
   مِحور — طبقة البيانات المشتركة
   مصدر واحد للحقيقة يخدمه الموقع العام ولوحة الإدارة معاً: نفس المفتاح في
   localStorage، ونفس شكل السجل، ونفس مسميات الحالات. أي تعديل في اللوحة يظهر
   للزائر مباشرة، وأي طلب يرسله الزائر يصل إلى اللوحة.

   التخزين محلي بالكامل — لا backend ولا قاعدة بيانات. راجع mihwar/README.md.
   ========================================================================== */

(function (global) {
  'use strict';

  var STORAGE_KEY = 'mihwar-data-v4';
  var LEGACY_KEY = 'mihwar-admin-data-v3';   // نسخة اللوحة قبل توحيد البيانات

  var VAT = 0.15;
  var DEFAULT_OPERATOR_PER_DAY = 420;
  var DEFAULT_TRANSPORT_FLAT = 900;

  // الأسبوع بخصم يعادل 6 أيام، والشهر يعادل 21.4 يوماً تقريباً
  var WEEK_FACTOR = 6;
  var MONTH_FACTOR = 21.4;

  /* ------------------------------ التصنيفات ------------------------------ */

  var CATEGORIES = [
    { key: 'dig',  label: 'حفر',   icon: 'i-excavator',   blurb: 'حفّارات جنزير وحفّارات صغيرة' },
    { key: 'load', label: 'تحميل', icon: 'i-loader',      blurb: 'شيولات وبوبكات' },
    { key: 'haul', label: 'نقل',   icon: 'i-dumptruck',   blurb: 'قلابات ونقل مواد' },
    { key: 'lift', label: 'رفع',   icon: 'i-mobilecrane', blurb: 'رافعات متحركة ومناولات' }
  ];

  var CITIES = [
    { key: 'riyadh', label: 'الرياض' },
    { key: 'jeddah', label: 'جدة' },
    { key: 'dammam', label: 'الدمام' }
  ];

  /* --------------------------- مسميات الحالات --------------------------- */

  var ORDER_STATUS_LABELS = {
    new: 'جديد',
    contacting: 'جارٍ التواصل',
    reviewed: 'تمت المراجعة',
    awaiting_owner: 'بانتظار موافقة المالك',
    approved: 'تمت الموافقة',
    confirmed: 'مؤكد',
    in_progress: 'قيد التنفيذ',
    delivered: 'تم التسليم',
    returned: 'تم الإرجاع',
    completed: 'مكتمل',
    closed: 'مغلق',
    rejected: 'مرفوض',
    cancelled: 'ملغي'
  };

  var EQUIPMENT_STATUS_LABELS = {
    active: 'معروضة',
    displayed: 'معروضة',
    pending: 'بانتظار المراجعة',
    pending_review: 'بانتظار المراجعة',
    booked: 'محجوزة',
    unavailable: 'غير متاحة',
    paused: 'موقوفة',
    suspended: 'موقوفة'
  };

  var OWNER_VERIFICATION_LABELS = {
    verified: 'موثق',
    pending: 'بانتظار التحقق',
    rejected: 'مرفوض'
  };

  var ACCOUNT_STATUS_LABELS = {
    active: 'نشط',
    suspended: 'موقوف',
    inactive: 'غير نشط'
  };

  var DOCUMENT_STATUS_LABELS = {
    verified: 'موثق',
    pending: 'بانتظار المراجعة',
    rejected: 'مرفوض',
    signed: 'موقّع',
    expired: 'منتهي'
  };

  var PAYMENT_STATUS_LABELS = {
    pending: 'بانتظار الدفع',
    unpaid: 'غير مدفوع',
    partially_paid: 'مدفوع جزئيًا',
    paid: 'مدفوع',
    confirmed: 'الدفع مؤكد',
    failed: 'فشل الدفع',
    refunded: 'مسترد'
  };

  // حالات عامة تظهر على الحجوزات وسجلات الصيانة والعمليات المالية
  var RECORD_STATUS_LABELS = {
    completed: 'مكتملة',
    active: 'جارية',
    scheduled: 'مجدولة',
    upcoming: 'قادمة',
    pending: 'معلّقة',
    cancelled: 'ملغاة',
    due: 'مستحقة',
    transferred: 'محوّلة',
    paid: 'مدفوعة',
    failed: 'فاشلة'
  };

  /* ------------------------- نصوص متكررة في العرض ------------------------- */

  var RENTER_DOCUMENTS = [
    'السجل التجاري ساري المفعول للمنشأة المستأجرة',
    'الشهادة الضريبية (الرقم الضريبي) لإصدار فاتورة نظامية',
    'هوية المفوّض بالتوقيع وخطاب تفويض',
    'عنوان الموقع ورخصة البناء أو تصريح العمل',
    'رخصة قيادة معدات ثقيلة سارية — إن كنت ستشغّلها بطاقمك'
  ];

  var VERIFIED_DOCUMENTS = [
    'استمارة المعدة سارية',
    'شهادة الفحص الدوري سارية',
    'ما يثبت ملكية المؤسسة للمعدة'
  ];

  /* ------------------------------ البيانات ------------------------------ */

  var SEED = {
    owners: [
      {
        id: 'OW-1001', name: 'مؤسسة الراسخ للمقاولات', contact: '0551000100', city: 'الرياض',
        verification: 'verified', accountStatus: 'active', memberSince: '2024',
        lastLogin: '2026-07-28T07:20:00.000Z',
        documents: [
          { name: 'السجل التجاري', status: 'verified', note: 'ساري حتى 2027' },
          { name: 'إثبات ملكية المعدات', status: 'verified', note: 'ثلاث معدات' }
        ],
        ratings: [
          { author: 'شركة إعمار الشرق', value: 5, comment: 'تسليم في الموعد وشروط واضحة.', date: '2026-06-18' },
          { author: 'مقاولات النخبة', value: 4, comment: 'تواصل سريع، تأخر النقل ساعتين.', date: '2026-05-02' }
        ],
        activity: [],
        earnings: {
          total: 86400, due: 12600, transferred: 73800,
          transactions: [
            { id: 'TR-2041', date: '2026-07-05', label: 'تحويل مستحقات يونيو', status: 'transferred', amount: 41200 },
            { id: 'TR-2088', date: '2026-08-01', label: 'مستحقات يوليو', status: 'due', amount: 12600 }
          ]
        }
      },
      {
        id: 'OW-1002', name: 'شركة البناء الحديث', contact: '0551000200', city: 'جدة',
        verification: 'verified', accountStatus: 'active', memberSince: '2024',
        lastLogin: '2026-07-30T11:05:00.000Z',
        documents: [{ name: 'السجل التجاري', status: 'verified', note: 'ساري حتى 2028' }],
        ratings: [{ author: 'مؤسسة الديار', value: 4, comment: 'معدة نظيفة ومطابقة للوصف.', date: '2026-04-11' }],
        activity: [],
        earnings: { total: 19000, due: 0, transferred: 19000, transactions: [] }
      },
      {
        id: 'OW-1003', name: 'مؤسسة سند للنقل', contact: '0551000300', city: 'الدمام',
        verification: 'pending', accountStatus: 'active', memberSince: '2026',
        lastLogin: '2026-08-02T06:40:00.000Z',
        documents: [{ name: 'السجل التجاري', status: 'pending', note: 'بانتظار مراجعة الفريق' }],
        ratings: [], activity: [],
        earnings: { total: 0, due: 0, transferred: 0, transactions: [] }
      },
      {
        id: 'OW-1004', name: 'مجموعة الأفق للرافعات', contact: '0551000400', city: 'جدة',
        verification: 'verified', accountStatus: 'active', memberSince: '2025',
        lastLogin: '2026-07-21T13:15:00.000Z',
        documents: [
          { name: 'السجل التجاري', status: 'verified', note: 'ساري حتى 2027' },
          { name: 'شهادة سلامة الرافعات', status: 'pending', note: 'نسخة محدّثة مطلوبة' }
        ],
        ratings: [{ author: 'شركة المسار', value: 5, comment: 'مشغّل خبير والتزام تام بالمواعيد.', date: '2026-03-27' }],
        activity: [],
        earnings: { total: 132000, due: 0, transferred: 132000, transactions: [] }
      }
    ],

    equipment: [
      {
        id: 'EQ-2001', slug: 'skidsteer-s650', name: 'بوبكات S650', model: 'Bobcat S650 — لودر انزلاقي',
        ownerId: 'OW-1001', category: 'تحميل', city: 'الرياض', dailyRate: 600,
        status: 'active', availability: 'available', icon: 'i-skidsteer',
        search: 'بوبكات S650 لودر انزلاقي skid steer bobcat',
        highlights: ['74 حصان', 'حمولة 1,327 كجم', 'موديل 2022'],
        summary: 'لودر انزلاقي مناسب للمواقع الضيقة وأعمال التسوية ونقل المواد داخل الموقع.',
        operatorPerDay: 320, transportFlat: 450,
        specs: [
          { label: 'الطراز', value: 'Bobcat S650 — لودر انزلاقي' },
          { label: 'سنة الصنع', value: '2022' },
          { label: 'قدرة المحرك', value: '74 حصان (55 ك.و)' },
          { label: 'حمولة التشغيل', value: '1,327 كجم' },
          { label: 'وزن التشغيل', value: '3.7 طن' },
          { label: 'عرض الجسم', value: '1.8 متر' },
          { label: 'ساعات التشغيل', value: '1,900 ساعة تقريباً' },
          { label: 'المقصورة', value: 'مكيّفة ومغلقة' }
        ],
        included: ['قادوس قياسي', '8 ساعات تشغيل يومياً', 'فحص تسليم موثّق بالصور'],
        excluded: ['الوقود ومواد التشغيل', 'أجرة المشغّل (تُضاف اختيارياً)', 'النقل من وإلى الموقع', 'تصاريح العمل البلدية'],
        terms: [
          { label: 'أقل مدة تأجير', value: 'يوم واحد (8 ساعات تشغيل)' },
          { label: 'ساعات التشغيل اليومية', value: '8 ساعات — الساعة الإضافية 90 ر.س' },
          { label: 'الوقود', value: 'على المستأجر — تُسلَّم وتُستعاد بخزان ممتلئ' },
          { label: 'المشغّل', value: 'اختياري من المالك' },
          { label: 'مبلغ التأمين المسترد', value: '1,500 ر.س يُرد بعد الفحص عند الإرجاع' },
          { label: 'الإلغاء', value: 'مجاني قبل 24 ساعة من موعد التسليم' },
          { label: 'نطاق التشغيل', value: 'داخل حدود أمانة الرياض' }
        ],
        documents: [
          { name: 'استمارة المعدة', type: 'استمارة', status: 'verified', expiresAt: '2027-03-01' },
          { name: 'شهادة الفحص الدوري', type: 'فحص دوري', status: 'verified', expiresAt: '2027-01-15' }
        ],
        maintenance: [], bookings: [], activity: [],
        createdAt: '2026-01-12T08:00:00.000Z'
      },
      {
        id: 'EQ-2002', slug: 'mini-excavator-5t', name: 'حفّار صغير 5 طن', model: 'حفّار مصغّر هيدروليكي',
        ownerId: 'OW-1002', category: 'حفر', city: 'جدة', dailyRate: 950,
        status: 'active', availability: 'available', icon: 'i-miniexcavator',
        search: 'حفّار صغير 5 طن ميني حفارة mini excavator',
        highlights: ['40 حصان', 'عمق 3.8 م', 'موديل 2021'],
        summary: 'حفّار مصغّر لأعمال الخنادق والتمديدات والحفر المحدود داخل الأحياء السكنية.',
        operatorPerDay: 340, transportFlat: 520,
        specs: [
          { label: 'الطراز', value: 'حفّار مصغّر هيدروليكي' },
          { label: 'سنة الصنع', value: '2021' },
          { label: 'قدرة المحرك', value: '40 حصان (30 ك.و)' },
          { label: 'وزن التشغيل', value: '5.1 طن' },
          { label: 'أقصى عمق حفر', value: '3.80 متر' },
          { label: 'أقصى مدى وصول', value: '6.10 متر' },
          { label: 'سعة القادوس', value: '0.18 متر مكعّب' },
          { label: 'نوع الجنزير', value: 'مطاطي — عرض 400 ملم' }
        ],
        included: ['قادوس حفر قياسي', '8 ساعات تشغيل يومياً', 'فحص تسليم موثّق بالصور'],
        excluded: ['الوقود ومواد التشغيل', 'أجرة المشغّل (تُضاف اختيارياً)', 'النقل من وإلى الموقع', 'تصاريح العمل البلدية'],
        terms: [
          { label: 'أقل مدة تأجير', value: 'يوم واحد (8 ساعات تشغيل)' },
          { label: 'ساعات التشغيل اليومية', value: '8 ساعات — الساعة الإضافية 110 ر.س' },
          { label: 'الوقود', value: 'على المستأجر — تُسلَّم وتُستعاد بخزان ممتلئ' },
          { label: 'المشغّل', value: 'اختياري من المالك' },
          { label: 'مبلغ التأمين المسترد', value: '2,000 ر.س يُرد بعد الفحص عند الإرجاع' },
          { label: 'الإلغاء', value: 'مجاني قبل 48 ساعة من موعد التسليم' },
          { label: 'نطاق التشغيل', value: 'داخل حدود أمانة جدة' }
        ],
        documents: [
          { name: 'استمارة المعدة', type: 'استمارة', status: 'verified', expiresAt: '2027-05-20' },
          { name: 'شهادة الفحص الدوري', type: 'فحص دوري', status: 'verified', expiresAt: '2026-11-30' }
        ],
        maintenance: [], bookings: [], activity: [],
        createdAt: '2026-02-03T08:00:00.000Z'
      },
      {
        id: 'EQ-2003', slug: 'dumptruck-30t', name: 'قلاب 30 طن', model: 'شاحنة قلابة 6×4',
        ownerId: 'OW-1003', category: 'نقل', city: 'الدمام', dailyRate: 1300,
        status: 'active', availability: 'available', icon: 'i-dumptruck',
        search: 'قلاب 30 طن شاحنة نقل dump truck',
        highlights: ['حمولة 30 طن', '6×4', 'موديل 2020'],
        summary: 'قلاب لنقل الرمل والبحص ومخلفات الهدم بين الموقع والمرمى المعتمد.',
        operatorPerDay: 380, transportFlat: 0,
        specs: [
          { label: 'الطراز', value: 'شاحنة قلابة 6×4' },
          { label: 'سنة الصنع', value: '2020' },
          { label: 'الحمولة القصوى', value: '30 طن' },
          { label: 'سعة الصندوق', value: '18 متر مكعّب' },
          { label: 'نظام الدفع', value: '6×4' },
          { label: 'قدرة المحرك', value: '380 حصان' },
          { label: 'العداد', value: '210,000 كم تقريباً' }
        ],
        included: ['سائق المالك ضمن السعر اليومي', '8 ساعات تشغيل يومياً', 'فحص تسليم موثّق بالصور'],
        excluded: ['الوقود', 'رسوم المرمى والتصاريح', 'العمل خارج نطاق المدينة دون موافقة مسبقة'],
        terms: [
          { label: 'أقل مدة تأجير', value: 'يوم واحد (8 ساعات تشغيل)' },
          { label: 'ساعات التشغيل اليومية', value: '8 ساعات — الساعة الإضافية 150 ر.س' },
          { label: 'الوقود', value: 'على المستأجر' },
          { label: 'السائق', value: 'من المالك — لا يُسلَّم القلاب بلا سائقه' },
          { label: 'مبلغ التأمين المسترد', value: 'لا يوجد' },
          { label: 'الإلغاء', value: 'مجاني قبل 24 ساعة من موعد التسليم' },
          { label: 'نطاق التشغيل', value: 'داخل المنطقة الشرقية' }
        ],
        documents: [{ name: 'استمارة المركبة', type: 'استمارة', status: 'verified', expiresAt: '2027-02-10' }],
        maintenance: [], bookings: [], activity: [],
        createdAt: '2026-05-19T08:00:00.000Z'
      },
      {
        id: 'EQ-2004', slug: 'wheel-loader-3m3', name: 'شيول 3 م³', model: 'لودر عجل هيدروليكي',
        ownerId: 'OW-1001', category: 'تحميل', city: 'الرياض', dailyRate: 1900,
        status: 'active', availability: 'available', icon: 'i-loader',
        search: 'شيول 3 م³ لودر عجل wheel loader',
        highlights: ['167 حصان', 'قادوس 3 م³', 'موديل 2020'],
        summary: 'لودر عجل لتحميل الشاحنات وتحريك كميات الردم الكبيرة داخل الموقع.',
        operatorPerDay: 400, transportFlat: 750,
        specs: [
          { label: 'الطراز', value: 'لودر عجل هيدروليكي' },
          { label: 'سنة الصنع', value: '2020' },
          { label: 'قدرة المحرك', value: '167 حصان (125 ك.و)' },
          { label: 'سعة القادوس', value: '3.0 متر مكعّب' },
          { label: 'وزن التشغيل', value: '17.4 طن' },
          { label: 'أقصى ارتفاع تفريغ', value: '2.95 متر' },
          { label: 'ساعات التشغيل', value: '6,800 ساعة تقريباً' },
          { label: 'المقصورة', value: 'مكيّفة، مطابقة لمعايير ROPS' }
        ],
        included: ['القادوس القياسي 3 م³', '8 ساعات تشغيل يومياً', 'فحص تسليم موثّق بالصور'],
        excluded: ['الوقود ومواد التشغيل', 'أجرة المشغّل (تُضاف اختيارياً)', 'النقل من وإلى الموقع', 'تصاريح العمل البلدية'],
        terms: [
          { label: 'أقل مدة تأجير', value: 'يوم واحد (8 ساعات تشغيل)' },
          { label: 'ساعات التشغيل اليومية', value: '8 ساعات — الساعة الإضافية 140 ر.س' },
          { label: 'الوقود', value: 'على المستأجر — تُسلَّم وتُستعاد بخزان ممتلئ' },
          { label: 'المشغّل', value: 'اختياري من المالك؛ لا يُسمح بمشغّل من طرفك دون موافقته الخطية' },
          { label: 'مبلغ التأمين المسترد', value: '3,500 ر.س يُرد بعد الفحص عند الإرجاع' },
          { label: 'الإلغاء', value: 'مجاني قبل 48 ساعة من موعد التسليم' },
          { label: 'نطاق التشغيل', value: 'داخل حدود أمانة الرياض — خارجها يتطلب موافقة مسبقة' }
        ],
        documents: [
          { name: 'استمارة المعدة', type: 'استمارة', status: 'verified', expiresAt: '2027-04-08' },
          { name: 'شهادة الفحص الدوري', type: 'فحص دوري', status: 'verified', expiresAt: '2026-12-01' }
        ],
        maintenance: [], bookings: [], activity: [],
        createdAt: '2026-01-12T08:00:00.000Z'
      },
      {
        id: 'EQ-2005', slug: 'excavator-cat-320', name: 'حفّار جنزير 22 طن', model: 'كاتربيلر 320',
        ownerId: 'OW-1001', category: 'حفر', city: 'الرياض', dailyRate: 3500,
        weeklyRate: 21000, monthlyRate: 75000,
        status: 'active', availability: 'available', icon: 'i-excavator',
        detailPath: 'equipment/excavator-cat-320.html',
        search: 'حفّار جنزير 22 طن كاتربيلر 320 crawler excavator caterpillar',
        highlights: ['122 حصان', 'عمق 6.7 م', 'موديل 2021'],
        summary: 'حفّار جنزير هيدروليكي مناسب لأعمال الحفر والأساسات والهدم الخفيف في المواقع الحضرية.',
        operatorPerDay: 420, transportFlat: 900,
        specs: [
          { label: 'الطراز', value: 'Caterpillar 320 — حفارة زاحفة هيدروليكية' },
          { label: 'سنة الصنع', value: '2021' },
          { label: 'قدرة المحرك', value: '122 حصان (91 ك.و)' },
          { label: 'وزن التشغيل', value: '22.2 طن' },
          { label: 'أقصى عمق حفر', value: '6.72 متر' },
          { label: 'أقصى مدى وصول', value: '9.87 متر' },
          { label: 'سعة القادوس', value: '1.02 متر مكعّب' },
          { label: 'ساعات التشغيل', value: '4,200 ساعة تقريباً' }
        ],
        included: ['القادوس القياسي 1.02 م³', '8 ساعات تشغيل يومياً', 'نظام التتبّع GPS', 'فحص تسليم موثّق بالصور'],
        excluded: ['الوقود ومواد التشغيل', 'أجرة المشغّل (تُضاف اختيارياً)', 'النقل من وإلى الموقع', 'تصاريح العمل البلدية', 'وثيقة التأمين على الموقع'],
        terms: [
          { label: 'أقل مدة تأجير', value: 'يوم واحد (8 ساعات تشغيل)' },
          { label: 'ساعات التشغيل اليومية', value: '8 ساعات — الساعة الإضافية 180 ر.س' },
          { label: 'الوقود', value: 'على المستأجر — تُسلَّم وتُستعاد بخزان ممتلئ' },
          { label: 'المشغّل', value: 'اختياري من المالك؛ لا يُسمح بمشغّل من طرفك دون موافقته الخطية' },
          { label: 'مبلغ التأمين المسترد', value: '5,000 ر.س يُرد بعد الفحص عند الإرجاع' },
          { label: 'الإلغاء', value: 'مجاني قبل 48 ساعة من موعد التسليم' },
          { label: 'نطاق التشغيل', value: 'داخل حدود أمانة الرياض — خارجها يتطلب موافقة مسبقة' }
        ],
        documents: [
          { name: 'استمارة المعدة', type: 'استمارة', status: 'verified', expiresAt: '2027-06-30' },
          { name: 'شهادة الفحص الدوري', type: 'فحص دوري', status: 'verified', expiresAt: '2027-02-14' }
        ],
        maintenance: [{ title: 'صيانة دورية 4,000 ساعة', date: '2026-05-14', status: 'completed', note: 'تغيير زيوت وفلاتر' }],
        bookings: [], activity: [],
        createdAt: '2026-01-12T08:00:00.000Z'
      },
      {
        id: 'EQ-2006', slug: 'mobile-crane-50t', name: 'رافعة متحركة 50 طن', model: 'رافعة متحركة هيدروليكية',
        ownerId: 'OW-1004', category: 'رفع', city: 'جدة', dailyRate: 6500,
        status: 'active', availability: 'booked', availabilityNote: 'محجوزة حتى 15 سبتمبر',
        icon: 'i-mobilecrane',
        search: 'رافعة متحركة 50 طن ونش mobile crane',
        highlights: ['حمولة 50 طن', 'ذراع 40 م', 'موديل 2019'],
        summary: 'رافعة متحركة لرفع العناصر الخرسانية والهياكل المعدنية في مواقع الإنشاء.',
        operatorPerDay: 700, transportFlat: 1800,
        specs: [
          { label: 'الطراز', value: 'رافعة متحركة هيدروليكية' },
          { label: 'سنة الصنع', value: '2019' },
          { label: 'أقصى حمولة رفع', value: '50 طن' },
          { label: 'طول الذراع الرئيسي', value: '40 متر' },
          { label: 'أقصى ارتفاع رفع', value: '56 متر' },
          { label: 'عدد المحاور', value: '4 محاور' },
          { label: 'ساعات التشغيل', value: '9,400 ساعة تقريباً' }
        ],
        included: ['المشغّل المعتمد ضمن السعر اليومي', '8 ساعات تشغيل يومياً', 'جدول أحمال موثّق'],
        excluded: ['الوقود', 'النقل من وإلى الموقع', 'تصاريح إغلاق الطريق', 'أعمال التثبيت الأرضي'],
        terms: [
          { label: 'أقل مدة تأجير', value: 'يوم واحد (8 ساعات تشغيل)' },
          { label: 'ساعات التشغيل اليومية', value: '8 ساعات — الساعة الإضافية 450 ر.س' },
          { label: 'الوقود', value: 'على المستأجر' },
          { label: 'المشغّل', value: 'من المالك حصراً — لا تُشغَّل بطاقم المستأجر' },
          { label: 'مبلغ التأمين المسترد', value: '10,000 ر.س يُرد بعد الفحص عند الإرجاع' },
          { label: 'الإلغاء', value: 'مجاني قبل 72 ساعة من موعد التسليم' },
          { label: 'نطاق التشغيل', value: 'داخل حدود أمانة جدة — خارجها يتطلب موافقة مسبقة' }
        ],
        documents: [
          { name: 'استمارة المعدة', type: 'استمارة', status: 'verified', expiresAt: '2027-08-22' },
          { name: 'شهادة الفحص الدوري', type: 'فحص دوري', status: 'pending', expiresAt: '2026-09-10' }
        ],
        maintenance: [], activity: [],
        bookings: [{ id: 'BK-3001', label: 'حجز قائم', startDate: '2026-08-20', endDate: '2026-09-15', status: 'active' }],
        createdAt: '2025-11-02T08:00:00.000Z'
      }
    ],

    customers: [
      { id: 'CU-3001', name: 'شركة إعمار الشرق', contact: '0555200100', city: 'الرياض', orders: 2, visits: 14, lastVisit: '2026-08-02', activity: [] },
      { id: 'CU-3002', name: 'مقاولات النخبة', contact: '0555200200', city: 'جدة', orders: 1, visits: 6, lastVisit: '2026-07-29', activity: [] },
      { id: 'CU-3003', name: 'مؤسسة الديار للتطوير', contact: '0555200300', city: 'الدمام', orders: 1, visits: 3, lastVisit: '2026-07-15', activity: [] }
    ],

    orders: [
      {
        id: 'MH-4001', customerId: 'CU-3001', ownerId: 'OW-1001', equipmentId: 'EQ-2005',
        renter: 'شركة إعمار الشرق', equipment: 'حفّار جنزير 22 طن',
        startDate: '2026-08-10', endDate: '2026-08-17', date: '2026-08-10',
        status: 'awaiting_owner', value: 24150, deliveryLocation: 'حي الملقا — الرياض',
        createdAt: '2026-08-02T09:15:00.000Z', updatedAt: '2026-08-02T09:15:00.000Z',
        operationalNote: 'العميل يطلب التسليم صباحاً قبل الساعة 8.',
        activity: [], timeline: [], notes: [], documents: [],
        payment: { status: 'pending', total: 24150, paid: 0, due: 24150, transactions: [] }
      },
      {
        id: 'MH-4002', customerId: 'CU-3002', ownerId: 'OW-1002', equipmentId: 'EQ-2002',
        renter: 'مقاولات النخبة', equipment: 'حفّار صغير 5 طن',
        startDate: '2026-07-20', endDate: '2026-07-27', date: '2026-07-20',
        status: 'completed', value: 7245, deliveryLocation: 'حي الصفا — جدة',
        createdAt: '2026-07-16T12:40:00.000Z', updatedAt: '2026-07-28T08:00:00.000Z',
        activity: [], timeline: [], notes: [],
        documents: [{ name: 'عقد التأجير', status: 'signed', date: '2026-07-18' }],
        payment: {
          status: 'paid', total: 7245, paid: 7245, due: 0,
          transactions: [{ id: 'PY-5001', date: '2026-07-18', method: 'تحويل بنكي', status: 'paid', amount: 7245 }]
        }
      },
      {
        id: 'MH-4003', customerId: 'CU-3003', ownerId: 'OW-1003', equipmentId: 'EQ-2003',
        renter: 'مؤسسة الديار للتطوير', equipment: 'قلاب 30 طن',
        startDate: '2026-07-12', endDate: '2026-07-14', date: '2026-07-12',
        status: 'new', value: 4485, deliveryLocation: 'طريق الملك فهد — الدمام',
        createdAt: '2026-07-11T06:05:00.000Z',
        activity: [], timeline: [], notes: [], documents: [],
        payment: { status: 'unpaid', total: 4485, paid: 0, due: 4485, transactions: [] }
      }
    ],

    conversations: [
      {
        id: 'CV-6001', customerId: 'CU-3001', ownerId: 'OW-1001', orderId: 'MH-4001',
        equipment: 'حفّار جنزير 22 طن', unread: 1, updatedAt: '2026-08-02T10:05:00.000Z',
        messages: [
          { from: 'customer', text: 'هل يمكن التسليم صباح العاشر قبل الثامنة؟', time: '2026-08-02T09:40:00.000Z' },
          { from: 'admin', text: 'نقلنا طلبك للمالك وسنوافيك بردّه.', time: '2026-08-02T10:05:00.000Z' }
        ]
      },
      {
        id: 'CV-6002', customerId: 'CU-3003', ownerId: 'OW-1003', orderId: 'MH-4003',
        equipment: 'قلاب 30 طن', unread: 0, updatedAt: '2026-07-11T07:30:00.000Z',
        messages: [{ from: 'customer', text: 'كم يستغرق تأكيد الطلب عادةً؟', time: '2026-07-11T07:30:00.000Z' }]
      }
    ]
  };

  /* ------------------------------ أدوات عامة ------------------------------ */

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isArray(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  }

  function lookupKey(list, label) {
    for (var index = 0; index < list.length; index += 1) {
      if (list[index].label === label) return list[index].key;
    }
    return '';
  }

  function lookupLabel(list, key) {
    for (var index = 0; index < list.length; index += 1) {
      if (list[index].key === key) return list[index].label;
    }
    return '';
  }

  function categoryKey(label) { return lookupKey(CATEGORIES, label); }
  function cityKey(label) { return lookupKey(CITIES, label); }
  function cityLabel(key) { return lookupLabel(CITIES, key); }

  // مُعرّف قصير يبقى فريداً حتى عند إنشاء سجلين في نفس الملّي ثانية
  var idCounter = 0;
  function nextId(prefix) {
    idCounter += 1;
    return prefix + '-' + String(Date.now()).slice(-6) + String(idCounter % 10);
  }

  /* الأسعار: الأسبوع والشهر مشتقّان من السعر اليومي ما لم يُصرَّح بهما */
  function rates(item) {
    var day = Number(item && item.dailyRate) || 0;
    return {
      day: day,
      week: Number(item && item.weeklyRate) || Math.round(day * WEEK_FACTOR),
      month: Number(item && item.monthlyRate) || Math.round(day * MONTH_FACTOR)
    };
  }

  function operatorRate(item) {
    var value = Number(item && item.operatorPerDay);
    return isNaN(value) ? DEFAULT_OPERATOR_PER_DAY : value;
  }

  function transportRate(item) {
    var value = Number(item && item.transportFlat);
    return isNaN(value) ? DEFAULT_TRANSPORT_FLAT : value;
  }

  /* رابط صفحة المعدة على الموقع العام؛ prefix يضبط المسار حسب موقع الصفحة */
  function detailPath(item) {
    if (!item) return '';
    if (item.detailPath) return item.detailPath;
    return 'equipment/detail.html?id=' + encodeURIComponent(item.id);
  }

  function detailHref(item, prefix) {
    var path = detailPath(item);
    return path ? (prefix || '') + path : '';
  }

  /* المعدة معروضة للزائر فقط إذا اعتمدتها الإدارة */
  function isListed(item) {
    return Boolean(item) && (item.status === 'active' || item.status === 'displayed');
  }

  function isAvailable(item) {
    return isListed(item) && item.availability !== 'booked' && item.status !== 'booked';
  }

  /* ------------------------------- التطبيع ------------------------------- */

  function normalizeOwner(owner) {
    owner.verification = owner.verification || 'pending';
    owner.accountStatus = owner.accountStatus || 'active';
    if (!('lastLogin' in owner)) owner.lastLogin = null;
    owner.documents = isArray(owner.documents) ? owner.documents : [];
    owner.ratings = isArray(owner.ratings) ? owner.ratings : [];
    owner.activity = isArray(owner.activity) ? owner.activity : [];
    owner.earnings = owner.earnings && isArray(owner.earnings.transactions) ? owner.earnings : { transactions: [] };
    return owner;
  }

  function normalizeEquipment(item) {
    item.documents = isArray(item.documents) ? item.documents : [];
    item.activity = isArray(item.activity) ? item.activity : [];
    item.maintenance = isArray(item.maintenance) ? item.maintenance : [];
    item.bookings = isArray(item.bookings) ? item.bookings : [];
    item.specs = isArray(item.specs) ? item.specs : [];
    item.terms = isArray(item.terms) ? item.terms : [];
    item.included = isArray(item.included) ? item.included : [];
    item.excluded = isArray(item.excluded) ? item.excluded : [];
    item.highlights = isArray(item.highlights) ? item.highlights : [];
    item.status = item.status || 'pending_review';
    item.availability = item.availability || 'available';
    item.icon = item.icon || 'i-excavator';
    if (!item.search) item.search = [item.name, item.model, item.category, item.city].filter(Boolean).join(' ');
    return item;
  }

  function normalizeOrder(order) {
    order.activity = isArray(order.activity) ? order.activity : [];
    order.timeline = isArray(order.timeline) ? order.timeline : [];
    order.notes = isArray(order.notes) ? order.notes : [];
    order.documents = isArray(order.documents) ? order.documents : [];
    if (order.payment && typeof order.payment === 'object' && !isArray(order.payment.transactions)) {
      order.payment.transactions = [];
    }
    return order;
  }

  function normalize(state) {
    var base = clone(SEED);
    if (!state || typeof state !== 'object') return base;

    state.owners = (isArray(state.owners) ? state.owners : []).map(normalizeOwner);
    state.equipment = (isArray(state.equipment) ? state.equipment : []).map(normalizeEquipment);
    state.orders = (isArray(state.orders) ? state.orders : []).map(normalizeOrder);
    state.customers = (isArray(state.customers) ? state.customers : []).map(function (customer) {
      customer.activity = isArray(customer.activity) ? customer.activity : [];
      return customer;
    });
    state.conversations = (isArray(state.conversations) ? state.conversations : []).map(function (conversation) {
      conversation.messages = isArray(conversation.messages) ? conversation.messages : [];
      conversation.unread = Number(conversation.unread) || 0;
      return conversation;
    });
    return state;
  }

  /* ----------------------------- قراءة وكتابة ----------------------------- */

  function readKey(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;   // وضع التصفح الخاص أو بيانات تالفة
    }
  }

  function load() {
    var stored = readKey(STORAGE_KEY);
    if (stored && isArray(stored.equipment)) return normalize(stored);

    // ترحيل بيانات لوحة الإدارة القديمة إن وُجدت
    var legacy = readKey(LEGACY_KEY);
    if (legacy && isArray(legacy.equipment) && legacy.equipment.length) {
      var migrated = normalize(legacy);
      save(migrated);
      return migrated;
    }

    return clone(SEED);
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;  // المعاينة تظل تعمل في الذاكرة
    }
  }

  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* لا شيء */ }
    return clone(SEED);
  }

  /* ------------------------------- التنسيق ------------------------------- */

  // ca-gregory يُثبّت التقويم الميلادي — 'ar-SA' وحدها تُخرج تواريخ هجرية
  // و -u-nu-latn يفرض الأرقام اللاتينية. راجع mihwar/README.md.
  var LOCALE = 'ar-SA-u-ca-gregory-nu-latn';

  function formatNumber(value) {
    return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function formatRiyal(value) {
    return formatNumber(value) + ' ر.س';
  }

  function toDate(value) {
    if (!value) return null;
    // التاريخ المجرّد يُقرأ عند منتصف النهار محلياً كي لا ينزلق يوماً بفارق التوقيت
    var parsed = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
      ? new Date(value + 'T12:00:00')
      : new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDate(value) {
    var parsed = toDate(value);
    if (!parsed) return '—';
    return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
  }

  function formatDateTime(value) {
    var parsed = toDate(value);
    if (!parsed) return '—';
    return new Intl.DateTimeFormat(LOCALE, {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(parsed);
  }

  function todayISO() {
    var now = new Date();
    return now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
  }

  function daysBetween(start, end) {
    var from = toDate(start);
    var to = toDate(end);
    if (!from || !to) return 0;
    var difference = to.getTime() - from.getTime();
    if (difference < 0) return 0;
    return Math.max(1, Math.round(difference / 86400000));
  }

  /* العدد في العربية يغيّر صيغة المعدود: واحد، مثنّى، جمع من 3 إلى 10،
     ثم مفرد منصوب من 11 فصاعداً. «7 يوم» خطأ، والصواب «7 أيام». */
  function countLabel(count, forms) {
    var n = Number(count) || 0;
    if (n === 1) return forms.one;
    if (n === 2) return forms.two;
    if (n >= 3 && n <= 10) return formatNumber(n) + ' ' + forms.few;
    return formatNumber(n) + ' ' + forms.many;
  }

  function normalizePhone(value) {
    var digits = String(value || '').replace(/\D/g, '');
    if (digits.indexOf('00') === 0) digits = digits.slice(2);
    if (digits.indexOf('05') === 0) digits = '966' + digits.slice(1);
    return digits;
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* الروابط تأتي من بيانات محرّرة يدوياً، فنمنع المخططات القابلة للتنفيذ */
  var SAFE_SCHEME = /^(https?:|mailto:|tel:|#|\/|\.{0,2}\/|[^:]*$)/i;
  function safeUrl(value) {
    var url = String(value == null ? '' : value).trim();
    if (!url) return '';
    return SAFE_SCHEME.test(url) ? url : '';
  }

  /* -------------------------------- التصدير -------------------------------- */

  global.MihwarData = {
    STORAGE_KEY: STORAGE_KEY,
    LEGACY_KEY: LEGACY_KEY,
    VAT: VAT,
    LOCALE: LOCALE,
    CATEGORIES: CATEGORIES,
    CITIES: CITIES,

    ORDER_STATUS_LABELS: ORDER_STATUS_LABELS,
    EQUIPMENT_STATUS_LABELS: EQUIPMENT_STATUS_LABELS,
    OWNER_VERIFICATION_LABELS: OWNER_VERIFICATION_LABELS,
    ACCOUNT_STATUS_LABELS: ACCOUNT_STATUS_LABELS,
    DOCUMENT_STATUS_LABELS: DOCUMENT_STATUS_LABELS,
    PAYMENT_STATUS_LABELS: PAYMENT_STATUS_LABELS,
    RECORD_STATUS_LABELS: RECORD_STATUS_LABELS,
    RENTER_DOCUMENTS: RENTER_DOCUMENTS,
    VERIFIED_DOCUMENTS: VERIFIED_DOCUMENTS,
    SEED: SEED,

    load: load,
    save: save,
    reset: reset,
    normalize: normalize,
    clone: clone,
    nextId: nextId,

    categoryKey: categoryKey,
    cityKey: cityKey,
    cityLabel: cityLabel,
    rates: rates,
    operatorRate: operatorRate,
    transportRate: transportRate,
    detailPath: detailPath,
    detailHref: detailHref,
    isListed: isListed,
    isAvailable: isAvailable,

    formatNumber: formatNumber,
    formatRiyal: formatRiyal,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    todayISO: todayISO,
    daysBetween: daysBetween,
    countLabel: countLabel,
    normalizePhone: normalizePhone,
    escapeHTML: escapeHTML,
    safeUrl: safeUrl
  };
})(window);
