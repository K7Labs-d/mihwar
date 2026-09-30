import mihwarMark from '../../assets/figma/mihwar-mark.svg';
import {
  getPage,
  getSectionRoot,
  SECTION_PAGES,
  pageHref,
  type Page,
} from '../../data/productPages';
import { useAuth } from '../client/AuthContext';

export function ProductNavigation({ page }: { page: Page }) {
  const { user } = useAuth();
  const root = getSectionRoot(page),
    admin = root === 'admin';
  const section: readonly Page[] =
    root === 'broker'
      ? [
          'broker-registration',
          'equipment',
          'broker-opportunities',
          'broker-offers',
          'lessor-payouts',
        ]
      : (SECTION_PAGES[root as keyof typeof SECTION_PAGES] ?? []);
  const pages: readonly Page[] = [
    '',
    'marketplace',
    'request',
    'bookings',
    'broker',
    'notifications',
  ];
  return (
    <>
      <header className="mahwar-header figma-header">
        <a
          href={user ? '#' : '#client'}
          className="mahwar-brand"
          aria-label="محور — الرئيسية"
        >
          <img src={mihwarMark} alt="" aria-hidden="true" />
          <span>
            محور<small>تأجير المعدات</small>
          </span>
        </a>
        <span className="header-caption">كل الأطراف. في مكان واحد.</span>
        {user && (
          <a href="#client" className="quiet-button">
            حسابي
          </a>
        )}
      </header>
      {user && user.selectedRole !== null && !admin && (
        <nav className="product-navigation" aria-label="أقسام محور">
          {pages.map((id) => (
            <a
              key={id}
              href={pageHref(id)}
              aria-current={root === id ? 'page' : undefined}
            >
              {id === ''
                ? 'الرئيسية'
                : id === 'request'
                  ? 'طلباتي'
                  : getPage(id).title}
            </a>
          ))}
        </nav>
      )}
      {user && user.selectedRole !== null && !admin && section.length > 0 && (
        <nav className="broker-navigation" aria-label={getPage(root).title}>
          {section.map((id) => (
            <a
              key={id}
              href={pageHref(id)}
              aria-current={page === id ? 'page' : undefined}
            >
              {id === 'broker-registration'
                ? 'الاعتماد'
                : id === 'broker-opportunities'
                  ? 'الفرص'
                  : id === 'lessor-payouts'
                    ? 'المستحقات'
                    : getPage(id).title}
            </a>
          ))}
        </nav>
      )}
    </>
  );
}
