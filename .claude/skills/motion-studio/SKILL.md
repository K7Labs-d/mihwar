---
name: motion-studio
description: Make studio-grade motion-graphics videos (ads, teasers, launch reels, explainers) from code, in Arabic/RTL and the MIHWAR brand — story first, cuts locked to the beat, 3D type, generated sound synced to every motion, and automatic checks over every frame before delivery. Use whenever a video, animated ad or motion piece is requested.
---

# استوديو الحركة

الفيلم = ملفين نصيين: **القصة** (`story.md`) و**اللقطات** (`production.js`). المحرك يرسمهم إطار إطار في متصفح بدون أي مؤقتات، فنفس الملفات تطلع نفس الفيديو كل مرة. الصوت يتولد من نفس جدول الحركة، وبعدها يمر الفيلم على ثلاث بوابات فحص. ما يتسلم فيديو ما عدّاها.

## القواعد الخمس وكيف تنفَّذ فعليًا

| القاعدة | الآلية في المحرك | البوابة اللي تمسكها |
|---|---|---|
| ١. القصة أولًا ثم الأسلوب | أي نص على الشاشة لازم يكون حرفيًا في `story.md` مع مصدره | `story-first` (pass 1) |
| ٢. كل قطع على نبضة | الوقت يُكتب بالنبضات؛ اللقطة تبدأ وتطول بنبضات صحيحة؛ BPM يعطي عدد إطارات صحيح لكل نبضة | `cut-on-beat`، `integer-frames-per-beat`، `cut-has-transient` |
| ٣. النص يتحرك ثلاثي الأبعاد | ما فيه دخول/خروج إلا من قوالب فيها عمق (z أو دوران)؛ الكاميرا تنجرف دائمًا | `text-moves-in-3d`، `never-static` |
| ٤. صوت لكل حركة | كل دخول وخروج وحركة يولّد مؤثره تلقائيًا؛ الصمت يحتاج سبب مكتوب | `sound-for-every-motion` (مرتين: في الجدول ثم في الملف الصوتي) |
| ٥. افحص كل إطار مرتين | فحص DOM لكل إطار قبل الرسم + فحص بكسلات لكل إطار بعد الرسم + مراجعة بالعين | pass 1، pass 2، pass 3 |

الذوق ("no slop"): `references/taste.md`. اقرأه قبل كتابة أي نص أو لقطة.

## هيكل الملفات

```
.claude/skills/motion-studio/
├── SKILL.md                    هذا الملف
├── references/
│   ├── story.md                طريقة كتابة القصة وجدول المصادر
│   ├── timing.md               رياضيات النبضة والإطار، قواعد القطع، زمن القراءة
│   ├── motion.md               مفردات التسهيل، قوالب الحركة، العمق، العربي، الكاميرا، اللون
│   ├── sound.md                خريطة الحركة ← الصوت، نقطة التزامن، المكساج، العلو
│   ├── qa.md                   كل فحص وحدّه، وكيف تقرأ لوحات المراجعة
│   └── taste.md                الممنوعات
├── engine/                     ثابت؛ لا تعدله لفيلم واحد
│   ├── runtime.js              الخط الزمني، القوالب، الصوت المرتبط، مِجسّ الفحص (في المتصفح)
│   ├── stage.html · base.css   المسرح
│   ├── lib.mjs                 خادم محلي + Playwright
│   ├── probe.mjs               pass 1: هيكل + هندسة كل إطار + يكتب manifest.json و samples.json
│   ├── selftest.mjs            يختبر الفاحص نفسه بأخطاء مزروعة
│   ├── audio/{dsp,sfx,music,mix}.py   الصوت: مؤثرات، موسيقى، مكساج، ماستر
│   ├── render.mjs              الرسم: ضبابية حركة بعينات تتكيف مع السرعة، ماستر بلا فقد، H.264
│   ├── qa.py                   pass 2 + لوحات pass 3
│   └── make.mjs                الأمر الواحد لكل المراحل
├── brands/mihwar/              brand.css · brand.json · mark.svg · fonts/ (OFL)
└── templates/production/       نقطة بداية أي فيلم جديد
```

