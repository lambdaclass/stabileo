/**
 * The DEMAND side of the app-to-checker axis mapping, pinned through the real solver.
 *
 * ── What this guards ───────────────────────────────────────────────
 *
 * `runSteelVerification` crosses the section INERTIAS into the checker's convention
 * (`SteelDesignParams.Iz` «eje fuerte» ← `section.iy`, the app's strong axis) but used to send
 * the DEMANDS straight through: `Muz` (checker: strong-axis moment, the one the
 * lateral-torsional-buckling check runs on) received the solver's `mz`, and `Muy` (weak)
 * received `my`.
 *
 * The solver convention is the other way round (`types-3d.ts`): `my` bends over the section
 * depth and uses `iy` — the STRONG axis of an unrolled tall section — while `mz` bends over
 * the width and uses `iz`. `solver-service.ts` forces local z = global up at the solver
 * boundary («gravity → My»). So for a gravity-loaded I-beam the entire real moment is `my`
 * and `mz` is identically zero.
 *
 * Both directions of the error were live, and both are pinned here with a solved IPE 200:
 *
 *   · Conservative-looking but false: the gravity moment was rated against the WEAK-axis
 *     plastic modulus (IPE 200: φMn_weak = 9,01 kN·m against φMn_strong = 44,34 kN·m — a
 *     4,9× understatement), so a beam at 45 % of its real capacity reported ratio 2,22 FAIL.
 *
 *   · Unconservative: the strong-axis LTB check ran on `mz ≈ 0` and passed vacuously. A 6 m
 *     unbraced IPE 200 carrying 7 kN·m is past its elastic-LTB capacity (φMn = 4,78 kN·m
 *     even at Cb = 1) and MUST fail; it reported ratio 0,00 OK.
 *
 * `steel-axis-mapping.test.ts` pins the inertia cross via `Lp` and could not see this: it
 * feeds `mz` as a hand-made fixture, which is exactly the channel that was wrong. These
 * tests solve real beams, so the demand channel is whatever the solver actually produces.
 */

import { describe, it, expect } from 'vitest';
import { solve3D } from '../wasm-solver';
import { computeStationDemands, runSteelVerification } from '../verification-service';
import type { AnalysisResults3D, SolverInput3D } from '../types-3d';
import type { LoadCombination } from '../../store/model.svelte';

// ─── Fixture ─────────────────────────────────────────────────

/** IPE 200, app catalogue values (data/steel-profiles.ts), SI. `iy` is the STRONG axis. */
const IPE200 = {
  id: 1, name: 'IPE 200',
  a: 28.5e-4, iy: 1943e-8, iz: 142e-8,
  h: 0.200, b: 0.100, tw: 0.0056, tf: 0.0085, j: 6.98e-8,
  shape: 'I',
};
/** F-24 (MPa). */
const STEEL = { id: 1, name: 'F-24', fy: 235, fu: 360, e: 200_000 };

// ─── Closed-form capacities, from the checker's own formulas (cirsoc301.ts) ──

const { b, tf, h, tw } = IPE200;
const Zx = b * tf * (h - tf) + tw * (h - 2 * tf) ** 2 / 4;          // m³, strong
const Sx = IPE200.iy / (h / 2);
const MP_STRONG = Math.min(STEEL.fy * Zx * 1e3, 1.5 * STEEL.fy * Sx * 1e3); // kN·m (F.2.1)
const Zy = tf * b ** 2 / 2 + (h - 2 * tf) * tw ** 2 / 4;            // m³, weak
const Sy = IPE200.iz / (b / 2);
const MP_WEAK = Math.min(STEEL.fy * Zy * 1e3, 1.5 * STEEL.fy * Sy * 1e3);   // kN·m (F.6.1 cap)
const PHI = 0.9;
/** ry from the WEAK inertia, as the fixed mapping gives the checker. */
const ry = Math.sqrt(IPE200.iz / IPE200.a);
const LP = 1.76 * ry * Math.sqrt(STEEL.e / STEEL.fy);

const COMBO: LoadCombination = { id: 1, name: '1.4D', factors: [{ caseId: 1, factor: 1.4 }] };

