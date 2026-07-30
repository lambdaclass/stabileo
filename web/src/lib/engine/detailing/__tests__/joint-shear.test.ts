import { describe, it, expect } from 'vitest';
import { teAllAt, teAt } from '../../../i18n/engine-text';
import {
  ASSUMED_JD_RATIO, MAX_EQUILIBRIUM_RESIDUAL, PHI_JOINT_SHEAR, checkJointShear,
  effectiveJointArea, jointFreeBody, jointNominalShear, jointStrengthCoefficient,
  type IncidentBeam,
} from '../joint-shear';

const beam = (elementId: number, endMoment: number, side: -1 | 1, d = 0.55): IncidentBeam =>
  ({ elementId, endMoment, side, d });

describe('§15.4.2.4 — effective joint area', () => {
  it('uses the full column width when the beam is at least as wide', () => {
    const a = effectiveJointArea({ columnDepth: 0.50, columnWidth: 0.40, beamWidth: 0.45 });
    expect(a.effectiveWidth).toBeCloseTo(0.40, 9);
    expect(a.governedBy).toBe('columnWidth');
    expect(a.aj).toBeCloseTo(0.20, 9);
  });

  it('takes the lesser of beam width + depth and twice the eccentricity', () => {
    // Column 900 wide, beam 300 wide, joint depth 500, beam offset so ecc = 0.30.
    // (a) = 0.30 + 0.50 = 0.80; (b) = 0.60 -> (b) governs.
    const a = effectiveJointArea({
      columnDepth: 0.50, columnWidth: 0.90, beamWidth: 0.30, beamEccentricity: 0.30,
    });
    expect(a.effectiveWidth).toBeCloseTo(0.60, 9);
    expect(a.governedBy).toBe('twiceEccentricity');
  });

  it('lets beam width + depth govern when the beam is well centred on a wide column', () => {
    // ecc = 0.45 -> (b) = 0.90; (a) = 0.20 + 0.50 = 0.70 -> (a) governs.
    const a = effectiveJointArea({ columnDepth: 0.50, columnWidth: 0.90, beamWidth: 0.20 });
    expect(a.effectiveWidth).toBeCloseTo(0.70, 9);
    expect(a.governedBy).toBe('beamWidthPlusDepth');
  });

  it('never exceeds the column width', () => {
    const a = effectiveJointArea({ columnDepth: 2.0, columnWidth: 0.40, beamWidth: 0.35 });
    expect(a.effectiveWidth).toBeLessThanOrEqual(0.40);
  });

  it('uses the column dimension in the shear direction as the joint depth', () => {
    const a = effectiveJointArea({ columnDepth: 0.60, columnWidth: 0.40, beamWidth: 0.40 });
    expect(a.depth).toBeCloseTo(0.60, 9);
  });
});

describe('Table 15.4.2.3 — nominal shear strength', () => {
  it('transcribes all eight rows', () => {
    expect(jointStrengthCoefficient('continuous', 'continuous', 'confined')).toBe(2.0);
    expect(jointStrengthCoefficient('continuous', 'continuous', 'unconfined')).toBe(1.7);
    expect(jointStrengthCoefficient('continuous', 'other', 'confined')).toBe(1.7);
    expect(jointStrengthCoefficient('continuous', 'other', 'unconfined')).toBe(1.3);
    expect(jointStrengthCoefficient('other', 'continuous', 'confined')).toBe(1.7);
    expect(jointStrengthCoefficient('other', 'continuous', 'unconfined')).toBe(1.3);
    expect(jointStrengthCoefficient('other', 'other', 'confined')).toBe(1.3);
    expect(jointStrengthCoefficient('other', 'other', 'unconfined')).toBe(1.0);
  });

  it('makes confinement worth a real strength increase', () => {
    const area = effectiveJointArea({ columnDepth: 0.5, columnWidth: 0.4, beamWidth: 0.4 });
    const conf = jointNominalShear(25, area, 'continuous', 'continuous', 'confined').Vn;
    const unconf = jointNominalShear(25, area, 'continuous', 'continuous', 'unconfined').Vn;
    expect(conf / unconf).toBeCloseTo(2.0 / 1.7, 9);
  });

  it('computes V_n in kN from f´c in MPa and A_j in m²', () => {
    // 2.0 × 1 × √25 × 0.20 m² = 2.0 MN = 2000 kN
    const area = effectiveJointArea({ columnDepth: 0.50, columnWidth: 0.40, beamWidth: 0.40 });
    expect(jointNominalShear(25, area, 'continuous', 'continuous', 'confined').Vn)
      .toBeCloseTo(2000, 6);
  });

  it('applies the lightweight-concrete factor', () => {
    const area = effectiveJointArea({ columnDepth: 0.5, columnWidth: 0.4, beamWidth: 0.4 });
    const normal = jointNominalShear(25, area, 'continuous', 'continuous', 'confined', 1.0).Vn;
    const light = jointNominalShear(25, area, 'continuous', 'continuous', 'confined', 0.75).Vn;
    expect(light / normal).toBeCloseTo(0.75, 9);
  });
});

