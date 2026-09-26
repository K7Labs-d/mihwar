import { useEffect, useRef } from 'react';
import { ArrowLeft, Bell, CalendarDays, FileText, Settings, Star, Tractor, Wallet } from 'lucide-react';
import { getPage, pageHref } from '../../data/productPages';
import { PAGE_SHELLS, type ShellIcon, type ShellPage } from '../../data/pageShells';
import './product-pages.css';

const icons = {
  equipment: Tractor, offers: FileText, booking: CalendarDays, payment: Wallet,
  execution: Settings, documents: FileText, notifications: Bell, reviews: Star,
} satisfies Record<ShellIcon, typeof FileText>;

export function ProductPageShell({ page }: { page: ShellPage }) {
  const info = getPage(page);
  const shell = PAGE_SHELLS[page];
  const Icon = icons[shell.icon];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [page]);

  return <section className="mahwar-content product-page-shell" dir="rtl" aria-labelledby="product-page-heading">
    <header className="product-page-heading">
      <div>
        <p className="eyebrow">{shell.section}</p>
        <h1 id="product-page-heading" tabIndex={-1} ref={heading}>{info.title}</h1>
        <p className="muted">{info.description}</p>
      </div>
      <span className="feature-status">الميزة قيد الإكمال</span>
    </header>

    <div className="product-page-layout">
      <section className="branch-panel product-page-body" aria-labelledby="product-empty-heading">
        <div className="empty-state product-page-empty">
          <Icon size={42} aria-hidden="true" />
          <h2 id="product-empty-heading">{shell.emptyTitle}</h2>
          <p className="muted">{shell.description}</p>
        </div>
        <nav className="product-related" aria-label="صفحات مرتبطة">
          <h2>صفحات مرتبطة</h2>
          <div className="related-pages">
            {shell.related.map(id => <a key={id} className="quiet-button" href={pageHref(id)}>
              <span>{getPage(id).title}</span><ArrowLeft size={16} aria-hidden="true" />
            </a>)}
          </div>
        </nav>
      </section>

      <nav className="product-journey" aria-labelledby="product-journey-heading">
        <h2 id="product-journey-heading">استعراض صفحات الرحلة</h2>
        <p className="muted">روابط للتنقل بين الصفحات؛ لا تعبّر عن تقدم طلب أو حجز.</p>
        <ol>
          {shell.journey.map(id => <li key={id}>
            <a href={pageHref(id)} aria-current={id === page ? 'page' : undefined}>
              <span>{getPage(id).title}</span><ArrowLeft size={16} aria-hidden="true" />
            </a>
          </li>)}
        </ol>
      </nav>
    </div>
  </section>;
}
