import * as axesModule from '../local-axes-3d';
/**
 * A member of variable section through the solve: cut into prismatic pieces for the engine, back to
 * one member in the results, against the exact integral of its own taper.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { toSectionFields } from '../../section/section-choice';
import { computeSectionProperties } from '../../data/section-shapes';
import { evaluateDiagramAt } from '../diagrams-3d';
import { expandVariableMembers } from '../variable-members';
import { memberLocalCurve, eiOf } from '../member-deflection';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

const L = 8, P = 10, B = 0.2, H0 = 0.8, H1 = 0.3;
const rect = (h: number) => {
  const params = { b: B, h };
  return modelStore.addSection(toSectionFields({ kind: 'built', name: `R${h}`, shapeType: 'concrete-rect', params, props: computeSectionProperties('concrete-rect', params)!, rotationDeg: 0 }, 0) as never);
};

/** δ = ∫ P (L−x)² / (E I(x)) dx, Simpson with a thousand intervals. */
function exactTip(E: number) {
  const n = 1000, dx = L / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const x = i * dx, h = H0 + (H1 - H0) * (x / L);
    sum += ((P * (L - x) ** 2) / (E * (B * h ** 3) / 12)) * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  }
  return (sum * dx) / 3;
}

function cantilever(segments?: number) {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  const sI = rect(H0), sJ = rect(H1);
  modelStore.updateElement(e, { sectionId: sI, variableSection: { sectionJ: sJ, ...(segments ? { segments } : {}) } } as never);
  modelStore.addSupport(a, 'fixed3d');
  return { a, b, e };
}

