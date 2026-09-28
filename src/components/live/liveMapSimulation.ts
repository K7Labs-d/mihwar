// Isolated, deterministic presentation fixtures. Never used by production APIs.
export type SignalKind = 'demand' | 'supply' | 'operation';
export type SignalFilter = 'all' | SignalKind | 'unmatched';
export type MapMode = 'pulse' | 'operations';
export type Phase = 'request' | 'search' | 'candidates' | 'connections' | 'ready';
export interface SimulationNode {
  id: string; kind: SignalKind; x: number; y: number;
  title: string; area: string; detail: string;
  category?: string; available?: boolean; booking?: string;
}
export const DEFAULT_REQUEST = 'REQ-8F21';
export const SIMULATION_NODES: readonly SimulationNode[] = [
  { id: DEFAULT_REQUEST, kind: 'demand', x: 48, y: 37, title: 'احتياج لحفار جنزير', area: 'الرياض', detail: '٣ أيام · بدون مشغّل', category: 'excavator' },
  { id: 'EQ-104', kind: 'supply', x: 24, y: 25, title: 'حفار جنزير', area: 'شمال الرياض', detail: 'مطابق للنوع · متاح في المحاكاة', category: 'excavator', available: true },
  { id: 'EQ-217', kind: 'supply', x: 73, y: 21, title: 'حفار جنزير', area: 'شرق الرياض', detail: 'مطابق للنوع · متاح في المحاكاة', category: 'excavator', available: true },
  { id: 'EQ-331', kind: 'supply', x: 76, y: 51, title: 'حفار جنزير', area: 'جنوب الرياض', detail: 'مطابق للنوع · متاح في المحاكاة', category: 'excavator', available: true },
  { id: 'EQ-402', kind: 'supply', x: 14, y: 43, title: 'رافعة شوكية', area: 'غرب الرياض', detail: 'نوع مختلف عن الاحتياج المحدد', category: 'forklift', available: true },
  { id: 'EQ-590', kind: 'supply', x: 85, y: 36, title: 'رافعة متنقلة', area: 'شرق الرياض', detail: 'غير متاحة في هذا السيناريو', category: 'crane', available: false },
  { id: 'REQ-2A10', kind: 'demand', x: 32, y: 60, title: 'احتياج لرافعة متنقلة', area: 'الرياض', detail: 'مثال لطلب لم يجد معدة متاحة', category: 'crane' },
  { id: 'OP-19', kind: 'operation', x: 66, y: 64, title: 'تنفيذ تجريبي', area: 'الرياض', detail: 'عرض بصري لمسار التنفيذ، لا عملية حقيقية', booking: 'SIM-BK-19' },
];
export const TIMING = {
  search: 650, reveal: [1850, 2550, 3250], connect: [3750, 4150, 4550],
  lineDuration: 650, ready: 5600, duration: 6000,
} as const;
export const PHASE_LABELS: Record<Phase, { title: string; caption: string }> = {
  request: { title: 'نبضة الاحتياج', caption: 'كل اتصال يبدأ بحاجة.' },
  search: { title: 'يتّسع نطاق البحث', caption: 'محور يصل الاحتياج بالمعدات المناسبة.' },
  candidates: { title: 'تتكشّف المعدات', caption: 'النوع والتوفر يحددان المرشحين في المحاكاة.' },
  connections: { title: 'تتكوّن المطابقة', caption: 'من نقاط متفرقة، إلى علاقة واضحة.' },
  ready: { title: 'اتصل الاحتياج بالمعدة', caption: 'هذه هي طبقة الربط التي يبنيها محور.' },
};
export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
export const progressAt = (time: number, start: number, duration: number) => clamp((time - start) / duration);
export const getNode = (id: string) => SIMULATION_NODES.find(node => node.id === id);
export function getRequest(id: string): SimulationNode {
  const node = getNode(id);
  return node?.kind === 'demand' ? node : getNode(DEFAULT_REQUEST)!;
}
export function getCandidates(requestId: string): readonly SimulationNode[] {
  const request = getRequest(requestId);
  return SIMULATION_NODES.filter(node => node.kind === 'supply' && node.available && node.category === request.category);
}
export function sceneAt(time: number, requestId = DEFAULT_REQUEST) {
  const elapsed = clamp(time, 0, TIMING.duration);
  const request = getRequest(requestId);
  const candidates = getCandidates(request.id);
  const phase: Phase = elapsed >= TIMING.ready ? 'ready' : elapsed >= TIMING.connect[0] ? 'connections'
    : elapsed >= TIMING.reveal[0] ? 'candidates' : elapsed >= TIMING.search ? 'search' : 'request';
  return {
    elapsed, request, candidates, phase, ready: elapsed >= TIMING.ready,
    searchProgress: progressAt(elapsed, TIMING.search, TIMING.reveal[2] - TIMING.search),
    revealedIds: candidates.filter((_, index) => elapsed >= TIMING.reveal[index]).map(node => node.id),
    connections: candidates.map((node, index) => ({ node, progress: progressAt(elapsed, TIMING.connect[index], TIMING.lineDuration) })),
  };
}
export type Scene = ReturnType<typeof sceneAt>;
export function visibleNodes(scene: Scene, mode: MapMode, filter: SignalFilter): readonly SimulationNode[] {
  return SIMULATION_NODES.filter(node => {
    if (filter === 'unmatched') return node.kind === 'demand' && getCandidates(node.id).length === 0;
    if (filter !== 'all' && node.kind !== filter) return false;
    if (node.kind === 'operation') return mode === 'operations' && scene.ready;
    if (node.kind === 'demand') return true;
    if (scene.candidates.some(candidate => candidate.id === node.id)) return scene.revealedIds.includes(node.id);
    return scene.elapsed >= TIMING.search;
  });
}
export function visibleConnections(scene: Scene, nodes: readonly SimulationNode[]) {
  const ids = new Set(nodes.map(node => node.id));
  return scene.connections.filter(link => link.progress > 0 && ids.has(scene.request.id) && ids.has(link.node.id));
}
export function position(node: SimulationNode, compact: boolean) {
  // Normalized schematic positions, NOT GPS coordinates or distance measurements.
  return { x: compact ? node.x : node.x * 0.73 + 3, y: compact ? node.y * 0.54 + 12.2 : node.y };
}
export const FILTERS: readonly { id: SignalFilter; label: string }[] = [
  { id: 'all', label: 'الكل' }, { id: 'demand', label: 'الطلب' },
  { id: 'supply', label: 'المعدات' }, { id: 'unmatched', label: 'غير مطابق' },
  { id: 'operation', label: 'التنفيذ' },
];
