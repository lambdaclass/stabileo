/**
 * Every catalogue profile: tabulated properties against the same profile computed from its
 * dimensions by the section engine.
 *
 * The outline is built from h, b, tw, tf (or t) and the root/toe radii alone; A, Iy and Iz are
 * then integrated exactly over that polygon, and J solved by Saint-Venant on its mesh. None of
 * the tabulated properties enters the construction, so agreement is evidence both that the row
 * was transcribed correctly and that the outline is the profile. Where they disagree the
 * reason is stated per family (fillet radii not published, nominal dimensions, table
 * rounding) and bounded, so a transcription slip — a digit, a column shift — still fails.
 *
 * External cross-checks of the same rows against the producers' tables (ArcelorMittal Orange
 * Book, AISC Shapes Database v16.0) are recorded in docs/verification/SECTIONS_CONNECTIONS.md.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, analyzeSectionTorsion } from '../../engine/wasm-solver';
import { ALL_PROFILES } from '../../data/steel-profiles';
import { resolveCanonicalSection, isGeometryBacked } from '../canonical';
import type { Section } from '../../store/model.svelte';

beforeAll(async () => { await initSolver(); }, 60_000);

type P = (typeof ALL_PROFILES)[number];
const sec = (p: P) => ({ id: 1, name: p.name, a: p.a * 1e-4, iy: p.iy * 1e-8, iz: p.iz * 1e-8 }) as Section;

/**
 * Largest admissible |computed/tabulated − 1| per family, A / I.
 *
 *   EN (IPE, HE, IPN, UPN, L): exact producer dimensions and radii — table rounding only.
 *   W, HP, M, C: the IRAM tables mark hw and r as nominal and derive A from the nominal mass,
 *     so dimensions and properties disagree by design (declared per profile in iram-wf.ts).
 *   L/T (IRAM): small sections, A printed to 3 figures; iy/iz are integrated, not transcribed.
 *   RHS/SHS/CHS: R = 2t exact; CHS small diameters carry two-decimal areas.
 */
const BOUND: Record<string, [number, number]> = {
  IPE: [0.006, 0.006], HEA: [0.006, 0.006], HEB: [0.006, 0.006], HEM: [0.006, 0.006],
  IPN: [0.006, 0.006], UPN: [0.006, 0.006],
  W: [0.04, 0.06], HP: [0.015, 0.015], M: [0.025, 0.025], C: [0.07, 0.07],
  L: [0.03, 0.03], T: [0.02, 0.02],
  RHS: [0.006, 0.01], SHS: [0.006, 0.006], CHS: [0.012, 0.03],
};

describe('tabulated A, Iy, Iz against the outline built from the dimensions', () => {
  it('every geometry-backed profile lands inside its family bound', () => {
    const fails: string[] = [];
    const worst = new Map<string, [number, number, string]>();
    let n = 0;
    for (const p of ALL_PROFILES) {
      const r = resolveCanonicalSection(sec(p));
      if (!isGeometryBacked(r)) continue;
      n++;
      const pr = r.properties;
      const dA = pr.a * 1e4 / p.a - 1;
      const dI = Math.max(Math.abs(pr.iy * 1e8 / p.iy - 1), Math.abs(pr.iz * 1e8 / p.iz - 1));
      const [bA, bI] = BOUND[p.family] ?? [0, 0];
      if (Math.abs(dA) > bA || dI > bI) {
        fails.push(`${p.name}: A ${(dA * 100).toFixed(2)}%, I ${(dI * 100).toFixed(2)}% (bound ${bA * 100}/${bI * 100}%)`);
      }
      const w = worst.get(p.family) ?? [0, 0, ''];
      worst.set(p.family, [Math.max(w[0], Math.abs(dA)), Math.max(w[1], dI), dI > w[1] ? p.name : w[2]]);
    }
    if (process.env.SECTIONS_REPORT) {
      for (const [f, [a, i, who]] of worst) console.log(`${f}: max |dA| ${(a * 100).toFixed(2)}%, max |dI| ${(i * 100).toFixed(2)}% (${who})`);
    }
    expect(n).toBeGreaterThan(600);
    expect(fails).toEqual([]);
  });
});

describe('tabulated J against Saint-Venant on the same outline', () => {
  /*
   * The FE J is a strict lower bound (P1 Prandtl), within ~3 % of an independent quadratic
   * solve on these thicknesses. The tabulated J of the producers is itself an approximate
   * formula (open sections: Σ b t³/3 plus fillet terms; tubes: thin-wall Bredt), so the two
   * agree to a few percent, not to rounding.
   */
  it('HEM, unequal angles and IRAM tubes agree within the formula spread', () => {
    const fails: string[] = [];
    const worst = new Map<string, [number, string]>();
    for (const p of ALL_PROFILES) {
      if (p.j == null) continue;
      const r = resolveCanonicalSection(sec(p));
      if (!isGeometryBacked(r)) continue;
      const j = analyzeSectionTorsion({ geometry: r.geometry }).j * 1e8;
      const d = j / p.j - 1;
      // Tubes' J is printed to two decimals: half a unit (0,005 cm⁴) is 4 % of a 12.7x0.9 tube's
      // 0,12, on top of the ~2 % the mesh sits below the exact annulus at that size.
      const bound = Math.max(p.family === 'CHS' ? 0.03 : 0.08, 0.005 / p.j + 0.02);
      if (Math.abs(d) > bound) fails.push(`${p.name}: FE ${j.toFixed(3)} vs tabulated ${p.j} (${(d * 100).toFixed(2)}%)`);
      const w = worst.get(p.family) ?? [0, ''];
      if (Math.abs(d) > Math.abs(w[0])) worst.set(p.family, [d, p.name]);
    }
    if (process.env.SECTIONS_REPORT) {
      for (const [f, [d, who]] of worst) console.log(`J ${f}: worst ${(d * 100).toFixed(2)}% (${who})`);
      console.log(fails.join('\n'));
    }
    expect(fails).toEqual([]);
  }, 600_000);
});
