import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Pause, Play, Radio, RotateCcw } from 'lucide-react';
import { DEFAULT_REQUEST, FILTERS, getNode, PHASE_LABELS, sceneAt, TIMING, visibleNodes, type MapMode, type SignalFilter, type SimulationNode } from './liveMapSimulation';
import { useLiveMapTimeline } from './useLiveMapTimeline';
import { MapScene } from './MapScene';
import { TransactionSheet } from './TransactionSheet';
import './live-map.css';

export function LiveMap() {
  const [mode, setMode] = useState<MapMode>('pulse');
  const [filter, setFilter] = useState<SignalFilter>('all');
  const [requestId, setRequestId] = useState(DEFAULT_REQUEST);
  const [selected, setSelected] = useState(DEFAULT_REQUEST);
  const [dismissed, setDismissed] = useState(false);
  const [size, setSize] = useState({ width: 1000, height: 650 });
  const field = useRef<HTMLDivElement>(null);
  const replayButton = useRef<HTMLButtonElement>(null);
  const clock = useLiveMapTimeline();
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    const update = () => setSize({ width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) });
    update();
    const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scene = sceneAt(clock.elapsed, requestId);
  const nodes = visibleNodes(scene, mode, filter);
  const active = getNode(selected) ?? scene.request;
  const sheetVisible = scene.ready && !dismissed && nodes.some(node => node.id === active.id);
  const empty = scene.candidates.length === 0 && scene.elapsed >= TIMING.reveal[0];
  const narrative = empty ? { title: 'احتياج ينتظر معدة مناسبة', caption: 'لا توجد معدة متاحة من هذا النوع في المحاكاة.' } : PHASE_LABELS[scene.phase];
  const selectNode = (node: SimulationNode) => {
    setSelected(node.id); setDismissed(false);
    if (node.kind === 'demand') { setRequestId(node.id); setFilter('all'); clock.replay(); }
  };
  const replay = () => {
    setRequestId(DEFAULT_REQUEST); setSelected(DEFAULT_REQUEST); setFilter('all'); setDismissed(false); clock.replay();
  };
  const chooseFilter = (next: SignalFilter) => {
    if (next === 'unmatched') selectNode(getNode('REQ-2A10')!);
    if (next === 'operation') { setSelected('OP-19'); setDismissed(false); clock.seek(TIMING.duration); }
    setFilter(next);
  };
  const changeMode = (next: MapMode) => {
    setMode(next); setFilter('all'); setDismissed(false);
    if (active.kind === 'operation') setSelected(requestId);
  };
  const closeSheet = () => {
    setDismissed(true);
    (field.current?.querySelector<HTMLButtonElement>(`[data-node="${selected}"]`) ?? replayButton.current)?.focus({ preventScroll: true });
  };
  return <section className="lm" aria-label="خريطة محور التفاعلية — محاكاة" data-phase={scene.phase} data-playing={clock.playing}
    onKeyDown={event => { if (event.key === 'Escape' && sheetVisible) { event.preventDefault(); closeSheet(); } }}>
    <header className="lm-heading">
      <div><p className="lm-eyebrow"><Radio className="lm-icon" aria-hidden="true" /><span dir="ltr">MIHWAR / LIVE MAP</span></p>
        <h1>الطلب يبدأ بنقطة.<span> ومحور يصنع الاتصال.</span></h1>
      </div>
      <div className="lm-modes" role="group" aria-label="وضع الخريطة" dir="ltr">
        <button type="button" aria-pressed={mode === 'pulse'} onClick={() => changeMode('pulse')}>MARKET PULSE</button>
        <button type="button" aria-pressed={mode === 'operations'} onClick={() => changeMode('operations')}>OPERATIONS</button>
      </div>
    </header>
    <div ref={field} className="lm-map" data-sheet={sheetVisible ? 'open' : 'closed'} data-mode={mode}>
      <MapScene scene={scene} nodes={nodes} selected={selected} width={size.width} height={size.height} onSelect={selectNode} />
      <div className="lm-map-top"><span className="lm-field-label" dir="ltr">RIYADH / <span>SCHEMATIC</span></span>
        <span className="lm-simulation"><i aria-hidden="true" />محاكاة تفاعلية · لا بيانات تشغيلية</span></div>
      <div className="lm-filters" role="group" aria-label="تصفية الإشارات">
        {FILTERS.filter(item => mode === 'operations' || !['unmatched', 'operation'].includes(item.id)).map(item =>
          <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => chooseFilter(item.id)}>
            <i className={`lm-filter-dot lm-filter-dot--${item.id}`} aria-hidden="true" />{item.label}</button>)}
      </div>
      {mode === 'operations' && <p className="lm-operations-note">{filter === 'unmatched' ? 'الطلبات التي لم تجد معدة في السيناريو' : 'اختر إشارة لفحص العلاقة أو حالة التنفيذ التجريبية'}</p>}
      <div className="lm-narrative" role="status" aria-live="polite" aria-atomic="true">
        <p className="lm-narrative-code" dir="ltr">{empty ? 'NO ELIGIBLE EQUIPMENT' : scene.ready ? 'DEMAND CONNECTED TO EQUIPMENT' : 'REQUEST → SEARCH → CONNECT'}</p>
        <h2>{narrative.title}</h2><p>{narrative.caption}</p>
      </div>
      {sheetVisible && <TransactionSheet key={active.id} node={active} scene={scene} onClose={closeSheet} onSelect={selectNode} />}
      {scene.ready && dismissed && nodes.some(node => node.id === active.id) && <button type="button" className="lm-reopen" onClick={() => setDismissed(false)}>
        تفاصيل العلاقة<ArrowUpRight className="lm-icon" aria-hidden="true" /></button>}
      <div className="lm-time" role="group" aria-label="التحكم بزمن المحاكاة" dir="ltr">
        <button ref={replayButton} type="button" className="lm-icon-button" onClick={replay} aria-label="إعادة تشغيل المحاكاة"><RotateCcw className="lm-icon" aria-hidden="true" /></button>
        <button type="button" className="lm-icon-button lm-play" onClick={() => { setDismissed(false); clock.toggle(); }}
          aria-label={clock.playing ? 'إيقاف المحاكاة مؤقتًا' : 'تشغيل المحاكاة'}>
          {clock.playing ? <Pause className="lm-icon" aria-hidden="true" /> : <Play className="lm-icon" aria-hidden="true" />}</button>
        <div className="lm-time-track"><label htmlFor="lm-time-range">TIME MACHINE <span>SIMULATION</span></label>
          <input id="lm-time-range" type="range" min="0" max={TIMING.duration} step="50" value={Math.round(clock.elapsed)}
            aria-label="الخط الزمني للمحاكاة" aria-valuetext={`${(clock.elapsed / 1000).toFixed(1)} ثانية من 6 ثوانٍ`}
            style={{ '--lm-progress': `${clock.elapsed / TIMING.duration * 100}%` } as CSSProperties}
            onChange={event => { setDismissed(false); clock.seek(Number(event.target.value)); }} /></div>
        <output className="lm-time-readout" htmlFor="lm-time-range">{(clock.elapsed / 1000).toFixed(1)}<small> / 6s</small></output>
      </div>
    </div>
    <p className="lm-footnote">توزيع مكاني توضيحي، لا مواقع معدات فعلية. {clock.reduced ? 'تقليل الحركة مفعّل؛ يمكنك استعراض المراحل بالشريط الزمني.' : 'اسحب الزمن لتشاهد العلاقة تتكوّن، أو اضغط إشارة لاستكشافها.'}</p>
  </section>;
}
