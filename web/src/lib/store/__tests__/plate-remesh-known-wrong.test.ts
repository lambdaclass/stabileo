import { beforeEach, expect, it } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { createArc } from '../curved-members';
import { applyPlateMeshes, createPlate, planPlateMesh, plateEntry, plateStatus } from '../physical-plates';

beforeEach(() => {
  modelStore.clear();
  historyStore.clear();
  uiStore.analysisMode = 'pro';
});

it.skip('known wrong result: #2365 — remeshing a plate respects its specified sweep when a member follows the complementary arc', () => {
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(4, 0, 0);
  const mid = modelStore.addNode(2, -2, 0);
  const c = modelStore.addNode(4, 5, 0);
  const d = modelStore.addNode(0, 5, 0);
  expect(createArc(a, { x: 2, y: 2, z: 0 }, b, 4)).toHaveLength(4);
  const plate = createPlate({ outline: [a, mid, b, c, d], arcMids: [1], followArcs: false, materialId: 1, thickness: 0.2 });
  if (!('id' in plate)) throw new Error(JSON.stringify(plate));
  const plan = planPlateMesh(plate.id, { size: 1, element: 'tri', followMembers: false })!;
  const result = applyPlateMeshes([plan]);
  expect(result.refused).toEqual([]);
  expect(result.plates).toBe(1);
  expect(plateStatus(plate.id)).toBe('current');
  const nodes = (plateEntry(plate.id)!.group.members.plates ?? []).flatMap(id => modelStore.plates.get(id)!.nodes);
  expect(nodes.length).toBeGreaterThan(0);
  expect(Math.min(...nodes.map(id => modelStore.nodes.get(id)!.y))).toBeLessThan(0);
});

it.skip.each(['offset', 'curvature'] as const)('known wrong result: #2365 — remeshing preserves or explicitly refuses a partial %s edit', field => {
  const outline = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const plate = createPlate({ outline, materialId: 1, thickness: 0.2 });
  if (!('id' in plate)) throw new Error(JSON.stringify(plate));
  const remesh = () => applyPlateMeshes([planPlateMesh(plate.id, { size: 2, element: 'quad', followMembers: false })!]);
  expect(remesh().refused).toEqual([]);
  const quads = () => plateEntry(plate.id)!.group.members.quads!.map(id => modelStore.quads.get(id)!);
  const original = quads();
  expect(original).toHaveLength(4);
  const offset = { frame: 'local' as const, x: 0, y: 0, z: 0.1 };
  if (field === 'offset') modelStore.setShellOffset('quad', original[0]!.id, offset);
  else modelStore.setQuadCurved(original[0]!.id, true);
  const edited = () => quads().filter(quad => field === 'offset' ? quad.offset?.z === offset.z : quad.curved === true);
  expect(edited()).toHaveLength(1);
  const footprint = (id: number) => modelStore.quads.get(id)!.nodes.map(node => {
    const p = modelStore.nodes.get(node)!;
    return [p.x, p.y, p.z].join(',');
  }).sort();
  const changed = footprint(edited()[0]!.id);
  const result = remesh();
  if (result.refused.length) expect(result.refused.map(({ id }) => id)).toContain(plate.id);
  else expect(result.plates).toBe(1);
  expect(edited()).toHaveLength(1);
  expect(footprint(edited()[0]!.id)).toEqual(changed);
});
