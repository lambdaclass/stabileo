/**
 * CIRSOC 201-2025 §9.6.3.1 on beams deeper than 250 mm, in the provided-reinforcement verifier.
 *
 * «Debe colocarse un área mínima de armadura para corte, Av,min, en todas las secciones donde
 * Vu > φ·0,085·√f'c·bw·d» (2005 §11.5.6.1: Vu > φVc/2), Av,min of §9.6.3.4. The verifier, whose
 * result is the member's verdict, did not read Av,min at all: a beam below it read ok.
 */
import { describe, expect, it } from 'vitest';
import { verifyProvidedReinforcement, computeShearCapacity } from '../station-design-forces';
import { checkShear } from '../codes/argentina/cirsoc201';
import { CIRSOC201_DESIGN_EDITION } from '../codes/argentina/cirsoc201-basis';

/**
 * §9.6.3.1 on a beam deeper than 250 mm: Av,min wherever Vu > φ·0,085·√f'c·bw·d (2025), an
 * evaluated check that FAILS (not a hold). 300 × 650 mm, f'c 25, fy = fyt 420, eØ6 2 ramas c/30:
 * d ≈ 0,61 m, threshold 0,75·0,085·5·300·610 = 58,3 kN; Av = 0,57 cm² < Av,min =
 * max(0,062·5, 0,35)·300·300/420 = 0,75 cm² (§9.6.3.4, the engine's figure).
 */
describe('a deep beam below Av,min where Vu passes φ·0,085·√f\'c·bw·d', () => {
  function deep(V: number, stirrups: { diameter: number; legs: number; spacing: number }) {
    const st = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; st.push({ t, x: t * 6, n: 0, vy: 0, vz: V * (1 - 2 * t), my: 120 * 4 * t * (1 - t), mz: 0, mx: 0 }); }
    return verifyProvidedReinforcement(1, 'beam', { top: { count: 3, diameter: 16 }, bottom: { count: 4, diameter: 16 }, stirrups } as never,
      undefined, {}, { b: 0.3, h: 0.65, fc: 25, fy: 420, cover: 0.025, stirrupDia: stirrups.diameter },
      { elementId: 1, length: 6, comboResults: [{ comboId: 1, comboName: 'U1', stations: st }] } as never);
  }
  const minRows = (r: ReturnType<typeof deep>) => r.checks.filter((c) => c.category.includes('Av,min'));

  it('Vu 80 kN, eØ6 c/30: fails on Av,min with the clause and the values', () => {
    const r = deep(80, { diameter: 6, legs: 2, spacing: 0.30 });
    expect(r.overallStatus).toBe('fail');
    const rows = minRows(r);
    expect(rows.length).toBeGreaterThan(0);
    const c = rows[0]!;
    expect(c.status).toBe('fail');
    expect(c.category).toContain('§9.6.3.1');
    expect(c.demand).toBeCloseTo(0.75, 2);
    expect(c.capacity).toBeCloseTo(0.566, 2);
    expect(c.description).toMatch(/> φ·0,085·√f'c·bw·d = 5\d\.\d kN.*Av = 0\.57 cm² < Av,min = 0\.75 cm² \(§9\.6\.3\.4, fyt = 420 MPa\)/);
    expect(r.shallowMinShear).toBeUndefined();
  });

  it('Vu 50 kN, under the threshold everywhere: no Av,min row, stays ok', () => {
    const r = deep(50, { diameter: 6, legs: 2, spacing: 0.30 });
    expect(minRows(r)).toEqual([]);
    expect(r.overallStatus).toBe('ok');
  });

  it('Vu 80 kN with eØ8 c/25 (Av 1,01 ≥ Av,min 0,63): stays ok', () => {
    const r = deep(80, { diameter: 8, legs: 2, spacing: 0.25 });
    expect(minRows(r)).toEqual([]);
    expect(r.overallStatus).toBe('ok');
  });

  /*
   * The designer (`checkShear`) sized the minimum with 2005's coefficients in the 2025 run,
   * max(√f'c/16, 0,33)·bw/fyt: 0,33 for 0,35 put it up to 6 % under §9.6.3.4 wherever the
   * minimum governed, 45 of these 1 920 sections. It reads the edition's coefficients now.
   */
  it('the TypeScript designer gives at least Av,min on deep beams (sweep)', () => {
    const seen: string[] = [];
    for (const h of [0.3, 0.45, 0.65, 0.9]) for (const b of [0.15, 0.2, 0.3, 0.5]) for (const fc of [20, 25, 30, 45, 70]) {
      for (const fy of [220, 420, 500]) for (const stirrupDia of [6, 8]) for (const Vu of [20, 60, 120, 250]) {
        const sh = checkShear({ b, h, fc, fy, cover: 0.025, stirrupDia } as never, Vu, 0, { edition: CIRSOC201_DESIGN_EDITION });
        const cap = computeShearCapacity(sh.stirrupDia, sh.stirrupLegs, sh.spacing, b, sh.d, fc, fy, 0, { Ag: b * h, rhoW: 0.005, h, edition: CIRSOC201_DESIGN_EDITION });
        if (cap.avBelowMin && Vu > 0.75 * 0.085 * Math.min(Math.sqrt(fc), 8.3) * b * sh.d * 1000) seen.push(`${h} ${b} ${fc} ${fy} Ø${stirrupDia} Vu=${Vu} s=${sh.spacing} AvMin=${cap.AvMin}`);
      }
    }
    expect(seen).toEqual([]);
  });
});
