import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { ArrowLeft, BadgeCheck, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, CircleDot, CreditCard, FileText, Fingerprint, HardHat, LockKeyhole, MapPin, Maximize2, Minimize2, Network, Pause, Play, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Star, Truck, UserRound, UsersRound, Volume2, VolumeX, X, type LucideIcon } from 'lucide-react';
import { soundEngine } from '../../utils/audioSynthesizer';
import { journeyConnections, journeyNodes, nodePosition, showcaseScenes, type JourneyNode } from './showcaseScenes';
import './showcase.css';

const icons: Record<JourneyNode, LucideIcon> = { account: Fingerprint, lessor: UsersRound, equipment: Truck, request: FileText, offer: SlidersHorizontal, booking: CalendarDays, payment: CreditCard, execution: HardHat, completion: CheckCheck };
const ease = [0.22, 1, 0.36, 1] as const;

function Excavator() {
  return <svg className="mh-excavator" viewBox="0 0 340 175" fill="none" aria-hidden="true">
    <defs><linearGradient id="mh-metal" x2="0.2" y2="1"><stop stopColor="#ffd17b" stopOpacity=".27" /><stop offset="1" stopColor="#9f6018" stopOpacity=".04" /></linearGradient></defs>
    <g stroke="#ad86514d" strokeWidth=".7"><path d="M15 152H325M40 161H305M64 170H284M20 142H318M46 132H298" /><path d="M85 124 35 172M125 124 103 172M167 124V172M211 124 235 172M252 124 301 172" /></g>
    <g stroke="#efb25b" strokeWidth="1.7" strokeLinejoin="round" fill="url(#mh-metal)">
      <path d="M63 130h108c27 0 27 29 0 29H63c-24 0-24-29 0-29Z" /><path d="M66 137h101c15 0 15 15 0 15H66c-14 0-14-15 0-15Z" />
      <path d="M62 130v-26h37l13-42h45l9 67Z" /><path d="m119 70-11 34h44l-3-34Z" fill="#ecb56416" /><path d="M68 110h26v13H68zM99 126h71M128 73v29" />
      <path className="mh-boom" d="m164 109 40-79 18-5 40 67-10 6-41-52-32 70Z" /><path d="m260 86 19 42 29 4-12 19h-30l-6-22-13-35Z" />
      <path d="m181 91 21-39m20-5 25 38M86 131v-6h61v6" />
      {[66, 85, 104, 123, 142, 163].map(x => <circle key={x} cx={x} cy="144" r="4.5" />)}
      <circle cx="211" cy="38" r="4" /><circle cx="257" cy="92" r="4" />
    </g>
    <g stroke="#d49440" strokeWidth=".6" strokeDasharray="3 4" opacity=".5"><path d="M41 43v85M32 43h18M32 128h18M64 22h186M64 17v10M250 17v10" /></g>
    <circle className="mh-machine-pulse" cx="138" cy="113" r="3" fill="#ffd184" />
  </svg>;
}

