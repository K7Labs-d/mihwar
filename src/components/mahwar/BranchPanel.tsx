import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Users, User, FileText, ClipboardCheck, Settings, Handshake, ChartNoAxesColumn, ChevronLeft, X } from 'lucide-react';
import type { MahwarBranch } from '../../types/mahwar';
import { BrokerManagement } from '../broker/BrokerManagement';
import { BROKER_PAGES, getPage, pageHref, type Page } from '../../data/productPages';
import { isOverviewPage, SectionOverview } from './SectionOverview';
import { ClientRequests } from '../request/ClientRequests';

const actionIcons = { 'broker-registration': Users, 'broker-management': FileText, 'broker-opportunities': Handshake, 'broker-reports': ChartNoAxesColumn, 'broker-settings': Settings };
const icons = { 'file-text': FileText, users: Users, 'clipboard-check': ClipboardCheck, settings: Settings, user: User };

export function BranchPanel({ branch, page, onClose, onRegister, onClientLogin, onBrokerBack }: { branch: MahwarBranch; page: Page; onClose: () => void; onRegister: () => void; onClientLogin: () => void; onBrokerBack: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const info = getPage(page);
  const Icon = actionIcons[page as keyof typeof actionIcons] ?? icons[branch.iconName];
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return <motion.aside className="branch-panel" aria-labelledby="branch-heading" data-branch-panel initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .2 }}>
    <div className="panel-heading"><div className="panel-title"><Icon size={38} aria-hidden="true" /><div><h2 id="branch-heading" tabIndex={-1} ref={heading}>{page.startsWith('broker-') ? info.title : branch.cardTitle}</h2><p>{page.startsWith('broker-') ? info.description : branch.cardSubtitle}</p></div></div><button className="quiet-button close-panel" onClick={onClose} aria-label="إغلاق لوحة الفرع"><X size={17} /> إغلاق</button></div>
    {page === 'request' ? <ClientRequests onClientLogin={onClientLogin} />
      : page === 'broker-management' ? <BrokerManagement onBack={onBrokerBack} onRegister={onRegister} onClientLogin={onClientLogin} />
      : isOverviewPage(page) ? <SectionOverview page={page} />
      : branch.id === 'broker' ? <div className="branch-actions">{BROKER_PAGES.map(({ id, title, description }, index) => {
        const ActionIcon = actionIcons[id as keyof typeof actionIcons];
        return <a key={id} href={pageHref(id)} className={`branch-action ${index === 0 ? 'primary-action' : ''}`}><span className="action-icon"><ActionIcon size={27} aria-hidden="true" /></span><span className="action-copy"><strong>{title}</strong><small>{description}</small></span><ChevronLeft size={21} aria-hidden="true" /></a>;
      })}</div> : null}
  </motion.aside>;
}
