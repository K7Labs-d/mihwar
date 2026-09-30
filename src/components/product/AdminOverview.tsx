import { useEffect, useRef, useState } from 'react';
import { getPage, type Page } from '../../data/productPages';
import { useAuth } from '../client/AuthContext';
import { canAccessAdminPage } from '../../utils/adminAccess';
import { AdminRequests } from '../request/AdminRequests';
import { BrokerReviewPanel } from '../broker/BrokerReviewPanel';
import { equipmentCategories } from '../../utils/equipmentForm';

const destinations: { id: Page; title: string }[] = [
  { id: 'admin', title: 'نظرة عامة' },
  { id: 'admin-requests', title: 'صندوق الطلبات' },
  { id: 'admin-lessors', title: 'اعتماد المؤجرين' },
  { id: 'admin-equipment', title: 'المعدات' },
  { id: 'admin-transactions', title: 'الحجوزات' },
  { id: 'admin-disputes', title: 'النزاعات والإلغاءات' },
  { id: 'admin-users', title: 'المستخدمون' },
  { id: 'admin-audit', title: 'سجل القرارات' },
];
const label: Record<string, string> = {
  pending: 'بانتظار المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  archived: 'مؤرشفة',
  renter: 'مستأجر',
  lessor: 'مؤجر',
  admin: 'إدارة',
};
const date = (v: string) => new Date(v).toLocaleString('ar-SA');
async function read(route: string) {
  const r = await fetch('/api/client/admin/' + route, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'تعذر تحميل البيانات.');
  return d;
}
export function AdminOverview({ page }: { page: Page }) {
  const { user } = useAuth();
  const permittedDestinations = destinations.filter((destination) =>
    canAccessAdminPage(user, destination.id),
  );
  const canOpenPage = permittedDestinations.some((destination) => destination.id === page);
  if (!user?.adminSession || !canOpenPage)
    return (
      <section className="figma-content">
        <div className="figma-card empty-state">
          <h1>غير مصرح</h1>
          <p>لا يملك حسابك صلاحية الوصول إلى هذه الصفحة الإدارية.</p>
          <a className="quiet-button" href="#client">
            العودة إلى حسابي
          </a>
        </div>
      </section>
    );
  return (
    <>
      <div className="figma-context">إدارة محور / {getPage(page).title}</div>
      <div className="figma-content admin-layout">
        <aside className="figma-card admin-sidebar">
          <h2>الإدارة</h2>
          <nav aria-label="الإدارة">
            {permittedDestinations.map((d) => (
              <a
                key={d.id}
                className="quiet-button"
                href={'#' + d.id}
                aria-current={page === d.id ? 'page' : undefined}
              >
                {d.title}
              </a>
            ))}
          </nav>
          <a className="quiet-button" href="#client">
            العودة إلى الموقع
          </a>
        </aside>
        <div className="admin-workspace">
          {page === 'admin' ? (
            <Overview />
          ) : page === 'admin-requests' ? (
            <AdminRequests />
          ) : page === 'admin-lessors' ? (
            <>
              <header className="figma-intro">
                <p className="eyebrow">إدارة محور / التشغيل</p>
                <h1>راجع الجهة قبل منح أهلية التأجير</h1>
                <p className="muted">
                  قرار المراجعة يحفظ السبب وهوية المسؤول ووقت القرار.
                </p>
              </header>
              <div className="figma-card">
                <BrokerReviewPanel
                  onBack={() => {
                    window.location.hash = permittedDestinations[0]?.id ?? 'client';
                  }}
                />
              </div>
            </>
          ) : ['admin-equipment', 'admin-users', 'admin-audit'].includes(
              page,
            ) ? (
            <AdminList
              key={page}
              kind={
                page === 'admin-equipment'
                  ? 'equipment'
                  : page === 'admin-users'
                    ? 'users'
                    : 'audit'
              }
            />
          ) : (
            <div className="figma-card empty-state">
              <h1>{getPage(page).title}</h1>
              <p className="muted">
                لا تتوفر خدمة{' '}
                {page === 'admin-disputes' ? 'النزاعات والإلغاءات' : 'الحجوزات'}{' '}
                في النسخة الحالية. ستظهر السجلات وحالاتها عند تنفيذها.
              </p>
              <span className="feature-status">غير متاحة بعد</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
function Overview() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [period, setPeriod] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    read('overview' + period)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [period, attempt]);
  const stats = [
    ['visitors', 'الزوار الفريدون'],
    ['users', 'المستخدمون المسجلون'],
    ['requests', 'طلبات الاحتياج'],
    ['waitingRequests', 'الطلبات المنتظرة'],
    ['newRequests', 'الطلبات الجديدة'],
    ['pendingLessors', 'اعتماد المؤجرين'],
    ['pendingEquipment', 'معدات تنتظر المراجعة'],
    ['bookings', 'الحجوزات'],
    ['disputes', 'النزاعات'],
    ['cancellations', 'الإلغاءات'],
  ];
  return (
    <>
      <header className="figma-intro">
        <p className="eyebrow">إدارة محور / التشغيل</p>
        <h1>لوحة خالد — إدارة محور</h1>
        <p className="muted">
          الطلبات، المسجلون، حركة الزوار، واعتماد المؤجرين والمعدات من مكان
          واحد.
        </p>
      </header>
      <form
        className="admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPeriod('?' + new URLSearchParams({ from, to }));
        }}
      >
        <label className="figma-field">
          من تاريخ
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="figma-field">
          إلى تاريخ
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="quiet-button">تطبيق الفترة</button>
        <button
          className="quiet-button"
          type="button"
          onClick={() => setAttempt((v) => v + 1)}
        >
          تحديث
        </button>
      </form>
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
      ) : !data ? (
        <p role="status" className="empty-state">
          جارٍ تحميل بيانات الإدارة…
        </p>
      ) : (
        <>
          <div className="admin-stats">
            {stats.map(([key, title]) => (
              <section className="figma-card" key={key}>
                <p className="eyebrow">الفترة المحددة</p>
                <h2>{title}</h2>
                <strong className="stat-value">
                  {data.stats[key] === null || data.stats[key] === 0
                    ? '—'
                    : data.stats[key]}
                </strong>
                <p className="muted">
                  {data.stats[key] === null
                    ? 'لم تُنفذ الخدمة بعد'
                    : data.stats[key] === 0
                      ? 'لا توجد سجلات في هذه الفترة'
                      : 'من السجلات المحفوظة'}
                </p>
              </section>
            ))}
          </div>
          <p className="figma-notice">
            {data.visitorDefinition}
            {data.measuredSince && ' بدأ القياس: ' + data.measuredSince}
          </p>
        </>
      )}
      <div className="admin-operation-grid">
        {destinations.slice(1).map((d) => (
          <section className="figma-card" key={d.id}>
            <h2>{d.title}</h2>
            <p className="muted">
              {d.id === 'admin-transactions' || d.id === 'admin-disputes'
                ? 'بانتظار تنفيذ الخدمة.'
                : 'مراجعة السجلات المحفوظة وصلاحياتها.'}
            </p>
            <a className="quiet-button" href={'#' + d.id}>
              فتح القسم
            </a>
          </section>
        ))}
      </div>
    </>
  );
}
function AdminList({ kind }: { kind: 'equipment' | 'users' | 'audit' }) {
  const [list, setList] = useState<any>(null),
    [item, setItem] = useState<any>(null),
    [selected, setSelected] = useState<string | null>(null),
    [q, setQ] = useState(''),
    [status, setStatus] = useState('all'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    setError('');
    setList(null);
    setItem(null);
    setReason('');
    read(kind + '?' + query + '&page=' + page)
      .then(async (d) => {
        if (!active) return;
        setList(d);
        if (selected && kind === 'equipment') {
          const detail = await read(
            'equipment/' + encodeURIComponent(selected),
          );
          if (active) setItem(detail.item);
        } else if (selected)
          setItem(
            d.items.find((v: any) => String(v.id ?? v.sequence) === selected),
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [kind, query, page, attempt, selected]);
  async function decide(status: string) {
    if (pending.current || !item) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const r = await fetch(
        '/api/client/admin/equipment/' + item.id + '/decision',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status,
            version: item.version,
            ...(status === 'rejected' ? { reason } : {}),
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setItem(d.item);
      setSuccess('تم حفظ القرار في السجل الإداري.');
      setReason('');
    } catch (e) {
      setError(
        e instanceof Error && e.name === 'Error'
          ? e.message
          : 'تعذر تأكيد الحفظ. حدّث التفاصيل للتحقق من القرار.',
      );
      setAttempt((v) => v + 1);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const statuses =
    kind === 'equipment'
      ? ['pending', 'approved', 'rejected', 'archived']
      : kind === 'users'
        ? ['renter', 'lessor', 'admin']
        : ['approved', 'rejected'];
  const title =
    kind === 'equipment'
      ? 'راجع المعدات المعروضة'
      : kind === 'users'
        ? 'المستخدمون والصلاحيات'
        : 'سجل القرارات الإدارية';
  return (
    <>
      <header className="figma-intro">
        <h1>{title}</h1>
        <p className="muted">
          {kind === 'equipment'
            ? 'ملكية كل معدة ثابتة في السجل. قرارات الاعتماد لا تغيّر أسعارها أو مواصفاتها.'
            : kind === 'users'
              ? 'صلاحيات منفصلة لكل حساب. لا تمنح هذه الشاشة صلاحيات الإدارة.'
              : 'سبب القرار وهوية المسؤول ووقت المراجعة محفوظة.'}
        </p>
      </header>
      <form
        className="admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setSelected(null);
          setPage(1);
          setSuccess('');
          setQuery(new URLSearchParams({ q, status, from, to }).toString());
        }}
      >
        <label className="figma-field">
          البحث
          <input
            maxLength={120}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث في السجلات"
          />
        </label>
        <label className="figma-field">
          الحالة
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">جميع الحالات</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {label[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="figma-field">
          من
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="figma-field">
          إلى
          <input
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="quiet-button" disabled={busy}>
          بحث وتصفية
        </button>
      </form>
      {error && (
        <p className="request-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="request-success" role="status">
          {success}
        </p>
      )}
      <button
        className="quiet-button"
        disabled={busy}
        onClick={() => setAttempt((v) => v + 1)}
      >
        تحديث السجلات
      </button>
      {!list && !error ? (
        <p role="status" className="empty-state">
          جارٍ تحميل السجلات…
        </p>
      ) : (
        list && (
          <>
            <div className="figma-card table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    {(kind === 'equipment'
                      ? [
                          'المعدة والتصنيف',
                          'المؤجر',
                          'الظهور والتوفر',
                          'المراجعة',
                          'إجراء',
                        ]
                      : kind === 'users'
                        ? [
                            'الاسم',
                            'البريد الإلكتروني',
                            'الدور',
                            'تاريخ التسجيل',
                            'إجراء',
                          ]
                        : ['المسؤول', 'السجل', 'القرار', 'وقت القرار', 'إجراء']
                    ).map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((v: any) => (
                    <tr key={v.id ?? v.sequence}>
                      {(kind === 'equipment'
                        ? [
                            v.name,
                            v.lessor_name,
                            v.status === 'archived'
                              ? 'مؤرشفة'
                              : v.availability === 'available'
                                ? 'متاحة'
                                : 'غير متاحة',
                            label[v.review_status],
                          ]
                        : kind === 'users'
                          ? [
                              v.name,
                              v.email,
                              v.is_platform_admin
                                ? 'مالك المنصة'
                                : (label[v.selected_role] ?? 'لم يختر الدور'),
                              date(v.created_at),
                            ]
                          : [
                              v.actor_name,
                              v.target_id,
                              label[v.action] ?? v.action,
                              date(v.created_at),
                            ]
                      ).map((value: any, i: number) => (
                        <td key={i}>{value}</td>
                      ))}
                      <td>
                        <button
                          className="quiet-button"
                          disabled={busy}
                          onClick={() => {
                            setSelected(String(v.id ?? v.sequence));
                            setSuccess('');
                          }}
                        >
                          تفاصيل
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {list.items.length === 0 && (
                <div className="empty-state">
                  <h2>
                    {kind === 'equipment'
                      ? 'قائمة المعدات الفعلية'
                      : kind === 'users'
                        ? 'لا توجد حسابات بهذه التصفية'
                        : 'لا توجد قرارات بهذه التصفية'}
                  </h2>
                  <p className="muted">تظهر هنا السجلات المحفوظة فقط.</p>
                </div>
              )}
            </div>
            <div className="request-pagination">
              <button
                className="quiet-button"
                disabled={busy || page === 1}
                onClick={() => {
                  setSelected(null);
                  setPage((v) => v - 1);
                }}
              >
                السابق
              </button>
              <span>صفحة {page}</span>
              <button
                className="quiet-button"
                disabled={busy || page * 20 >= list.total}
                onClick={() => {
                  setSelected(null);
                  setPage((v) => v + 1);
                }}
              >
                التالي
              </button>
            </div>
          </>
        )
      )}
      {selected && item && (
        <section className="figma-card admin-detail">
          <h2>
            {kind === 'equipment'
              ? 'مراجعة المعدة المحددة'
              : kind === 'users'
                ? 'الحساب المحدد'
                : 'تفاصيل القرار'}
          </h2>
          <dl className="figma-data">
            {(kind === 'equipment'
              ? [
                  ['الاسم', item.name],
                  [
                    'التصنيف',
                    equipmentCategories.find((c) => c.value === item.category)
                      ?.label,
                  ],
                  ['المؤجر', item.lessor_name],
                  ['الوصف', item.description],
                  ['الموقع', item.location],
                  [
                    'سعر الساعة',
                    item.hourly_rate_halalas === null
                      ? 'لم يحدد'
                      : item.hourly_rate_halalas / 100 + ' ر.س',
                  ],
                  [
                    'سعر اليوم',
                    item.daily_rate_halalas === null
                      ? 'لم يحدد'
                      : item.daily_rate_halalas / 100 + ' ر.س',
                  ],
                  ['الحالة', label[item.review_status]],
                  ['سبب الرفض', item.rejection_reason ?? '—'],
                  ['المسؤول', item.decided_by ?? '—'],
                  ['وقت القرار', item.decided_at ? date(item.decided_at) : '—'],
                ]
              : kind === 'users'
                ? [
                    ['الاسم', item.name],
                    ['البريد', item.email],
                    [
                      'إدارة الطلبات',
                      item.can_manage_requests ? 'مخوّل' : 'غير مخوّل',
                    ],
                    [
                      'مراجعة المؤجرين',
                      item.can_review_brokers ? 'مخوّل' : 'غير مخوّل',
                    ],
                    ['ملف المؤجر', label[item.lessor_status] ?? 'لا يوجد طلب'],
                  ]
                : [
                    ['المسؤول', item.actor_name],
                    ['هوية المسؤول', item.actor_id],
                    ['نوع السجل', item.target_type],
                    ['السجل', item.target_id],
                    ['القرار', label[item.action] ?? item.action],
                    ['السبب', item.reason ?? '—'],
                    ['الوقت', date(item.created_at)],
                  ]
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {kind === 'equipment' &&
            item.review_status === 'pending' &&
            item.status === 'active' && (
              <fieldset disabled={busy} className="figma-decision">
                <label className="figma-field">
                  سبب الرفض
                  <textarea
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                  />
                </label>
                <div className="registration-controls">
                  <button
                    className="gold-button"
                    onClick={() => void decide('approved')}
                  >
                    اعتماد المعدة
                  </button>
                  <button
                    className="quiet-button"
                    disabled={reason.trim().length < 3}
                    onClick={() => void decide('rejected')}
                  >
                    رفض المعدة
                  </button>
                </div>
              </fieldset>
            )}
          <button
            className="quiet-button"
            disabled={busy}
            onClick={() => setSelected(null)}
          >
            إغلاق التفاصيل
          </button>
        </section>
      )}
    </>
  );
}