function solverInput(
  L: number,
  load: SolverInput3D['loads'][number],
  cantilever = false,
): SolverInput3D {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: L, y: 0, z: 0 }],
    ]),
    materials: new Map([[1, { id: 1, e: STEEL.e, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: IPE200.a, iy: IPE200.iy, iz: IPE200.iz, j: IPE200.j }]]),
    elements: new Map([[1, {
      id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
      releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: false, releaseMzEnd: false,
      releaseTStart: false, releaseTEnd: false,
    }]]),
    supports: cantilever
      ? new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]])
      // Pinned ends with torsion restrained (torsional stability), bending free.
      : new Map([
        [1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: false, rrz: false }],
        [2, { nodeId: 2, rx: true, ry: true, rz: true, rrx: true, rry: false, rrz: false }],
      ]),
    loads: [load],
  };
}

function verificationModel(L: number) {
  return {
    elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]),
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: L, y: 0, z: 0 }]]),
    sections: new Map([[1, IPE200]]),
    materials: new Map([[1, STEEL]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' }]]),
  } as any;
}

/** Solve a beam and run the app's steel verification path (station demands included). */
function solveAndVerify(L: number, load: SolverInput3D['loads'][number]) {
  const input = solverInput(L, load);
  const results = solve3D(input) as AnalysisResults3D;
  expect(typeof results).not.toBe('string');
  const model = verificationModel(L);
  const { demands, stations } = computeStationDemands(new Map([[1, results]]), [COMBO], model);
  const verifs = runSteelVerification(results, model, demands, stations);
  expect(verifs.length, 'the IPE beam must produce a steel verification').toBe(1);
  return { results, demands, verif: verifs[0] };
}

/** Max |demand| over the governing station categories of one moment channel. */
function channelMax(demands: ReturnType<typeof computeStationDemands>['demands'], prefix: 'My' | 'Mz'): number {
  const dems = demands.get(1)!.demands;
  // extractGoverningDemands only emits a category when a nonzero value exists,
  // so an empty channel means the moment is identically zero — Math.max(0, …) says that.
  return Math.max(0, ...dems.filter(d => d.category.startsWith(prefix)).map(d => d.absValue));
}

// ─── Tests ───────────────────────────────────────────────────

