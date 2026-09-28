import { memo, useId } from 'react';
import { position, progressAt, TIMING, visibleConnections, type Scene, type SimulationNode } from './liveMapSimulation';

const CityField = memo(function CityField() {
  const id = useId().replace(/:/g, '');
  return <svg className="lm-geography" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <pattern id={id} width="78" height="62" patternUnits="userSpaceOnUse">
        <path d="M7 7H66V51H7Z M14 14H58V44H14Z" fill="none" stroke="currentColor" strokeWidth=".8" />
        <path d="M38 14V44 M14 29H58" fill="none" stroke="currentColor" strokeWidth=".5" />
      </pattern>
    </defs>
    <g transform="translate(500 330) rotate(-19) translate(-500 -330)">
      <rect x="-300" y="-300" width="1600" height="1300" fill={`url(#${id})`} />
      <path className="lm-avenue-bed" d="M-80 188H1090 M-80 436H1090 M270 -200V1000 M738 -200V1000" />
      <path className="lm-avenue-line" d="M-80 188H1090 M-80 436H1090 M270 -200V1000 M738 -200V1000" />
      <rect className="lm-ring-road" x="86" y="64" width="830" height="508" rx="108" />
    </g>
    <path className="lm-terrain" d="M-40 590Q200 620 285 485T420 370 M-40 625Q185 650 300 500T445 370 M-40 656Q220 684 324 510T470 380" />
    <text x="445" y="325" className="lm-city-name">الرياض</text>
    <text x="385" y="352" className="lm-city-caption">RIYADH · ILLUSTRATIVE FIELD</text>
  </svg>;
});
interface Props {
  scene: Scene; nodes: readonly SimulationNode[]; selected: string;
  width: number; height: number; onSelect: (node: SimulationNode) => void;
}
export function MapScene({ scene, nodes, selected, width, height, onSelect }: Props) {
  const compact = width < 900;
  const point = (node: SimulationNode) => {
    const p = position(node, compact); return { x: p.x * width / 100, y: p.y * height / 100 };
  };
  const origin = point(scene.request);
  const radius = Math.max(Math.min(width, height) * .3, ...scene.candidates.map(node => {
    const p = point(node); return Math.hypot(p.x - origin.x, p.y - origin.y) + 18;
  }));
  const requestVisible = nodes.some(node => node.id === scene.request.id);
  const pulse = progressAt(scene.elapsed, 0, TIMING.search);
  return <>
    <CityField />
    <div className="lm-map-vignette" aria-hidden="true" />
    <svg className="lm-network" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      {requestVisible && <g>
        {scene.elapsed < TIMING.search && <circle className="lm-request-wave" cx={origin.x} cy={origin.y} r={8 + pulse * 38} opacity={1 - pulse} />}
        {scene.elapsed >= TIMING.search && <g opacity={scene.ready ? .18 : .8}>
          <circle className="lm-search-fill" cx={origin.x} cy={origin.y} r={radius * scene.searchProgress} />
          <circle className="lm-search-edge" cx={origin.x} cy={origin.y} r={radius * scene.searchProgress} />
          <circle className="lm-search-inner" cx={origin.x} cy={origin.y} r={radius * scene.searchProgress * .58} />
        </g>}
      </g>}
      {visibleConnections(scene, nodes).map(({ node, progress }) => {
        const end = point(node), cx = (origin.x + end.x) / 2, cy = (origin.y + end.y) / 2 - 26;
        const d = `M${origin.x} ${origin.y}Q${cx} ${cy} ${end.x} ${end.y}`;
        const t = progress, bx = (1-t)**2*origin.x + 2*(1-t)*t*cx + t*t*end.x;
        const by = (1-t)**2*origin.y + 2*(1-t)*t*cy + t*t*end.y;
        const dim = selected.startsWith('EQ-') && selected !== node.id;
        return <g key={node.id} opacity={dim ? .2 : 1} data-connection={node.id}>
          <path className="lm-connection" d={d} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - progress} />
          {progress < 1 && <circle className="lm-travel-dot" cx={bx} cy={by} r="2.5" />}
        </g>;
      })}
    </svg>
    <div className="lm-nodes" aria-label="إشارات الخريطة التجريبية">
      {nodes.map(node => {
        const p = position(node, compact);
        const matched = scene.revealedIds.includes(node.id);
        const dim = node.kind === 'supply' && !matched;
        return <button key={node.id} type="button" data-node={node.id}
          className={`lm-node lm-node--${node.kind}${matched ? ' lm-node--matched' : ''}${dim ? ' lm-node--muted' : ''}`}
          style={{ left: `${p.x}%`, top: `${p.y}%` }} aria-pressed={selected === node.id}
          aria-label={`${node.title}، ${node.area}، ${node.id}، محاكاة`} onClick={() => onSelect(node)}>
          <span className="lm-node-visual" aria-hidden="true"><i className="lm-node-halo" /><i className="lm-node-core" /></span>
          <span className={`lm-node-label${node.kind === 'demand' ? ' lm-node-label--request' : ''}`}>
            <b dir="ltr">{node.id}</b><small>{node.kind === 'demand' ? 'احتياج' : node.kind === 'operation' ? 'تنفيذ تجريبي' : matched ? 'معدة مطابقة' : 'معدة'}</small>
          </span>
        </button>;
      })}
    </div>
  </>;
}
