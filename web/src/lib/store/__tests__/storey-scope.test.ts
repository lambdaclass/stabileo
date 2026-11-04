import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore, uiStore, historyStore } from '../index';
import { storeyScope } from '../storey-scope.svelte';
import { nextMember } from '../next-member.svelte';
import { elementLevel } from '../../model/similar-storeys';

/** Thirteen levels; storeys 2–5 repeat 1, 7–9 repeat 6, the rest are their own. Two columns and a beam per storey. */
function thirteen(): { beamOn: (lv: number) => number } {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  const levels = Array.from({ length: 14 }, (_, k) => ({ id: `L${k}`, name: `N${k}`, z: 3 * k }));
  for (const k of [2, 3, 4, 5]) (levels[k] as { similarTo?: string }).similarTo = 'L1';
  for (const k of [7, 8, 9]) (levels[k] as { similarTo?: string }).similarTo = 'L6';
  modelStore.setGrid({ axes: [], levels });
  const at: Array<[number, number]> = [];
  const beams = new Map<number, number>();
  for (let k = 0; k <= 13; k++) {
    at.push([modelStore.addNode(0, 0, 3 * k), modelStore.addNode(6, 0, 3 * k)]);
    if (k === 0) continue;
    modelStore.addElement(at[k - 1]![0], at[k]![0]);
    modelStore.addElement(at[k - 1]![1], at[k]![1]);
    beams.set(k, modelStore.addElement(at[k]![0], at[k]![1]));
  }
  if (!modelStore.sections.has(2)) modelStore.addSection({ name: 'V2', a: 0.1, iz: 1e-3, iy: 1e-3 } as never);
  return { beamOn: (k) => beams.get(k)! };
}

const levelOf = (id: number) => elementLevel({ nodes: modelStore.nodes, elements: modelStore.elements }, id, modelStore.grid!.levels)!.name;

