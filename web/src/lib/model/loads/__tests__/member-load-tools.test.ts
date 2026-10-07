/**
 * The member load tools, the targets they go on, the operations on loads, and the new loads kept
 * whole through the model's own edits and files.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import '../../../store/index';
import { initSolver } from '../../../engine/wasm-solver';
import { triangularPeak, hydrostaticLoads, orderedChain, loadsOnChain, inclinedForce } from '../member-load-tools';
import { resolveTargets, parseIdList, memberKindOf } from '../load-targets';
import { copyLoadsToCase, moveLoadsToCase, scaleLoads, duplicateCase, addLoads } from '../../../store/load-ops';
import { modelToCode, codeToModel } from '../../code/format';
import { flipMembers } from '../../edit/flip-members';
import { appliedResultant } from '../../../engine/statics-check';
import { evaluateDiagramAt } from '../../../engine/diagrams-3d';
import { memberRef3D } from '../../../engine/solver-service';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

const solve = () => {
  const r = modelStore.solve3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
};

describe('member load tools', () => {
  it('a triangle with its peak at a third: two trapezoids whose resultant is the triangle\'s', () => {
    const parts = triangularPeak(1, 6, -12, 'z', 'local', 2);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ qZI: 0, qZJ: -12, b: 2 });
    expect(parts[1]).toMatchObject({ qZI: -12, qZJ: 0, a: 2 });
    const total = parts.reduce((s, p) => s + ((p.qZI + p.qZJ) / 2) * ((p.b ?? 6) - (p.a ?? 0)), 0);
    expect(total).toBeCloseTo(-36, 12);
    // A peak at an end is one trapezoid.
    expect(triangularPeak(1, 6, 5, 'y', 'local', 6)).toHaveLength(1);
  });

  it('a hydrostatic load: w₁ at the lowest point of the members, w₂ at the highest', () => {
    const m = [
      { id: 1, i: { x: 0, y: 0, z: 0 }, j: { x: 0, y: 0, z: 2 } },
      { id: 2, i: { x: 0, y: 0, z: 2 }, j: { x: 0, y: 0, z: 4 } },
    ];
    const out = hydrostaticLoads(m, 'Z', 40, 0, 'x', 'global');
    expect(out.map((d) => [d.qXI, d.qXJ])).toEqual([[40, 20], [20, 0]]);
    expect(out.every((d) => d.frame === 'global')).toBe(true);
  });

  it('a load on a physical member: the chain\'s distances, cut into each member, the reversed one in global axes', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0), c = modelStore.addNode(7, 0, 0);
    const e1 = modelStore.addElement(a, b, 'frame'), e2 = modelStore.addElement(c, b, 'frame');
    const chain = orderedChain([e1, e2], (id) => modelStore.elements.get(id), (id) => modelStore.nodes.get(id))!;
    expect(chain.total).toBeCloseTo(7, 12);
    expect(chain.links.map((l) => l.reversed)).toEqual([false, true]);
    const ax = (id: number) => memberRef3D(modelStore.model as never, id)?.axes ?? null;
    const chainAxes = { ex: [1, 0, 0] as [number, number, number], ey: [0, 1, 0] as [number, number, number], ez: [0, 0, 1] as [number, number, number], L: 7 };
    const loads = loadsOnChain(chain, { kind: 'distributed', a: 2, b: 5, frame: 'local', qI: [0, 0, -10], qJ: [0, 0, -10] }, (id) => (id === e1 ? chainAxes : ax(id)), chainAxes);
    expect(loads).toHaveLength(2);
    const [l1, l2] = loads;
    expect(l1!.data).toMatchObject({ elementId: e1, a: 2, qZI: -10, qZJ: -10 });
    // The second member runs from 7 back to 3: the stretch 3–5 of the chain is its 2–4.
    expect(l2!.data).toMatchObject({ elementId: e2, a: 2, frame: 'global', qZI: -10, qZJ: -10 });
    expect((l2!.data as { b?: number }).b).toBeUndefined();
    // A point load at 6 m of the chain is 1 m from the far end of the second member's I.
    const p = loadsOnChain(chain, { kind: 'point', a: 6, frame: 'global', F: [0, 0, -5], M: [0, 0, 0] }, () => chainAxes, chainAxes);
    expect(p[0]!.data).toMatchObject({ elementId: e2, a: 1, pz: -5, frame: 'global' });
    // Not a chain: a corner.
    const d = modelStore.addNode(3, 4, 0);
    const e3 = modelStore.addElement(b, d, 'frame');
    expect(orderedChain([e1, e3], (id) => modelStore.elements.get(id), (id) => modelStore.nodes.get(id))).toBeNull();
  });

  it('a force toward a point, by its components', () => {
    expect(inclinedForce({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: -4 }, 10)).toEqual([6, 0, -8]);
    expect(inclinedForce({ x: 1, y: 1 }, { x: 1, y: 1 }, 10)).toBeNull();
  });
});

describe('targets', () => {
  it('ids, a range, a section and a kind', () => {
    expect(parseIdList('1, 4 7-9; 4')).toEqual([1, 4, 7, 8, 9]);
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(4, 0, 3), modelStore.addNode(4, 0, 0)];
    const col1 = modelStore.addElement(n[0]!, n[1]!, 'frame'), beam = modelStore.addElement(n[1]!, n[2]!, 'frame'), col2 = modelStore.addElement(n[3]!, n[2]!, 'frame');
    const m = { nodes: modelStore.nodes, elements: modelStore.elements, groups: modelStore.model.groups };
    const sel = { nodes: [], elements: [] };
    expect(resolveTargets('members', { by: 'kind', kind: 'column' }, m, sel)).toEqual([col1, col2]);
    expect(resolveTargets('members', { by: 'kind', kind: 'beam' }, m, sel)).toEqual([beam]);
    expect(resolveTargets('members', { by: 'range', axis: 'Z', min: 3, max: 3 }, m, sel)).toEqual([beam]);
    expect(resolveTargets('nodes', { by: 'range', axis: 'X', min: 3.9995, max: 10 }, m, sel)).toEqual([n[2], n[3]]);
    const sid = modelStore.elements.get(beam)!.sectionId;
    expect(resolveTargets('members', { by: 'section', sectionId: sid }, m, sel)).toEqual([col1, beam, col2]);
    expect(memberKindOf(m, col2)).toBe('column');
    // The whole model: every member, every node.
    expect(resolveTargets('members', { by: 'all' }, m, sel)).toEqual([col1, beam, col2].sort((x, y) => x - y));
    expect(resolveTargets('nodes', { by: 'all' }, m, sel)).toEqual([...n].sort((x, y) => x - y));
  });
});

describe('operations on loads', () => {
  it('copy with a factor, move, scale and duplicate a case: magnitudes only, one undo step each', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    const [c1, c2] = modelStore.model.loadCases.map((c) => c.id);
    const [p, t] = addLoads([
      { type: 'pointOnElement3d', data: { id: 0, elementId: e, a: 1.5, py: 0, pz: -10, my: 4, caseId: c1 } },
      { type: 'prestress3d', data: { id: 0, elementId: e, force: 300, eI: 0, eM: 0.1, eJ: 0, caseId: c1 } },
    ]);
    const [copy] = copyLoadsToCase([p!], c2!, 1.5);
    const cp = modelStore.loads.find((l) => l.data.id === copy)!.data as { a: number; pz: number; my: number; caseId: number };
    expect(cp).toMatchObject({ a: 1.5, pz: -15, my: 6, caseId: c2 });
    scaleLoads([t!], 2);
    expect(modelStore.loads.find((l) => l.data.id === t)!.data).toMatchObject({ force: 600, eM: 0.1 });
    moveLoadsToCase([t!], c2!);
    expect(modelStore.loads.find((l) => l.data.id === t)!.data.caseId).toBe(c2);
    const dup = duplicateCase(c2!, 'L bis', -1)!;
    const dupLoads = modelStore.loads.filter((l) => l.data.caseId === dup);
    expect(dupLoads).toHaveLength(2);
    expect(dupLoads.map((l) => (l.data as { pz?: number; force?: number }).pz ?? (l.data as { force: number }).force).sort()).toEqual([-600, 15].sort());
    expect(modelStore.model.loadCases.find((c) => c.id === dup)!.type).toBe(modelStore.model.loadCases.find((c) => c.id === c2)!.type);
  });

  it('the case totals before solving: a point moment counts, a tendon nets to nothing', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    const c1 = modelStore.model.loadCases[0]!.id;
    addLoads([
      { type: 'pointOnElement3d', data: { id: 0, elementId: e, a: 1, py: 0, pz: -10, my: 3, caseId: c1 } },
      { type: 'prestress3d', data: { id: 0, elementId: e, force: 300, eI: 0, eM: 0.1, eJ: 0, caseId: c1 } },
    ]);
    const r = appliedResultant(modelStore.model as never, c1, { includeSelfWeight: false });
    expect(r.applied.fz).toBeCloseTo(-10, 9);
    expect(r.uncovered).toEqual([]);
  });
});

describe('kept whole', () => {
  it('through the model as code and the file snapshot', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    addLoads([
      { type: 'pointOnElement3d', data: { id: 0, elementId: e, a: 1, py: 0, pz: -10, px: 2, mx: 1, frame: 'global' } },
      { type: 'prestress3d', data: { id: 0, elementId: e, force: 300, eI: 0.05, eM: 0.1, eJ: -0.02 } },
      { type: 'thermal', data: { id: 0, elementId: e, dtUniform: 0, dtGradient: 0, dtGradientY: 12, strain: -2e-4 } },
      { type: 'displacement3d', data: { id: 0, nodeId: a, dz: -0.01 } },
    ]);
    const snap = modelStore.snapshot();
    const back = codeToModel(modelToCode(snap));
    expect(back.errors).toEqual([]);
    expect(JSON.parse(JSON.stringify(back.snapshot!.loads))).toEqual(JSON.parse(JSON.stringify(snap.loads)));
    modelStore.clear();
    modelStore.restore(JSON.parse(JSON.stringify(snap)));
    expect(JSON.parse(JSON.stringify(modelStore.loads))).toEqual(JSON.parse(JSON.stringify(snap.loads)));
  });

  it('a split member with a tendon solves as the whole one; a reversed one too', () => {
    const build = () => {
      modelStore.clear();
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(8, 0, 0);
      const e = modelStore.addElement(a, b, 'frame');
      modelStore.addSupport(a, 'pinned3d'); modelStore.addSupport(b, 'pinned3d');
      modelStore.updateSupport([...modelStore.supports.values()][1]!.id, { dofRestraints: { tx: false, ty: true, tz: true, rx: true, ry: false, rz: false } });
      addLoads([
        { type: 'prestress3d', data: { id: 0, elementId: e, force: 400, eI: 0.05, eM: 0.25, eJ: -0.1 } },
        { type: 'pointOnElement3d', data: { id: 0, elementId: e, a: 3, py: 0, pz: 0, my: 20 } },
        { type: 'thermal', data: { id: 0, elementId: e, dtUniform: 0, dtGradient: 15, dtGradientY: 8 } },
      ]);
      return { a, b, e };
    };
    const tip = (r: ReturnType<typeof solve>, id: number) => r.displacements.find((d) => d.nodeId === id)!;
    const { b, e } = build();
    const whole = solve();
    const mid = evaluateDiagramAt(whole.elementForces.find((f) => f.elementId === e)!, 'momentY', 0.5);
    modelStore.splitMember(e, [0.3, 0.55]);
    const split = solve();
    expect(tip(split, b).rx).toBeCloseTo(tip(whole, b).rx, 9);
    expect(tip(split, b).ry).toBeCloseTo(tip(whole, b).ry, 9);
    expect(tip(split, b).rz).toBeCloseTo(tip(whole, b).rz, 9);
    build();
    flipMembers([e]);
    const flipped = solve();
    expect(tip(flipped, b).ry).toBeCloseTo(tip(whole, b).ry, 9);
    expect(tip(flipped, b).rz).toBeCloseTo(tip(whole, b).rz, 9);
    expect(Math.abs(evaluateDiagramAt(flipped.elementForces.find((f) => f.elementId === e)!, 'momentY', 0.5))).toBeCloseTo(Math.abs(mid), 6);
  });
});