describe('§15.4.1.1 — the free body', () => {
  it('computes T = M / jd for each incident beam', () => {
    const fb = jointFreeBody([beam(1, 200, 1)], 0);
    expect(fb.tensions[0].T).toBeCloseTo(200 / (ASSUMED_JD_RATIO * 0.55), 6);
  });

  it('ADDS the tensions of beams on opposite sides', () => {
    // The classic result: under lateral load a two-sided joint is more heavily loaded
    // than a one-sided one, because the two beam moments act in opposite senses and
    // their tension forces reinforce at the joint plane.
    const one = jointFreeBody([beam(1, 200, 1)], 100);
    const two = jointFreeBody([beam(1, 200, 1), beam(2, -200, -1)], 100);
    expect(Math.abs(two.Vu)).toBeGreaterThan(Math.abs(one.Vu));
    expect(two.tensions[0].T).toBeCloseTo(two.tensions[1].T, 9);
  });

  it('subtracts the column shear', () => {
    const withCol = jointFreeBody([beam(1, 200, 1)], 150);
    const noCol = jointFreeBody([beam(1, 200, 1)], 0);
    expect(withCol.Vu).toBeCloseTo(noCol.Vu - 150, 9);
  });

  it('surfaces jd as an assumption, not a code value', () => {
    const fb = jointFreeBody([beam(1, 200, 1)], 0);
    expect(fb.jd.origin).toBe('assumed');
    expect(fb.jd.assumption?.key).toBe('detailing.joint.assumedJd');
    expect(teAt(fb.jd.assumption!, 'es')).toMatch(/no un valor reglamentario/);
    expect(teAt(fb.jd.assumption!, 'en')).toMatch(/not a regulatory one/);
  });

  it('closes to zero residual for a consistent free body', () => {
    const fb = jointFreeBody([beam(1, 200, 1), beam(2, -180, -1)], 140);
    expect(fb.residual).toBeLessThan(1e-12);
  });
});

