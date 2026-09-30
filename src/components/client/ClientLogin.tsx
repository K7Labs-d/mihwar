import { useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth, authAction } from './AuthContext';
import { adminLandingPage } from '../../utils/adminAccess';

export function ClientLogin({ admin = false }: { admin?: boolean }) {
  const { user, setUser } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login'),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const pending = useRef(false);
  const registration = mode === 'register' && !admin;
  async function action(task: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof Error && e.name === 'Error'
          ? e.message
          : 'تعذر الاتصال بالخادم. حاول مرة أخرى.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (registration && password !== confirmation) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    await action(async () => {
      const data = await authAction(
        admin ? 'admin-login' : mode,
        registration ? { name, email, password } : { email, password },
      );
      if (!data.user?.id) throw new Error('تعذر التحقق من الحساب.');
      setUser(data.user);
      setPassword('');
      setConfirmation('');
      setSuccess(
        registration
          ? 'تم إنشاء الحساب. اختر دورك للمتابعة.'
          : 'تم تسجيل الدخول.',
      );
      if (admin) window.location.hash = adminLandingPage(data.user);
    });
  }
  const feedback = (
    <>
      {error && (
        <p role="alert" className="request-error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="request-success">
          {success}
        </p>
      )}
    </>
  );
  if (user && !admin && user.selectedRole === null)
    return (
      <section className="figma-content">
        <div className="figma-card role-choice">
          <p className="eyebrow">تم إنشاء حسابك</p>
          <h1>كيف تبدأ مع محور؟</h1>
          <p className="muted">
            حساب واحد للاستئجار والتأجير. يمكنك طلب تفعيل المؤجر لاحقًا.
          </p>
          {feedback}
          <div className="role-options">
            {(['renter', 'lessor'] as const).map((role) => (
              <button
                className="quiet-button"
                disabled={busy}
                key={role}
                onClick={() =>
                  void action(async () => {
                    const data = await authAction('role', { role });
                    setUser(data.user);
                    window.location.hash =
                      role === 'lessor' ? 'broker-registration' : 'marketplace';
                  })
                }
              >
                <strong>{role === 'renter' ? 'مستأجر' : 'مؤجر'}</strong>
                <span>
                  {role === 'renter'
                    ? 'ابحث عن معدة أو انشر احتياجك'
                    : 'أكمل طلب الاعتماد قبل نشر المعدات'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  if (user && !admin)
    return (
      <section className="figma-content">
        <header className="figma-intro">
          <h1>حساب واحد. أكثر من دور.</h1>
          <p className="muted">
            بياناتك وطلباتك ومعداتك مترابطة، بينما صلاحيات كل دور مستقلة.
          </p>
        </header>
        <div className="account-layout">
          <div className="figma-card">
            <h2>بيانات الحساب</h2>
            <dl className="figma-data">
              <div>
                <dt>الاسم</dt>
                <dd>{user.name}</dd>
              </div>
              <div>
                <dt>البريد الإلكتروني</dt>
                <dd dir="ltr">{user.email}</dd>
              </div>
              <div>
                <dt>المساحة المختارة</dt>
                <dd>{user.selectedRole === 'lessor' ? 'مؤجر' : 'مستأجر'}</dd>
              </div>
            </dl>
            <div className="figma-notice">
              طلب تفعيل دور المؤجر لا يمنح أهلية نشر المعدات؛ يلزم اعتماد
              الإدارة.
            </div>
            {feedback}
            <button
              className="quiet-button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await authAction('logout', {});
                  setUser(null);
                  setMode('login');
                })
              }
            >
              {busy ? 'جارٍ المتابعة…' : 'تسجيل الخروج'}
            </button>
          </div>
          <aside className="figma-card figma-tint">
            <h2>مساحات حسابك</h2>
            <a className="gold-button" href="#request">
              طلباتي كمستأجر
            </a>
            <a className="quiet-button" href="#equipment">
              تأجير معداتي
            </a>
            <button
              className="quiet-button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const data = await authAction('role', { role: 'lessor' });
                  setUser(data.user);
                  window.location.hash = 'broker-registration';
                })
              }
            >
              طلب تفعيل دور المؤجر
            </button>
            <a className="quiet-button" href="#broker-management">
              متابعة طلب الاعتماد
            </a>
          </aside>
        </div>
      </section>
    );
  return (
    <>
      <div className="figma-context">
        {admin
          ? 'الإدارة / دخول خاص'
          : registration
            ? 'الحساب / إنشاء حساب'
            : 'الحساب / تسجيل الدخول'}
      </div>
      <section
        className="figma-content auth-layout"
        data-node-id={registration ? '7:7' : '7:6'}
      >
        <div className="auth-introduction">
          <h1>
            {admin ? 'إدارة محور.\nقرار موثّق.' : 'محور يجمع كل أطراف العملية.'}
          </h1>
          <p className="muted">
            {admin
              ? 'دخول منفصل للحسابات المخولة. تُتحقق الصلاحيات في الخادم عند كل طلب.'
              : 'حساب واحد للاستئجار والتأجير. الدخول مطلوب قبل تصفح المعدات أو الطلب أو التواصل أو الحجز.'}
          </p>
          <div className="figma-notice">
            <p>طلباتك ومحادثاتك مرتبطة بحسابك.</p>
            <p>تأجير المعدات يتطلب اعتماد ملف المؤجر.</p>
            <p className="muted">صلاحيات الإدارة لا تُختار أثناء التسجيل.</p>
          </div>
        </div>
        <div className="figma-card auth-card">
          <h2>
            {admin
              ? 'تسجيل دخول الإدارة'
              : registration
                ? 'ابدأ بحساب واحد'
                : 'حياك من جديد'}
          </h2>
          <p className="muted">
            {registration
              ? 'للاستئجار وتأجير معداتك، دون حسابين منفصلين.'
              : 'سجّل ببريدك الإلكتروني وكلمة المرور.'}
          </p>
          {feedback}
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              {registration && (
                <label className="figma-field" htmlFor="client-name">
                  الاسم
                  <input
                    id="client-name"
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="أدخل اسمك"
                  />
                </label>
              )}
              <label className="figma-field" htmlFor="client-email">
                البريد الإلكتروني
                <input
                  id="client-email"
                  name="email"
                  type="email"
                  dir="ltr"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="أدخل بريدك الإلكتروني"
                />
              </label>
              <label className="figma-field" htmlFor="client-password">
                كلمة المرور
                <span className="password-input">
                  <input
                    id="client-password"
                    name="password"
                    type={visible ? 'text' : 'password'}
                    autoComplete={
                      registration ? 'new-password' : 'current-password'
                    }
                    required
                    minLength={8}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby="password-help"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    aria-label={
                      visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'
                    }
                    aria-pressed={visible}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
                <small id="password-help">من 8 إلى 128 حرفًا.</small>
              </label>
              {registration && (
                <label className="figma-field" htmlFor="client-confirmation">
                  تأكيد كلمة المرور
                  <input
                    id="client-confirmation"
                    name="confirmation"
                    type={visible ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    dir="ltr"
                  />
                </label>
              )}
              <button type="submit" className="gold-button">
                {busy
                  ? 'جارٍ المتابعة…'
                  : registration
                    ? 'إنشاء الحساب'
                    : 'تسجيل الدخول'}
              </button>
            </fieldset>
          </form>
          {!admin && (
            <button
              className="quiet-button"
              disabled={busy}
              onClick={() => {
                setMode(registration ? 'login' : 'register');
                setError('');
                setPassword('');
                setConfirmation('');
              }}
            >
              {registration ? 'لدي حساب بالفعل' : 'إنشاء حساب جديد'}
            </button>
          )}
          {admin && (
            <a className="quiet-button" href="#client">
              العودة إلى حسابي
            </a>
          )}
        </div>
      </section>
    </>
  );
}
