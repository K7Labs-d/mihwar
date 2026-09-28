import { useId, useRef, useState, type PointerEvent } from 'react';
import { ChevronUp, MapPin, X } from 'lucide-react';
import { type Scene, type SimulationNode } from './liveMapSimulation';
interface Props { node: SimulationNode; scene: Scene; onClose: () => void; onSelect: (node: SimulationNode) => void; }

export function TransactionSheet({ node, scene, onClose, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const start = useRef<{ y: number; id: number } | null>(null);
  const dragged = useRef(false);
  const id = useId();
  const matched = node.kind === 'demand' ? scene.candidates.length > 0 : scene.revealedIds.includes(node.id);
  const status = node.kind === 'operation' ? 'مسار تنفيذ توضيحي' : matched ? 'مطابقة ضمن المحاكاة' : 'لا توجد مطابقة متاحة في السيناريو';
  const handleDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    start.current = { y: event.clientY, id: event.pointerId }; dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (start.current?.id !== event.pointerId) return;
    const delta = event.clientY - start.current.y;
    if (Math.abs(delta) > 28) {
      dragged.current = true;
      if (delta < 0) setExpanded(true); else if (expanded) setExpanded(false); else onClose();
    }
    start.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <section className={`lm-dna${expanded ? ' lm-dna--expanded' : ''}`} data-dna="true" aria-labelledby={`${id}-title`}>
    <button type="button" className="lm-sheet-handle" aria-label={expanded ? 'طي تفاصيل المعاملة' : 'توسيع تفاصيل المعاملة'}
      aria-expanded={expanded} aria-controls={`${id}-details`} onPointerDown={handleDown} onPointerUp={handleUp}
      onPointerCancel={() => { start.current = null; dragged.current = false; }}
      onClick={() => { if (dragged.current) { dragged.current = false; return; } setExpanded(value => !value); }}
      onKeyDown={event => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setExpanded(event.key === 'ArrowUp'); }
      }}><span aria-hidden="true" /></button>
    <div className="lm-dna-top"><span>TRANSACTION DNA</span><button type="button" className="lm-icon-button" aria-label="إغلاق تفاصيل المعاملة" onClick={onClose}><X className="lm-icon" aria-hidden="true" /></button></div>
    <div className="lm-dna-summary">
      <div><b className="lm-dna-id" dir="ltr">{node.id}</b><h2 id={`${id}-title`}>{node.title}</h2></div>
      <span className="lm-dna-area"><MapPin className="lm-icon" aria-hidden="true" />{node.area}</span>
    </div>
    <p className="lm-dna-status"><i aria-hidden="true" />{status}</p>
    <div className="lm-dna-path" dir="ltr" aria-label="مسار توضيحي">
      {(node.kind === 'operation' ? ['BOOKING', 'EXECUTION', 'STATUS'] : ['REQUEST', 'MATCH', 'EQUIPMENT']).map((label, index) =>
        <span key={label} className={index === 1 ? 'lm-path-current' : ''}>{label}</span>)}
    </div>
    <div id={`${id}-details`} className="lm-dna-details" hidden={!expanded}>
      <p>{node.detail}</p>
      {node.kind === 'demand' && <div className="lm-related-list">
        {scene.candidates.length ? scene.candidates.map(candidate => <button type="button" key={candidate.id} onClick={() => onSelect(candidate)}>
          <span>{candidate.area}</span><b dir="ltr">{candidate.id}</b></button>) : <p>لا توجد معدة متاحة من النوع المطلوب في بيانات المحاكاة.</p>}
      </div>}
      {node.kind === 'supply' && matched && <p>مرتبطة بالطلب <bdi>{scene.request.id}</bdi> ضمن هذا السيناريو فقط.</p>}
      {node.kind === 'operation' && <p>مرجع حجز توضيحي: <bdi>{node.booking}</bdi></p>}
      <div className="lm-future-path"><span>لاحقًا في المنتج</span><p>العرض ← الحجز ← التنفيذ</p></div>
      <small>محاكاة تصميمية مستقلة. لا تنشئ عروضًا أو حجوزات أو مدفوعات فعلية.</small>
    </div>
    <button type="button" className="lm-dna-expand" aria-expanded={expanded} aria-controls={`${id}-details`} onClick={() => setExpanded(value => !value)}>
      {expanded ? 'طي التفاصيل' : 'تفاصيل العلاقة'}<ChevronUp className={`lm-icon${expanded ? ' lm-icon--flipped' : ''}`} aria-hidden="true" />
    </button>
  </section>;
}
