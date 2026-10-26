/**
 * EN 1993-1-1 on every combination at every station: a tuple that is no single force's peak governs.
 *
 * HEB 200 in S275 (fy 275 MPa), a 0,80 m cantilever column, fixed at its base, moments at its top:
 *   C1: My = 140 kN·m and 0,5 kN each way (the largest My, Vy, Vz: at the base My = 140,4, Mz = 0,4);
 *   C2: Mz = 67 kN·m (the largest Mz); C3: My = 124, Mz = 59 kN·m, the peak of nothing. Class 1 (flange c/t = (200 − 9 − 30)/2/15 = 5,37 ≤ 9ε = 8,32).
 * The checker's own resistances, by hand from the section (`steelProps`: Wpl,y = 642,604 cm³, Wpl,z =
 * 305,820 cm³, Iz = 2003 cm⁴, It = 58,10 cm⁴, Iw = 171,38 cm⁶·10³):
 *   Mcr = π²·E·Iz/L²·√(Iw/Iz + L²·G·It/(π²·E·Iz)) = 64,87 MN·m·√(8,556e-3 + 7,235e-4) = 6249 kN·m (C1 = 1);
 *   λ̄LT = √(Wpl,y·fy/Mcr) = √(176,716/6249) = 0,168 ≤ 0,2 → χLT = 1, Mb,Rd = 176,716 kN·m;
 *   Mc,z,Rd = 305,820·275/1000 = 84,101 kN·m.
 *   With no axial force the checker's 6.3.3 reads My,Ed/Mb,Rd + Mz,Ed/Mc,z,Rd:
 *   C1 at the base 140,4/176,716 + 0,4/84,101 = 0,7945 + 0,0048 = 0,799; C2 67/84,101 = 0,797;
 *   C3 124/176,716 + 59/84,101 = 0,7017 + 0,7015 = 1,403.
 * Read from the peaks alone (b0fa4094) the member passed at 0,799 and the HEB 200 was proposed.
 *
 * With main's engine the transverse load is taken on the top flange (zg = h/2, C2 = C1 = 1, SN003b
 * eq. (2)) because the app does not know where it acts (`other-codes/steel-codes.ts`):
 *   Mcr = π²·E·Iz/L²·[√(Iw/Iz + L²·G·It/(π²·E·Iz) + zg²) − zg] = 2520 kN·m, λ̄LT = 0,265,
 *   χLT = 0,9856, Mb,Rd = 174,170 kN·m.
 *   C1 140,4/174,170 + 0,4/84,101 = 0,811; C3 124/174,170 + 59/84,101 = 1,413 (kzy = 1 and
 *   kzz = Cmz without axial force, Table B.2, so Eq. 6.62 is the sum). The tuple still governs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { verificationStore } from '../verification.svelte';
import { foreignRun } from '../foreign-design';
import { activePerCombo3D, activeCombinations } from '../active-results';
import { memberContexts, runOtherCode } from '../../engine/design/other-codes';
import { EC3 } from '../../engine/design/other-codes/steel-codes';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

function column(name: string) {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  const steel = modelStore.addMaterial({ name: 'S275', e: 210000, nu: 0.3, rho: 78.5, fy: 275, fu: 430 } as never);
  const p = profileByName(name)!;
  const sec = modelStore.addSection({ ...profileToSectionFull(p), name: p.name, profileFamily: p.family } as never);
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 0.8);
  const el = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementMaterial(el, steel); modelStore.updateElementSection(el, sec);
  modelStore.addSupport(a, 'fixed3d');
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  // Global Mx is the member's Mz, global My its My. C1 also takes 0,5 kN each way at the top, so the
  // largest shears are C1's (with none, numerical noise of 1e-13 kN made C3 the "largest" Vy).
  [[0, 140, 0.5], [67, 0, 0], [59, 124, 0]].forEach(([mz, my, h], i) => {
    const id = modelStore.addLoadCase(`D${i + 1}`, 'D');
    modelStore.addNodalLoad3D(b, h!, -h!, 0, mz!, my!, 0, id);
    modelStore.addCombination(`C${i + 1}`, [{ caseId: id, factor: 1 }]);
  });
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
  const perCombo = activePerCombo3D();
  return memberContexts(modelStore.model as never, perCombo, activeCombinations().filter((c) => perCombo.has(c.id)))[0]!;
}

describe('EN 1993-1-1 on every combination at every station', () => {
  it('the peaks alone read 0,811; every tuple finds C3 at 1,413, with its combination and station', () => {
    const ctx = column('HEB 200');
    expect(ctx.demands.some((d) => d.comboName === 'C3')).toBe(false);
    const peaks = runOtherCode(EC3, [ctx]).rows[0]!;
    expect(peaks.status === 'checked' && [peaks.comboName, +peaks.reading.ratio.toFixed(3)]).toEqual(['C1', 0.811]);
    const all = runOtherCode(EC3, [ctx], { tuples: true }).rows[0]!;
    expect(all.status).toBe('checked');
    if (all.status !== 'checked') return;
    expect(all.reading.ratio).toBeCloseTo(1.413, 3);
    expect(all.reading.governing).toBe('otherCodes.gov.interaction');
    expect([all.comboName, all.comboId, all.stationT]).toEqual(['C3', ctx.tuples!.find((t) => t.comboName === 'C3')!.comboId, 0]);
    // A profile past 1 is not read further: the same verdict, with fewer tuples read.
    const early = runOtherCode(EC3, [ctx], { tuples: true, stopAbove: 1 }).rows[0]!;
    expect(early.status === 'checked' && early.reading.ratio > 1).toBe(true);
  });

  it('the design fails the HEB 200 and proposes a heavier HEB that carries C3', () => {
    column('HEB 200');
    const m = foreignRun('ec3').members[0]!;
    expect([m.rows[0]!.status, m.rows[0]!.combination, m.rows[0]!.ratio]).toEqual(['fail', 'C3', 1.413]);
    expect(m.proposal).toBeDefined();
    expect(m.proposal).not.toBe('HEB 200');
    const heavier = Number(m.proposal!.split(' ')[1]);
    expect(heavier).toBeGreaterThan(200);
    // The proposal carries every tuple: read on its own, its worst is under 1.
    column(m.proposal!);
    const again = foreignRun('ec3').members[0]!;
    expect(again.rows[0]!.ratio!).toBeLessThanOrEqual(1);
    expect(again.proposal).toBe(m.proposal);
  });
});
