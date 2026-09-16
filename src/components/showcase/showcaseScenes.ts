export const journeyNodes = [
  { id: 'account', label: 'حساب واحد', code: 'IDENTITY', angle: -150 },
  { id: 'lessor', label: 'المؤجر', code: 'SUPPLY', angle: -110 },
  { id: 'equipment', label: 'المعدات', code: 'DISCOVER', angle: -70 },
  { id: 'request', label: 'طلب الاحتياج', code: 'REQUEST', angle: -30 },
  { id: 'offer', label: 'العروض', code: 'MATCH', angle: 10 },
  { id: 'booking', label: 'الحجز', code: 'BOOK', angle: 50 },
  { id: 'payment', label: 'الدفع', code: 'PAY', angle: 90 },
  { id: 'execution', label: 'التنفيذ', code: 'EXECUTE', angle: 130 },
  { id: 'completion', label: 'الإتمام', code: 'COMPLETE', angle: 170 },
] as const;

export type JourneyNode = typeof journeyNodes[number]['id'];
export const nodePosition = (id: JourneyNode) => {
  const angle = journeyNodes.find(node => node.id === id)!.angle * Math.PI / 180;
  return { x: Math.cos(angle) * 1010, y: Math.sin(angle) * 780 };
};
export const journeyConnections: { from: JourneyNode; to: JourneyNode; direct?: boolean }[] = [
  { from: 'account', to: 'lessor' }, { from: 'lessor', to: 'equipment' },
  { from: 'account', to: 'equipment', direct: true }, { from: 'account', to: 'request' },
  { from: 'equipment', to: 'offer' }, { from: 'request', to: 'offer' },
  { from: 'equipment', to: 'booking', direct: true }, { from: 'offer', to: 'booking' },
  { from: 'booking', to: 'payment' }, { from: 'payment', to: 'execution' },
  { from: 'execution', to: 'completion' },
];

export const showcaseScenes: { target: JourneyNode | 'core' | 'overview'; chapter: string; title: string; accent: string; description: string; tags: string[]; duration: number; current?: boolean }[] = [
  { target: 'core', chapter: 'من نقطة واحدة', title: 'تبدأ الحكاية.', accent: 'ويتحرك محور.', description: 'منصة تجمع المستأجر ومالك المعدات الثقيلة في رحلة واحدة متصلة.', tags: ['محور', 'رؤية المنتج'], duration: 7800 },
  { target: 'overview', chapter: 'الفكرة كاملة', title: 'أطراف متعددة.', accent: 'منظومة واحدة.', description: 'حساب واحد. مساران للوصول إلى المعدة. ومن الحجز تبدأ رحلة مشتركة حتى إتمام العمل.', tags: ['استئجار مباشر', 'طلب وعروض'], duration: 7000 },
  { target: 'account', chapter: 'بداية الرحلة', title: 'ادخل مرة.', accent: 'وانطلق بالدورين.', description: 'أنشئ حسابك أو سجّل الدخول. استأجر ما تحتاج، وتقدّم كمؤجر من الحساب نفسه.', tags: ['تسجيل الدخول', 'إنشاء حساب'], duration: 7000, current: true },
  { target: 'lessor', chapter: 'جانب المؤجر', title: 'معداتك.', accent: 'فرصها أوسع.', description: 'يسجّل مالك المعدات بياناته ويُراجع طلبه. بعد الاعتماد يبدأ تجهيز معداته للعرض والتأجير.', tags: ['ملف المؤجر', 'مراجعة واعتماد'], duration: 7200 },
  { target: 'equipment', chapter: 'المسار الأول · اختيار مباشر', title: 'اعثر على المعدة.', accent: 'بالشروط الواضحة.', description: 'تصفّح المعدات حسب الموقع والتوفر. اختر السعر بالساعة أو اليوم، مع مشغّل أو بدونه، ثم انتقل للحجز.', tags: ['سعر نهائي', 'موقع وتوفر', 'خيار المشغّل'], duration: 8000 },
  { target: 'request', chapter: 'المسار الثاني · انشر احتياجك', title: 'صف احتياجك.', accent: 'تصل إليك الفرص.', description: 'حدد المعدة المطلوبة وموقع العمل وفترة الإيجار. يرى المؤجرون المناسبون طلبك ويقدّمون معداتهم كعروض.', tags: ['مواصفات الاحتياج', 'المدة والموقع'], duration: 7600 },
  { target: 'offer', chapter: 'المعدة المناسبة للطلب المناسب', title: 'قارن بوضوح.', accent: 'واختر بثقة.', description: 'كل عرض مرتبط بمعدة يملكها المؤجر. راجع المعدة والسعر والتوفر وخيار المشغّل، ثم اختر العرض الأنسب.', tags: ['عرض مرتبط بمعدة', 'مقارنة الشروط'], duration: 7200 },
  { target: 'booking', chapter: 'هنا يلتقي المساران', title: 'اختياران.', accent: 'وحجز واحد.', description: 'سواء اخترت معدة مباشرة أو قبلت عرضًا، تُثبت تفاصيل المعدة والمدة والسعر والشروط في حجز واحد.', tags: ['تثبيت الشروط', 'تأكيد التوفر'], duration: 8000 },
  { target: 'payment', chapter: 'داخل المنصة · في الرؤية المستهدفة', title: 'الدفع واضح.', accent: 'وكل شيء مترابط.', description: 'يرتبط الدفع بالحجز داخل محور، مع توضيح إجمالي التكلفة وعمولة المنصة قبل المتابعة.', tags: ['دفع مرتبط بالحجز', 'عمولة واضحة'], duration: 7000 },
  { target: 'execution', chapter: 'من الاتفاق إلى العمل', title: 'تبدأ المعدة.', accent: 'وتتابع الرحلة.', description: 'ينسّق المستأجر والمؤجر التسليم وبدء العمل، ويتابعان التنفيذ حتى نهاية فترة الإيجار.', tags: ['التسليم', 'بدء العمل', 'المتابعة'], duration: 7200 },
  { target: 'completion', chapter: 'نهاية العمل · بداية الثقة', title: 'اكتمل العمل.', accent: 'وتبقى التجربة.', description: 'يؤكَّد انتهاء الإيجار وإعادة المعدة، ثم يُغلق الحجز ويقيّم المستخدم تجربته.', tags: ['إتمام الطلب', 'إغلاق الحجز', 'التقييم'], duration: 7500 },
  { target: 'overview', chapter: 'محور · من الاحتياج إلى الإنجاز', title: 'كل خطوة متصلة.', accent: 'وكل رحلة لها محور.', description: 'هذه هي رؤية المنصة الكاملة. استكشف أي محطة من الخريطة، أو أعد مشاهدة الرحلة من البداية.', tags: ['المستأجر', 'المؤجر', 'المعدة'], duration: 7000 },
];
