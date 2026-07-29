import { describe, it, expect } from 'vitest';
import {
  ALPHA_S, PHI_SHEAR, checkPunchingShear, criticalSection, derivePunchingDemand,
  punchingResistance, sizeEffectFactor, sqrtFcCapped,
} from '../punching-shear';

describe('§22.6.4 — the critical section', () => {
  it('puts the perimeter at d/2 from the face on all four sides for an interior column', () => {
    // 400×400 column, d = 200 mm -> critical rectangle 600×600 -> bo = 2400 mm.
    const c = criticalSection(0.40, 0.40, 0.20, 'interior');
    expect(c.bo).toBeCloseTo(2.4, 9);
    expect(c.beta).toBeCloseTo(1, 9);
    expect(c.enclosedArea).toBeCloseTo(0.36, 9);
  });

  it('truncates the perimeter at a free edge', () => {
    // The most common punching error is using the full interior perimeter at an edge,
    // which over-states resistance by roughly a third.
    const interior = criticalSection(0.40, 0.40, 0.20, 'interior');
    const edge = criticalSection(0.40, 0.40, 0.20, 'edge');
    const corner = criticalSection(0.40, 0.40, 0.20, 'corner');
    expect(edge.bo).toBeCloseTo(1.8, 9);      // 2·0.6 + 0.6
    expect(corner.bo).toBeCloseTo(1.2, 9);    // 0.6 + 0.6
    expect(edge.bo / interior.bo).toBeCloseTo(0.75, 9);
    expect(corner.bo / interior.bo).toBeCloseTo(0.5, 9);
  });

  it('computes β from the loaded area, not from the critical rectangle', () => {
    const c = criticalSection(0.30, 0.90, 0.20, 'interior');
    expect(c.beta).toBeCloseTo(3, 9);
  });

  it('replaces a circular column with an equal-area square, per §22.6.4.1.2', () => {
    const c = criticalSection(0.50, 0.50, 0.20, 'interior', 'circular');
    const side = Math.sqrt(Math.PI * 0.25 ** 2);   // 0.4431 m
    expect(c.bo).toBeCloseTo(4 * (side + 0.20), 6);
    expect(c.notes.join(' ')).toMatch(/área equivalente/);
  });
});

describe('§22.5.5.1.3 and §22.6.3.1 — modifiers', () => {
  it('caps the size-effect factor at 1,0 for thin slabs', () => {
    // d = 250 mm -> sqrt(2/(1+1)) = 1.0 exactly; anything thinner is also capped.
    expect(sizeEffectFactor(0.250)).toBeCloseTo(1.0, 9);
    expect(sizeEffectFactor(0.150)).toBe(1.0);
  });

  it('reduces it for thick sections', () => {
    // d = 600 mm -> sqrt(2/3.4) = 0.7670
    expect(sizeEffectFactor(0.600)).toBeCloseTo(0.7670, 4);
    expect(sizeEffectFactor(1.0)).toBeCloseTo(Math.sqrt(2 / 5), 9);
  });

  it('caps √f´c at 8,3 MPa', () => {
    expect(sqrtFcCapped(25)).toBeCloseTo(5, 9);
    // f'c = 100 would give 10; the cap holds it at 8.3.
    expect(sqrtFcCapped(100)).toBe(8.3);
  });

  it('uses the §22.6.5.3 α_s values', () => {
    expect(ALPHA_S).toEqual({ interior: 40, edge: 30, corner: 20 });
  });
});