describe('variable-section members', () => {
  it('twelve pieces reach the exact tip deflection within 0,5 %, and the results name one member', () => {
    const { b, e } = cantilever();
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const E = [...modelStore.materials.values()][0]!.e * 1000;
    const uz = -r.displacements.find((d) => d.nodeId === b)!.uz;
    expect(Math.abs(uz - exactTip(E)) / exactTip(E)).toBeLessThan(0.005);
    // No interior node and no piece is left in what the app reads.
    expect(r.displacements.map((d) => d.nodeId).sort()).toEqual([...modelStore.nodes.keys()].sort());
    expect(r.elementForces.map((f) => f.elementId)).toEqual([e]);
    const f = r.elementForces[0]!;
    expect(f.pieces).toHaveLength(12);
    expect(f.length).toBeCloseTo(L, 9);
    // Statics along the whole member: the moment at a point is P times its distance to the tip.
    for (const t of [0, 0.31, 0.5, 0.9, 1]) expect(Math.abs(evaluateDiagramAt(f, 'momentY', t))).toBeCloseTo(P * L * (1 - t), 6);
  });

  it('a stiffer prismatic member would be wrong: the variable one deflects half again as much as its deep end alone', () => {
    const { b } = cantilever();
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0);
    const r1 = modelStore.solve3D(false, false, true);
    const vMember = [...modelStore.elements.values()][0]!;
    modelStore.updateElement(vMember.id, { variableSection: undefined } as never);
    const r0 = modelStore.solve3D(false, false, true);
    if (!r0 || typeof r0 === 'string' || !r1 || typeof r1 === 'string') throw new Error('solve');
    const uz = (r: typeof r0) => -r.displacements.find((d) => d.nodeId === b)!.uz;
    expect(uz(r1)).toBeGreaterThan(uz(r0) * 1.5);
  });

  it('self-weight follows the section along the member', () => {
    const { a } = cantilever();
    const r = modelStore.solve3D(true, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const rho = [...modelStore.materials.values()][0]!.rho;
    // ∫ ρ b h(x) dx = ρ b L (h0 + h1)/2; the pieces read each section at mid-piece: exact for a linear area.
    expect(r.reactions.find((x) => x.nodeId === a)!.fz).toBeCloseTo(rho * B * L * (H0 + H1) / 2, 3);
  });

  it('the expansion splits the member\'s loads and keeps its end releases at its ends', () => {
    const { b, e } = cantilever(4);
    modelStore.addDistributedLoad3D(e, 0, 0, -2, -2);
    modelStore.updateElement(e, { releaseJ: { my: true, mz: false, t: false } } as never);
    const m = expandVariableMembers(modelStore.model as never) as typeof modelStore.model;
    const pieces = [...m.elements.values()];
    expect(pieces).toHaveLength(4);
    expect(pieces.filter((p) => p.releaseJ?.my)).toHaveLength(1);
    expect(pieces[pieces.length - 1]!.nodeJ).toBe(b);
    const total = m.loads.filter((l) => l.type === 'distributed3d').reduce((s, l) => {
      const d = l.data as { qZI: number; qZJ: number; a?: number; b?: number; elementId: number };
      const len = L / 4;
      return s + ((d.qZI + d.qZJ) / 2) * ((d.b ?? len) - (d.a ?? 0));
    }, 0);
    expect(total).toBeCloseTo(-2 * L, 9);
  });

  it('combinations and their envelope come back as one member', () => {
    const { b, e } = cantilever();
    const lc = modelStore.model.loadCases[0]!.id;
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0, lc);
    const cid = modelStore.addCombination('1.5 D', [{ caseId: lc, factor: 1.5 }]);
    const r = modelStore.solveCombinations3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const combo = r.perCombo.get(cid)!;
    expect(combo.elementForces.map((f) => f.elementId)).toEqual([e]);
    expect(r.envelope.momentY.elements.map((x) => x.elementId)).toEqual([e]);
    const env = r.envelope.momentY.elements[0]!;
    expect(env.tPositions[0]).toBeCloseTo(0, 9);
    expect(env.tPositions[env.tPositions.length - 1]).toBeCloseTo(1, 9);
    expect(Math.max(...env.posValues.map(Math.abs), ...env.negValues.map(Math.abs))).toBeCloseTo(1.5 * P * L, 4);
  });

  it('the deflected curve runs through each piece\'s solved end, with each piece\'s own EI', () => {
    const { a, b, e } = cantilever();
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const f = r.elementForces.find((x) => x.elementId === e)!;
    const na = modelStore.nodes.get(a)!, nb = modelStore.nodes.get(b)!;
    const dI = r.displacements.find((d) => d.nodeId === a)!, dJ = r.displacements.find((d) => d.nodeId === b)!;
    const el = modelStore.elements.get(e)!;
    const ei = eiOf(modelStore.materials.get(el.materialId), modelStore.sections.get(el.sectionId));
    const xis = f.pieces!.map((p) => p.x1 / L);
    const c = memberLocalCurve({ x: na.x, y: na.y, z: na.z ?? 0 }, { x: nb.x, y: nb.y, z: nb.z ?? 0 }, dI, dJ, f, ei, undefined, 0, false, xis)!;
    f.pieces!.forEach((p, k) => {
      const w = c.w[k]!;
      // The local Z of a member along +X with no roll is global Z.
      expect(Math.abs(w - p.dJ!.uz)).toBeLessThan(1e-9 + 1e-6 * Math.abs(p.dJ!.uz));
    });
  });
  it('groups unsorted/duplicate stations by piece with the same values as one-point evaluation', () => {
    const { a, b, e } = cantilever();
    modelStore.addNodalLoad3D(b, 0, 0, -P, 0, 0, 0);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const f = r.elementForces.find(x => x.elementId === e)!;
    const ni = modelStore.nodes.get(a)!, nj = modelStore.nodes.get(b)!;
    const start = { x: ni.x, y: ni.y, z: ni.z ?? 0 }, end = { x: nj.x, y: nj.y, z: nj.z ?? 0 };
    const dI = r.displacements.find(d => d.nodeId === a)!, dJ = r.displacements.find(d => d.nodeId === b)!;
    const ts = [1, 0.25, 0, 0.3, 0.5, 0.25, 0.75, ...Array.from({ length: 41 }, (_, i) => i / 40)];
    const reference = ts.map(t => memberLocalCurve(start, end, dI, dJ, f, undefined, undefined, 0, false, [t])!);
    const spy = vi.spyOn(axesModule, 'computeLocalAxes3D');
    try {
      const result = memberLocalCurve(start, end, dI, dJ, f, undefined, undefined, 0, false, ts)!;
      expect(result.xi).toEqual(ts);
      for (const component of ['u', 'v', 'w'] as const) expect(result[component]).toEqual(reference.map(c => c[component][0]));
      expect(spy).toHaveBeenCalledTimes(f.pieces!.length);
    } finally { spy.mockRestore(); }
  });

});
