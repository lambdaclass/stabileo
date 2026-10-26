/**
 * CIRSOC 201-2025 §9.6.3.1 and Tabla 9.6.3.1 on a shallow beam (h ≤ 250 mm).
 *
 * «Para los casos de la tabla, se debe colocar al menos Av,min cuando Vu > φVc»: a beam «de poca
 * altura» is exempt from the minimum shear reinforcement only where Vu ≤ φVc. The engine's checker
 * (`min_shear_missing`, cirsoc201_check.rs) returns False for every member with h ≤ 0,25 m, and the
 * provided-reinforcement verifier did not read Av,min at all, so a shallow beam with Vu > φVc and
 * Av < Av,min read approved. Until the engine applies the clause the member is HELD on it: its
 * verdict is neither an approval nor a failure, and the reason names the clause.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyProvidedReinforcement, computeShearCapacity, SHALLOW_BEAM_MAX_H } from '../station-design-forces';
import { checkShear } from '../codes/argentina/cirsoc201';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';
import { CIRSOC201_DESIGN_EDITION } from '../codes/argentina/cirsoc201-basis';
import { verificationStore } from '../../store/verification.svelte';
import { verdictApproves, holdText, projectVerdictLines } from '../../store/member-verdict';

/** A 4 m beam, shear V at the ends falling linearly to −V, moment 10 kN·m parabolic. */
function stations(V: number) {
  const out = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    out.push({ t, x: t * 4, n: 0, vy: 0, vz: V * (1 - 2 * t), my: 40 * t * (1 - t), mz: 0, mx: 0 });
  }
  return out;
}

/**
 * 260 × 250 mm, f'c = 70 MPa, fy = fyt = 220 MPa, eØ6 2 ramas c/10 cm: every table limit met
 * (s ≤ d/2, legs across ≤ d), and Av = 0,57 cm² < Av,min = 0,062·√70·260·100/220 = 0,61 cm²
 * (§9.6.3.4, the engine's figure). φVc ≈ 41,6 kN with Av < Av,min (Tabla 22.5.5.1 row c).
 */
function verify(V: number) {
  return verifyProvidedReinforcement(1, 'beam',
    { top: { count: 3, diameter: 12 }, bottom: { count: 3, diameter: 12 }, stirrups: { diameter: 6, legs: 2, spacing: 0.10 } } as never,
    undefined, {}, { b: 0.26, h: 0.25, fc: 70, fy: 220, cover: 0.025, stirrupDia: 6 },
    { elementId: 1, length: 4, comboResults: [{ comboId: 1, comboName: 'U1', stations: stations(V) }] } as never);
}

afterEach(() => vi.restoreAllMocks());

const tr = (k: string, p?: Record<string, string | number>) => `${k}${p ? JSON.stringify(p) : ''}`;

describe('shallow beam, Vu > φVc, Av < Av,min', () => {
  it('its local checks pass, and the region is recorded against §9.6.3.1', () => {
    const r = verify(50);
    expect(r.overallStatus).toBe('ok');
    expect(r.shallowMinShear?.length).toBeGreaterThan(0);
    const w = r.shallowMinShear![0];
    expect(w.Vu).toBeGreaterThan(w.phiVc);
    expect(w.Av).toBeLessThan(w.AvMin);
    expect(w.phiVc).toBeCloseTo(41.6, 0);
    expect(w.AvMin).toBeCloseTo(0.608, 2);
  });

  it('the member is held, not approved and not failed, with the clause in its reason', () => {
    const r = verify(50);
    vi.spyOn(verificationStore, 'providedFor').mockReturnValue(r);
    vi.spyOn(verificationStore, 'localStatus').mockReturnValue('ok');
    const v = verificationStore.memberVerdict(1);
    expect(v.local).toBe('ok');
    expect(v.status).toBe('unavailable');
    expect(verdictApproves(v)).toBe(false);
    const h = v.holds.find((x) => x.kind === 'enginePending');
    expect(h?.key).toBe('verdict.hold.shallowMinShear');
    expect(h?.params).toMatchObject({ h: 250, avMin: '0.61', av: '0.57', s: '10.0' });
    expect(holdText(h!, tr)).toContain('verdict.hold.shallowMinShear');
    expect(projectVerdictLines({ state: 'held', total: 1, conforming: 0, held: { enginePending: 1 }, failing: 0, provisional: 0, unchecked: 0, stale: 0 }, tr).reasons)
      .toEqual(['verdict.project.held.enginePending{"n":1}']);
  });
});

