/**
 * Regenerating a structure whose node now lands on a model node welds it there, and the node
 * welded away hands over what it carried.
 *
 * A plane frame of two 6 m bays is regenerated as two 7 m bays next to a column the user drew at
 * x = 14: the old end base (x = 12) moves onto the column's foot and becomes it. The old node is
 * removed, and with it went its support — the base stood on nothing — while a shell on it kept a
 * corner that was not there and a constraint on it was dropped.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { generateStructure, DEFAULT_STRUCTURE_PARAMS } from '../../engine/generators/structures';
import { emitModel, defaultProfileSpec, type EmitOptions } from '../../engine/generators/emit';
import { insertGenerated, regenerate } from '../generated-structures';
import { translation } from '../../model/edit/affine';

const PROFILES: EmitOptions['profiles'] = {
  chord: defaultProfileSpec('IPE 160'), post: defaultProfileSpec('L 50x50x5'), diagonal: defaultProfileSpec('L 50x50x5'),
  rafter: defaultProfileSpec('IPE 200'), column: defaultProfileSpec('HEB 200'), beam: defaultProfileSpec('IPE 240'),
  purlin: defaultProfileSpec('UPN 100'), bracing: defaultProfileSpec('L 50x50x5'),
};
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

function frame(baysX: string) {
  const t = generateStructure('planeFrame', { ...DEFAULT_STRUCTURE_PARAMS.planeFrame, baysX, storeys: '3' })!;
  return { g: emitModel(t, { name: 'P', profiles: PROFILES }), roles: t.members.map((m) => m.role) };
}
const meta = (baysX: string) => ({ generator: 'planeFrame', params: { baysX }, profiles: {}, gradeId: null, name: `P ${baysX}` });
const nodeAt = (x: number, z: number) => [...modelStore.nodes.values()].filter((n) => Math.abs(n.x - x) < 1e-9 && Math.abs((n.z ?? 0) - z) < 1e-9);
const supportsAt = (x: number, z: number) => [...modelStore.supports.values()].filter((s) => nodeAt(x, z).some((n) => n.id === s.nodeId));

/** The 6 m frame, its end base, and the column at x = 14 the 7 m frame will weld onto. */
function setUp() {
  const f6 = frame('6; 6');
  const r = insertGenerated(f6.g, translation([0, 0, 0]), meta('6; 6'), f6.roles);
  const base = nodeAt(12, 0)[0]!.id;
  const foot = modelStore.addNode(14, 0, 0), head = modelStore.addNode(14, 0, 3);
  modelStore.addElement(foot, head, 'frame');
  return { groupId: r.groupId, base, foot, head };
}
const regen7 = (groupId: number) => { const f7 = frame('7; 7'); return regenerate(groupId, f7.g, meta('7; 7'), f7.roles)!; };

describe('regenerating onto a model node', () => {
  it('moves the support of the base welded away onto the node it became', () => {
    const { groupId, base, foot } = setUp();
    expect(supportsAt(12, 0)).toHaveLength(1);
    const generated = supportsAt(12, 0)[0]!.type;
    const r = regen7(groupId);
    expect(r.welded).toBeGreaterThan(0);
    expect(modelStore.nodes.has(base)).toBe(false);
    expect(supportsAt(0, 0)).toHaveLength(1);
    expect(supportsAt(7, 0)).toHaveLength(1);
    expect(supportsAt(14, 0).map((s) => [s.nodeId, s.type])).toEqual([[foot, generated]]);
    expect(r.supportKept).toBe(0);
  });

  it("keeps the model node's own support, and says so", () => {
    const { groupId, foot } = setUp();
    modelStore.addSupport(foot, 'rollerX');
    const r = regen7(groupId);
    expect(supportsAt(14, 0).map((s) => [s.nodeId, s.type])).toEqual([[foot, 'rollerX']]);
    expect(r.supportKept).toBe(1);
  });

  it('moves a shell corner and a constraint on the base welded away onto the node it became', () => {
    const { groupId, base, foot, head } = setUp();
    const b = modelStore.addNode(12, -2, 0), c = modelStore.addNode(10, -2, 0), d = modelStore.addNode(10, -1, 0);
    const q = modelStore.addQuad([base, b, c, d], 1, 0.2);
    modelStore.addConstraint({ type: 'equalDOF', masterNode: head, slaveNode: base, dofs: [0, 1] });
    regen7(groupId);
    const corners = [...modelStore.quads.get(q)!.nodes];
    expect(corners.every((n) => modelStore.nodes.has(n))).toBe(true);
    expect(corners).toEqual([foot, b, c, d]);
    expect(modelStore.model.constraints).toEqual([{ type: 'equalDOF', masterNode: head, slaveNode: foot, dofs: [0, 1] }]);
  });

  it('is one undo step', () => {
    const { groupId, base } = setUp();
    historyStore.clear();
    regen7(groupId);
    historyStore.undo();
    expect(modelStore.nodes.has(base)).toBe(true);
    expect(supportsAt(12, 0)).toHaveLength(1);
    expect(supportsAt(14, 0)).toHaveLength(0);
  });
});
