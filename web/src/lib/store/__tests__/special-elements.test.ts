/**
 * Fire resistance and the particular elements through the store.
 *
 * A concrete frame with two walls on axis A joined by beams (coupling beams), a masonry wall on
 * axis B, a corbel under a beam's end, an opening through a beam and a masonry infill whose
 * struts go into the model; solved with dead, live and a lateral case. Then a tubular steel truss
 * with a gapped K joint, and a timber connection. Every row read has its title in the locales.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { verificationStore } from '../verification.svelte';
import { placeFrame, placeWall } from '../../model/building/build-on-grid';
import { couplingCandidates, couplingChecks, corbelChecks, openingChecks, saveEntry } from '../special-elements';
import { infillChecks, masonryWallChecks, placeInfillStruts, setMasonryChoice } from '../masonry-infill';
import { dowelChecks, hssJointChecks, hssJointGeometry } from '../special-connections';
import { fireChecks, patchFire } from '../fire';
import { runSteelCheck } from '../steel-check';
import { memoriaInput } from '../memoria-inputs';
import es from '../../i18n/locales/es';
import type { StructuralGrid } from '../../model/grid';
import type { CheckRow } from '../../design-contract';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 4 }, { id: 'x2', name: '3', axis: 'x', at: 6 }, { id: 'x3', name: '4', axis: 'x', at: 10 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }],
};

const titled = (rows: readonly CheckRow[]) => rows.filter((r) => r.titleKey && !(r.titleKey in (es as Record<string, string>))).map((r) => r.titleKey);
const solve = () => {
  const combo = modelStore.solveCombinations3D(true, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
};
const at = (x: number, y: number, z: number) => [...modelStore.nodes.values()].find((n) => Math.hypot(n.x - x, (n.y ?? 0) - y, (n.z ?? 0) - z) < 1e-6)!.id;
const between = (a: number, b: number) => [...modelStore.elements.values()].find((e) => (e.nodeI === a && e.nodeJ === b) || (e.nodeI === b && e.nodeJ === a))!.id;

describe('fire and particular elements', () => {
  it('a concrete frame: coupling beams, corbel, opening, masonry wall, infill and its fire rows', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.00213, iz: 0.00213, j: 0.0036, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: '25×60', a: 0.15, iy: 0.0045, iz: 0.00078, j: 0.0024, b: 0.25, h: 0.6, shape: 'rect' } as never);
    placeFrame(grid, { x: ['x0', 'x3'], y: ['y0', 'y1'], levels: ['N0', 'N2'], columns: { sectionId: col, materialId: mat }, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } }, { fixBase: true });
    placeWall(grid, { axis: 'y0', from: 'x0', to: 'x1', levelFrom: 'N0', levelTo: 'N2', thickness: 0.2, materialId: mat, meshSize: 1 });
    placeWall(grid, { axis: 'y0', from: 'x2', to: 'x3', levelFrom: 'N0', levelTo: 'N2', thickness: 0.2, materialId: mat, meshSize: 1 });
    placeWall(grid, { axis: 'y1', from: 'x0', to: 'x1', levelFrom: 'N0', levelTo: 'N1', thickness: 0.18, materialId: mat, meshSize: 1, typology: 'masonry' });
    const lCase = modelStore.addLoadCase('L', 'L'), wCase = modelStore.addLoadCase('W', 'W');
    for (const e of modelStore.elements.values()) {
      const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
      if (Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6 && (a.z ?? 0) > 0) { modelStore.addDistributedLoad3D(e.id, 0, 0, -20, -20, undefined, undefined, 1, { frame: 'global' }); modelStore.addDistributedLoad3D(e.id, 0, 0, -10, -10, undefined, undefined, lCase, { frame: 'global' }); }
    }
    for (const z of [3, 6]) modelStore.addNodalLoad3D(at(0, 0, z), 80, 0, 0, 0, 0, 0, wCase);
    modelStore.addCombination('1.2D + 1.6L', [{ caseId: 1, factor: 1.2 }, { caseId: lCase, factor: 1.6 }]);
    modelStore.addCombination('1.2D + L + 1.6W', [{ caseId: 1, factor: 1.2 }, { caseId: lCase, factor: 1 }, { caseId: wCase, factor: 1.6 }]);
    solve();

    // Coupling beams: the beams from x = 4 to x = 6 on axis A, at both levels.
    const cand = couplingCandidates();
    expect(cand).toHaveLength(2);
    const cp = couplingChecks();
    expect(cp[0]!.vu).toBeGreaterThan(0);
    expect(cp[0]!.rows.map((r) => r.clause)).toContain('3.8.1.2');

    // A corbel under the end of a beam on axis B; an opening at the middle of another.
    const beamB = between(at(6, 5, 3), at(10, 5, 3));
    saveEntry('corbels', { id: 'c1', name: 'M1', bw: 0.4, h: 0.5, d: 0.45, av: 0.2, monolithic: true, from: { elementId: beamB, end: 'j' } });
    const cb = corbelChecks()[0]!;
    expect(cb.vu).toBeGreaterThan(0);
    expect(cb.rows.map((r) => r.clause)).toEqual(expect.arrayContaining(['16.5.2.4', '16.5.5.1']));
    saveEntry('openings', { id: 'o1', elementId: beamB, x: 2, lo: 0.4, ho: 0.15 });
    const op = openingChecks()[0]!;
    expect(op.mu).toBeGreaterThan(0);
    expect(op.rows.length).toBeGreaterThan(3);

    // The masonry wall: no material yet, then confined brick.
    let ms = masonryWallChecks();
    expect(ms).toHaveLength(1);
    expect(ms[0]!.status).toBe('notVerified');
    const el = { b: 0.18, h: 0.2, bars: 4, barDia: 10, fy: 420, tieDia: 6, sNormal: 0.2, sCritical: 0.1 };
    setMasonryChoice(ms[0]!.key, { kind: 'simple', unit: 'solidBrick', mortar: 'I', zone: 3, storiesAbove: 0, edges: 'threeOrMore', column: el, beam: el });
    ms = masonryWallChecks();
    expect(ms[0]!.forces!.vu).toBeGreaterThan(0);
    expect(ms[0]!.rows.map((r) => r.clause)).toEqual(expect.arrayContaining(['3.4.2']));

    // A masonry infill in the bay x = 6–10 on axis B, its struts in the model, solved again.
    const c1 = between(at(6, 5, 0), at(6, 5, 3)), c2 = between(at(10, 5, 0), at(10, 5, 3));
    saveEntry('infills', { id: 'i1', name: 'R1', columns: [c1, c2], beam: beamB, t: 0.18, em: 3600, strength: 3 });
    expect(infillChecks()[0]!.rows[0]!.status).toBe('notVerified');
    const before = modelStore.elements.size;
    expect(placeInfillStruts('i1')).toHaveLength(2);
    expect(placeInfillStruts('i1')).toHaveLength(2);
    expect(modelStore.elements.size).toBe(before + 2);
    solve();
    const inf = infillChecks()[0]!;
    expect(inf.strut!.width).toBeGreaterThan(0.1);
    expect(inf.demand).toBeGreaterThan(0);

    // Fire: concrete against the project's table.
    patchFire({ rMinutes: 60, concreteTable: [{ kind: 'beam', r: 60, bMin: 0.2, aMin: 0.03 }, { kind: 'column', r: 60, bMin: 0.25, aMin: 0.035 }] });
    const fire = fireChecks();
    const beamRows = fire.find((f) => f.elementId === beamB)!.rows;
    expect(beamRows.map((r) => r.titleKey)).toEqual(['check.fire.concreteWidth', 'check.fire.concreteAxis']);
    expect(fire.some((f) => f.family === 'concrete' && f.groupId !== undefined)).toBe(true);

    const all = [...cp, cb, op, ...ms, inf, ...fire].flatMap((c) => c.rows);
    expect(titled(all)).toEqual([]);
    const m = memoriaInput((k) => k, 'en');
    for (const p of ['cp-', 'cb-', 'op-', 'ms-', 'in-', 'fi-']) expect(m.elements.some((e) => e.id.startsWith(p)), p).toBe(true);
  });

  it('a tubular truss: its K joint found and checked, its members in fire; a timber connection', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const steel = modelStore.addMaterial({ name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 240, fu: 370 } as never);
    const chs = (D: number, t: number) => { const d = D - 2 * t, I = (Math.PI / 64) * (D ** 4 - d ** 4); return { name: `CHS ${D * 1000}×${t * 1000}`, a: (Math.PI / 4) * (D * D - d * d), iy: I, iz: I, j: 2 * I, h: D, b: D, t, tw: t, tf: t, shape: 'CHS' }; };
    const chord = modelStore.addSection(chs(0.1683, 0.008) as never), web = modelStore.addSection(chs(0.0603, 0.004) as never);
    const n = (x: number, z: number) => modelStore.addNode(x, 0, z);
    const b0 = n(0, 0), b1 = n(2, 0), b2 = n(4, 0), t0 = n(1, 1.2), t1 = n(3, 1.2);
    const member = (a: number, b: number, s: number) => { const id = modelStore.addElement(a, b, 'frame'); modelStore.updateElement(id, { materialId: steel, sectionId: s }); return id; };
    member(b0, b1, chord); member(b1, b2, chord); member(t0, t1, chord);
    member(b0, t0, web); member(t0, b1, web); member(b1, t1, web); member(t1, b2, web);
    modelStore.addSupport(b0, 'pinned'); modelStore.addSupport(b2, 'rollerX');
    // One top node loaded, so the middle panel carries shear and the K joint's branches work.
    modelStore.addNodalLoad3D(t0, 0, 0, -60, 0, 0, 0, 1);
    void t1;
    modelStore.addCombination('1.4D', [{ caseId: 1, factor: 1.4 }]);
    solve();

    const g = hssJointGeometry(b1)!;
    expect(g.joint).toBe('K');
    expect(g.branches.map((b) => Math.round(b.theta))).toEqual([50, 50]);
    saveEntry('hss', { id: 'h1', nodeId: b1, gap: 40 });
    const hj = hssJointChecks()[0]!;
    expect(hj.input!.branches.map((b) => Math.sign(b.P)).sort()).toEqual([-1, 1]);
    expect(hj.rows[0]!.titleKey).toBe('check.hss.limits');

    runSteelCheck();
    patchFire({ rMinutes: 30, steel: { exposure: 4 } });
    const fire = fireChecks().filter((f) => f.family === 'steel');
    expect(fire).toHaveLength(7);
    expect(fire[0]!.rows.map((r) => r.titleKey)).toEqual(['check.fire.utilization', 'check.fire.steelTemperature']);

    saveEntry('dowels', { id: 'd1', name: 'U1', D: 12.7, Fyb: 310, lm: 89, ls: 38, Fem: 31, Fes: 31, theta: 0, shear: 'single', n: 4, demand: 20 });
    const dw = dowelChecks()[0]!;
    expect(dw.rows[0]!.titleKey).toBe('check.dowel.lateral');
    expect(titled([...hj.rows, ...fire.flatMap((f) => f.rows), ...dw.rows])).toEqual([]);
  });
});
