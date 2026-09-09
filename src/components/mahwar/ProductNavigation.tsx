import { ArrowLeft, CircleDot } from 'lucide-react';
import { MAHWAR_BRANCHES } from '../../data/mahwarBranches';
import { BROKER_PAGES, getPage, pageHref, type Page } from '../../data/productPages';

export function ProductNavigation({ page }: { page: Page }) {
  const current = getPage(page);
  return <>
    <header className="mahwar-header">
      <a href={pageHref('')} className="mahwar-brand" aria-label="محور — الرئيسية"><CircleDot aria-hidden="true" /><span>محور<small>منظومة متكاملة</small></span></a>
      <span className="header-caption">كل الأطراف. في مكان واحد.</span>
      <a href={pageHref('client')} className="quiet-button" aria-current={page === 'client' ? 'page' : undefined}>حساب العميل</a>
    </header>
    <nav className="product-navigation" aria-label="أقسام محور">
      <a href={pageHref('')} aria-current={page === '' ? 'page' : undefined}>المحور</a>
      {MAHWAR_BRANCHES.map(branch => <a key={branch.id} href={pageHref(branch.id as Page)} aria-current={current.branchId === branch.id ? (page === branch.id ? 'page' : 'location') : undefined}>{branch.label}</a>)}
    </nav>
    {current.branchId === 'broker' && <nav className="broker-navigation" aria-label="وظائف الوسيط">
      {BROKER_PAGES.map(item => <a key={item.id} href={pageHref(item.id)} aria-current={page === item.id ? 'page' : undefined}>{item.title}</a>)}
    </nav>}
    {page && <nav className="page-breadcrumb" aria-label="مسار الصفحة">
      <a href={pageHref('')}>المحور</a><ArrowLeft size={13} aria-hidden="true" />
      {page.startsWith('broker-') && <><a href={pageHref('broker')}>الوسيط</a><ArrowLeft size={13} aria-hidden="true" /></>}
      <span aria-current="page">{current.title}</span>
    </nav>}
  </>;
}
