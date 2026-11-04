/**
 * EN 1992-1-1 through the store, on members whose answers are worked by hand from the code's
 * clauses (not from the functions under test).
 *
 * Common data: C30/37 with the recommended values, fcd = 30/1,5 = 20 MPa, η = 1, λ = 0,8,
 * εcu3 = 3,5 ‰; the project's reinforcing steel fyk = 420 MPa, fyd = 420/1,15 = 365,217 MPa,
 * εyd = 1,826 ‰; cover 25 mm, links Ø8 and Ø20 bars: d2 = 25 + 8 + 10 = 43 mm.
 *
 * Columns: when both layers yield (εs ≥ εyd at both faces) the steel forces cancel and the
 * neutral axis comes from NEd alone, x = NEd/(η·fcd·b·λ), with the window
 * d2/(1 − εyd/εcu3) ≤ x ≤ d/(1 + εyd/εcu3), i.e. 89,9 mm ≤ x ≤ 136,0 mm over a depth of 250 mm and
 * 89,9 mm ≤ x ≤ 366,0 mm over a depth of 600 mm. Then
 *   MRd = NEd·(h/2 − λx/2) + As·fyd·(h/2 − d2)     (As total, half on each face)
 * and the least As is (MEd − NEd·(h/2 − λx/2)) / (fyd·(h/2 − d2)).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { verificationStore } from '../verification.svelte';
import { foreignRun } from '../foreign-design';
import { modelStoreyStability } from '../storey-sway';
import { memoriaInput } from '../memoria-inputs';
import { setForeignCodes } from '../foreign-design';
import * as wasmSolver from '../../engine/wasm-solver';
import { memberContexts } from '../../engine/design/other-codes';
import { activePerCombo3D, activeCombinations } from '../active-results';
import { ec2ColumnDesign } from '../../engine/design/eurocode/ec2-column';
import { EC2_RECOMMENDED } from '../../engine/design/eurocode/ec2-params';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const reset = () => { modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro'; };
const solve = () => {
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
};
const clearLoads = () => {
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
};
const concrete = () => modelStore.addMaterial({ name: 'C30/37', e: 30000, nu: 0.2, rho: 25, fc: 30 } as never);
const rect = (b: number, h: number) => modelStore.addSection({ name: `${b * 100}×${h * 100}`, a: b * h, iy: (b * h ** 3) / 12, iz: (h * b ** 3) / 12, j: 0.003, b, h, shape: 'rect' } as never);
/** A cantilever column, fixed at its base; each combination is its own dead case at 1,0. Global Mx is the member's Mz, global My its My. */
function cantilever(o: { b: number; h: number; L: number; kStrong?: number; kWeak?: number; combos: Array<{ N: number; My?: number; Mz?: number }> }) {
  reset();
  const mat = concrete(), sec = rect(o.b, o.h);
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, o.L);
  const el = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementMaterial(el, mat); modelStore.updateElementSection(el, sec);
  modelStore.updateElement(el, { ...(o.kStrong !== undefined ? { kStrong: o.kStrong } : {}), ...(o.kWeak !== undefined ? { kWeak: o.kWeak } : {}) });
  modelStore.addSupport(a, 'fixed3d');
  clearLoads();
  o.combos.forEach((c, i) => {
    const id = modelStore.addLoadCase(`D${i + 1}`, 'D');
    modelStore.addNodalLoad3D(b, 0, 0, -c.N, c.Mz ?? 0, c.My ?? 0, 0, id);
    modelStore.addCombination(`C${i + 1}`, [{ caseId: id, factor: 1 }]);
  });
  solve();
  return el;
}
const col = (code: 'ec2' | 'ec2-uk' = 'ec2') => foreignRun(code).members.find((m) => m.kind === 'column')!;
const asOf = (m: { data: Array<[string, string]> }, k = 'As') => Number(m.data.find(([x]) => x === k)![1].split(' ')[0]);
const input = (m: { rows: Array<{ titleKey?: string; inputs: Array<{ symbol: string; value: number | string }> }> }, key: string, sym: string) =>
  Number(m.rows.find((r) => r.titleKey === key)!.inputs.find((i) => i.symbol === sym)!.value);