describe('§22.6.5.2 — v_c is the least of the three expressions', () => {
  it('is governed by (a) for a square interior column with a normal b_o/d', () => {
    // β = 1 -> (b) = 0.17·3 = 0.51 > 0.33. bo/d = 12 -> (c) = 0.083(2+40/12) = 0.443.
    const c = criticalSection(0.40, 0.40, 0.20, 'interior');
    const r = punchingResistance(25, c, 'interior');
    expect(r.governedBy).toBe('a');
    expect(r.vc).toBeCloseTo(0.33 * 1.0 * 5, 6);
  });

  it('is governed by (b) for a very elongated column', () => {
    // β = 6 -> (b) = 0.17(1 + 1/3) = 0.2267 < 0.33.
    const c = criticalSection(0.20, 1.20, 0.20, 'interior');
    const r = punchingResistance(25, c, 'interior');
    expect(r.governedBy).toBe('b');
  });

  it('is governed by (c) for a large loaded area in a thin slab at a corner', () => {
    // (c) falls below (a) when α_s·d/b_o is SMALL — a long perimeter relative to the
    // depth, with the low corner α_s. 2.0 m square pad, d = 150 mm, corner:
    // b_o = 2·(2.0+0.15) = 4.30 m, α_s d/b_o = 20·0.15/4.30 = 0.70,
    // so (c) = 0.083·2.70 = 0.224 against (a) = 0.33.
    const c = criticalSection(2.0, 2.0, 0.15, 'corner');
    const r = punchingResistance(25, c, 'corner');
    expect(r.governedBy).toBe('c');
    expect(r.vc).toBeLessThan(0.33 * r.lambdaS * 5);
  });

  it('keeps (a) governing when the depth is large relative to the perimeter', () => {
    // The opposite case, which the previous version of the test above got backwards:
    // a small column in a thick slab makes α_s·d/b_o LARGE, so (c) rises above (a).
    const c = criticalSection(0.25, 0.25, 0.70, 'corner');
    expect(punchingResistance(25, c, 'corner').governedBy).toBe('a');
  });

  it('makes a corner column weaker than an interior one, both ways', () => {
    // Smaller α_s in (c) AND a shorter perimeter — the two compound.
    const ci = criticalSection(0.40, 0.40, 0.30, 'interior');
    const cc = criticalSection(0.40, 0.40, 0.30, 'corner');
    const ri = punchingResistance(25, ci, 'interior');
    const rc = punchingResistance(25, cc, 'corner');
    expect(rc.vc).toBeLessThanOrEqual(ri.vc);
    expect(cc.bo).toBeLessThan(ci.bo);
  });

  it('reports all three candidates so the memo can show the comparison', () => {
    const r = punchingResistance(30, criticalSection(0.40, 0.60, 0.25, 'edge'), 'edge');
    expect(r.candidates.a).toBeGreaterThan(0);
    expect(r.vc).toBe(Math.min(r.candidates.a, r.candidates.b, r.candidates.c));
  });
});

describe('demand by equilibrium — the finding that unblocked this', () => {
  const crit = criticalSection(0.40, 0.40, 0.20, 'interior');

  it('derives V_u from the step in column axial force across the joint', () => {
    // 900 kN below, 600 kN above -> 300 kN delivered into the slab at this level.
    const d = derivePunchingDemand({ axialBelow: 900, axialAbove: 600 }, crit);
    expect(d.outcome).toBe('DERIVED');
    expect(d.Vu).toBeCloseTo(300, 9);
    expect(d.derivation).toMatch(/salto de la fuerza axial/);
    expect(d.derivation).toMatch(/equilibrio exacto/);
  });

  it('uses the support reaction at a footing', () => {
    const d = derivePunchingDemand({ supportReaction: 850 }, crit);
    expect(d.outcome).toBe('DERIVED');
    expect(d.Vu).toBeCloseTo(850, 9);
    expect(d.derivation).toMatch(/reacción de apoyo/);
  });

  it('handles a top-storey connection with no column above', () => {
    const d = derivePunchingDemand({ axialBelow: 420 }, crit);
    expect(d.Vu).toBeCloseTo(420, 9);
  });

  it('subtracts the load inside the critical perimeter when it is known', () => {
    // 10 kPa over 0.36 m² = 3.6 kN.
    const d = derivePunchingDemand(
      { axialBelow: 900, axialAbove: 600, loadInsidePerimeter: 10 }, crit);
    expect(d.Vu).toBeCloseTo(296.4, 6);
    expect(d.conservative).toBe(false);
  });

  it('is conservative, and says so, when that load is unknown', () => {
    const d = derivePunchingDemand({ axialBelow: 900, axialAbove: 600 }, crit);
    expect(d.conservative).toBe(true);
    expect(d.derivation).toMatch(/conservador/);
  });

  it('returns UNAVAILABLE rather than a guess when there is no force to balance', () => {
    const d = derivePunchingDemand({}, crit);
    expect(d.outcome).toBe('UNAVAILABLE');
    expect(d.Vu).toBe(0);
    expect(d.unavailableReason).toMatch(/no se adopta un valor supuesto/);
  });

  it('carries the unbalanced moment as a magnitude', () => {
    const d = derivePunchingDemand(
      { axialBelow: 500, unbalancedMomentX: 30, unbalancedMomentY: 40 }, crit);
    expect(d.Msc).toBeCloseTo(50, 9);
  });
});

