/**
 * EN 1993-1-1 6.3.3 under compression and bending: the checker sums NEd/Nb,Rd + My,Ed/Mb,Rd + Mz,Ed/Mc,z,Rd
 * without the interaction factors of Annex B, so that sum is no check of 6.3.3 and the row says so: not
 * verified, with no ratio. A part evaluated as its clause writes it (6.3.1, 6.3.2, 6.2.5, 6.2.6) that passes
 * 1 fails the member by itself. (The EN 1993-1-1 text is not in docs/codes; the clauses are cited as published.)
 *
 * HEB 200, S275 (fy 275 MPa, E 210 000 MPa, G = E/2,6), a 6,00 m cantilever column with NEd and a moment My at
 * its top, so My is uniform (ψ = 1). Buckling lengths as stated on the member: lcr,y = 1·6,00 m, lcr,z = (1/6)·6,00
 * = 1,00 m; Lb = 6,00 m. Section, as the checker reads it: A = 78,1 cm², Iy = 5696 cm⁴, Iz = 2003 cm⁴, It = 58,10 cm⁴,
 * Iw = 171,38·10³ cm⁶, Wpl,y = 642,604 cm³ (Class 1). Curves (Tabla 6.2, h/b = 1 ≤ 1,2, tf ≤ 100): y b (α 0,34),
 * z c (α 0,49); LTB (Tabla 6.4, rolled I, h/b ≤ 2): a (α 0,21), 6.3.2.2 with λ̄LT,0 = 0,2.
 *   Ncr,y = π²·E·Iy/6² = 3279,3 kN, λ̄y = √(2147,8/3279,3) = 0,8093, χy = 0,7187;
 *   Ncr,z = π²·E·Iz/1² = 41 514 kN, λ̄z = 0,2275, χz = 0,9860; Nb,Rd = 0,7187·2147,8 = 1543,6 kN;
 *   Mcr (C1 = 1) = π²·E·Iz/Lb²·√(Iw/Iz + Lb²·G·It/(π²·E·Iz)) = 255,92 kN·m, λ̄LT = √(176,716/255,92) = 0,8310,
 *   χLT = 0,7775, Mb,Rd = 137,402 kN·m.
 *
 * Case 1, NEd = 600 kN, My,Ed = 70 kN·m: the checker's sum 600/1543,6 + 70/137,402 = 0,3887 + 0,5095 = 0,898.
 *   Annex B, Table B.2 (Class 1, susceptible to torsional deformation), Table B.3 Cmy = 0,6 + 0,4·ψ = 1,0:
 *   ny = NEd/(χy·NRk) = 600/(0,7187·2147,8) = 0,3887; kyy = Cmy·(1 + (λ̄y − 0,2)·ny) = 1,2368 ≤ Cmy·(1 + 0,8·ny) = 1,311;
 *   Eq. 6.61: 0,3887 + 1,2368·0,5095 = 1,019 > 1. The sum reads 0,898 where 6.3.3 fails.
 *   Every part evaluated as written passes (6.3.1: 0,389; 6.3.2: 0,509): not verified, no ratio.
 * Case 2, NEd = 600 kN, My,Ed = 140 kN·m: 6.3.2 alone reads 140/137,402 = 1,019 > 1: fails, by 6.3.2.
 *
 * ── With main's engine (the checker these cases were written for is gone) ──
 * The engine's EN 1993-1-1 checker now evaluates 6.3.3 itself, with the Annex B factors, and,
 * since the app does not know where a transverse load acts, takes it on the top flange (zg = h/2,
 * C2 = C1 = 1, SN003b eq. (2); `other-codes/steel-codes.ts`), the lowest Mcr:
 *   Mcr = C1·π²·E·Iz/Lb²·[√(Iw/Iz + Lb²·G·It/(π²·E·Iz) + (C2·zg)²) − C2·zg] = 165,38 kN·m, λ̄LT = 1,0337,
 *   χLT = 0,6420, Mb,Rd = 113,45 kN·m.
 * Case 1: 6.3.1 0,3887; 6.3.2 70/113,45 = 0,617; Eq. 6.61 0,3887 + 1,2368·0,617 = 1,152: fails, by 6.3.3.
 * Case 2: 6.3.2 140/113,45 = 1,234; Eq. 6.61 0,3887 + 1,2368·1,234 = 1,915: fails, by 6.3.3.
 * The top-flange default reads an end moment (no transverse load, C2·zg = 0 by SN003b) on the
 * conservative side; it is the engine's and is kept.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { verificationStore } from '../verification.svelte';
import { foreignRun } from '../foreign-design';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';
import * as wasmSolver from '../../engine/wasm-solver';
import { memberContexts, runOtherCode } from '../../engine/design/other-codes';
import { EC3 } from '../../engine/design/other-codes/steel-codes';
import { activePerCombo3D, activeCombinations } from '../active-results';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

function column(N: number, My: number, k: { strong: number; weak: number } = { strong: 1, weak: 1 / 6 }) {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  const steel = modelStore.addMaterial({ name: 'S275', e: 210000, nu: 0.3, rho: 78.5, fy: 275, fu: 430 } as never);
  const p = profileByName('HEB 200')!;
  const sec = modelStore.addSection({ ...profileToSectionFull(p), name: p.name, profileFamily: p.family } as never);
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 6);
  const el = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementMaterial(el, steel); modelStore.updateElementSection(el, sec);
  modelStore.updateElement(el, { kStrong: k.strong, kWeak: k.weak });
  modelStore.addSupport(a, 'fixed3d');
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  const id = modelStore.addLoadCase('D', 'D');
  modelStore.addNodalLoad3D(b, 0, 0, -N, 0, My, 0, id);
  modelStore.addCombination('C1', [{ caseId: id, factor: 1 }]);
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
  return foreignRun('ec3').members[0]!;
}

describe('EN 1993-1-1 6.3.3 without the Annex B factors', () => {
  it('Eq. 6.61 with the Annex B factors, in the engine: case 1 fails by 6.3.3 (1,152)', () => {
    const m = column(600, 70);
    // The checker's own numbers, against the hand values above.
    const pc = activePerCombo3D();
    const rd = runOtherCode(EC3, memberContexts(modelStore.model as never, pc, activeCombinations().filter((c) => pc.has(c.id))), { tuples: true }).rows[0]!;
    if (rd.status !== 'checked') throw new Error('not checked');
    const part = (k: string) => rd.reading.parts!.find((x) => x.kind === k)!.ratio;
    expect(part('compression')).toBeCloseTo(0.3887, 3);
    expect(part('flexureStrong')).toBeCloseTo(70 / 113.454, 3);
    expect(part('interaction')).toBeCloseTo(0.3887 + 1.2368 * (70 / 113.454), 3);
    expect(rd.reading.unevaluated).toEqual([]);
    expect(rd.reading.ratio).toBeCloseTo(1.152, 3);
    expect(rd.reading.accredited!.ratio).toBeCloseTo(1.152, 3);
    const row = m.rows[0]!;
    expect([row.status, row.clause]).toEqual(['fail', '6.3.3']);
    expect(row.ratio).toBeCloseTo(1.152, 3);
    // A failing member gets a heavier profile proposed.
    expect(m.proposal).toBeDefined();
  });

  it('case 2: 6.3.2 past 1 (1,234), and Eq. 6.61 above it governs (1,915)', () => {
    const row = column(600, 140).rows[0]!;
    expect([row.status, row.clause, row.titleKey]).toEqual(['fail', '6.3.3', 'otherCodes.gov.interaction']);
    expect(row.ratio).toBeCloseTo(0.3887 + 1.2368 * (140 / 113.454), 2);
  });

  /*
   * 6.3.1.4, torsional buckling, which the checker leaves out: the same column with lcr,y = 0,3·6 = 1,80 m and
   * lcr,z = 1,00 m, axial load only, NEd = 1800 kN.
   *   Flexural: Ncr,y = π²·E·Iy/1,8² = 36 437 kN, λ̄y = 0,2428, χy = 0,9848; λ̄z = 0,2275, χz = 0,9860;
   *   Nb,Rd = 0,9848·2147,8 = 2115,1 kN → 1800/2115,1 = 0,851.
   *   Torsional (lT = 6,00 m, ends held against twist): i0² = (Iy + Iz)/A = 9,858e-3 m²; G·It = 46 928 N·m²,
   *   π²·E·Iw/lT² = 9 866,9 N·m²; Ncr,T = (46 928 + 9 866,9)/9,858e-3 = 5761,4 kN; λ̄T = √(2147,8/5761,4) = 0,6106;
   *   χT (curve c) = 0,7791; Nb,T,Rd = 1673,3 kN → 1800/1673,3 = 1,076 > 1: fails by 6.3.1.4.
   */
  it('torsional buckling, 6.3.1.4, governs a short-braced HEB 200', () => {
    const row = column(1800, 0, { strong: 0.3, weak: 1 / 6 }).rows[0]!;
    expect([row.status, row.clause, row.titleKey]).toEqual(['fail', '6.3.1.4', 'otherCodes.gov.compression']);
    expect(row.ratio).toBeCloseTo(1.076, 3);
  });
});
