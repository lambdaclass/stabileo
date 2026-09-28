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
import { compose, rotation, translation, applyPoint } from '../../model/edit/affine';
import { copyTransformed, insertFragment } from '../../model/edit/transformed-copy';
import { transformInPlace } from '../../model/edit/transform-in-place';
import { detach, fragmentOf } from '../../model/edit/fragment';

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
  const selection = (id: number) => {
    const d = generatedData(id)!;
    return { nodes: d.nodes.map((n) => n.id), elements: d.elements.flatMap((e) => e ? [e.id] : []) };
  };
  const positions = (id: number) => generatedData(id)!.nodes.map((n) => {
    const p = modelStore.nodes.get(n.id)!; return [p.x, p.y, p.z ?? 0];
  });

  it('regenerates a rotated copy independently of its original, including undo', () => {
    const original = ins('6', translation([10, 0, 0]));
    const before = positions(original.groupId);
    const T = compose(translation([30, 0, 0]), rotation([0, 0, 0], [0, 0, 1], 90));
    const copy = copyTransformed(selection(original.groupId), [T], { withGroups: true });
    const id = copy.groups[0]!;
    const placed = positions(id);
    expect(placed).toEqual(before.map((p) => applyPoint(T, p as [number, number, number])));
    expect(copy.warnings.groupDataVerbatim).toBeUndefined();
    const undo = historyStore.undoCount;
    regen(id, '8');
    expect(positions(original.groupId)).toEqual(before);
    expect(Math.max(...positions(id).map((p) => p[1]!))).toBeCloseTo(18);
    expect(historyStore.undoCount).toBe(undo + 1);
    historyStore.undo();
    expect(positions(id)).toEqual(placed);
  });

  it('keeps the composed placement when a moved structure regenerates', () => {
    const r = ins('6', translation([5, 2, 0]));
    transformInPlace(selection(r.groupId), rotation([0, 0, 0], [0, 0, 1], 90));
    transformInPlace(selection(r.groupId), translation([20, 0, 0]));
    const moved = positions(r.groupId);
    regen(r.groupId, '6');
    expect(positions(r.groupId)).toEqual(moved);
    regen(r.groupId, '8');
    expect(Math.min(...positions(r.groupId).map((p) => p[0]!))).toBeCloseTo(18);
    expect(Math.max(...positions(r.groupId).map((p) => p[1]!))).toBeCloseTo(13);
  });

  it.each(['copy', 'move'] as const)('%s onto a host node relinquishes ownership and leaves the host in place on regeneration', (mode) => {
    const r = ins('6', translation([0, 0, 0]));
    const host = modelStore.addNode(26, 0, 0);
    const T = translation([20, 0, 0]);
    let id = r.groupId;
    if (mode === 'copy') id = copyTransformed(selection(id), [T]).groups[0]!;
    else transformInPlace(selection(id), T);
    const data = generatedData(id)!;
    expect(data.nodes.find((n) => n.id === host)?.owned).toBe(false);
    expect(modelStore.model.groups.get(id)!.members.nodes).not.toContain(host);
    expect(data.nodes.every((n) => modelStore.nodes.has(n.id))).toBe(true);
    regen(id, '8');
    expect(modelStore.nodes.get(host)).toMatchObject({ x: 26, y: 0 });
    expect(Math.max(...positions(id).map((p) => p[0]!))).toBe(28);
  });

  it('pastes generated section references into a different project and preserves manual resizing', () => {
    const r = ins('6', translation([0, 0, 0]));
    const first = generatedData(r.groupId)!.elements.find((e) => e)!;
    const resized = modelStore.addSection({ name: 'Custom', a: 0.02, iz: 0.0002 } as never);
    modelStore.updateElementSection(first.id, resized);
    const fragment = detach(fragmentOf(selection(r.groupId)));
    modelStore.clear();
    // Occupy donor IDs with unrelated definitions.
    for (let i = 0; i < 8; i++) modelStore.addSection({ name: `Host ${i}`, a: 0.01, iz: 0.0001 } as never);
    const copy = insertFragment(fragment, [translation([20, 0, 0])]);
    const data = generatedData(copy.groups[0]!)!;
    for (let i = 0; i < data.elements.length; i++) {
      const old = (fragment.groups[0]!.data as unknown as typeof data).elements[i]!;
      expect(modelStore.sections.get(data.elements[i]!.sectionId)!.name).toBe(fragment.sections.find((s) => s.id === old.sectionId)!.name);
    }
    expect(regen(copy.groups[0]!, '8')!.keptSections).toBe(1);
    expect(modelStore.sections.get(modelStore.elements.get(data.elements[0]!.id)!.sectionId)!.name).toBe('Custom');
    expect(Math.min(...positions(copy.groups[0]!).map((p) => p[0]!))).toBe(20);
  });

  it('repeated copies only own the nodes each copy created', () => {
    const original = ins('6', translation([0, 0, 0]));
    const copy = copyTransformed(selection(original.groupId), [translation([6, 0, 0]), translation([12, 0, 0])]);
    const a = generatedData(copy.groups[0]!)!, b = generatedData(copy.groups[1]!)!;
    const aOwned = new Set(a.nodes.filter((n) => n.owned).map((n) => n.id));
    expect(b.nodes.filter((n) => n.owned).every((n) => !aOwned.has(n.id))).toBe(true);
    expect(b.nodes.some((n) => !n.owned && aOwned.has(n.id))).toBe(true);
    const count = modelStore.elements.size;
    const originalPositions = positions(original.groupId), firstCopyPositions = positions(copy.groups[0]!);
    regen(copy.groups[1]!, '6');
    expect(modelStore.elements.size).toBe(count);
    expect(positions(original.groupId)).toEqual(originalPositions);
    expect(positions(copy.groups[0]!)).toEqual(firstCopyPositions);
  });

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
