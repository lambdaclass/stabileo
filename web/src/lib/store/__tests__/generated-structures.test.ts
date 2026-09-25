/**
 * A generated structure placed into a model is a group that can be regenerated in place: its
 * members keep their ids (and so their loads and edits), a resized member keeps its size, and
 * the whole regeneration is one undo step.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { generateStructure, DEFAULT_STRUCTURE_PARAMS } from '../../engine/generators/structures';
import { emitModel, defaultProfileSpec, type EmitOptions } from '../../engine/generators/emit';
import { insertGenerated, regenerate, generatedData } from '../generated-structures';
import { compose, rotation, translation } from '../../model/edit/affine';

const PROFILES: EmitOptions['profiles'] = {
  chord: defaultProfileSpec('IPE 160'), post: defaultProfileSpec('L 50x50x5'), diagonal: defaultProfileSpec('L 50x50x5'),
  rafter: defaultProfileSpec('IPE 200'), column: defaultProfileSpec('HEB 200'), beam: defaultProfileSpec('IPE 240'),
  purlin: defaultProfileSpec('UPN 100'), bracing: defaultProfileSpec('L 50x50x5'),
};

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

function frame(baysX: string, profiles = PROFILES) {
  const t = generateStructure('planeFrame', { ...DEFAULT_STRUCTURE_PARAMS.planeFrame, baysX, storeys: '3' })!;
  return { g: emitModel(t, { name: 'Pórtico', profiles }), roles: t.members.map((m) => m.role) };
}
const ins = (baysX: string, T: Parameters<typeof insertGenerated>[1]) => { const f = frame(baysX); return insertGenerated(f.g, T, meta(baysX), f.roles); };
const regen = (id: number, baysX: string) => { const f = frame(baysX); return regenerate(id, f.g, meta(baysX), f.roles); };
const meta = (baysX: string) => ({ generator: 'planeFrame', params: { baysX }, profiles: {}, gradeId: null, name: `Pórtico ${baysX}` });

describe('generated structures', () => {
  it('places at a point, rotated, and records what it became', () => {
    const T = compose(translation([10, 5, 0]), rotation([0, 0, 0], [0, 0, 1], 90));
    const r = ins('6; 6', T);
    expect(r.nodes).toHaveLength(6);
    const d = generatedData(r.groupId)!;
    expect(d.nodes.every((n) => n.owned)).toBe(true);
    // The span along +X became +Y at x = 10.
    const xs = d.nodes.map((n) => modelStore.nodes.get(n.id)!).map((n) => [Math.round(n.x * 1e6) / 1e6, Math.round(n.y * 1e6) / 1e6]);
    expect(new Set(xs.map((p) => p[0]))).toEqual(new Set([10]));
    expect(new Set(xs.map((p) => p[1]))).toEqual(new Set([5, 11, 17]));
    expect(modelStore.supports.size).toBe(3);
  });

  it('regenerates in place keeping member ids, loads and a resized member', () => {
    const r = ins('6; 6', translation([0, 0, 0]));
    const d0 = generatedData(r.groupId)!;
    const beam = d0.elements.map((e) => e!.id).find((id) => { const e = modelStore.elements.get(id)!; return modelStore.nodes.get(e.nodeI)!.z === 3 && modelStore.nodes.get(e.nodeJ)!.z === 3; })!;
    modelStore.addDistributedLoad3D(beam, 0, 0, -10, -10, undefined, undefined, 1);
    // The user resizes one column.
    const col = d0.elements.find((e) => e!.role === 'column')!.id;
    const other = modelStore.addSection({ name: 'Mano', a: 0.01, iz: 1e-5 } as never);
    modelStore.updateElement(col, { sectionId: other });
    const nodes0 = modelStore.nodes.size, undo0 = historyStore.undoCount;

    const rr = regen(r.groupId, '7; 7; 7')!;
    expect(historyStore.undoCount).toBe(undo0 + 1);
    expect(rr.added).toBeGreaterThan(0);
    expect(modelStore.elements.has(beam)).toBe(true);
    expect(modelStore.loads.some((l) => (l.data as { elementId?: number }).elementId === beam)).toBe(true);
    expect(modelStore.elements.get(col)!.sectionId).toBe(other);
    // Still a column: vertical.
    const c = modelStore.elements.get(col)!;
    expect(modelStore.nodes.get(c.nodeI)!.x).toBe(modelStore.nodes.get(c.nodeJ)!.x);
    expect(rr.keptSections).toBe(1);
    // Four columns, three beams, all at the new bays.
    expect(modelStore.elements.size).toBe(7);
    expect(Math.max(...[...modelStore.nodes.values()].map((n) => n.x))).toBe(21);
    expect(modelStore.supports.size).toBe(4);
    // No section was duplicated by regenerating with the same profiles.
    const names = [...modelStore.sections.values()].map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);

    historyStore.undo();
    expect(modelStore.nodes.size).toBe(nodes0);
    expect(modelStore.elements.size).toBe(5);
  });

  it('regenerating to fewer bays removes what is no longer there', () => {
    const r = ins('6; 6; 6', translation([0, 0, 0]));
    const rr = regen(r.groupId, '6')!;
    // 4 columns and 3 beams become 2 and 1.
    expect(rr.removed).toBe(4);
    expect(modelStore.elements.size).toBe(3);
    expect(modelStore.nodes.size).toBe(4);
    expect(modelStore.supports.size).toBe(2);
  });
});
