/**
 * The CIRSOC 301 bolted joint against INTI-CIRSOC's published worked example.
 *
 * Source: G. Troglia, D. Troglia, J. Angulo Bocco, *Ejemplos de Aplicación del Reglamento
 * CIRSOC 301-2018*, INTI-CIRSOC, July 2018, Ejemplo 1 (Ej. 1-4 … 1-6): angle in tension,
 * Tu = 180 kN, three A325 5/8" (15,87 mm) bolts in a line, threads excluded, bearing type,
 * s = 85 mm, end distance 35 mm, angle leg and gusset t = 6,4 mm, Fu = 370 MPa.
 * Coverage table: `docs/verification/DESIGN_EXAMPLES.md`.
 */

import { describe, it, expect } from 'vitest';
import { designBoltedJoint, type BoltLayoutChoice } from '../bolted-joint';

const layout: BoltLayoutChoice = {
  diameterMm: 15.87, grade: 'A325', threads: 'excluded', count: 3, rows: 1,
  spacingMm: 85, edgeDistanceMm: 35, shearPlanes: 1, deformationConsidered: true,
};
const run = () => designBoltedJoint(layout, { thicknessMm: 6.4, fuMPa: 370 }, { shearKN: 180 });

function published(actual: number, printed: number, rel = 0.005): void {
  const err = Math.abs(actual - printed) / Math.abs(printed);
  expect(err, `stabileo ${actual}, published ${printed} (off by ${(err * 100).toFixed(3)} %)`)
    .toBeLessThanOrEqual(rel);
}

describe('INTI CIRSOC 301-2018, Ejemplo 1 — bolts in shear and bearing', () => {
  /** Printed: φ = 0,75, Fnv = 415 MPa (Tabla J.3.2), Ab = 1,98 cm²; Rd = 61,63 kN per bolt. */
  it('§J.3.6 bolt shear per bolt', () => {
    const r = run();
    expect(r.boltAreaCm2).toBeCloseTo(1.98, 2);
    published(r.checks.find((c) => c.id === 'boltShear')!.capacityKN! / 3, 61.63);
  });

  /**
   * Printed, end bolt: Rn = 1,2·(3,5 − 0,5·1,75)·0,64·370·0,1 = 74,6 kN < 2,4·d·t·Fu = 90,25 kN,
   * Rd = 55,95 kN (J.3-6a); interior bolts 67,69 kN; group Rd = 55,95 + 2·61,63 = 179,2 kN.
   *
   * DISCREPANCY (example): it takes a 17,5 mm hole for the 5/8" bolt — the AISC 11/16" hole,
   * carried over from the 2005 examples. CIRSOC 301-2018 Tabla J.3.3 is metric only (…, 14 → 16,
   * 16 → 18 mm, …) and has no row for a 15,87 mm bolt, so the 2018 text gives no hole and no
   * bearing strength for it. stabileo says exactly that — bearing `unavailable`,
   * `bolt.hole.notTabulated` — rather than inventing the AISC hole. The bearing formula itself is
   * covered by `bolted-joint.test.ts` on metric bolts.
   *
   * Also noted, not exercised here: the module gives every bolt the END bolt's clear distance
   * (conservative), whereas the example sums per-bolt minima with the interior bolts' larger Lc.
   */
  it('§J.3.10 bearing — the 2018 hole table has no row for a 5/8" bolt', () => {
    const bearing = run().checks.find((c) => c.id === 'bearing')!;
    expect(bearing.state).toBe('unavailable');
    expect(bearing.noteKeys).toContain('bolt.hole.notTabulated');
  });
});
