import { useEffect, useState } from 'react';
import { equipmentCategories } from '../../utils/equipmentForm';
export function Marketplace() {
  const [items, setItems] = useState<any[] | null>(null),
    [q, setQ] = useState(''),
    [category, setCategory] = useState(''),
    [location, setLocation] = useState(''),
    [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<any>(null),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setItems(null);
    setError('');
    fetch('/api/client/marketplace?' + query, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (active) setItems(d.equipment);
      })
      .catch((e) => {
        if (active)
          setError(e.name === 'Error' ? e.message : 'تعذر الاتصال بالخادم.');
      });
    return () => {
      active = false;
    };
  }, [query, attempt]);
  return (
    <>
      <div className="figma-context">المستأجر / سوق المعدات</div>
      <section className="figma-content">
        <header className="figma-intro">
          <h1>
            {selected
              ? 'كل ما تحتاجه قبل الاختيار'
              : 'ابحث عن المعدة التي تحتاجها'}
          </h1>
          <p className="muted">
            التصنيف والموقع والتوفر في مكان واحد. تظهر المعدات المعتمدة فقط.
          </p>
        </header>
        {selected ? (
          <div className="figma-card">
            <h2>{selected.name}</h2>
            <dl className="figma-data">
              {[
                ['الوصف', selected.description],
                ['الموقع', selected.location],
                [
                  'المشغل',
                  selected.operator_mode === 'with_operator'
                    ? 'مع مشغل'
                    : 'بدون مشغل',
                ],
                [
                  'التوفر',
                  selected.availability === 'available' ? 'متاحة' : 'غير متاحة',
                ],
                [
                  'سعر الساعة',
                  selected.hourly_rate_halalas === null
                    ? 'لم يحدد'
                    : selected.hourly_rate_halalas / 100 + ' ر.س',
                ],
                [
                  'سعر اليوم',
                  selected.daily_rate_halalas === null
                    ? 'لم يحدد'
                    : selected.daily_rate_halalas / 100 + ' ر.س',
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="figma-notice">
              طلب الاستئجار المباشر والحجز لم يُنفذا بعد. يمكنك نشر طلب احتياج.
            </p>
            <a className="gold-button" href="#request">
              إنشاء طلب احتياج
            </a>
            <button className="quiet-button" onClick={() => setSelected(null)}>
              العودة إلى السوق
            </button>
          </div>
        ) : (
          <div className="marketplace-layout">
            <form
              className="figma-card"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(
                  new URLSearchParams({ q, category, location }).toString(),
                );
              }}
            >
              <h2>تصفية المعدات</h2>
              <label className="figma-field">
                البحث في المعدات
                <input
                  value={q}
                  maxLength={120}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <label className="figma-field">
                التصنيف
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">جميع التصنيفات</option>
                  {equipmentCategories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="figma-field">
                الموقع
                <input
                  value={location}
                  maxLength={160}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </label>
              <button className="gold-button">تطبيق التصفية</button>
              <button
                className="quiet-button"
                type="button"
                onClick={() => {
                  setQ('');
                  setCategory('');
                  setLocation('');
                  setQuery('');
                }}
              >
                مسح التصفية
              </button>
            </form>
            <div>
              {error ? (
                <div className="request-error" role="alert">
                  {error}
                  <button
                    className="quiet-button"
                    onClick={() => setAttempt((v) => v + 1)}
                  >
                    إعادة المحاولة
                  </button>
                </div>
              ) : items === null ? (
                <p className="empty-state" role="status">
                  جارٍ تحميل المعدات…
                </p>
              ) : items.length === 0 ? (
                <div className="figma-card empty-state">
                  <h2>لا توجد معدات معتمدة بهذه التصفية</h2>
                  <p className="muted">تظهر المعدات بعد اعتمادها من الإدارة.</p>
                  <a className="gold-button" href="#request">
                    إنشاء طلب احتياج
                  </a>
                </div>
              ) : (
                <div className="marketplace-results">
                  {items.map((item) => (
                    <article className="figma-card" key={item.id}>
                      <h2>{item.name}</h2>
                      <p className="muted">{item.location}</p>
                      <p>{item.description}</p>
                      <button
                        className="quiet-button"
                        onClick={() => setSelected(item)}
                      >
                        تفاصيل المعدة
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
