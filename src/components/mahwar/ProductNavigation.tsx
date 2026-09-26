import { ArrowLeft, CircleDot } from 'lucide-react';
import { getPage, getParentPage, getSectionRoot, PRIMARY_PAGES, SECTION_PAGES, pageHref, type Page } from '../../data/productPages';

export function ProductNavigation({ page }: { page: Page }) {
  const current = getPage(page);
  const root = getSectionRoot(page);
  const section: readonly Page[] = SECTION_PAGES[root as keyof typeof SECTION_PAGES] ?? [];
  const parent = getParentPage(page);
  return <>
    <header className="mahwar-header">
      <a href={pageHref('')} className="mahwar-brand" aria-label="محور — الرئيسية"><CircleDot aria-hidden="true" /><span>محور<small>منظومة متكاملة</small></span></a>
      <span className="header-caption">كل الأطراف. في مكان واحد.</span>
      <a href={pageHref('client')} className="quiet-button" aria-current={page === 'client' ? 'page' : undefined}>حسابي</a>
    </header>
    <nav className="product-navigation" aria-label="أقسام محور">
      {PRIMARY_PAGES.map(id => <a key={id} href={pageHref(id)} aria-current={root === id ? (page === id ? 'page' : 'location') : undefined}>{id === '' ? 'المحور' : getPage(id).title}</a>)}
    </nav>
    {section.length > 0 && <nav className="broker-navigation" aria-label={getPage(root).title}>
      {section.map(id => <a key={id} href={pageHref(id)} aria-current={page === id ? 'page' : undefined}>{getPage(id).title}</a>)}
    </nav>}
    {page && <nav className="page-breadcrumb" aria-label="مسار الصفحة">
      <a href={pageHref('')}>المحور</a><ArrowLeft size={13} aria-hidden="true" />
      {parent && <><a href={pageHref(parent)}>{getPage(parent).title}</a><ArrowLeft size={13} aria-hidden="true" /></>}
      <span aria-current="page">{current.title}</span>
    </nav>}
  </>;
}
