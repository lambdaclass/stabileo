/**
 * Design to foreign codes through the store: a concrete frame designed by EN 1992-1-1 with the
 * recommended values and with the UK National Annex (more steel for the same beam, αcc = 0,85),
 * and by ACI 318-19 on the CIRSOC 201-2025 design; a steel frame rated by EN 1993-1-1 with the
 * lightest passing profile of each member's series. The memoria carries the rows and the scope.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { verificationStore } from '../verification.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { FOREIGN_MATRIX, foreignRun, setForeignCodes } from '../foreign-design';
import { concreteCheckRows } from '../../engine/design/check-rows';
import { designEverything } from '../design-desk';
import { memoriaInput } from '../memoria-inputs';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';
import es from '../../i18n/locales/es';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';
import { stateSuiteLateral } from './suite-lateral';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [{ id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 6 }, { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 5 }],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3.5 }],
};
const solve = () => {
  const combo = modelStore.solveCombinations3D(true, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
};
const loadBeams = (q: number) => {
  for (const e of modelStore.elements.values()) {
    const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
    if (Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6) modelStore.addDistributedLoad3D(e.id, 0, 0, -q, -q, undefined, undefined, 1, { frame: 'global' });
  }
  modelStore.addCombination('1.4D', [{ caseId: 1, factor: 1.4 }]);
};
const titled = (keys: Array<string | undefined>) => keys.filter((k) => k && !(k in (es as Record<string, string>)));

describe('design to foreign codes', () => {
  it('a concrete frame by EN 1992-1-1 (recommended and UK) and ACI 318-19', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    // The reading of the beams' role in the lateral system this suite was written under (`suite-lateral.ts`).
    stateSuiteLateral();
    const mat = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.00213, iz: 0.00213, j: 0.0036, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.0054, iz: 0.00135, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
    placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: mat }, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } }, { fixBase: true });
    loadBeams(40);
    solve();

    const rec = foreignRun('ec2'), uk = foreignRun('ec2-uk');
    const beams = rec.members.filter((m) => m.kind === 'beam'), cols = rec.members.filter((m) => m.kind === 'column');
    expect(beams.length).toBe(4);
    expect(cols.length).toBe(4);
    expect(beams[0]!.rows[0]!.code).toBe('en-1992-1-1');
    expect(uk.members[0]!.rows[0]!.code).toBe('bs-en-1992-1-1');
    const area = (m: (typeof beams)[number]) => Number(m.data.find(([k]) => k === 'As,inf')![1].split(' ')[0]);
    expect(area(uk.members.find((m) => m.elementId === beams[0]!.elementId)!)).toBeGreaterThan(area(beams[0]!));
    expect(titled(rec.members.flatMap((m) => m.rows.map((r) => r.titleKey)))).toEqual([]);

    designEverything({ edited: 'keep', steel: true });
    const aci = foreignRun('aci318');
    expect(aci.members.length).toBeGreaterThan(0);
    expect(aci.members.every((m) => m.rows.every((r) => !r.code.startsWith('cirsoc')))).toBe(true);
    expect(aci.members[0]!.rows.some((r) => r.code === 'aci-318' && r.edition === '19')).toBe(true);
    // Each CIRSOC 201-2025 check carried to ACI 318-19 by its own clause, never by a new label alone:
    // flexure 22.3 with φ from Table 21.2.2, the beam's minimum steel 9.6.1.2, as CIRSOC states them.
    const aciRows = aci.members.flatMap((m) => m.rows);
    const cirsoc = [...verificationStore.contexts.keys()].flatMap((id) => concreteCheckRows(verificationStore.providedFor(id)!));
    const flex = aciRows.filter((r) => r.titleKey === 'check.rc.flexure');
    expect(flex.length).toBeGreaterThan(0);
    expect(flex.every((r) => r.clause === '22.3; 21.2.2')).toBe(true);
    expect(flex.map((r) => r.status)).toEqual(cirsoc.filter((r) => r.titleKey === 'check.rc.flexure').map((r) => r.status));
    // The reciprocal load method is not a clause of ACI 318-19: no equivalence, so not verified under it.
    const biaxial = aciRows.filter((r) => r.titleKey === 'check.rc.biaxial');
    expect(biaxial.length).toBeGreaterThan(0);
    expect(biaxial.every((r) => r.status === 'notVerified' && r.ratio === null && (r.derivation ?? []).some((l) => l.includes('no equivalence')))).toBe(true);

    setForeignCodes({ concrete: 'ec2-uk' });
    const m = memoriaInput((k) => k, 'en');
    expect(m.elements.filter((e) => e.id.startsWith('fx-ec2-uk-'))).toHaveLength(8);
    expect(m.scope.some((s) => s.code === 'bs-en-1992-1-1' && s.feature === 'fx.feat.torsion' && !s.offered)).toBe(true);
  });

  it('a steel frame by EN 1993-1-1: rated, with the lightest passing profile', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const steel = modelStore.addMaterial({ name: 'S275', e: 210000, nu: 0.3, rho: 78.5, fy: 275, fu: 430 } as never);
    const sec = (name: string) => { const p = profileByName(name)!; return modelStore.addSection({ ...profileToSectionFull(p), name: p.name, profileFamily: p.family } as never); };
    placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: sec('HEB 300'), materialId: steel }, beamsX: { sectionId: sec('IPE 600'), materialId: steel }, beamsY: { sectionId: sec('IPE 600'), materialId: steel } }, { fixBase: true });
    loadBeams(15);
    solve();
    const run = foreignRun('ec3');
    expect(run.members.length).toBeGreaterThan(0);
    // The IPE 600 beams carry a little compression and their web reads as class 4: out of scope.
    expect(run.skipped.every((x) => x.reasonKey === 'otherCodes.skip.ec3Class4')).toBe(true);
    /*
     * A HEB 300 column under this frame is far from its limit, and it carries compression with
     * bending. The engine's checker evaluates 6.3.3 with the Annex B factors (main; it used to sum
     * without them and leave 6.3.3 unevaluated), so the column is rated and the lightest HEB that
     * passes with nothing left out is proposed: the HEB 160 that was only a candidate before.
     */
    const column = run.members.find((m) => m.kind === 'column')!;
    expect(column.proposal).toBe('HEB 160');
    expect(column.rows[0]!.code).toBe('en-1993-1-1');
    expect(column.rows[0]!.status).toBe('ok');
    // The matrix and the memoria say the same: 6.3.3 in part (Cm at its upper bound), 6.2 in part, neither offered.
    expect(FOREIGN_MATRIX.ec3.rows.find((r) => r.clauses === '6.3.3')!.status).toBe('partial');
    expect(FOREIGN_MATRIX.ec3.rows.find((r) => r.clauses === '6.2')!.status).toBe('partial');
    setForeignCodes({ steel: 'ec3' });
    const scope = memoriaInput((k) => k, 'en').scope.filter((s) => s.code === 'en-1993-1-1');
    expect(scope.find((s) => s.clauses.includes('6.3.3'))!.offered).toBe(false);
    expect(scope.find((s) => s.clauses.includes('6.2'))!.offered).toBe(false);
  });

  it('AISC 360-10 reads the CIRSOC 301-2018 rows by AISC\'s own numbering', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const steel = modelStore.addMaterial({ name: 'S275', e: 210000, nu: 0.3, rho: 78.5, fy: 275, fu: 430 } as never);
    const sec = (name: string) => { const p = profileByName(name)!; return modelStore.addSection({ ...profileToSectionFull(p), name: p.name, profileFamily: p.family } as never); };
    placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: sec('HEB 300'), materialId: steel }, beamsX: { sectionId: sec('IPE 600'), materialId: steel }, beamsY: { sectionId: sec('IPE 600'), materialId: steel } }, { fixBase: true });
    loadBeams(15);
    solve();
    designEverything({ edited: 'keep', steel: true });
    const rows = foreignRun('aisc360').members.flatMap((m) => m.rows);
    // AISC 360-10 numbers weak-axis shear G7 (G6 is round HSS); strong-axis flexure of an I, compact or with
    // noncompact flanges as the CIRSOC checker classifies them, is F2 or F3.
    expect(rows.filter((r) => r.titleKey === 'check.steel.G.6').every((r) => r.clause === 'G7')).toBe(true);
    expect(rows.some((r) => r.titleKey === 'check.steel.G.6')).toBe(true);
    expect(rows.filter((r) => r.titleKey === 'check.steel.F.2').every((r) => r.clause === 'F2; F3')).toBe(true);
  });
});