describe('shallow beam, Vu ≤ φVc', () => {
  it('stays approved: Tabla 9.6.3.1 exempts it from Av,min there', () => {
    const r = verify(30);
    expect(r.overallStatus).toBe('ok');
    expect(r.shallowMinShear).toBeUndefined();
    vi.spyOn(verificationStore, 'providedFor').mockReturnValue(r);
    vi.spyOn(verificationStore, 'localStatus').mockReturnValue('ok');
    const v = verificationStore.memberVerdict(1);
    expect(v.status).toBe('ok');
    expect(verdictApproves(v)).toBe(true);
  });
});

describe('a beam deeper than 250 mm is not held by this rule', () => {
  it('h = 260 mm with the same stirrups', () => {
    const r = verifyProvidedReinforcement(1, 'beam',
      { top: { count: 3, diameter: 12 }, bottom: { count: 3, diameter: 12 }, stirrups: { diameter: 6, legs: 2, spacing: 0.10 } } as never,
      undefined, {}, { b: 0.26, h: 0.26, fc: 70, fy: 220, cover: 0.025, stirrupDia: 6 },
      { elementId: 1, length: 4, comboResults: [{ comboId: 1, comboName: 'U1', stations: stations(50) }] } as never);
    expect(r.shallowMinShear).toBeUndefined();
  });
});

describe('the TypeScript designer (checkShear) never produces the held case', () => {
  /*
   * The reconciliation log says the designer always provides the minimum. Checked here against
   * the engine's Av,min in the design edition, over shallow sections: the designer's own minimum
   * (max(√f'c/16, 0,33)·bw/fy) is below 2025's 0,35·bw/fyt when f'c < 31,9 MPa, but on a shallow
   * beam the spacing is capped at d/2 by Tabla 9.7.6.2.2, which gives more than either.
   */
  it('a sweep of b, f\'c, fy, stirrup Ø and Vu on h ≤ 250 mm', () => {
    const seen: string[] = [];
    let n = 0;
    for (const h of [0.15, 0.2, 0.25]) for (const b of [0.15, 0.2, 0.3, 0.5, 0.8, 1.2]) for (const fc of [20, 25, 30, 45, 70]) {
      for (const fy of [220, 420, 500]) for (const stirrupDia of [6, 8]) for (const Vu of [5, 20, 40, 80]) {
        expect(h).toBeLessThanOrEqual(SHALLOW_BEAM_MAX_H);
        const sh = checkShear({ b, h, fc, fy, cover: 0.025, stirrupDia } as never, Vu, 0, { edition: CIRSOC201_DESIGN_EDITION });
        const av = sh.stirrupLegs * (sh.stirrupDia === 6 ? 0.283 : 0.503);
        const cap = computeShearCapacity(sh.stirrupDia, sh.stirrupLegs, sh.spacing, b, sh.d, fc, fy, 0, { Ag: b * h, rhoW: 0.005, h, edition: CIRSOC201_DESIGN_EDITION });
        expect(cap.evaluated).toBe(true);
        n++;
        if (cap.avBelowMin && Vu > cap.phiVc) seen.push(`${h} ${b} ${fc} ${fy} Ø${stirrupDia} Vu=${Vu} Av=${av} AvMin=${cap.AvMin}`);
      }
    }
    expect(n).toBe(3 * 6 * 5 * 3 * 2 * 4);
    expect(seen).toEqual([]);
    // And the kernel answers this boundary as used above.
    expect(evaluateBeamSection({ edition: '2025', fc: 25e6, fy: 420e6, b: 0.2, h: 0.25, d: 0.21, As: 3e-4, Av: 0.566e-4, s: 0.1, Ag: 0.05 })?.avBelowMin).toBe(false);
  });
});