function ScenePreview({ id }: { id: JourneyNode }) {
  switch (id) {
    case 'account': return <><div className="mh-identity"><Fingerprint size={42} strokeWidth={1} /><span>هويتك في محور</span></div><div className="mh-faux-field"><UserRound size={13} /> البريد الإلكتروني<span className="mh-field-line" /></div><div className="mh-faux-field"><LockKeyhole size={13} /> كلمة المرور<span className="mh-password-dots">••••••••</span></div><div className="mh-dual-role"><span>مستأجر</span><CircleDot size={20} /><span>مؤجر</span></div></>;
    case 'lessor': return <><div className="mh-profile"><div className="mh-avatar"><UsersRound size={28} /></div><div><strong>مالك المعدات</strong><small>ملف واحد لإدارة نشاطك</small></div><ShieldCheck size={21} /></div><div className="mh-review-steps">{['البيانات الأساسية', 'مراجعة الطلب', 'اعتماد المؤجر'].map((label, i) => <div key={label}><span>{i === 2 ? <BadgeCheck size={14} /> : <Check size={12} />}</span>{label}<i /></div>)}</div></>;
    case 'equipment': return <><div className="mh-search"><Search size={13} /><span>ابحث عن معدتك التالية</span><SlidersHorizontal size={13} /></div><Excavator /><div className="mh-equipment-meta"><span><MapPin size={12} /> الموقع</span><span><CalendarDays size={12} /> التوفر</span></div><div className="mh-price-options"><span>بالساعة <b>أو</b> باليوم</span><span>مع مشغّل / بدونه</span></div></>;
    case 'request': return <><div className="mh-paper-heading"><FileText size={27} /><span>احتياجك، كما تريده</span></div><div className="mh-spec-lines"><span>نوع المعدة<i /></span><span>موقع المشروع<i /></span><span>فترة الإيجار<i /></span></div><div className="mh-request-signal"><span /><span /><span /><UsersRound size={23} /><small>يصل للمؤجرين المناسبين</small></div></>;
    case 'offer': return <><div className="mh-offer-list">{[{ icon: Truck, text: 'المعدة المقترحة', sub: 'من معدات المؤجر' }, { icon: CalendarDays, text: 'التوفر وفترة الإيجار', sub: 'متوافقان مع احتياجك' }, { icon: SlidersHorizontal, text: 'السعر والشروط', sub: 'مقارنة قبل الاختيار' }].map(({ icon: Icon, text, sub }) => <div key={text}><Icon size={20} /><span>{text}<small>{sub}</small></span><ChevronLeft size={14} /></div>)}</div><div className="mh-preview-note">كل عرض مرتبط بمعدة محددة</div></>;
    case 'booking': return <><div className="mh-merge-top"><span><Truck size={16} /> اختيار معدة</span><span><FileText size={16} /> قبول عرض</span></div><svg className="mh-merge-lines" viewBox="0 0 300 60"><path d="M65 0v17Q65 32 90 32h45q15 0 15 20M235 0v17q0 15-25 15h-45q-15 0-15 20" fill="none" stroke="currentColor" /><circle cx="150" cy="54" r="4" fill="currentColor" /></svg><div className="mh-booking-card"><CalendarDays size={33} strokeWidth={1.3} /><strong>حجز واحد</strong><span>المعدة · المدة · السعر · الشروط</span></div></>;
    case 'payment': return <><div className="mh-payment-card"><CircleDot size={24} /><span>محور</span><ShieldCheck size={18} /><div className="mh-card-orbit" /><p>دفعتك مرتبطة بحجزك</p></div><div className="mh-payment-row"><span>تكلفة الإيجار</span><span className="mh-price-line" /></div><div className="mh-payment-row"><span>عمولة المنصة</span><span className="mh-price-line small" /></div><div className="mh-preview-note"><LockKeyhole size={11} /> يُوضَّح الإجمالي قبل التأكيد</div></>;
    case 'execution': return <><div className="mh-route-map"><svg viewBox="0 0 310 110"><g stroke="#8c784126" fill="none"><path d="M0 25H310M0 55H310M0 85H310M35 0V110M95 0V110M155 0V110M215 0V110M275 0V110" /></g><path d="M40 80h65V35h100v40h60" fill="none" stroke="#f3b458" strokeWidth="2" strokeDasharray="5 4" className="mh-route-trace" /><circle cx="40" cy="80" r="6" fill="#131717" stroke="#ffcc73" /><circle cx="265" cy="75" r="6" fill="#ffcc73" /></svg><Truck size={23} /></div><div className="mh-execution-steps"><span><Check size={13} /> التسليم</span><span><HardHat size={13} /> العمل</span><span><CheckCheck size={13} /> الإعادة</span></div><div className="mh-preview-note">رحلة التنفيذ بين المستأجر والمؤجر</div></>;
    case 'completion': return <><div className="mh-complete-seal"><div /><CheckCheck size={43} strokeWidth={1.4} /></div><strong className="mh-complete-title">من الاحتياج إلى الإنجاز</strong><div className="mh-stars">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={19} strokeWidth={1.1} />)}</div><div className="mh-preview-note">إتمام الإيجار، ثم تقييم التجربة</div></>;
  }
}