الفيلم نفسه يعيش خارج المهارة:

```
marketing/motion/<slug>/
├── story.md          القصة والنص ومصادره (يُكتب أولًا)
├── music.json        ترتيب الموسيقى بالنبضات
├── production.js     config + build(S, rt)
├── style.css         أحجام النص وشكل العناصر
├── review.md         سجل pass 3 بالعين (يُكتب بعد كل رندر نهائي)
└── out/<WxH>/        (مولّد، خارج git) manifest.json · audio/ · master.mkv · final.mp4 · qa/
```

المتطلبات: Node 22 + Playwright (موجود في البيئة)، ffmpeg، Python 3 مع numpy وscipy وPillow (`pip install scipy` لو ناقصة).

## سير العمل (بالترتيب، كل خطوة لها بوابة)

**٠. المصدر.** اقرأ مرجع المنتج (لمحور: ملف المنتج و`docs/MIHWAR_MASTER_PRODUCT_BLUEPRINT.md`) و`brands/<brand>/brand.json`. أي ادعاء ما له صفحة مصدر ما يدخل الفيلم.

**١. القصة.** انسخ `templates/production/` إلى `marketing/motion/<slug>/` واكتب `story.md` كاملًا قبل أي لقطة: الفكرة في جملة، رسالة واحدة، القوس بالنبضات، جدول النص سطر سطر مع المصدر، حدود الصدق. التفاصيل: `references/story.md`. لو المستخدم موجود، اعرض عليه القصة قبل الأسلوب.

**٢. الإيقاع.** اختر fps وBPM بحيث `60 × fps ÷ BPM` عدد صحيح (30 fps: 90/100/120 BPM). حوّل القوس إلى نبضات ولقطات، واكتب `music.json` على نفس الشبكة. التفاصيل: `references/timing.md`.

**٣. اللقطات.** اكتب `production.js` و`style.css` بواجهة المحرك (تحت). كل لقطة: `S.shot` ← عناصر ← `enter/exit/move/draw` ← `camera`.

**٤. لقطات ثابتة للمراجعة السريعة** (ثواني، قبل أي رسم كامل):
```bash
node .claude/skills/motion-studio/engine/render.mjs marketing/motion/<slug> --mode draft --stills 0.5,2.1,4.0,90f
node .claude/skills/motion-studio/engine/probe.mjs marketing/motion/<slug>      # pass 1 وحده (ثواني)
```
الأوقات بالثواني أو بالإطارات (`90f`). يكتب `out/<fmt>/stills/sheet.png`؛ اقرأها بعينك وصلّح التكوين قبل ما تكمل. خذ دائمًا إطار القطع نفسه لكل لقطة.

**٥. المصنع:**
```bash
node .claude/skills/motion-studio/engine/make.mjs marketing/motion/<slug>          # كامل
node .claude/skills/motion-studio/engine/make.mjs marketing/motion/<slug> --draft  # سريع بنصف الدقة بدون pass 2
```
يقف عند أول بوابة تفشل. لا تتجاوز فشل بتعديل الحدود؛ صلّح الفيلم.

**٦. pass 3 بالعين.** اقرأ `out/<fmt>/qa/report.md` ثم الصور: `timeline.png` و`cuts.png` وكل لوحة في `shots/`. اكتب `review.md` في مجلد الفيلم (يُحفظ في git، بعكس `out/`) بالقائمة الموجودة في `references/qa.md` (لقطة لقطة، نعم/لا مع ملاحظة). أي «لا» = رجوع للخطوة ٣.

**٧. التسليم.** `final.mp4` + `qa/report.md` + `review.md`. اذكر للمستخدم بصراحة اللي ما انفحص (مثلًا: الصوت انفحص بالأرقام والرسوم، ما انسمع).

## واجهة المحرك (production.js)