describe('EN 1992-1-1 columns from simultaneous forces, on the right axis', () => {
  it('a 25 × 60 column bending about its width (Mz) is designed over 250 mm', () => {
    // NEd = 1056 kN, x = 1056/(20000·0,6·0,8) = 0,110 m (in the window). Mz0 = 137,36 kN·m; l0 = kWeak·L =
    // 0,4·2,5 = 1,0 m, ei = l0/400 = 2,5 mm, MEd = 137,36 + 1056·0,0025 = 140,0 kN·m.
    // As = (140 − 1056·(0,125 − 0,044)) / (365 217·(0,125 − 0,043)) = 54,464/29 947,8 = 18,19 cm².
    cantilever({ b: 0.25, h: 0.6, L: 2.5, kWeak: 0.4, combos: [{ N: 1056, Mz: 137.36 }] });
    expect(asOf(col())).toBeCloseTo(18.186, 1);
  });

  it('the same member bending about its depth (My) is designed over 600 mm', () => {
    // NEd = 1000 kN, x = 1000/(20000·0,25·0,8) = 0,25 m. l0 = kStrong·L = 0,5·2,5 = 1,25 m, ei = 3,125 mm;
    // MEd = 296,875 + 3,125 = 300 kN·m. As = (300 − 1000·(0,3 − 0,1)) / (365 217·0,257) = 10,654 cm².
    cantilever({ b: 0.25, h: 0.6, L: 2.5, kStrong: 0.5, kWeak: 0.4, combos: [{ N: 1000, My: 296.875 }] });
    expect(asOf(col())).toBeCloseTo(10.654, 1);
  });

  it('designs each combination with its own axial force, never the largest N with the largest M', () => {
    // C1: N = 400, My0 = 200; C2: N = 1400, no moment. l0 = 0,5·3 = 1,5 m, ei = 3,75 mm.
    // C1 governs: MEd = 200 + 400·0,00375 = 201,5; x = 0,1 m; As = (201,5 − 400·0,26)/(365 217·0,257) = 10,388 cm².
    // (1400 kN with 201,5 kN·m would need none: 1400·(0,3 − 0,14) = 224 kN·m ≥ 201,5.)
    cantilever({ b: 0.25, h: 0.6, L: 3, kStrong: 0.5, kWeak: 0.3, combos: [{ N: 400, My: 200 }, { N: 1400 }] });
    expect(asOf(col())).toBeCloseTo(10.388, 1);
  });

  /*
   * Two combinations whose peaks are apart, in combination and in station. 25 × 60, L = 3 m, fixed base,
   * kStrong = 0,5 (l0 = 1,5 m, ei = 3,75 mm), C30/37, fyk 420, d2 = 43 mm.
   *   A: 1100 kN at the top and 100 kN/m along the column: N = 1400 kN at the base (x = 0), 1100 at the
   *      top, no moment.
   *   B: 400 kN, My = 200 kN·m at the top and a horizontal force that brings it to 100 kN·m at the base:
   *      the largest moment, 200 kN·m, at x = 3 m, with N = 400 kN.
   * Simultaneous (B at x = 3 m, end moments 100 and 200 of the same combination): MEd = 200 + 400·0,00375
   *   = 201,5 kN·m; x = 400/(20 000·0,25·0,8) = 0,100 m, both layers yield (0,0899 ≤ x ≤ 0,366);
   *   As = (201,5 − 400·(0,3 − 0,04))/(365 217·0,257) = 97,5/93 860,8 = 10,388 cm².
   * Peaks apart (1400 kN with 200 kN·m, cbb531a1's call): MEd = 200 + 1400·0,00375 = 205,25 kN·m;
   *   x = 0,350 m; 1400·(0,3 − 0,14) = 224 kN·m ≥ 205,25 → no steel for strength; As,min = 0,1·1400/365 217
   *   = 3,833 cm² (9.5.2(2)). 3,833 < 10,388: taking the peaks apart is on the unsafe side here, since
   *   compression below the balanced point raises the moment the section resists.
   */
  it('two combinations with the peaks apart: the design reads the pair that acts together', () => {
    reset();
    const mat = concrete(), sec = rect(0.25, 0.6);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    const el = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementMaterial(el, mat); modelStore.updateElementSection(el, sec);
    modelStore.updateElement(el, { kStrong: 0.5, kWeak: 0.3 });
    modelStore.addSupport(a, 'fixed3d');
    clearLoads();
    const A = modelStore.addLoadCase('A', 'D');
    modelStore.addNodalLoad3D(b, 0, 0, -1100, 0, 0, 0, A);
    modelStore.addDistributedLoad3D(el, 0, 0, -100, -100, undefined, undefined, A, { frame: 'global' });
    modelStore.addCombination('A', [{ caseId: A, factor: 1 }]);
    const B = modelStore.addLoadCase('B', 'D');
    modelStore.addNodalLoad3D(b, -100 / 3, 0, -400, 0, 200, 0, B);
    modelStore.addCombination('B', [{ caseId: B, factor: 1 }]);
    solve();
    // The peaks: the largest compression in A at the base, the largest moment in B at the top.
    const perCombo = activePerCombo3D();
    const ctx = memberContexts(modelStore.model as never, perCombo, activeCombinations().filter((c) => perCombo.has(c.id)))[0]!;
    const peak = (c: string) => ctx.demands.find((d) => d.category === c)!;
    expect([peak('N_compression').comboName, peak('N_compression').stationX]).toEqual(['A', 0]);
    expect(peak('N_compression').forces.n).toBeCloseTo(-1400, 6);
    expect([peak('My+').comboName, peak('My+').stationX]).toEqual(['B', 3]);
    expect(peak('My+').forces.n).toBeCloseTo(-400, 6);
    expect(peak('My+').forces.my).toBeCloseTo(200, 6);
    // The engine: B at x = 3 m, its own N with its own moments.
    const m = col();
    expect(asOf(m)).toBeCloseTo(10.388, 2);
    const row = m.rows.find((r) => r.titleKey === 'check.ec2.columnSection')!;
    expect([row.combination, row.location]).toEqual(['B', 'x = 3.00 m']);
    expect(input(m, 'check.ec2.columnSection', 'NEd')).toBeCloseTo(400, 6);
    expect(input(m, 'check.ec2.columnSection', 'MEd,y')).toBeCloseTo(201.5, 3);
    // The peaks taken apart, called the way cbb531a1 called it, ask for less than a third of that.
    const apart = ec2ColumnDesign({ b: 0.25, h: 0.6, cover: 0.025, linkDia: 8, barDia: 20, fck: 30, fyk: 420, NEd: 1400, M01: 200, M02: 200, l0: 1.5, params: EC2_RECOMMENDED, phiEf: 0 });
    expect(apart.as! * 1e4).toBeCloseTo(3.833, 3);
    expect(apart.as! * 1e4).toBeLessThan(asOf(m) / 2.5);
  });

  /*
   * A tuple that is no force's peak. Nodal loads at the top: C1 N = 1400 (the largest compression),
   * C2 N = 1000 with My = 210 (the largest moment), C3 N = 400 with My = 200. C3 is the peak of nothing,
   * and it governs: As = 10,388 cm² as above. C2 in plane y alone: MEd = 210 + 1000·0,00375 = 213,75,
   * x = 0,25 m, As = (213,75 − 1000·0,2)/93 860,8 = 1,465 cm²; with the imperfection in z instead,
   * MEd,z = 1000·0,02 = 20 kN·m, ez/ey = (20/0,25)/(210/0,6) = 0,229 > 0,2, so Eq. 5.39 holds it, and
   * (20/MRd,z)^a + (210/MRd,y)^a = 1 by strain compatibility at As = 4,510 cm² (a = 1,18, NEd/NRd = 0,316;
   * worked in a script by bisection, not by the code). C1 needs none.
   * Designed from the governing demands alone (b80d794f) the column took those 4,51 cm².
   */
  it('a combination that is no force\'s peak is designed too', () => {
    cantilever({ b: 0.25, h: 0.6, L: 3, kStrong: 0.5, kWeak: 0.3, combos: [{ N: 1400 }, { N: 1000, My: 210 }, { N: 400, My: 200 }] });
    const perCombo = activePerCombo3D();
    const ctx = memberContexts(modelStore.model as never, perCombo, activeCombinations().filter((c) => perCombo.has(c.id)))[0]!;
    expect(ctx.demands.some((d) => d.comboName === 'C3')).toBe(false);
    const m = col();
    expect(asOf(m)).toBeCloseTo(10.388, 2);
    expect(m.rows.find((r) => r.titleKey === 'check.ec2.columnSection')!.combination).toBe('C3');
  });

  it('a column in tension is designed with its tension, not as if N were zero', () => {
    // T = 200 kN, My = 30 kN·m over 600 mm (b = 0,25 m). Both layers yield in tension and the block
    // F = η·fcd·b·λx resists the moment: MRd = F·(h/2 − F/(2·η·fcd·b)) → F = 5000·(0,3 − √(0,09 − 60/5000))
    // = 103,58 kN, x = 25,9 mm ≤ d2·εcu3/(εcu3 + εyd) = 28,3 mm. As = (F + T)/fyd = 303,58/365 217 = 8,312 cm².
    cantilever({ b: 0.25, h: 0.6, L: 3, combos: [{ N: -200, My: 30 }] });
    expect(asOf(col())).toBeCloseTo(8.312, 1);
  });

  it('both moments together: 5.8.9(4) with the exponent a, on the bars the member holds', () => {
    // N = 1000, My0 = 150, Mz0 = 60; l0y = 0,5·3 = 1,5 m (ei 3,75 mm), l0z = 0,3·3 = 0,9 m (ei 2,25 mm).
    // 4 Ø20 at the corners: each face of either axis holds 2 Ø20 = 6,283 cm².
    // MRdy = 1000·(0,3 − 0,1) + 6,283e-4·365 217·0,514 = 317,95; MRdz = 1000·(0,125 − 0,0417) + 229,47·0,164 = 120,97.
    // NRd = 0,15·20 000 + 12,566e-4·365 217 = 3458,9; NEd/NRd = 0,2891 → a = 1 + (0,2891 − 0,1)/0,6·0,5 = 1,1576.
    // 5.38b: (150/0,6)/(60/0,25) = 1,04 → neither ≤ 0,2 nor ≥ 5, so Eq. 5.39. The imperfection in one direction
    // at a time (5.8.9(2)): (60/120,97)^a + (153,75/317,95)^a = 0,8754 and (62,25/120,97)^a + (150/317,95)^a = 0,8826.
    const el = cantilever({ b: 0.25, h: 0.6, L: 3, kStrong: 0.5, kWeak: 0.3, combos: [{ N: 1000, My: 150, Mz: 60 }] });
    modelStore.reinforcementTransaction((api) => api.setReinforcement(el, { column: { cornerDia: 20, faceDia: 20, nBottom: 0, nTop: 0, nLeft: 0, nRight: 0 }, stirrups: { diameter: 8, legs: 2, spacing: 0.15 } }));
    const m = col();
    const provided = m.rows.find((r) => r.titleKey === 'check.ec2.barsProvided')!;
    expect(provided.ratio).toBeCloseTo(0.8826, 2);
    // The steel it designs reaches 5.39 = 1 with half of As on each face of either axis: As = 8,605 cm²
    // (bisection of the same closed forms, done by hand in a script, not by the code).
    expect(asOf(m)).toBeCloseTo(8.605, 1);
    const design = m.rows.find((r) => r.titleKey === 'check.ec2.columnSection')!;
    expect(design.derivation!.some((l) => l.includes('Eq. 5.39'))).toBe(true);
    // At the steel it designs Eq. 5.39 reads 1: that is the design, not a separate check that could read as passing.
    expect(input(m, 'check.ec2.columnSection', 'a')).toBeGreaterThan(1);
  });
});

