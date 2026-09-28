import {useState} from'react';
import{Activity,Clock3,Crosshair,MapPinned,Radio,ShieldCheck}from'lucide-react';
import'./live-map.css';
type Kind='demand'|'supply'|'operation';
type Node={id:string;kind:Kind;x:number;y:number;city:string;title:string;meta:string};
const N:Node[]=[
{id:'REQ-8F21',kind:'demand',x:48,y:47,city:'الرياض',title:'طلب معدة',meta:'حفار جنزير · 3 أيام · بدون مشغل'},
{id:'EQ-104',kind:'supply',x:38,y:38,city:'الرياض',title:'معدة متاحة',meta:'مطابقة مبدئية لنوع المعدة'},
{id:'EQ-217',kind:'supply',x:59,y:37,city:'الرياض',title:'معدة متاحة',meta:'مطابقة مبدئية للموقع'},
{id:'EQ-331',kind:'supply',x:57,y:59,city:'الخرج',title:'معدة متاحة',meta:'ضمن نطاق المحاكاة'},
{id:'OP-19',kind:'operation',x:27,y:68,city:'جدة',title:'عملية',meta:'مثال بصري لمسار التنفيذ'},
{id:'REQ-2A10',kind:'demand',x:72,y:67,city:'الدمام',title:'طلب احتياج',meta:'مثال محاكاة غير تشغيلي'}];
const L:Record<Kind,string>={demand:'الطلب',supply:'المعروض',operation:'التنفيذ'};
export function LiveMap(){
const[mode,setMode]=useState<'pulse'|'operations'>('pulse'),[focus,setFocus]=useState<'all'|Kind>('all'),[active,setActive]=useState<Node>(N[0]),[time,setTime]=useState(68);
const visible=N.filter(n=>focus==='all'||n.kind===focus),main=N[0],matches=N.slice(1,4);
return <section className="lm" aria-label="محاكاة خريطة محور الحية">
<header className="lm-head"><div><p className="lm-k"><Radio size={14}/> MIHWAR / LIVE MAP</p><h1>السوق وهو <em>يتنفس.</em></h1><p>طبقة بصرية تربط الطلب بالمعدة ثم بالمعاملة. البيانات الظاهرة محاكاة تصميمية وليست عمليات حقيقية.</p></div><div className="lm-mode"><button className={mode==='pulse'?'on':''} onClick={()=>setMode('pulse')}>MARKET PULSE</button><button className={mode==='operations'?'on':''} onClick={()=>setMode('operations')}>OPERATION MODE</button></div></header>
<div className="lm-stage"><aside><div className="lm-signal"><Activity size={15}/> SIGNAL</div>{(['all','demand','supply','operation']as const).map(k=><button key={k} className={focus===k?'on':''} onClick={()=>setFocus(k)}><i className={'dot '+k}/>{k==='all'?'الكل':L[k]}</button>)}<div className="lm-safe"><ShieldCheck size={15}/><span>SIMULATION<small>لا بيانات تشغيلية مصطنعة</small></span></div></aside>
<div className="lm-map"><div className="lm-grid"/><div className="lm-land"><span>SAUDI ARABIA</span></div>
<svg viewBox="0 0 100 100" preserveAspectRatio="none">{matches.map((n,i)=><line key={n.id} x1={main.x} y1={main.y} x2={n.x} y2={n.y} className={mode==='pulse'?'hot':''} style={{animationDelay:i*.18+'s'}}/>)}</svg>
{visible.map(n=><button key={n.id} className={'lm-node '+n.kind+(active.id===n.id?' selected':'')} style={{left:n.x+'%',top:n.y+'%'}} onClick={()=>setActive(n)}><b/><i/><span><strong>{n.id}</strong><small>{n.city}</small></span></button>)}
<div className="lm-caption"><Crosshair size={15}/>{mode==='pulse'?'DEMAND → MATCH → EQUIPMENT':'REQUEST → BOOKING → EXECUTION'}</div>
<article className="lm-dna"><p>TRANSACTION DNA</p><h2>{active.id}</h2><div><MapPinned size={14}/>{active.city}</div><h3>{active.title}</h3><p>{active.meta}</p><ol>{['REQUEST','MATCH','EQUIPMENT','BOOKING','EXECUTION'].map((x,i)=><li key={x}><span>{x}</span><b>0{i+1}</b></li>)}</ol><small>ما بعد EQUIPMENT رؤية مستهدفة للمنتج، وليس حالة تشغيل مكتملة.</small></article>
</div></div>
<footer className="lm-time"><div><Clock3 size={14}/> MIHWAR TIME MACHINE</div><input type="range" min="0" max="100" value={time} onChange={e=>setTime(+e.target.value)}/><b>{String(Math.floor(8+time*.15)).padStart(2,'0')}:{String((time*7)%60).padStart(2,'0')}</b><span>SIMULATION / DESIGN PROTOTYPE</span></footer>
</section>}