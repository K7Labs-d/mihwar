import { useState } from 'react';
import { ArrowRight, Users } from 'lucide-react';
import { MahwarState, MahwarBranch } from '../../types/mahwar';
import { MAHWAR_BRANCHES } from '../../data/mahwarBranches';
import { MahwarWheel } from './MahwarWheel';
import { BranchPanel } from './BranchPanel';
import { BrokerRequestPanel } from '../broker/BrokerRequestPanel';
import { BrokerManagement } from '../broker/BrokerManagement';
import { LessorEquipment } from '../lessor/LessorEquipment';
import { ClientRequests } from '../request/ClientRequests';
import { getPage, pageHref, type Page } from '../../data/productPages';

export const MahwarHero = ({
  onClientLogin,
  page,
  onNavigate,
}: {
  onClientLogin: () => void;
  page: Page;
  onNavigate: (page: Page) => void;
}) => {
  const info = getPage(page);
  const [currentState, setCurrentState] = useState<MahwarState>(
    page ? 'open' : 'closed',
  );
  const activeBranchId = info.branchId;
  const registering = page === 'broker-registration';
  const activeBranch = MAHWAR_BRANCHES.find(
    (branch) => branch.id === activeBranchId,
  );
  const closePanel = () => onNavigate('');
  const brokerBack = () => onNavigate('broker');
  const select = (branch: MahwarBranch | null) =>
    onNavigate(branch ? (branch.id as Page) : '');

  if (
    [
      'broker-registration',
      'broker-management',
      'equipment',
      'request',
    ].includes(page)
  )
    return (
      <>
        <div className="figma-context">
          {page === 'request'
            ? 'المستأجر / طلباتي'
            : 'تأجير معداتي / ' + (registering ? 'الاعتماد' : info.title)}
        </div>
        <div className="figma-content phase1-existing-flow">
          <div className="figma-intro">
            <h1>{registering ? 'ابدأ بتعريفنا على نشاطك' : info.title}</h1>
            <p>
              {registering
                ? 'أكمل بيانات نشاطك. لا اعتماد تلقائي بعد الإرسال.'
                : info.description}
            </p>
          </div>
          <div
            className={
              registering ? 'lessor-application-layout' : 'phase1-flow-card'
            }
          >
            <div className="phase1-flow-body">
              {registering ? (
                <BrokerRequestPanel
                  registration
                  onBack={brokerBack}
                  onClientLogin={onClientLogin}
                />
              ) : page === 'equipment' ? (
                <LessorEquipment onClientLogin={onClientLogin} />
              ) : page === 'request' ? (
                <ClientRequests onClientLogin={onClientLogin} />
              ) : (
                <BrokerManagement
                  onBack={brokerBack}
                  onRegister={() => onNavigate('broker-registration')}
                  onClientLogin={onClientLogin}
                />
              )}
            </div>
            {registering && (
              <aside className="figma-card figma-tint">
                <h2>رحلة الاعتماد</h2>
                <ol>
                  <li>بيانات المؤجر</li>
                  <li>مجال العمل</li>
                  <li>المستندات</li>
                  <li>المراجعة والإرسال</li>
                </ol>
                <p className="muted">
                  بعد الإرسال يظهر طلبك بانتظار مراجعة الإدارة. إذا رُفض، راجع
                  السبب وصحّح بياناتك ثم أعد التقديم.
                </p>
              </aside>
            )}
          </div>
        </div>
      </>
    );

  return (
    <>
      <div className="mahwar-content">
        <div className="experience-heading">
          <p className="eyebrow">محور — منظومة متكاملة</p>
          <h1>
            {page ? (
              info.title
            ) : (
              <>
                منظومة <em>محور</em> المتكاملة
              </>
            )}
          </h1>
          <p>{info.description}</p>
        </div>
        <div
          className={`mahwar-workspace ${activeBranch ? 'has-panel' : ''} ${registering ? 'is-registering' : ''}`}
        >
          <div className="wheel-context">
            {registering && (
              <button
                className="quiet-button context-back"
                onClick={brokerBack}
              >
                <ArrowRight size={18} /> العودة إلى المؤجر
              </button>
            )}
            <MahwarWheel
              currentState={currentState}
              onStateChange={setCurrentState}
              activeBranchId={activeBranchId}
              onBranchSelect={select}
              interactionLocked={registering}
            />
            {registering && (
              <div className="context-caption">
                <Users size={26} />
                <h2>إضافة مؤجر جديد</h2>
                <p>أكمل بياناتك خطوة بخطوة</p>
              </div>
            )}
          </div>
          {activeBranch &&
            (registering ? (
              <BrokerRequestPanel
                registration
                onBack={brokerBack}
                onClientLogin={onClientLogin}
              />
            ) : (
              <BranchPanel
                branch={activeBranch}
                page={page}
                onClose={closePanel}
                onRegister={() => onNavigate('broker-registration')}
                onClientLogin={onClientLogin}
                onBrokerBack={brokerBack}
              />
            ))}
        </div>
      </div>
      <footer className="mahwar-footer">
        <span>
          محور <span className="footer-dot">·</span> ترابط في كل خطوة
        </span>
        {activeBranch && !registering && (
          <a className="text-button" href={pageHref('')}>
            <ArrowRight size={17} /> العودة إلى المحور
          </a>
        )}
      </footer>
    </>
  );
};