```js
export const config = { title, brand: 'mihwar', fps: 30, bpm: 120, beats: 56,
  formats: ['1920x1080'], fonts: ['600 96px "Noto Sans Arabic"'], render: { samples: 4, shutter: 180 } };

export function build(S, rt) {            // S = Studio, rt = { Ease, noise1, ... }
  const s = S.shot('need', { at: 0, beats: 4 });          // يبدأ ويطول بنبضات صحيحة
  const h = s.text('مشروع ينتظر معدة.', { cls: 'h1' });   // يقسّم بالكلمات (العربي ما ينقسم بالحروف أبدًا)
  s.place(h, { x: 1260, y: 630 });                        // نقطة الارتكاز بالبكسل
  s.enter(h, 'rise', { land: 0.5 });                      // land = النبضة اللي "يوصل" فيها (90% من المسافة)
  s.exit(h, 'lift', { at: 3.4 });                         // at = بداية الخروج
  s.camera({ z: 90, x: -40, ry: -3.5 });                  // انجراف مستمر طول اللقطة
}
```

| الدالة | الغرض | الصوت التلقائي |
|---|---|---|
| `S.shot(id, {at, beats, persp})` | لقطة؛ القطع عند `at` | يحتاج ضربة موسيقى أو مؤثر على إطار القطع |
| `s.dissolveIn(beats)` | ذوبان من اللقطة السابقة (للختام؛ القطع الحاد هو الافتراضي) | يحتاج صوت على إطار القطع |
| `S.persistent(id)` | طبقة طول الفيلم (خلفية، تظليل) | — |
| `s.text(str, {cls, parent, split, allowOverlap})` | نص بكلمات منفصلة | — |
| `s.item(html, {x, y, w, h})` · `s.depth(z)` | عنصر في مكانه · مستوى عمق للـ parallax | — |
| `s.enter(el, preset, {land, lands, sfx, silent})` | دخول ثلاثي الأبعاد؛ `lands` نبضة لكل كلمة | whoosh عند أقصى سرعة + land عند الوصول (حسب القالب) |
| `s.exit(el, preset, {at})` | خروج | swell ينتهي لحظة الاختفاء |
| `s.move(el, from, to, {a, b, ease, sfx, land})` | حركة بين نبضتين | whoosh عند أقصى سرعة (+ `land` اختياري) |
| `s.draw(paths, {a, b, stagger})` | رسم خطوط SVG (`pathLength="1"`) | draw طول الرسم |
| `s.proc(label, {a, b, sfx})` | تعريف حركة إجرائية يرسمها `S.every` | الأصوات اللي تحددها |
| `s.camera({z, x, y, rx, ry})` | انجراف الكاميرا | تحمله الموسيقى |
| `S.cue(t, name, {gain, pan, pitch, len})` | مؤثر يدوي | — |
| `S.tween/track/fn/every` | خصائص منخفضة المستوى ودوال إجرائية (نقية في t) | لازم تعلن حركتها بـ `proc` |

القوالب: دخول `rise · swing · dolly · drop · pop`، خروج `lift · push · sink · away`. التسهيل: `Ease.out · in · move · snap · drift` فقط. الجدول الكامل وأسبابه في `references/motion.md`.

## حدود صريحة
- الصوت مولّد رياضيًا ومفحوص بالأرقام (علو، ذروة، تزامن، وجود صوت على كل إطار حركة) ولوحة طيف؛ الذوق السمعي يحتاج أذن بشرية قبل النشر.
- العرض بالمعالج (بدون GPU): ~150–210 ms لكل التقاطة. `render.mjs --bench` يطبع التكلفة لكل لقطة؛ استعمله قبل رسم طويل. كل عامل له متصفح مستقل (المتصفح الواحد له معالج رسم واحد يصير عنق زجاجة).
- عند تعديل المحرك: `node .claude/skills/motion-studio/engine/selftest.mjs` لازم يطبع «every gate caught its defect».
- صيغة 9:16 مدعومة في المحرك والفحص (منطقة آمنة خاصة بالمنصات)، لكن كل فيلم يحتاج تخطيط عمودي مستقل؛ لا تكتفي بتغيير `formats`.
