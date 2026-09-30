import { BrokerRequestPanel } from './BrokerRequestPanel';
export function BrokerManagement({ onBack, onRegister, onClientLogin }: { onBack: () => void; onRegister: () => void; onClientLogin?: () => void }) {
  return <><h3 className="review-title">طلب المؤجر الخاص بي</h3><BrokerRequestPanel onBack={onBack} onRegister={onRegister} onClientLogin={onClientLogin} /></>;
}