function Core({ expanded }: { expanded: boolean }) {
  return <div className={`mh-core ${expanded ? 'is-expanded' : ''}`} aria-hidden="true">
    <div className="mh-core-aura" /><div className="mh-core-orbit outer" /><div className="mh-core-orbit inner" />
    <svg className="mh-core-segments" viewBox="0 0 400 400"><circle cx="200" cy="200" r="176" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="120 157" /><circle cx="200" cy="200" r="190" fill="none" stroke="currentColor" strokeWidth=".8" strokeDasharray="2 14" /></svg>
    <div className="mh-sphere"><div className="mh-sphere-light" /><CircleDot className="mh-core-symbol" size={42} strokeWidth={1.3} /><strong>محور</strong><span>من الاحتياج إلى الإنجاز</span><div className="mh-core-coordinate">MAHWAR / CONNECTED</div></div>
    <span className="mh-orbit-dot one" /><span className="mh-orbit-dot two" />
  </div>;
}

export function MahwarShowcase() {
  const reduced = useReducedMotion();
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const [visible, setVisible] = useState(!document.hidden);
  const [muted, setMuted] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [screenError, setScreenError] = useState('');
  const [replay, setReplay] = useState(0);
  const [size, setSize] = useState({ width: 1200, height: 640 });
  const root = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const elapsed = useRef(0);
  const progress = useMotionValue(0);
  const chapterButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const active = showcaseScenes[scene];
  const ended = scene === showcaseScenes.length - 1 && !playing;
  const wide = size.width > 760;
  const overview = active.target === 'overview';
  const core = active.target === 'core';
  const position = core || overview ? { x: 0, y: 0 } : nodePosition(active.target as JourneyNode);
  const scale = overview ? Math.min(size.width * (wide ? .60 : .91) / 2450, size.height * (wide ? .9 : .49) / 2020)
    : core ? Math.min(size.width / 610, size.height * (wide ? .73 : .5) / 410, 1.2)
    : Math.min(size.width * (wide ? .50 : .84) / 366, size.height * (wide ? .73 : .46) / 296, 1.55);
  const anchorX = size.width * (core ? .5 : wide ? .32 : .5);
  const anchorY = size.height * (wide ? (core ? .42 : .50) : .29);

  const jump = (index: number) => {
    elapsed.current = 0; progress.set(0);
    setScene(Math.max(0, Math.min(index, showcaseScenes.length - 1)));
  };
  const restart = () => { jump(0); setReplay(value => value + 1); setPlaying(true); };
  const togglePlay = () => { if (ended) restart(); else setPlaying(value => !value); };
  const toggleSound = () => { const next = !muted; setMuted(next); soundEngine.setMuted(next); if (!next) soundEngine.playBranchesExpand(); };
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement === root.current) await document.exitFullscreen(); else await root.current?.requestFullscreen(); setScreenError(''); }
    catch { setScreenError('ملء الشاشة غير متاح هنا؛ يمكنك متابعة العرض داخل النافذة.'); }
  };

  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(viewport.current);
    const visibility = () => setVisible(!document.hidden);
    const full = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('visibilitychange', visibility); document.addEventListener('fullscreenchange', full);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('fullscreenchange', full); soundEngine.setMuted(true); };
  }, []);
  useEffect(() => { if (reduced) setPlaying(false); }, [reduced]);
  useEffect(() => {
    if (!playing || !visible) return;
    let frame: number, previous: number | undefined;
    const tick = (time: number) => {
      if (previous !== undefined) elapsed.current += Math.min(time - previous, 100);
      previous = time;
      progress.set(Math.min(elapsed.current / active.duration, 1));
      if (elapsed.current >= active.duration) {
        if (scene === showcaseScenes.length - 1) setPlaying(false);
        else { elapsed.current = 0; progress.set(0); setScene(current => current + 1); }
      } else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, playing, visible, active.duration, progress, replay]);
  useEffect(() => {
    chapterButtons.current[scene]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'instant' : 'smooth' });
    if (scene > 0) soundEngine.playBranchHover();
  }, [scene, reduced]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)) return;
      if (event.code === 'Space' && !(event.target as HTMLElement)?.closest('button,a')) { event.preventDefault(); togglePlay(); }
      if (event.code === 'ArrowLeft') { event.preventDefault(); jump(scene + 1); }
      if (event.code === 'ArrowRight') { event.preventDefault(); jump(scene - 1); }
      if (event.code === 'Escape' && !document.fullscreenElement) window.location.hash = '';
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [scene, playing, ended]);

  return <main ref={root} className={`mh-cinema ${playing && visible ? '' : 'is-paused'} ${core ? 'is-intro' : ''} ${overview ? 'is-overview' : ''} ${reduced ? 'is-reduced' : ''}`} dir="rtl" aria-label="العرض السينمائي لرؤية محور">
    <motion.div key={`curtain-${replay}`} className="mh-black-curtain" initial={{ opacity: reduced ? 0 : 1 }} animate={{ opacity: 0 }} transition={{ delay: .5, duration: 1.7 }} aria-hidden="true" />
    <header className="mh-cinema-header">
      <a href="#" className="mh-cinema-brand" aria-label="العودة إلى موقع محور"><CircleDot size={30} strokeWidth={1.6} /><strong>محور</strong><span>رؤية تتحرّك</span></a>
      <div className="mh-film-label"><span /> عرض تصوّري للمنصة <i>MAHWAR / VISION</i></div>
      <div className="mh-header-actions"><button onClick={toggleSound} aria-label={muted ? 'تفعيل صوت الانتقالات' : 'كتم الصوت'} aria-pressed={!muted}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><button className="mh-fullscreen" onClick={toggleFullscreen} aria-label={fullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'}>{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button><a href="#" aria-label="إغلاق العرض والعودة للموقع"><X size={19} /></a></div>
    </header>
    <div className="mh-stage" ref={viewport}>
      <div className="mh-stage-grid" aria-hidden="true" /><div className="mh-stage-grain" aria-hidden="true" /><div className="mh-stage-vignette" aria-hidden="true" />
      <div className="mh-corner-mark tl" aria-hidden="true" /><div className="mh-corner-mark br" aria-hidden="true" />
      <span className="mh-stage-coordinate" aria-hidden="true">{overview ? 'SYSTEM / OVERVIEW' : `FOCUS / ${active.target.toUpperCase()}`}</span>
      <motion.div className="mh-camera" initial={false} animate={{ x: anchorX - position.x * scale, y: anchorY - position.y * scale, scale }} transition={{ duration: reduced ? 0 : core ? 2.6 : 1.9, ease }}>
        <motion.div className="mh-world-rings" initial={false} animate={{ opacity: core ? 0 : 1, scale: core ? .2 : 1 }} transition={{ duration: reduced ? 0 : 2 }} aria-hidden="true"><div /><div /><div /></motion.div>
        <svg className="mh-connections" viewBox="-1400 -1100 2800 2200" aria-hidden="true">
          {journeyConnections.map(({ from, to, direct }) => {
            const a = nodePosition(from), b = nodePosition(to);
            const lit = !core && (overview || active.target === from || active.target === to);
            const path = `M ${a.x} ${a.y} Q ${(a.x + b.x) * .2} ${(a.y + b.y) * .2} ${b.x} ${b.y}`;
            return <g key={`${from}-${to}`} opacity={core ? 0 : lit ? 1 : .17}><path d={path} className={`mh-connection ${direct ? 'direct' : ''}`} /><path d={path} className="mh-connection-stream" /><circle cx={a.x} cy={a.y} r="6" /><circle cx={b.x} cy={b.y} r="6" /></g>;
          })}
        </svg>
        <motion.div className="mh-core-anchor" key={`core-${replay}`} initial={{ opacity: 0, scale: .25 }} animate={{ opacity: core || overview ? 1 : .25, scale: 1 }} transition={{ duration: reduced ? 0 : 2.5, delay: core && !reduced ? .8 : 0, ease }}><Core expanded={!core} /></motion.div>
        {journeyNodes.map((node, index) => {
          const p = nodePosition(node.id), Icon = icons[node.id];
          const selected = active.target === node.id;
          return <motion.button key={node.id} className={`mh-node ${selected ? 'is-selected' : ''}`} style={{ left: p.x, top: p.y }} initial={false} animate={{ opacity: core ? 0 : overview || selected ? 1 : .15, scale: core ? .2 : selected ? 1.04 : 1 }} transition={{ duration: reduced ? 0 : 1.3, delay: overview ? index * .035 : 0, ease }} onClick={() => jump(index + 2)} tabIndex={core || (!overview && !selected) ? -1 : 0} disabled={core} aria-label={`انتقل إلى مشهد ${node.label}`} aria-current={selected ? 'step' : undefined}>
            <span className="mh-node-port" /><div className="mh-node-header"><Icon size={17} /><strong>{node.label}</strong><span>{node.code}</span><i /></div><div className="mh-node-preview" aria-hidden="true"><ScenePreview id={node.id} /></div><div className="mh-node-footer"><span>محور / رحلة متصلة</span><span dir="ltr">{String(index + 1).padStart(2, '0')}</span></div>
          </motion.button>;
        })}
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.section className={`mh-scene-copy ${core ? 'mh-intro-copy' : ''}`} key={`${scene}-${replay}`} initial={{ opacity: 0, y: reduced ? 0 : 22, filter: reduced ? 'none' : 'blur(7px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: reduced ? 0 : -10, filter: reduced ? 'none' : 'blur(5px)' }} transition={{ duration: reduced ? 0 : .65, delay: core && !reduced ? 1.9 : .15 }}>
          <p className="mh-chapter"><span /> {active.chapter}</p>
          <h1>{active.title}<em>{active.accent}</em></h1>
          <p className="mh-scene-description">{active.description}</p>
          <div className="mh-scene-tags">{active.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          {!core && !overview && <p className="mh-capability-note"><span className={active.current ? 'current' : ''} />{active.current ? 'تسجيل الحساب والدخول متاحان في النسخة الحالية' : 'مشهد من الرؤية المستهدفة للمنتج'}</p>}
          {scene === showcaseScenes.length - 1 && <button className="mh-replay-cta" onClick={restart}><RotateCcw size={16} /> شاهد الرحلة مرة أخرى<ArrowLeft size={16} /></button>}
        </motion.section>
      </AnimatePresence>
      {screenError && <p role="status" className="mh-screen-error">{screenError}<button onClick={() => setScreenError('')} aria-label="إغلاق التنبيه"><X size={14} /></button></p>}
    </div>
    <footer className="mh-cinema-footer">
      <div className="mh-transport"><div className="mh-playback-controls"><button className="mh-play" onClick={togglePlay} aria-label={playing ? 'إيقاف العرض مؤقتًا' : ended ? 'إعادة تشغيل العرض' : 'استئناف العرض'}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><button onClick={() => jump(scene - 1)} disabled={scene === 0} aria-label="المشهد السابق"><ChevronRight size={20} /></button><button onClick={() => jump(scene + 1)} disabled={scene === showcaseScenes.length - 1} aria-label="المشهد التالي"><ChevronLeft size={20} /></button><button onClick={restart} aria-label="إعادة العرض من البداية"><RotateCcw size={17} /></button></div><div className="mh-now-playing"><span>{playing && visible ? 'الرحلة مستمرة' : ended ? 'اكتملت الجولة' : 'العرض متوقف'}</span><strong dir="ltr">{String(scene + 1).padStart(2, '0')} <small>/ {String(showcaseScenes.length).padStart(2, '0')}</small></strong></div><button className="mh-map-button" onClick={() => jump(1)}><Network size={16} /><span>الفكرة كاملة</span></button></div>
      <div className="mh-film-progress"><motion.div style={{ scaleX: progress }} /></div>
      <nav className="mh-chapters" aria-label="مشاهد العرض">{showcaseScenes.map((item, index) => <button key={index} ref={element => { chapterButtons.current[index] = element; }} onClick={() => jump(index)} aria-current={scene === index ? 'step' : undefined} aria-label={`مشهد ${index + 1}: ${item.chapter}`}><i className={index < scene ? 'passed' : ''} /><span>{index === 0 ? 'البداية' : index === 1 ? 'المنظومة' : index === showcaseScenes.length - 1 ? 'الرؤية' : journeyNodes[index - 2].label}</span></button>)}</nav>
      <p className="mh-concept-disclaimer">عرض تصوّري لرؤية محور — المشاهد لا تنشئ حسابًا أو طلبًا أو حجزًا أو دفعة فعلية.</p>
    </footer>
  </main>;
}
