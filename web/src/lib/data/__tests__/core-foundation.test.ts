import { beforeAll, expect, it } from 'vitest';
import { assessProject } from '../../provenance/applicability';
import { initSolver } from '../../engine/wasm-solver';
import { modelStore, uiStore } from '../../store';
import { PRO_EXAMPLES } from '../pro-examples';
import fixture from '../../templates/fixtures/pro-edificio-7p.json';

beforeAll(async () => { await initSolver(); });

it.each(['fixture', 'gallery'] as const)('known wrong result: #1928 the seven-storey core stands on its foundation through the %s loader', async source => {
  uiStore.analysisMode = 'pro';
  if (source === 'fixture') await modelStore.loadExample('pro-edificio-7p');
  else {
    const examples = PRO_EXAMPLES.some(e => e.id === 'pro-edificio-7p')
      ? PRO_EXAMPLES : (await import('../pro-examples')).publishedBuildingExamples;
    await examples.find(e => e.id === 'pro-edificio-7p')!.load();
  }
  const nodes = new Map(fixture.nodes.map(n => [n.id, n]));
  const base = Math.min(...fixture.supports.map(s => nodes.get(s.nodeId)!.z));
  const held = new Map([...modelStore.supports.values()].map(s => [s.nodeId, s.type]));
  const wallFeet = fixture.quads.filter(q => new Set(q.nodes.map(id => nodes.get(id)!.z)).size > 1)
    .flatMap(q => q.nodes.filter(id => nodes.get(id)!.z === base));
  expect(new Set(wallFeet)).toEqual(new Set([1, 118, 119, 120]));
  for (const id of wallFeet) expect(held.get(id), String(id)).toBe('fixed3d');
  expect([...held.keys()].some(id => nodes.get(id) && nodes.get(id)!.z > base)).toBe(false);
});

it('rechecks saved seven-storey models with the original core connectivity and a missing base support', async () => {
  await modelStore.loadExample('pro-edificio-7p');
  const snapshot = modelStore.snapshot();
  const affected = (s: typeof snapshot) => assessProject(s, undefined, 'pro').changes.some(c => c.id === 'example-core-foundation');
  expect(affected(snapshot)).toBe(false);
  const missing = { ...snapshot, supports: snapshot.supports.filter(([, s]) => s.nodeId !== 118) };
  expect(affected(missing)).toBe(true);
  expect(affected({ ...missing, quads: [] })).toBe(false);
});
