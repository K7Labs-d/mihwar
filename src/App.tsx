import { lazy, Suspense, useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { MahwarHero } from './components/mahwar/MahwarHero';
const ClientLogin = lazy(() => import('./components/client/ClientLogin').then(module => ({ default: module.ClientLogin })));

export default function App() {
  const [clientPage, setClientPage] = useState(() => window.location.hash === '#client');
  useEffect(() => {
    const clearOldRoute = () => {
      const client = window.location.hash === '#client';
      setClientPage(client);
      if (!client && window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
      window.scrollTo(0, 0);
    };
    clearOldRoute();
    window.addEventListener('hashchange', clearOldRoute);
    return () => window.removeEventListener('hashchange', clearOldRoute);
  }, []);

  return <MotionConfig reducedMotion="user">
    <main id="main-content" className="min-h-screen bg-[#05070e] text-slate-100 overflow-x-hidden" dir="rtl">
      <Suspense fallback={<p role="status" className="p-10 text-center text-slate-400">جارٍ التحميل…</p>}>
        {clientPage ? <ClientLogin /> : <MahwarHero onClientLogin={() => { window.location.hash = 'client'; }} />}
      </Suspense>
    </main>
  </MotionConfig>;
}