describe('the D8c gate — validate or declare unsupported', () => {
  const base = {
    fc: 25, columnDepth: 0.50, columnWidth: 0.40, beamWidth: 0.35,
    columnContinuity: 'continuous' as const,
    beamContinuity: 'continuous' as const,
    confinement: 'confined' as const,
  };

  it('verifies a joint whose free body closes', () => {
    const r = checkJointShear({ ...base, beams: [beam(1, 150, 1)], columnShear: 100 });
    expect(r.status).toBe('OK');
    expect(r.freeBody.residual).toBeLessThan(MAX_EQUILIBRIUM_RESIDUAL);
    expect(r.utilization).toBeLessThan(1);
  });

  it('fails an overloaded joint rather than passing it', () => {
    const r = checkJointShear({
      ...base, fc: 20, columnDepth: 0.30, columnWidth: 0.30, beamWidth: 0.30,
      beams: [beam(1, 900, 1, 0.35), beam(2, -900, -1, 0.35)], columnShear: 50,
    });
    expect(r.status).toBe('FAIL');
    expect(r.utilization).toBeGreaterThan(1);
  });

  it('crosses OK to FAIL exactly at φV_n', () => {
    // Aj = 0.50 × 0.40 = 0.20; Vn = 2.0·√25·0.20·1000 = 2000 kN; φVn = 1500 kN.
    const area = effectiveJointArea(base);
    const phiVn = PHI_JOINT_SHEAR * jointNominalShear(
      25, area, 'continuous', 'continuous', 'confined').Vn;
    expect(phiVn).toBeCloseTo(1500, 6);

    // Choose beam moments so Vu lands just either side. T = M/(0.875·0.55) = 2.078 M.
    const mFor = (vu: number) => (vu + 0) / 2 / (1 / (ASSUMED_JD_RATIO * 0.55));
    const under = checkJointShear({
      ...base, columnShear: 0,
      beams: [beam(1, mFor(phiVn * 0.98), 1), beam(2, -mFor(phiVn * 0.98), -1)],
    });
    const over = checkJointShear({
      ...base, columnShear: 0,
      beams: [beam(1, mFor(phiVn * 1.02), 1), beam(2, -mFor(phiVn * 1.02), -1)],
    });
    expect(under.status).toBe('OK');
    expect(over.status).toBe('FAIL');
  });

  it('declares UNSUPPORTED when there are no incident beams', () => {
    const r = checkJointShear({ ...base, beams: [], columnShear: 100 });
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.unsupportedReason?.key).toBe('detailing.joint.unsupported.noIncidentBeams');
    expect(teAt(r.unsupportedReason!, 'es')).toMatch(/cuerpo libre/);
  });

  it('declares UNSUPPORTED for a biaxial joint instead of checking one direction', () => {
    // Verifying one direction and calling the joint done would be a false pass.
    const r = checkJointShear({
      ...base, beams: [beam(1, 150, 1)], columnShear: 100, biaxial: true,
    });
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.unsupportedReason?.key).toBe('detailing.joint.unsupported.biaxial');
    expect(teAt(r.unsupportedReason!, 'es')).toMatch(/ambas direcciones/);
    expect(teAllAt(r.memo, 'es').join(' ')).toMatch(/NO VERIFICADO/);
    expect(teAllAt(r.memo, 'en').join(' ')).toMatch(/NOT VERIFIED/);
  });

  it('reports the residual in the memo of a verified joint', () => {
    const r = checkJointShear({ ...base, beams: [beam(1, 150, 1)], columnShear: 100 });
    expect(r.memo.map((m) => m.key)).toContain('detailing.joint.memo.residual');
    const es = teAllAt(r.memo, 'es').join('\n');
    expect(es).toMatch(/Residuo de equilibrio/);
    expect(es).toMatch(/límite 2 %/);
  });

  it('carries the jd assumption onto the result', () => {
    const r = checkJointShear({ ...base, beams: [beam(1, 150, 1)], columnShear: 100 });
    expect(r.assumptions.map((a) => a.key)).toContain('detailing.joint.assumedJd');
    expect(teAllAt(r.assumptions, 'es').join(' ')).toMatch(/jd = 0,875 d/);
    expect(teAllAt(r.assumptions, 'en').join(' ')).toMatch(/jd = 0.875 d/);
  });

  it('never returns OK with a utilization it did not compute', () => {
    // An UNSUPPORTED result must not be mistaken for a pass anywhere downstream.
    const r = checkJointShear({ ...base, beams: [], columnShear: 100 });
    expect(r.utilization).toBe(0);
    expect(r.phiVn).toBe(0);
    expect(r.status).not.toBe('OK');
  });

  it('cites the clauses it applied, all from the 2025 edition', () => {
    const r = checkJointShear({ ...base, beams: [beam(1, 150, 1)], columnShear: 100 });
    const cl = r.refs.map((x) => x.clause);
    expect(cl).toContain('15.4.1.1');
    expect(cl).toContain('15.4.2.4');
    expect(cl).toContain('Tabla 15.4.2.3');
    expect(cl).toContain('21.2.1');
    expect(r.refs.every((x) => x.edition === '2025')).toBe(true);
  });

  it('is deterministic', () => {
    const run = () => checkJointShear({ ...base, beams: [beam(1, 173.4, 1)], columnShear: 96.2 });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
