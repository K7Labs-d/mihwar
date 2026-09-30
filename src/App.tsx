import { lazy, Suspense, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './components/client/AuthContext';
import { MotionConfig } from 'motion/react';
import { MahwarHero } from './components/mahwar/MahwarHero';
import { ProductNavigation } from './components/mahwar/ProductNavigation';
import { getPage, resolvePage, type Page } from './data/productPages';
import { isShellPage } from './data/pageShells';
import './components/product/product-pages.css';
const LiveMap = lazy(() =>
  import('./components/live/LiveMap').then((module) => ({
    default: module.LiveMap,
  })),
);
const ClientLogin = lazy(() =>
  import('./components/client/ClientLogin').then((module) => ({
    default: module.ClientLogin,
  })),
);
const Marketplace = lazy(() =>
  import('./components/product/Marketplace').then((module) => ({
    default: module.Marketplace,
  })),
);
const ProductPageShell = lazy(() =>
  import('./components/product/ProductPageShell').then((module) => ({
    default: module.ProductPageShell,
  })),
);
const AdminOverview = lazy(() =>
  import('./components/product/AdminOverview').then((module) => ({
    default: module.AdminOverview,
  })),
);
const currentPage = () => resolvePage(window.location.hash);
const navigate = (page: Page) => {
  window.location.hash = page;
};

function AuthenticatedApp() {
  const { user, loading, error, refresh } = useAuth();
  const [page, setPage] = useState(currentPage);
  useEffect(() => {
    const clearOldRoute = () => {
      const route = currentPage();
      setPage(route);
      document.title = route
        ? `${getPage(route).title} | محور`
        : 'منظومة محور المتكاملة';
      if (!route && window.location.hash)
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search,
        );
      window.scrollTo(0, 0);
    };
    clearOldRoute();
    window.addEventListener('hashchange', clearOldRoute);
    return () => window.removeEventListener('hashchange', clearOldRoute);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={
          page === 'live-map' && user
            ? 'mahwar-experience mahwar-experience--live-map'
            : 'mahwar-experience'
        }
        dir="rtl"
      >
        <a
          className="skip-navigation"
          href="#main-content"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById('main-content')?.focus();
          }}
        >
          تجاوز التنقل إلى المحتوى
        </a>
        <ProductNavigation page={page} />
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 text-slate-100"
        >
          <Suspense
            fallback={
              <p role="status" className="p-10 text-center text-slate-400">
                جارٍ التحميل…
              </p>
            }
          >
            {loading ? (
              <p className="empty-state" role="status">
                جارٍ التحقق من تسجيل الدخول…
              </p>
            ) : error ? (
              <div className="empty-state">
                <p role="alert">{error}</p>
                <button className="quiet-button" onClick={() => void refresh()}>
                  إعادة المحاولة
                </button>
              </div>
            ) : page === 'admin-login' ? (
              <ClientLogin admin />
            ) : !user || (user.selectedRole === null && !user.adminSession) ? (
              <ClientLogin />
            ) : (page === 'admin' || page.startsWith('admin-')) &&
              !user.adminSession ? (
              <ClientLogin admin />
            ) : page === 'marketplace' || page === 'equipment-details' ? (
              <Marketplace />
            ) : page === 'live-map' ? (
              <LiveMap />
            ) : page === 'client' ? (
              <ClientLogin />
            ) : page === 'admin' || page.startsWith('admin-') ? (
              <AdminOverview key={page} page={page} />
            ) : isShellPage(page) ? (
              <ProductPageShell key={page} page={page} />
            ) : (
              <MahwarHero
                key={page}
                page={page}
                onNavigate={navigate}
                onClientLogin={() => navigate('client')}
              />
            )}
          </Suspense>
        </main>
      </div>
    </MotionConfig>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
