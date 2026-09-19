import { lazy, Suspense, useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { MahwarHero } from './components/mahwar/MahwarHero';
import { ProductNavigation } from './components/mahwar/ProductNavigation';
import { getPage, resolvePage, type Page } from './data/productPages';
const ClientLogin = lazy(() => import('./components/client/ClientLogin').then(module => ({ default: module.ClientLogin })));
const AdminRequests = lazy(() => import('./components/request/AdminRequests').then(module => ({ default: module.AdminRequests })));
const currentPage = () => resolvePage(window.location.hash);
const navigate = (page: Page) => { window.location.hash = page; };

export default function App() {
  const [page, setPage] = useState(currentPage);
  useEffect(() => {
    const clearOldRoute = () => {
      const route = currentPage();
      setPage(route);
      document.title = route ? `${getPage(route).title} | محور` : 'منظومة محور التفاعلية';
      if (!route && window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
      window.scrollTo(0, 0);
    };
    clearOldRoute();
    window.addEventListener('hashchange', clearOldRoute);
    return () => window.removeEventListener('hashchange', clearOldRoute);
  }, []);

  return <MotionConfig reducedMotion="user">
    <div className="mahwar-experience" dir="rtl">
      <a className="skip-navigation" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>تجاوز التنقل إلى المحتوى</a>
      <ProductNavigation page={page} />
    <main id="main-content" tabIndex={-1} className="min-w-0 text-slate-100">
      <Suspense fallback={<p role="status" className="p-10 text-center text-slate-400">جارٍ التحميل…</p>}>
        {page === 'client' ? <ClientLogin /> : page === 'admin-requests' ? <AdminRequests /> : <MahwarHero key={page} page={page} onNavigate={navigate} onClientLogin={() => navigate('client')} />}
      </Suspense>
    </main>
    </div>
  </MotionConfig>;
}
