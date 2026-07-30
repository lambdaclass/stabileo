import { describe, it, expect } from 'vitest';
import {
  checkBearing, checkFooting, checkOneWayShear, type FootingInput,
} from '../foundation-check';

const footing = (over: Partial<FootingInput> = {}): FootingInput => ({
  kind: 'isolated',
  B: 2.5, L: 2.5, thickness: 0.60, d: 0.52,
  columnB: 0.40, columnH: 0.40,
  fc: 25, allowableBearing: 250,
  serviceAxial: 900, factoredAxial: 1250,
  position: 'interior',
  ...over,
});

describe('bearing pressure', () => {
  it('gives a uniform pressure for a concentric load', () => {
    const r = checkBearing(footing({ serviceAxial: 625 }));
    // 625 / 6.25 m² = 100 kPa
    expect(r.qMax).toBeCloseTo(100, 6);
    expect(r.qMin).toBeCloseTo(100, 6);
    expect(r.status).toBe('OK');
  });

  it('produces a trapezoid under eccentric load', () => {
    // e = 200/900 = 0.2222 m, within B/6 = 0.4167.
    const r = checkBearing(footing({ serviceMomentB: 200 }));
    expect(r.eB).toBeCloseTo(0.2222, 4);
    expect(r.qMax).toBeGreaterThan(r.qMin);
    expect(r.uplift).toBe(false);
  });

  it('fails when the peak exceeds the allowable', () => {
    expect(checkBearing(footing({ serviceAxial: 2000 })).status).toBe('FAIL');
  });

  it('refuses rather than under-reporting when the base lifts off', () => {
    // e = 500/900 = 0.5556 m > B/6 = 0.4167. The linear distribution stops being valid
    // and reporting its q_max would UNDER-state the real peak — the wrong direction.
    const r = checkBearing(footing({ serviceMomentB: 500 }));
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.uplift).toBe(true);
    expect(r.memo.join(' ')).toMatch(/subestimaría la presión real/);
  });

  it('detects the kern boundary on either axis', () => {
    expect(checkBearing(footing({ serviceMomentL: 500 })).uplift).toBe(true);
    expect(checkBearing(footing({ serviceMomentB: 200, serviceMomentL: 200 })).uplift).toBe(false);
  });

  it('reports UNSUPPORTED for a nonsensical input rather than dividing by zero', () => {
    expect(checkBearing(footing({ B: 0 })).status).toBe('UNSUPPORTED');
    expect(checkBearing(footing({ serviceAxial: 0 })).status).toBe('UNSUPPORTED');
  });
});

describe('one-way shear', () => {
  it('takes the critical section at d from the column face', () => {
    // a = (2.5 - 0.4)/2 - 0.52 = 0.53 m
    const q = 1250 / 6.25;
    const r = checkOneWayShear(footing(), q);
    expect(r.Vu).toBeCloseTo(q * 0.53 * 2.5, 6);
    expect(r.memo[0]).toMatch(/a = 0\.530/);
  });

  it('does not govern when the critical section falls outside the base', () => {
    // A deep, small footing: (1.0 - 0.4)/2 = 0.30 < d = 0.52.
    const r = checkOneWayShear(footing({ B: 1.0 }), 200);
    expect(r.status).toBe('OK');
    expect(r.Vu).toBe(0);
    expect(r.memo[0]).toMatch(/cae fuera de la zapata/);
  });

  it('fails a thin footing under heavy pressure', () => {
    const r = checkOneWayShear(footing({ d: 0.15, B: 4.0 }), 600);
    expect(r.status).toBe('FAIL');
    expect(r.utilization).toBeGreaterThan(1);
  });
});

describe('the complete isolated footing', () => {
  it('passes an adequately sized footing', () => {
    const r = checkFooting(footing());
    expect(r.status).toBe('OK');
    expect(r.bearing.status).toBe('OK');
    expect(r.punching?.status).toBe('OK');
    expect(r.worstUtilization).toBeLessThan(1);
  });

  it('derives punching demand from the support reaction, less the soil inside the perimeter', () => {
    // Same equilibrium argument as a slab-column joint: the soil pressure acting inside
    // the critical perimeter never crosses the critical section.
    const r = checkFooting(footing());
    expect(r.punching?.demand.outcome).toBe('DERIVED');
    expect(r.punching?.demand.conservative).toBe(false);
    const q = 1250 / 6.25;
    const inside = q * (r.punching!.critical.enclosedArea);
    expect(r.punching?.demand.Vu).toBeCloseTo(1250 - inside, 4);
  });

  it('fails a footing too thin to punch', () => {
    const r = checkFooting(footing({ d: 0.15, thickness: 0.20, factoredAxial: 2500 }));
    expect(r.status).toBe('FAIL');
  });

  it('rolls an unsupported constituent up to UNSUPPORTED, not OK', () => {
    // Bearing is unsupported because the base lifts; everything else passes. Reporting
    // the footing as OK would be a false completeness claim.
    const r = checkFooting(footing({ serviceMomentB: 500 }));
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.unsupported.join(' ')).toMatch(/núcleo central/);
    expect(r.status).not.toBe('OK');
  });

  it('computes the flexural demand at the column face', () => {
    const r = checkFooting(footing());
    const q = 1250 / 6.25;
    const a = (2.5 - 0.4) / 2;
    expect(r.Mu).toBeCloseTo(q * 2.5 * a * a / 2, 6);
  });

  it('is harder to satisfy at a corner than in the interior', () => {
    const interior = checkFooting(footing({ factoredAxial: 2000 }));
    const corner = checkFooting(footing({ factoredAxial: 2000, position: 'corner' }));
    expect(corner.punching!.utilization).toBeGreaterThan(interior.punching!.utilization);
  });

  it('cites the foundation clauses it applied', () => {
    const cl = checkFooting(footing()).refs.map((x) => x.clause);
    expect(cl).toContain('13.2');
    expect(cl).toContain('13.2.7');
    expect(cl).toContain('22.5');
    expect(cl).toContain('22.6.4.1');
  });

  it('is deterministic', () => {
    const run = () => checkFooting(footing({ serviceAxial: 873.2, factoredAxial: 1211.5 }));
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe('foundation types that are NOT implemented', () => {
  it.each(['combined', 'strip', 'mat', 'pileCap'] as const)(
    'declares %s unsupported rather than treating it as isolated', (kind) => {
      const r = checkFooting(footing({ kind }));
      expect(r.status).toBe('UNSUPPORTED');
      expect(r.unsupported).toHaveLength(1);
      expect(r.memo.join(' ')).toMatch(/apariencia de correcto/);
      // Critically, no numbers are produced that could be mistaken for a check.
      expect(r.worstUtilization).toBe(0);
      expect(r.punching).toBeNull();
    });
});
