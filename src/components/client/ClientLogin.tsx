import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import { pageHref } from '../../data/productPages';

type Client = { id: string; name: string; email: string; createdAt: string; permissions?: { manageRequests?: boolean; reviewBrokers?: boolean } };

export function ClientLogin() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [user, setUser] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [visible, setVisible] = useState(false);
  const submitting = useRef(false);
  const registration = mode === 'register';

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let active = true;
    fetch('/api/client/me', { credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        if (response.status === 401) return;
        if (!response.ok) throw new Error('تعذر التحقق من تسجيل الدخول. حاول مرة أخرى.');
        const data = await response.json();
        if (active) setUser(data.user);
      })
      .catch(() => { if (active) setError('تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.'); })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, []);

  async function send(action: string, body: object) {
    const response = await fetch('/api/client/' + action, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر إكمال الطلب.');
    return data;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    if (registration && password !== confirmation) { setError('كلمتا المرور غير متطابقتين.'); return; }
    submitting.current = true;
    setBusy(true);
    try {
      const data = await send(mode, registration ? { name, email, password } : { email, password });
      if (!registration && data.challenge) {
        setChallenge(data.challenge);
        setCode('');
      } else {
        if (!data.user?.id) throw new Error('تعذر التحقق من الحساب.');
        setUser(data.user);
      }
      setPassword('');
      setConfirmation('');
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== 'TimeoutError' && failure.name !== 'TypeError'
        ? failure.message : 'تعذر الاتصال بالخادم. حاول مرة أخرى.');
    } finally { submitting.current = false; setBusy(false); }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const data = await send('login/verify', { challenge, code });
      if (!data.user?.id) throw new Error('تعذر التحقق من الحساب.');
      setUser(data.user);
      setChallenge('');
      setCode('');
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== 'TimeoutError' && failure.name !== 'TypeError'
        ? failure.message : 'تعذر الاتصال بالخادم. حاول مرة أخرى.');
    } finally { submitting.current = false; setBusy(false); }
  }

  async function logout() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try { await send('logout', {}); setUser(null); setMode('login'); }
    catch { setError('تعذر تسجيل الخروج. حاول مرة أخرى.'); }
    finally { submitting.current = false; setBusy(false); }
  }

  const field = 'w-full rounded-xl border border-slate-700 bg-[#080d18] px-4 py-3 text-sm text-white outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/15 disabled:opacity-60';
  const primary = 'w-full rounded-xl bg-gradient-to-l from-amber-400 to-amber-500 px-4 py-3 font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-50 disabled:cursor-wait';

  return <section className="px-5 py-8 sm:py-12" dir="rtl">
    <div className="mx-auto max-w-md">
      <a href={pageHref('')} className="mb-8 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-amber-400"><ArrowRight size={17} />العودة إلى محور</a>
      <div className="rounded-3xl border border-amber-500/25 bg-[#0a0f1d] p-6 shadow-2xl sm:p-8">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-400/10 text-amber-400"><UserRound size={28} /></div>
        <h1 className="mb-2 text-2xl font-extrabold text-white">{user ? 'حسابي' : challenge ? 'رمز الدخول' : registration ? 'إنشاء حساب' : 'تسجيل الدخول'}</h1>
        {error && <p role="alert" className="my-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm leading-7 text-red-200">{error}</p>}
        {loading ? <p role="status" className="py-8 text-slate-400">جارٍ التحقق من تسجيل الدخول…</p> : user ? <div className="space-y-5 pt-4">
          <p role="status" className="text-amber-300">أهلًا {user.name}، أنت مسجّل الدخول.</p>
          <dl className="space-y-4 rounded-xl border border-slate-800 p-4 text-sm">
            <div><dt className="mb-1 text-slate-400">الاسم</dt><dd className="break-words text-white">{user.name}</dd></div>
            <div><dt className="mb-1 text-slate-400">البريد الإلكتروني</dt><dd dir="ltr" className="break-all text-right text-white">{user.email}</dd></div>
          </dl>
          <nav className="client-destinations" aria-label="متابعة العمل في محور">
            <a className="quiet-button" href={pageHref('request')}>طلباتي والردود</a>
            {(user.permissions?.manageRequests === true || user.permissions?.reviewBrokers === true) && <a className="gold-button" href={pageHref('admin')}>الإدارة والتشغيل</a>}
            {user.permissions?.manageRequests && <a className="gold-button" href={pageHref('admin-requests')}>إدارة الطلبات</a>}
            <a className="quiet-button" href={pageHref('equipment')}>معداتـي</a>
            <a className="quiet-button" href={pageHref('broker-registration')}>التسجيل كمؤجر</a>
            <a className="quiet-button" href={pageHref('broker-management')}>طلبات الاعتماد</a>
            <a className="quiet-button" href={pageHref('bookings')}>حجوزاتي</a>
            <a className="quiet-button" href={pageHref('payments')}>المدفوعات والمستحقات</a>
            <a className="quiet-button" href={pageHref('notifications')}>الإشعارات</a>
            <a className="quiet-button" href={pageHref('documents')}>المستندات</a>
            <a className="quiet-button" href={pageHref('reviews')}>التقييمات</a>
          </nav>
          <button className={primary} onClick={logout} disabled={busy}>{busy ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}</button>
        </div> : challenge ? <>
          <p className="mb-6 text-sm leading-7 text-slate-400">أرسلنا رمزًا من 6 أرقام إلى بريدك الإلكتروني. صالح لمدة 5 دقائق.</p>
          <form onSubmit={verify} className="space-y-4">
            <label htmlFor="client-code" className="block text-sm text-slate-200">رمز التحقق</label>
            <input id="client-code" name="one-time-code" type="text" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" dir="ltr" required maxLength={6} className={field} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))} disabled={busy} />
            <button type="submit" className={primary} disabled={busy}>{busy ? 'جارٍ التحقق…' : 'تأكيد الدخول'}</button>
          </form>
          <button type="button" className="mt-5 text-sm text-amber-400 hover:underline" disabled={busy} onClick={() => { setChallenge(''); setCode(''); setError(''); }}>إعادة تسجيل الدخول للحصول على رمز جديد</button>
        </> : <>
          <p className="mb-6 text-sm leading-7 text-slate-400">{registration ? 'أدخل بياناتك لإنشاء حسابك في محور.' : 'أدخل بريدك الإلكتروني وكلمة المرور للوصول إلى حسابك.'}</p>
          <form onSubmit={submit} className="space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              {registration && <div><label htmlFor="client-name" className="mb-2 block text-sm text-slate-200">الاسم</label><input id="client-name" name="name" autoComplete="name" required minLength={2} maxLength={80} className={field} value={name} onChange={e => setName(e.target.value)} /></div>}
              <div><label htmlFor="client-email" className="mb-2 block text-sm text-slate-200">البريد الإلكتروني</label><input id="client-email" name="email" type="email" dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} className={field} value={email} onChange={e => setEmail(e.target.value)} /></div>
              <div>
                <label htmlFor="client-password" className="mb-2 block text-sm text-slate-200">كلمة المرور</label>
                <div className="relative"><input id="client-password" name="password" type={visible ? 'text' : 'password'} dir="ltr" autoComplete={registration ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} aria-describedby="password-help" className={field + ' pr-12'} value={password} onChange={e => setPassword(e.target.value)} /><button type="button" aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={visible} onClick={() => setVisible(!visible)} className="absolute right-3 top-3 text-slate-400 hover:text-amber-400">{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
                <p id="password-help" className="mt-2 text-xs text-slate-400">من 12 إلى 128 حرفًا.</p>
              </div>
              {registration && <div><label htmlFor="client-confirmation" className="mb-2 block text-sm text-slate-200">تأكيد كلمة المرور</label><input id="client-confirmation" name="confirmation" type={visible ? 'text' : 'password'} dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} className={field} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></div>}
              <button type="submit" className={primary}>{busy ? 'جارٍ المتابعة…' : registration ? 'إنشاء الحساب' : 'تسجيل الدخول'}</button>
            </fieldset>
          </form>
          <div className="mt-6 border-t border-slate-800 pt-5 text-center text-sm text-slate-400">{registration ? 'لديك حساب؟ ' : 'ليس لديك حساب؟ '}<button disabled={busy} className="font-bold text-amber-400 hover:underline disabled:opacity-50" onClick={() => { setMode(registration ? 'login' : 'register'); setError(''); setPassword(''); setConfirmation(''); }}>{registration ? 'تسجيل الدخول' : 'إنشاء حساب'}</button></div>
          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500"><LockKeyhole size={14} />لا تشارك كلمة مرورك مع أي شخص.</p>
        </>}
      </div>
    </div>
  </section>;
}
