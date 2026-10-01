/**
 * What an editing command leaves behind in the lists that name members, nodes and groups by id.
 *
 * Self-weight loads on chosen members, deflection rules, what a saved view hides and the forces
 * of a time history all hold ids. A command that renumbers, merges or deletes what they name has
 * to carry them along, or the members quietly lose their weight or their limit. Cutting a member
 * at one of its own ends must not make a member of zero length.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { renumber } from '../renumber';
import { mergeCollinear } from '../merge-collinear';

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const view = (hidden: number[]) => ({
  id: 1, name: 'v', position: { x: 0, y: 0, z: 10 }, target: { x: 0, y: 0, z: 0 },
  display: { camera: 'perspective' as const, hidden: { elements: hidden, shells: [] }, labels: { nodes: false, members: false, memberLabel: 'id', lengths: false, shells: false } },
});

function withRefs(members: number[], node: number) {
  const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
  snap.analysis = { ...(snap.analysis ?? {}), selfWeight: [{ caseId: 1, direction: 'Z', factor: -1, elements: members }] };
  snap.deflectionLimits = { rules: [{ id: 1, scope: { kind: 'members', ids: members }, n: 250, direction: 'resultant' }] };
  snap.views = [view(members)];
  snap.dynamics = { timeHistory: { dt: 0.01, nSteps: 10, forces: [{ nodeId: node, dir: 'x', kind: 'step', amplitude: 1 }] } };
  modelStore.restore(snap);
  historyStore.clear();
}

describe('split at a member end', () => {
  it('does not make a zero-length member when a cut lands on an end', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    const r = modelStore.splitMember(e, [1e-6, 0.5], { reuseNodeTol: 1e-3 });
    expect(r).not.toBeNull();
    for (const m of modelStore.elements.values()) expect(m.nodeI).not.toBe(m.nodeJ);
    expect(modelStore.elements.size).toBe(2);
  });

  it('does nothing when every cut lands on an end', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    historyStore.clear();
    expect(modelStore.splitMember(e, [1e-6, 1 - 1e-6], { reuseNodeTol: 1e-3 })).toBeNull();
    expect(modelStore.elements.size).toBe(1);
    expect(historyStore.undoCount).toBe(0);
  });
});

describe('renumber', () => {
  it('carries self-weight lists, deflection rules, hidden members and time-history forces', () => {
    const top = modelStore.addNode(0, 0, 3), base = modelStore.addNode(0, 0, 0);
    const far = modelStore.addNode(5, 0, 0);
    const beam = modelStore.addElement(far, top, 'frame');
    const col = modelStore.addElement(base, top, 'frame');
    withRefs([col], top);
    const at = (id: number) => { const n = modelStore.nodes.get(id)!; return `${n.x},${n.y},${n.z ?? 0}`; };
    const colEnds = (id: number) => { const m = modelStore.elements.get(id)!; return [at(m.nodeI), at(m.nodeJ)].join('|'); };
    const before = colEnds(col);
    const r = renumber({ nodes: true, members: true, order: 'zyx' });
    if ('refused' in r) throw new Error('refused');
    expect(beam).not.toBe(col);
    const newCol = [...modelStore.elements.values()].find((m) => colEnds(m.id) === before)!.id;
    expect(modelStore.analysis?.selfWeight?.[0]!.elements).toEqual([newCol]);
    const rule = modelStore.deflectionLimits!.rules[0]!;
    expect(rule.scope).toEqual({ kind: 'members', ids: [newCol] });
    expect(modelStore.snapshot().views![0]!.display!.hidden!.elements).toEqual([newCol]);
    const force = modelStore.snapshot().dynamics!.timeHistory!.forces[0]!;
    expect(at(force.nodeId)).toBe('0,0,3');
  });
});

describe('merge collinear', () => {
  it('carries references to the absorbed segment, and keeps the far spring', () => {
    const a = modelStore.addNode(0, 0, 0), m = modelStore.addNode(3, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e1 = modelStore.addElement(a, m, 'frame'), e2 = modelStore.addElement(m, b, 'frame');
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    const spring = { ky: 1000, kz: 2000 };
    snap.elements = snap.elements.map(([id, el]: [number, Record<string, unknown>]) => [id, id === e2 ? { ...el, semiRigid: { j: spring } } : el]);
    modelStore.restore(snap);
    // The force on an end node: one on m keeps m, and the members are not merged through it.
    withRefs([e2], b);
    const r = mergeCollinear([e1, e2]);
    expect(r.merged.length).toBe(1);
    const [kept] = [...modelStore.elements.values()];
    expect(modelStore.elements.size).toBe(1);
    expect(kept!.semiRigid?.j).toEqual(spring);
    expect(modelStore.analysis?.selfWeight?.[0]!.elements).toEqual([kept!.id]);
    expect(modelStore.deflectionLimits!.rules[0]!.scope).toEqual({ kind: 'members', ids: [kept!.id] });
    expect(modelStore.snapshot().views![0]!.display!.hidden!.elements).toEqual([kept!.id]);
  });
});

describe('remove group', () => {
  it('turns a self-weight load and a deflection rule on the group into its member list', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    const g = modelStore.addGroup('beams', 'selection', { elements: [e] });
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    snap.analysis = { ...(snap.analysis ?? {}), selfWeight: [{ caseId: 1, direction: 'Z', factor: -1, groupId: g }] };
    snap.deflectionLimits = { rules: [{ id: 1, scope: { kind: 'group', groupId: g }, n: 300, direction: 'resultant' }] };
    modelStore.restore(snap);
    historyStore.clear();
    expect(modelStore.removeGroup(g)).toBe('removed');
    expect(modelStore.model.groups.has(g)).toBe(false);
    expect(modelStore.analysis?.selfWeight).toEqual([{ caseId: 1, direction: 'Z', factor: -1, elements: [e] }]);
    expect(modelStore.deflectionLimits!.rules[0]!.scope).toEqual({ kind: 'members', ids: [e] });
    expect(historyStore.undoCount).toBe(1);
    historyStore.undo();
    expect(modelStore.model.groups.has(g)).toBe(true);
    expect(modelStore.analysis?.selfWeight?.[0]!.groupId).toBe(g);
  });

  it('keeps a group whose shells a self-weight load covers, and says why', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    const g = modelStore.addGroup('slab', 'selection', { elements: [e], quads: [7] });
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    snap.analysis = { ...(snap.analysis ?? {}), selfWeight: [{ caseId: 1, direction: 'Z', factor: -1, groupId: g }] };
    modelStore.restore(snap);
    expect(modelStore.removeGroup(g)).toBe('selfWeightShells');
    expect(modelStore.model.groups.has(g)).toBe(true);
  });
});