describe('steel demand axis mapping, through the real solver', () => {
  it('checks a gravity beam’s moment on the strong axis, against strong-axis capacity', () => {
    // L = 1 m ≤ Lp: no LTB, so the strong-axis capacity is exactly φ·Mp and the
    // demand/capacity pairing is what the ratio measures.
    const L = 1.0;
    const M = 20;                         // kN·m midspan
    const w = 8 * M / (L * L);            // 160 kN/m, gravity (local z = global Z, downward)
    const { demands, verif } = solveAndVerify(L, {
      type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: -w, qZJ: -w },
    });

    // The solver convention itself: gravity bending is `my`, and `mz` is identically zero.
    expect(channelMax(demands, 'My'), 'gravity moment must appear as My (strong axis)').toBeCloseTo(M, 3);
    expect(channelMax(demands, 'Mz'), 'a gravity beam has no Mz').toBe(0);

    // The checker must receive it on Muz — the strong-axis slot its LTB check runs on.
    expect(verif.Muz, 'Muz must be the solver my channel').toBeCloseTo(M, 3);
    expect(verif.Muy, 'Muy must be the solver mz channel').toBeCloseTo(0, 6);
    expect(verif.flexureY, 'no weak-axis demand → no weak-axis check').toBeUndefined();

    const phiMnStrong = PHI * MP_STRONG;  // Lb ≤ Lp → Mn = Mp
    expect(verif.flexureZ.phiMn).toBeCloseTo(phiMnStrong, 3);
    expect(verif.flexureZ.ratio).toBeCloseTo(M / phiMnStrong, 3);  // ≈ 0,451
    expect(verif.flexureZ.status).toBe('ok');
    // The beam is at 45 % of its real capacity. The crossed-out mapping reported
    // ratio 2,22 FAIL here — the moment rated against φ·Mn of the weak axis (9,01 kN·m).
    expect(verif.overallStatus).toBe('ok');
  });

  it('runs lateral-torsional buckling against the real strong-axis moment', () => {
    // L = 6 m > Lr: elastic LTB governs the strong axis. 7 kN·m exceeds the reduced
    // capacity, so the beam MUST fail — with the uncrossed mapping the LTB check ran on
    // mz ≡ 0 and reported ratio 0,00 OK.
    const L = 6.0;
    const M = 7;
    const w = 8 * M / (L * L);
    const { verif } = solveAndVerify(L, {
      type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: -w, qZJ: -w },
    });

    expect(verif.Muz).toBeCloseTo(M, 3);
    expect(verif.flexureZ.Lp).toBeCloseTo(LP, 3);
    expect(verif.flexureZ.Lr).toBeGreaterThan(LP);
    expect(L).toBeGreaterThan(verif.flexureZ.Lr);   // zone 3, elastic LTB

    // Cb must come from the real strong-axis diagram: F.1.1 on a sagging parabola gives
    // 12,5·Mmax/(2,5·Mmax + 3·MA + 4·MB + 3·MC) = 12,5/11 ≈ 1,136 (the 11-station sample
    // interpolates the parabola, moving it by well under 1 %). From the mz diagram — all
    // zeros — momentGradient refuses and the checker falls back to the permitted 1,0.
    const cbStep = verif.flexureZ.steps.find(s => s.includes('Cb ='));
    expect(cbStep, 'Cb must be computed from the moment diagram, not defaulted to 1').toContain('calculado del diagrama');
    const cb = parseFloat(cbStep!.match(/Cb = ([\d.]+)/)![1]);
    expect(cb).toBeGreaterThan(1.10);
    expect(cb).toBeLessThan(1.16);

    // Fcr = Cb·π²·E/(Lb/ry)², Mn = min(Fcr·Sx, Mp) — closed form with the exact parabola Cb.
    const fcr = (12.5 / 11) * Math.PI ** 2 * STEEL.e / ((L / ry) ** 2);
    const mn = Math.min(fcr * Sx * 1e3, MP_STRONG);
    const expected = M / (PHI * mn);                 // ≈ 1,29 (1,47 at Cb = 1)
    expect(verif.flexureZ.ratio).toBeCloseTo(expected, 1);
    expect(verif.flexureZ.ratio).toBeGreaterThan(1);
    expect(verif.flexureZ.status).toBe('fail');
    expect(verif.overallStatus).toBe('fail');
  });

  it('checks a lateral load on the weak axis, against weak-axis capacity', () => {
    // A horizontal (local Y) load bends the beam over its width: solver `mz`, checker
    // weak axis. 20 kN·m is fine on the strong axis (ratio 0,451) but the weak axis
    // genuinely cannot take it: φ·Mn_weak = 9,01 kN·m. The crossing must show BOTH.
    const L = 1.0;
    const M = 20;
    const w = 8 * M / (L * L);
    const { demands, verif } = solveAndVerify(L, {
      type: 'distributed', data: { elementId: 1, qYI: -w, qYJ: -w, qZI: 0, qZJ: 0 },
    });

    expect(channelMax(demands, 'Mz'), 'lateral bending must appear as Mz (weak axis)').toBeCloseTo(M, 3);
    expect(channelMax(demands, 'My')).toBe(0);

    expect(verif.Muy, 'Muy must be the solver mz channel').toBeCloseTo(M, 3);
    expect(verif.Muz).toBeCloseTo(0, 6);
    expect(verif.flexureZ.ratio).toBeCloseTo(0, 6);

    const phiMnWeak = PHI * MP_WEAK;
    expect(verif.flexureY?.phiMn).toBeCloseTo(phiMnWeak, 3);
    expect(verif.flexureY?.ratio).toBeCloseTo(M / phiMnWeak, 3);  // ≈ 2,22
    expect(verif.flexureY?.status).toBe('fail');
    expect(verif.overallStatus).toBe('fail');
  });

  it('crosses the demand mapping on the endpoint fallback too (no station demands)', () => {
    // Cantilever with a 20 kN downward tip load: end moment P·L = 20 kN·m lands in
    // `my`, and runSteelVerification without station demands reads ef.myStart/myEnd.
    const L = 1.0;
    const P = 20;
    const results = solve3D(solverInput(L, {
      type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -P, mx: 0, my: 0, mz: 0 },
    }, true)) as AnalysisResults3D;
    expect(typeof results).not.toBe('string');
    const ef = results.elementForces[0];
    expect(Math.abs(ef.myStart), 'cantilever root moment is the my channel').toBeCloseTo(P * L, 3);
    expect(Math.abs(ef.mzStart)).toBeLessThan(1e-9);

    const verifs = runSteelVerification(results, verificationModel(L));
    expect(verifs.length).toBe(1);
    const verif = verifs[0];
    expect(verif.Muz).toBeCloseTo(P * L, 3);
    expect(verif.Muy).toBeCloseTo(0, 6);
    expect(verif.flexureZ.ratio).toBeCloseTo((P * L) / (PHI * MP_STRONG), 3);  // ≈ 0,451
    expect(verif.overallStatus).toBe('ok');
  });
});