describe('EN 1992-1-1 beams on the right axis, with the shear that acts with each moment', () => {
  it('a beam bent sideways (Mz) is designed over its width', () => {
    // 25 × 60 simply supported over 6 m under 20 kN/m along global Y: Mz = 20·6²/8 = 90 kN·m over a depth of
    // 250 mm and a width of 600 mm, d = 0,207 m. 9600·x·(0,207 − 0,4·x) = 90 → x = 64,70 mm (≤ 0,45·d),
    // z = 0,207 − 0,4·0,0647 = 0,18112 m, As = 90/(365 217·0,18112) = 13,606 cm².
    reset();
    const mat = concrete(), sec = rect(0.25, 0.6);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const el = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementMaterial(el, mat); modelStore.updateElementSection(el, sec);
    modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
    clearLoads();
    const d = modelStore.addLoadCase('D', 'D');
    modelStore.addDistributedLoad3D(el, -20, -20, 0, 0, undefined, undefined, d, { frame: 'global' });
    modelStore.addCombination('1.0D', [{ caseId: d, factor: 1 }]);
    solve();
    const m = foreignRun('ec2').members.find((x) => x.elementId === el)!;
    expect(Math.max(asOf(m, 'As,inf'), asOf(m, 'As,sup'))).toBeCloseTo(13.606, 1);
  });

  it('VRd,c at the support reads the top steel the hogging moment there needs', () => {
    // 30 × 60 fixed at both ends, 6 m, 40 kN/m: M = 120 kN·m at the supports with V = 120 kN, 60 kN·m at mid-span.
    // Top: 1200·x·(0,557 − 0,4x)·10 … As = 6,209 cm²; ρl = 6,209/(30·55,7) = 0,003716, k = 1 + √(200/557) = 1,5992,
    // VRd,c = 0,12·1,5992·(100·0,003716·30)^(1/3)·0,3·0,557 = 71,64 kN (the bottom steel would give vmin: 64,78 kN).
    reset();
    const mat = concrete(), sec = rect(0.3, 0.6);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const el = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementMaterial(el, mat); modelStore.updateElementSection(el, sec);
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    clearLoads();
    const d = modelStore.addLoadCase('D', 'D');
    modelStore.addDistributedLoad3D(el, 0, 0, -40, -40, undefined, undefined, d, { frame: 'global' });
    modelStore.addCombination('1.0D', [{ caseId: d, factor: 1 }]);
    solve();
    const m = foreignRun('ec2').members.find((x) => x.elementId === el)!;
    expect(input(m, 'check.ec2.shearMax', 'VRd,c')).toBeCloseTo(71.64, 0);
  });

  it('a beam with axial force says it was not evaluated, instead of passing in pure bending', () => {
    // 30 × 60 simply supported, 6 m, 20 kN/m and 540 kN of compression = 0,15·fcd·Ac > 0,1·fcd·Ac = 360 kN.
    reset();
    const mat = concrete(), sec = rect(0.3, 0.6);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const el = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementMaterial(el, mat); modelStore.updateElementSection(el, sec);
    modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
    modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
    clearLoads();
    const d = modelStore.addLoadCase('D', 'D');
    modelStore.addDistributedLoad3D(el, 0, 0, -20, -20, undefined, undefined, d, { frame: 'global' });
    modelStore.addNodalLoad3D(b, -540, 0, 0, 0, 0, 0, d);
    modelStore.addCombination('1.0D', [{ caseId: d, factor: 1 }]);
    solve();
    const m = foreignRun('ec2').members.find((x) => x.elementId === el)!;
    const row = m.rows.find((r) => r.titleKey === 'check.ec2.axialNotEvaluated');
    expect(row?.status).toBe('notVerified');
    expect(m.status).toBe('notVerified');
  });
});

