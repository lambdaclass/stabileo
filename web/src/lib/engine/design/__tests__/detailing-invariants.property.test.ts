/**
 * Property test: whatever the candidate search certifies for a beam satisfies the code, checked
 * here independently of the verifier that certified it.
 *
 * Random fixed-ended beams (span, section, concrete, dead and live load) are solved by the
 * engine and designed by the bounded search. For every VERIFIED outcome the accepted
 * reinforcement must:
 *
 *   - resist the factored moments with the steel actually placed: engine φMn ≥ Mu in the span
 *     (bottom bars) and at both supports (top bars), the other face's bars as compression steel;
 *   - be ductile: εt ≥ εt,min (9.3.3.1);
 *   - resist the factored shear: engine φVn ≥ Vu, with the stirrups placed;
 *   - fit: every row's clear spacing ≥ max(25 mm, db) (25.2.1) inside bw − 2·(cover + stirrup),
 *     which is the cover respected;
 *   - space its stirrups within min(d/2, 600 mm) (Tabla 9.7.6.2.2, row 1).
 *
 * The numbers are recomputed from the geometry, not read back from the verdict.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { designMember } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { solveFixture } from './helpers';
import { evaluateBeamSection } from '../../codes/argentina/cirsoc201-beam-kernel';
import type { RebarLayer, StirrupDef } from '../../../store/model.svelte';

const AREA: Record<number, number> = { 6: 0.283, 8: 0.503, 10: 0.785, 12: 1.131, 16: 2.011, 20: 3.142, 25: 4.909, 32: 8.042 };

function beamFixture(p: { L: number; b: number; h: number; fc: number; D: number; Lq: number }) {
  return {
    name: 'prop-beam',
    materials: [{ id: 1, name: `H${p.fc}`, e: 4700 * Math.sqrt(p.fc), nu: 0.2, rho: 25, fy: p.fc }],
    sections: [{ id: 1, name: 'beam', a: p.b * p.h, iy: (p.b * p.h ** 3) / 12, iz: (p.h * p.b ** 3) / 12,
      j: 0.2 * p.b ** 3 * p.h, b: p.b, h: p.h, shape: 'rect' }],
    nodes: [{ id: 1, x: 0, y: 0, z: 3 }, { id: 2, x: p.L, y: 0, z: 3 }],
    elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    supports: [{ id: 1, nodeId: 1, type: 'fixed3d' }, { id: 2, nodeId: 2, type: 'fixed3d' }],
    loads: [
      { type: 'distributed3d', data: { id: 1, elementId: 1, qYI: 0, qYJ: 0, qZI: -p.D, qZJ: -p.D, caseId: 1 } },
      { type: 'distributed3d', data: { id: 2, elementId: 1, qYI: 0, qYJ: 0, qZI: -p.Lq, qZJ: -p.Lq, caseId: 2 } },
    ],
    plates: [], quads: [], constraints: [],
    loadCases: [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'L' }],
    combinations: [
      { id: 1, name: '1.4D', factors: [{ caseId: 1, factor: 1.4 }] },
      { id: 2, name: '1.2D+1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
    ],
  };
}

const area = (layers: RebarLayer[]) => layers.reduce((s, l) => s + l.count * AREA[l.diameter], 0); // cm²

/** Depth of the layers' centroid from their face, m, rows stacked at a 25 mm (or db) clear gap. */
function centroidFromFace(layers: RebarLayer[], cover: number, stirrup: number): number {
  let m = 0, a = 0;
  for (const l of layers) {
    const db = l.diameter / 1000;
    const y = cover + stirrup + db / 2 + l.row * (db + Math.max(0.025, db));
    m += l.count * AREA[l.diameter] * y; a += l.count * AREA[l.diameter];
  }
  return m / a;
}

