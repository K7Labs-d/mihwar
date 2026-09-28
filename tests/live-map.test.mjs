import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_REQUEST, getCandidates, sceneAt, SIMULATION_NODES, TIMING, visibleConnections, visibleNodes, position } from '../src/components/live/liveMapSimulation.ts';

test('live map: deterministic fixtures have unique IDs and in-bounds schematic positions', () => {
  assert.equal(new Set(SIMULATION_NODES.map(node => node.id)).size, SIMULATION_NODES.length);
  for (const node of SIMULATION_NODES) for (const compact of [true, false]) {
    const p = position(node, compact);
    assert.ok(p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100);
  }
});
test('live map: request, search, reveal, connection, then DNA', () => {
  for (const [time, phase] of [[0,'request'],[649,'request'],[650,'search'],[1849,'search'],[1850,'candidates'],[3749,'candidates'],[3750,'connections'],[5599,'connections'],[5600,'ready']]) {
    assert.equal(sceneAt(time).phase, phase, `time=${time}`);
  }
});
test('live map: candidates are revealed one by one, never all on mount', () => {
  for (const [time, count] of [[0,0],[1849,0],[1850,1],[2549,1],[2550,2],[3249,2],[3250,3]]) {
    assert.equal(sceneAt(time).revealedIds.length, count, `time=${time}`);
  }
});
test('live map: all candidates precede lines; all lines precede DNA', () => {
  assert.ok(sceneAt(3749).connections.every(link => link.progress === 0));
  assert.ok(sceneAt(4000).connections[0].progress > 0);
  assert.equal(sceneAt(4000).connections[1].progress, 0);
  assert.ok(sceneAt(TIMING.ready).connections.every(link => link.progress === 1));
  assert.equal(sceneAt(5599).ready, false);
  assert.equal(sceneAt(5600).ready, true);
});
test('live map: timeline rewind restores earlier state without stale candidates or links', () => {
  const before = sceneAt(900);
  sceneAt(TIMING.duration);
  assert.deepEqual(sceneAt(900), before);
  assert.equal(sceneAt(900).revealedIds.length, 0);
  assert.equal(sceneAt(900).ready, false);
});
test('live map: filtering never leaves dangling connection lines', () => {
  const scene = sceneAt(TIMING.duration);
  assert.equal(visibleConnections(scene, visibleNodes(scene, 'pulse', 'all')).length, 3);
  for (const filter of ['demand', 'supply', 'unmatched', 'operation']) {
    assert.equal(visibleConnections(scene, visibleNodes(scene, 'operations', filter)).length, 0);
  }
});
test('live map: operation signals are not mislabeled as equipment requests', () => {
  assert.equal(visibleNodes(sceneAt(0), 'operations', 'operation').length, 0);
  assert.equal(visibleNodes(sceneAt(TIMING.duration), 'pulse', 'all').some(node => node.kind === 'operation'), false);
  const [operation] = visibleNodes(sceneAt(TIMING.duration), 'operations', 'operation');
  assert.equal(operation.booking, 'SIM-BK-19');
});
test('live map: unavailable or wrong-type equipment cannot become candidates', () => {
  assert.deepEqual(getCandidates(DEFAULT_REQUEST).map(node => node.id), ['EQ-104','EQ-217','EQ-331']);
  assert.deepEqual(getCandidates('REQ-2A10'), []);
  assert.equal(sceneAt(TIMING.duration, 'REQ-2A10').connections.length, 0);
  assert.deepEqual(visibleNodes(sceneAt(TIMING.duration), 'operations', 'unmatched').map(node => node.id), ['REQ-2A10']);
});
test('live map: bad times and unknown request IDs are normalized safely', () => {
  assert.equal(sceneAt(-10).elapsed, 0);
  assert.equal(sceneAt(Number.NaN).elapsed, 0);
  assert.equal(sceneAt(999999).elapsed, TIMING.duration);
  assert.equal(sceneAt(0, 'missing').request.id, DEFAULT_REQUEST);
});
test('live map: SVG sizing is scoped to the map layers, not every nested icon', async () => {
  const css = await readFile(new URL('../src/components/live/live-map.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.lm-map\s+svg\s*\{/);
  assert.match(css, /\.lm-geography,\s*\.lm-network\s*\{/);
  assert.match(css, /\.lm\s+\.lm-icon\s*\{[^}]*position:static/);
});