describe('EN 1992-1-1: what is left out is said', () => {
  it('walls, sections it cannot read and materials without f\'c are listed, and reach the memoria', () => {
    reset();
    const mat = concrete();
    const bare = modelStore.addMaterial({ name: 'sin resistencia', e: 30000, nu: 0.2, rho: 25 } as never);
    const sq = rect(0.4, 0.4), wall = rect(0.2, 1.2);
    const circle = modelStore.addSection({ name: 'Ø40', a: 0.1257, iy: 0.00126, iz: 0.00126, j: 0.0025, b: 0.4, h: 0.4, shape: 'circle' } as never);
    const ids: number[] = [];
    for (const [i, [s, m]] of ([[sq, mat], [wall, mat], [circle, mat], [sq, bare]] as const).entries()) {
      const a = modelStore.addNode(4 * i, 0, 0), b = modelStore.addNode(4 * i, 0, 3);
      const el = modelStore.addElement(a, b, 'frame');
      modelStore.updateElementMaterial(el, m); modelStore.updateElementSection(el, s);
      modelStore.addSupport(a, 'fixed3d');
      ids.push(el);
    }
    clearLoads();
    const d = modelStore.addLoadCase('D', 'D');
    for (const el of ids) modelStore.addNodalLoad3D(modelStore.elements.get(el)!.nodeJ, 0, 0, -300, 0, 20, 0, d);
    modelStore.addCombination('1.0D', [{ caseId: d, factor: 1 }]);
    solve();
    const run = foreignRun('ec2');
    const reason = (id: number) => run.skipped.find((s) => s.elementId === id)?.reasonKey;
    // EN 1992-1-1 9.6.1(1): a vertical member longer in plan than 4 times its thickness is a wall (1,2/0,2 = 6).
    expect(reason(ids[1]!)).toBe('otherCodes.skip.ec2Wall');
    expect(reason(ids[2]!)).toBe('otherCodes.skip.notRectangular');
    expect(reason(ids[3]!)).toBe('otherCodes.skip.noFc');
    expect(run.members.map((m) => m.elementId)).toEqual([ids[0]]);
    setForeignCodes({ concrete: 'ec2' });
    const memo = memoriaInput((k) => k, 'en');
    const listed = memo.elements.filter((e) => e.id.startsWith('fx-ec2-'));
    expect(listed.map((e) => e.id).sort()).toEqual(ids.map((id) => `fx-ec2-${id}`).sort());
    for (const id of ids.slice(1)) expect(listed.find((e) => e.id === `fx-ec2-${id}`)!.rows.every((r) => r.status === 'notVerified')).toBe(true);
  });

  it('no row reads as passing when nothing was compared', () => {
    cantilever({ b: 0.4, h: 0.4, L: 6, combos: [{ N: 1200, My: 60 }] });
    const rows = col().rows;
    expect(rows.filter((r) => r.ratio === null && r.status === 'ok').map((r) => r.titleKey)).toEqual([]);
  });
});