describe('detailing invariants of certified beams', () => {
  it('every VERIFIED beam resists, is ductile, fits and spaces its stirrups within the code', () => {
    let verified = 0;
    fc.assert(fc.property(
      fc.record({
        L: fc.double({ min: 3, max: 8, noNaN: true }),
        b: fc.constantFrom(0.2, 0.25, 0.3, 0.35, 0.4),
        h: fc.constantFrom(0.4, 0.5, 0.6, 0.7, 0.8),
        fc: fc.constantFrom(20, 25, 30, 35),
        D: fc.double({ min: 5, max: 40, noNaN: true }),
        Lq: fc.double({ min: 0, max: 25, noNaN: true }),
      }),
      (p) => {
        const solved = solveFixture(beamFixture(p), { selfWeight: false });
        const ctx = solved.contexts.get(1);
        if (!ctx) return;
        const o = designMember(cirsoc201Adapter, ctx);
        if (o.outcome !== 'VERIFIED') return;
        verified++;
        const r = o.accepted!.regions!;
        const { cover, stirrupDia, fc: fcM, fy } = ctx.material;
        const st = stirrupDia / 1000;
        const b = ctx.axes.bFlex, h = ctx.axes.hFlex;
        const dem = new Map(ctx.demands!.demands.map((d) => [d.category, d.absValue]));
        const sag = dem.get(ctx.axes.sagCategory) ?? 0, hog = dem.get(ctx.axes.hogCategory) ?? 0;
        const bottom = r.bottomSpanLayers ?? (r.bottomSpan ? [{ ...r.bottomSpan, row: 0 }] : []);
        const tops = [r.topStartLayers ?? (r.topStart ? [{ ...r.topStart, row: 0 }] : []),
          r.topEndLayers ?? (r.topEnd ? [{ ...r.topEnd, row: 0 }] : [])];

        const flex = (tension: RebarLayer[], comp: RebarLayer[], Mu: number) => {
          if (Mu < 0.5) return;
          expect(tension.length, 'a moment with no bars').toBeGreaterThan(0);
          const d = h - centroidFromFace(tension, cover, st);
          const q = evaluateBeamSection({
            edition: '2025', fc: fcM * 1e6, fy: fy * 1e6, b, h, d, As: area(tension) * 1e-4,
            AsComp: comp.length ? area(comp) * 1e-4 : 0, dPrime: comp.length ? centroidFromFace(comp, cover, st) : 0,
          })!;
          expect(q.phiMn / 1e3, `φMn at d = ${d.toFixed(3)}`).toBeGreaterThanOrEqual(Mu * (1 - 1e-3));
          expect(q.epsilonT).toBeGreaterThanOrEqual(q.epsilonTMin * (1 - 1e-6));
        };
        flex(bottom, tops[0], sag);
        for (const t of tops) flex(t, bottom, hog);

        for (const layers of [bottom, ...tops]) for (const l of layers) {
          const db = l.diameter / 1000;
          const inside = b - 2 * (cover + st);
          const clear = l.count > 1 ? (inside - l.count * db) / (l.count - 1) : inside - db;
          expect(clear, `${l.count} Ø${l.diameter} in ${b} m`).toBeGreaterThanOrEqual(Math.max(0.025, db) - 1e-9);
        }

        const dShear = h - centroidFromFace(bottom.length ? bottom : tops[0], cover, st);
        const Vu = dem.get(ctx.axes.shear) ?? 0;
        for (const s of [r.stirrupsSupport, r.stirrupsSpan].filter(Boolean) as StirrupDef[]) {
          expect(s.spacing).toBeLessThanOrEqual(Math.min(dShear / 2, 0.6) + 1e-9);
        }
        const sup = r.stirrupsSupport ?? r.stirrupsSpan ?? o.accepted!.stirrups;
        if (Vu > 0.5) {
          expect(sup, 'shear with no stirrups').toBeTruthy();
          const v = evaluateBeamSection({
            edition: '2025', fc: fcM * 1e6, fy: fy * 1e6, b, h, d: dShear,
            As: area(bottom.length ? bottom : tops[0]) * 1e-4,
            Av: sup!.legs * AREA[sup!.diameter] * 1e-4, s: sup!.spacing, Ag: b * h,
          })!;
          expect(v.phiVn / 1e3).toBeGreaterThanOrEqual(Vu * (1 - 1e-3));
        }
      },
    ), { numRuns: 40, seed: 424242 });
    // The property says nothing if nothing was certified.
    expect(verified).toBeGreaterThan(10);
  }, 300_000);
});