describe('the complete check', () => {
  const base = {
    fc: 25, columnB: 0.40, columnH: 0.40, d: 0.20,
    position: 'interior' as const,
  };

  it('passes a connection with adequate slab depth', () => {
    // bo = 2.4 m, d = 0.2 -> φvc = 0.75 × 1.65 = 1.2375 MPa.
    // Capacity = 1.2375 × 2.4 × 0.2 × 1000 = 594 kN.
    const r = checkPunchingShear({ ...base, demand: { axialBelow: 400, axialAbove: 100 } });
    expect(r.status).toBe('OK');
    expect(r.vu).toBeCloseTo(300 / (2.4 * 0.2) / 1000, 6);
    expect(r.phiVc).toBeCloseTo(PHI_SHEAR * 0.33 * 5, 6);
    expect(r.utilization).toBeLessThan(1);
  });

  it('fails a connection that is overloaded', () => {
    const r = checkPunchingShear({ ...base, demand: { axialBelow: 900, axialAbove: 0 } });
    expect(r.status).toBe('FAIL');
    expect(r.utilization).toBeGreaterThan(1);
  });

  it('crosses from OK to FAIL exactly at the capacity', () => {
    const capacity = PHI_SHEAR * 0.33 * 5 * 2.4 * 0.2 * 1000;  // kN
    expect(checkPunchingShear({ ...base, demand: { axialBelow: capacity * 0.99 } }).status).toBe('OK');
    expect(checkPunchingShear({ ...base, demand: { axialBelow: capacity * 1.01 } }).status).toBe('FAIL');
  });

  it('is harder to satisfy at a corner than in the interior, for the same load', () => {
    const interior = checkPunchingShear({ ...base, demand: { axialBelow: 400 } });
    const corner = checkPunchingShear({ ...base, position: 'corner', demand: { axialBelow: 400 } });
    expect(corner.utilization).toBeGreaterThan(interior.utilization);
  });

  it('refuses rather than approximates when an unbalanced moment is present', () => {
    // Checking only direct shear here would report a pass on a connection that the
    // eccentric-shear transfer of §8.4.4.2 might well fail.
    const r = checkPunchingShear({
      ...base, demand: { axialBelow: 400, unbalancedMomentX: 60 },
    });
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.unsupportedReason).toMatch(/8\.4\.4\.2/);
    expect(r.memo.join(' ')).toMatch(/NO VERIFICADO/);
  });

  it('tolerates a negligible unbalanced moment', () => {
    const r = checkPunchingShear({
      ...base, demand: { axialBelow: 400, unbalancedMomentX: 0.5 },
    });
    expect(r.status).toBe('OK');
  });

  it('returns UNSUPPORTED, not OK, when the demand cannot be derived', () => {
    const r = checkPunchingShear({ ...base, demand: {} });
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.utilization).toBe(0);
    // Critically, an unavailable demand must never read as a passing check.
    expect(r.status).not.toBe('OK');
  });

  it('produces a memo a reviewer can follow line by line', () => {
    const r = checkPunchingShear({
      ...base, demand: { axialBelow: 900, axialAbove: 600, loadInsidePerimeter: 10 },
    });
    const memo = r.memo.join('\n');
    expect(memo).toMatch(/salto de la fuerza axial/);
    expect(memo).toMatch(/Perímetro crítico a d\/2/);
    expect(memo).toMatch(/vc = mín/);
    expect(memo).toMatch(/vu = /);
  });

  it('cites the clauses it applied', () => {
    const r = checkPunchingShear({ ...base, demand: { axialBelow: 400 } });
    const clauses = r.refs.map((x) => x.clause);
    expect(clauses).toContain('22.6.4.1');
    expect(clauses).toContain('Tabla 22.6.5.2');
    expect(clauses).toContain('21.2');
    expect(r.refs.every((x) => x.edition === '2025')).toBe(true);
  });

  it('is deterministic', () => {
    const run = () => checkPunchingShear({ ...base, demand: { axialBelow: 617.3 } });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