describe('EN 1992-1-1: sway and creep from the model', () => {
  it('a storey whose second-order effects pass 10 % of the first-order ones is unbraced (5.8.2(6))', () => {
    // Q = ΣP·Δ/(V·lc) is the storey's second-order to first-order ratio before amplification; its effects
    // reach 10 % of the first-order ones when Q/(1 − Q) ≥ 0,1, i.e. Q ≥ 1/11.
    reset();
    const mat = concrete(), c = rect(0.25, 0.25), bm = rect(0.3, 0.6);
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(6, 0, 0), modelStore.addNode(0, 0, 5), modelStore.addNode(6, 0, 5)];
    const c1 = modelStore.addElement(n[0]!, n[2]!, 'frame'), c2 = modelStore.addElement(n[1]!, n[3]!, 'frame'), beam = modelStore.addElement(n[2]!, n[3]!, 'frame');
    for (const e of [c1, c2, beam]) modelStore.updateElementMaterial(e, mat);
    modelStore.updateElementSection(c1, c); modelStore.updateElementSection(c2, c); modelStore.updateElementSection(beam, bm);
    modelStore.addSupport(n[0]!, 'fixed3d'); modelStore.addSupport(n[1]!, 'fixed3d');
    clearLoads();
    const d = modelStore.addLoadCase('D', 'D');
    modelStore.addNodalLoad3D(n[2]!, 50, 0, -600, 0, 0, 0, d); modelStore.addNodalLoad3D(n[3]!, 0, 0, -600, 0, 0, 0, d);
    modelStore.addCombination('1.0D', [{ caseId: d, factor: 1 }]);
    solve();
    const Q = Math.max(...modelStoreyStability([c1, c2]).map((s) => s.Q));
    expect(Q).toBeGreaterThan(1 / 11);
    const m = foreignRun('ec2').members.find((x) => x.elementId === c1)!;
    const text = m.rows.flatMap((r) => r.derivation ?? []).join(' | ');
    expect(text).toContain('unbraced');
    expect(text).toContain(`Q = ${Q.toFixed(3)}`);
  });

  it('φef = φ(∞,t0)·M0Eqp/M0Ed, the same φef in Kφ and in λlim\'s A', () => {
    // 40 × 40 columns, h0 = 2·Ac/u = 200 mm, C30/37 (fcm = 38 > 35), RH = 50 %, t0 = 28 days (Annex B):
    // α1 = (35/38)^0,7, α2 = (35/38)^0,2, φRH = [1 + 0,5/(0,1·200^(1/3))·α1]·α2 = 1,7778, β(fcm) = 16,8/√38,
    // β(t0) = 1/(0,1 + 28^0,2) → φ(∞,t0) = 2,3664. The beams carry dead load only and the largest factor on it
    // is 1,4, so M0Eqp/M0Ed = 1/1,4 and φef = 1,6903.
    reset();
    const mat = concrete(), c = rect(0.4, 0.4), bm = rect(0.3, 0.6);
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(6, 0, 0), modelStore.addNode(0, 0, 3.5), modelStore.addNode(6, 0, 3.5)];
    const c1 = modelStore.addElement(n[0]!, n[2]!, 'frame'), c2 = modelStore.addElement(n[1]!, n[3]!, 'frame'), beam = modelStore.addElement(n[2]!, n[3]!, 'frame');
    for (const e of [c1, c2, beam]) modelStore.updateElementMaterial(e, mat);
    modelStore.updateElementSection(c1, c); modelStore.updateElementSection(c2, c); modelStore.updateElementSection(beam, bm);
    modelStore.addSupport(n[0]!, 'fixed3d'); modelStore.addSupport(n[1]!, 'fixed3d');
    clearLoads();
    const d = modelStore.addLoadCase('D', 'D');
    modelStore.addDistributedLoad3D(beam, 0, 0, -40, -40, undefined, undefined, d, { frame: 'global' });
    modelStore.addCombination('1.4D', [{ caseId: d, factor: 1.4 }]);
    modelStore.addCombination('1.2D', [{ caseId: d, factor: 1.2 }]);
    solve();
    const m = foreignRun('ec2').members.find((x) => x.elementId === c1)!;
    expect(input(m, 'check.ec2.columnSection', 'φ(∞,t0)')).toBeCloseTo(2.3664, 3);
    expect(input(m, 'check.ec2.columnSection', 'φef,y')).toBeCloseTo(1.6903, 3);
  });
});