describe('the storey scope', () => {
  beforeEach(() => { storeyScope.scope = 'this'; uiStore.clearSelection(); });

  it('takes a beam selected on the master to its similar storeys, and to no other', () => {
    const { beamOn } = thirteen();
    storeyScope.scope = 'similar';
    uiStore.setSelection(new Set(), new Set([beamOn(1)]));
    expect(storeyScope.expandSelection()).toBe(4);
    expect([...uiStore.selectedElements].map(levelOf).sort()).toEqual(['N1', 'N2', 'N3', 'N4', 'N5']);
    expect(storeyScope.last!.unmatched).toEqual([]);
  });

  it('keeps what it took when the selection it set comes back to it', () => {
    const { beamOn } = thirteen();
    storeyScope.scope = 'similar';
    uiStore.setSelection(new Set(), new Set([beamOn(1)]));
    storeyScope.expandSelection();
    expect(storeyScope.expandSelection()).toBe(0);
    expect(storeyScope.last!.added).toBe(4);
    uiStore.setSelection(new Set(), new Set([beamOn(6)]));
    expect(storeyScope.expandSelection()).toBe(3);
  });

  it('deselecting one copy keeps the other copies as copies: back to "this" leaves only what was picked', () => {
    const { beamOn } = thirteen();
    storeyScope.scope = 'similar';
    uiStore.setSelection(new Set(), new Set([beamOn(1)]));
    storeyScope.expandSelection();
    uiStore.setSelection(new Set(), new Set([...uiStore.selectedElements].filter((id) => id !== beamOn(2))));
    storeyScope.expandSelection();
    storeyScope.scope = 'this';
    expect([...uiStore.selectedElements]).toEqual([beamOn(1)]);
  });

  it('an edit of the selection reaches them all, and is undone in one step', () => {
    const { beamOn } = thirteen();
    storeyScope.scope = 'similar';
    uiStore.setSelection(new Set(), new Set([beamOn(6)]));
    storeyScope.expandSelection();
    const section = [...modelStore.sections.keys()].at(-1)!;
    modelStore.batch(() => { for (const id of uiStore.selectedElements) modelStore.updateElementSection(id, section); });
    const changed = [...modelStore.elements.values()].filter((e) => e.sectionId === section).map((e) => levelOf(e.id)).sort();
    expect(changed).toEqual(['N6', 'N7', 'N8', 'N9']);
    historyStore.undo();
    expect([...modelStore.elements.values()].some((e) => e.sectionId === section)).toBe(false);
  });

  it('a member drawn on a storey is drawn on its similar ones, in one undo step', () => {
    thirteen();
    storeyScope.scope = 'similar';
    const a = modelStore.addNode(0, 5, 3), b = modelStore.addNode(6, 5, 3);
    const before = modelStore.elements.size;
    nextMember.add(a, b);
    expect(modelStore.elements.size).toBe(before + 5);
    historyStore.undo();
    expect(modelStore.elements.size).toBe(before);
  });

  it('a member drawn where a similar storey already has one adds no second member there', () => {
    const { beamOn } = thirteen();
    const beam = modelStore.elements.get(beamOn(1))!;
    const [a, b] = [beam.nodeI, beam.nodeJ];
    modelStore.removeElement(beamOn(1));
    storeyScope.scope = 'similar';
    const before = modelStore.elements.size;
    nextMember.add(a, b);
    expect(modelStore.elements.size).toBe(before + 1);
    const pairs = [...modelStore.elements.values()].map((e) => [e.nodeI, e.nodeJ].sort((x, y) => x - y).join('-'));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('a column drawn on a 3 m storey spans a similar storey of 4 m from its floor to its ceiling', () => {
    uiStore.analysisMode = 'pro';
    modelStore.clear();
    modelStore.setGrid({ axes: [], levels: [{ id: 'L0', name: 'N0', z: 0 }, { id: 'L1', name: 'N1', z: 3 }, { id: 'L2', name: 'N2', z: 7, similarTo: 'L1' }] });
    const floor2 = modelStore.addNode(0, 5, 3);
    storeyScope.scope = 'similar';
    nextMember.add(modelStore.addNode(0, 5, 0), floor2);
    const top = (e: { nodeI: number; nodeJ: number }) => Math.max(...[e.nodeI, e.nodeJ].map((n) => modelStore.nodes.get(n)!.z ?? 0));
    expect(modelStore.elements.size).toBe(2);
    const copy = [...modelStore.elements.values()].find((e) => top(e) === 7)!;
    const zs = [copy.nodeI, copy.nodeJ].map((n) => modelStore.nodes.get(n)!.z).sort((x, y) => x! - y!);
    expect(zs).toEqual([3, 7]);
    expect([copy.nodeI, copy.nodeJ]).toContain(floor2);
  });

  it('narrowing the scope goes back to what was selected on the storey', () => {
    const { beamOn } = thirteen();
    storeyScope.scope = 'similar';
    uiStore.setSelection(new Set(), new Set([beamOn(1)]));
    storeyScope.expandSelection();
    expect(uiStore.selectedElements.size).toBe(5);
    storeyScope.scope = 'this';
    expect([...uiStore.selectedElements]).toEqual([beamOn(1)]);
    storeyScope.scope = 'all';
    expect(uiStore.selectedElements.size).toBe(13);
    storeyScope.scope = 'similar';
    expect([...uiStore.selectedElements].map(levelOf).sort()).toEqual(['N1', 'N2', 'N3', 'N4', 'N5']);
  });

  it('narrowing after adding to an expanded selection keeps only what was picked on the storey', () => {
    const { beamOn } = thirteen();
    storeyScope.scope = 'similar';
    uiStore.setSelection(new Set(), new Set([beamOn(1)]));
    storeyScope.expandSelection();
    const column = [...modelStore.elements.values()].find((e) => e.id !== beamOn(1) && levelOf(e.id) === 'N1' && e.id !== beamOn(2))!.id;
    uiStore.setSelection(new Set(), new Set([...uiStore.selectedElements, column]));
    storeyScope.expandSelection();
    expect([...uiStore.selectedElements].map(levelOf).sort()).toEqual(['N1', 'N1', 'N2', 'N2', 'N3', 'N3', 'N4', 'N4', 'N5', 'N5']);
    storeyScope.scope = 'this';
    expect([...uiStore.selectedElements].sort((a, b) => a - b)).toEqual([beamOn(1), column].sort((a, b) => a - b));
  });

  it('a selection changed after the expansion is the one the scope starts from', () => {
    const { beamOn } = thirteen();
    storeyScope.scope = 'similar';
    uiStore.setSelection(new Set(), new Set([beamOn(1)]));
    storeyScope.expandSelection();
    uiStore.setSelection(new Set(), new Set([beamOn(10)]));
    storeyScope.scope = 'this';
    expect([...uiStore.selectedElements]).toEqual([beamOn(10)]);
  });

  it('a member copied to the similar storeys keeps every property but its place and its name', () => {
    thirteen();
    storeyScope.scope = 'similar';
    const a = modelStore.addNode(0, 5, 3), b = modelStore.addNode(6, 5, 3);
    const id = modelStore.addElement(a, b, 'truss');
    const section = [...modelStore.sections.keys()].at(-1)!;
    modelStore.updateElement(id, {
      name: 'V101', sectionId: section,
      releaseI: { my: true, mz: true, t: false }, releaseJ: { my: false, mz: true, t: true },
      jointI: { dof: [false, false, false, false, true, true] }, rollAngle: 30, localYx: 0, localYy: 0, localYz: 1,
      offset: { frame: 'global', i: { dx: 0, dy: 0.1, dz: -0.2 } } as never,
      behaviour: { kind: 'tensionOnly' } as never, stiffness: { iy: 0.35, iz: 0.35 } as never,
      semiRigid: { i: { ky: 1e4 } } as never, kStrong: 0.8, kWeak: 1.2, unbracedLength: 2,
      steelLoadHeight: 'web', keptOver: [1],
    });
    const source = modelStore.elements.get(id)!;
    const copies = storeyScope.replicateMember(id);
    expect(copies).toHaveLength(4);
    const { id: _id, nodeI: _i, nodeJ: _j, name: _n, keptOver: _k, ...kept } = source;
    for (const c of copies) {
      const { id: _cid, nodeI: _ci, nodeJ: _cj, ...copy } = modelStore.elements.get(c)!;
      expect(copy).toEqual(kept);
    }
    const ends = (e: number) => { const m = modelStore.elements.get(e)!; return [m.nodeI, m.nodeJ].map((n) => modelStore.nodes.get(n)!).map((p) => [p.x, p.y, p.z]); };
    expect(copies.map(levelOf).sort()).toEqual(['N2', 'N3', 'N4', 'N5']);
    for (const c of copies) { const [i, j] = ends(c); expect([i![0], i![1], j![0], j![1]]).toEqual([0, 5, 6, 5]); expect(i![2]).toBe(j![2]); }
    expect(storeyScope.lastReplication).toEqual({ copies, skipped: [], resized: [], existing: [] });
  });

  it('a storey a copy cannot reach is reported, and a copy of another length drops what is stated in metres along it', () => {
    uiStore.analysisMode = 'pro';
    modelStore.clear();
    modelStore.setGrid({ axes: [], levels: [{ id: 'L0', name: 'N0', z: 0 }, { id: 'L1', name: 'N1', z: 3, similarTo: 'L0' }, { id: 'L2', name: 'N2', z: 7, similarTo: 'L0' }] });
    storeyScope.scope = 'similar';
    const col = modelStore.addElement(modelStore.addNode(0, 5, 0), modelStore.addNode(0, 5, 3));
    modelStore.updateElement(col, { unbracedLength: 1.5, bracing: { top: [1] } as never, kStrong: 0.7 });
    const copies = storeyScope.replicateMember(col);
    expect(copies).toHaveLength(1);
    const copy = modelStore.elements.get(copies[0]!)!;
    expect(copy.kStrong).toBe(0.7);
    expect(copy.unbracedLength).toBeUndefined();
    expect(copy.bracing).toBeUndefined();
    expect(storeyScope.lastReplication).toEqual({ copies, skipped: ['L0'], resized: ['L2'], existing: [] });
  });

  it('a storey that already has the member keeps its own, and is reported', () => {
    uiStore.analysisMode = 'pro';
    modelStore.clear();
    modelStore.setGrid({ axes: [], levels: [{ id: 'L0', name: 'N0', z: 0 }, { id: 'L1', name: 'N1', z: 3, similarTo: 'L0' }, { id: 'L2', name: 'N2', z: 6, similarTo: 'L0' }] });
    storeyScope.scope = 'similar';
    const there = modelStore.addElement(modelStore.addNode(0, 0, 6), modelStore.addNode(5, 0, 6));
    modelStore.updateElement(there, { kStrong: 0.5 });
    const beam = modelStore.addElement(modelStore.addNode(0, 0, 3), modelStore.addNode(5, 0, 3));
    modelStore.updateElement(beam, { kStrong: 0.9 });
    const copies = storeyScope.replicateMember(beam);
    expect(copies).toHaveLength(1);
    expect(modelStore.nodes.get(modelStore.elements.get(copies[0]!)!.nodeI)!.z ?? 0).toBe(0);
    expect(modelStore.elements.get(there)!.kStrong).toBe(0.5);
    expect(storeyScope.lastReplication).toEqual({ copies, skipped: [], resized: [], existing: ['L2'] });
  });

  it('does nothing outside PRO, or with the scope on this storey', () => {
    const { beamOn } = thirteen();
    uiStore.setSelection(new Set(), new Set([beamOn(1)]));
    expect(storeyScope.expandSelection()).toBe(0);
    storeyScope.scope = 'all';
    uiStore.analysisMode = '3d';
    expect(storeyScope.expandSelection()).toBe(0);
    uiStore.analysisMode = 'pro';
  });
});
