import { describe, it, expect } from 'vitest';
import { wallCheckRows } from '../../design/check-rows-families';
import {
  SHRINKAGE_RATIO, TWO_WAY_ASPECT_LIMIT, checkSlabOneWayShear, classifySlab,
  designSlabPanel, maxBarSpacing, maxShrinkageSpacing, minimumFlexuralSteel,
  selectSlabBars, woodArmer, type SlabPanelInput,
} from '../slab-design';
import {
  checkWallAxialFlexure, checkWallInPlaneShear, designWall, maxWallSpacing,
  minimumWallRatios, minimumWallThickness, type WallDesignInput,
} from '../wall-design';

// ─── Slab classification ─────────────────────────────────────────

describe('slab classification', () => {
  it('is two-way for a square panel on four sides', () => {
    const c = classifySlab(5, 5, 4);
    expect(c.behaviour).toBe('twoWay');
    expect(c.aspect).toBeCloseTo(1, 9);
  });

  it('is one-way once the aspect ratio passes 2', () => {
    expect(classifySlab(5, 10, 4).behaviour).toBe('twoWay');   // exactly 2
    expect(classifySlab(5, 10.5, 4).behaviour).toBe('oneWay');
    expect(TWO_WAY_ASPECT_LIMIT).toBe(2);
  });

  it('is one-way when supported on fewer than three sides, whatever the shape', () => {
    const c = classifySlab(5, 5, 2);
    expect(c.behaviour).toBe('oneWay');
    expect(c.note).toMatch(/2 lado/);
  });
});

// ─── Wood-Armer ──────────────────────────────────────────────────

describe('Wood-Armer design moments', () => {
  it('adds the twisting moment to both directions at the bottom', () => {
    const d = woodArmer(40, 30, 10);
    expect(d.bottomX).toBeCloseTo(50, 9);
    expect(d.bottomY).toBeCloseTo(40, 9);
    expect(d.corrected).toBe(false);
  });

  it('is insensitive to the sign of mxy', () => {
    expect(woodArmer(40, 30, 10).bottomX).toBeCloseTo(woodArmer(40, 30, -10).bottomX, 12);
  });

  it('needs no bottom steel where the design moment is negative', () => {
    const d = woodArmer(-50, 30, 5);
    expect(d.bottomX).toBe(0);
    expect(d.topX).toBeGreaterThan(0);
  });

  it('transfers the twisting moment to the other direction instead of dropping it', () => {
    // The classic error: dropping it leaves corner panels short of steel.
    // mx + |mxy| = -50 + 20 = -30 < 0, so x takes no bottom steel and its share of the
    // twisting moment must move to y rather than vanishing.
    const withTransfer = woodArmer(-50, 30, 20);
    expect(withTransfer.corrected).toBe(true);
    expect(withTransfer.bottomX).toBe(0);
    expect(withTransfer.bottomY).toBeGreaterThan(30);
  });

  it('does not claim a correction when neither face needs steel in a direction', () => {
    // The ordinary sagging panel: the top face needs nothing, and "nothing to do" is
    // not "a transfer was made".
    expect(woodArmer(40, 30, 10).corrected).toBe(false);
    expect(woodArmer(40, 30, 10).topX).toBe(0);
    expect(woodArmer(40, 30, 10).topY).toBe(0);
  });

  it('produces top steel for a hogging field', () => {
    const d = woodArmer(-60, -40, 8);
    expect(d.topX).toBeGreaterThan(0);
    expect(d.topY).toBeGreaterThan(0);
    expect(d.bottomX).toBe(0);
  });

  it('scales linearly with the moment field', () => {
    const a = woodArmer(40, 30, 10);
    const b = woodArmer(80, 60, 20);
    expect(b.bottomX).toBeCloseTo(2 * a.bottomX, 9);
    expect(b.bottomY).toBeCloseTo(2 * a.bottomY, 9);
  });

  it('is symmetric under swapping the two directions', () => {
    const a = woodArmer(40, 25, 12);
    const b = woodArmer(25, 40, 12);
    expect(a.bottomX).toBeCloseTo(b.bottomY, 9);
    expect(a.bottomY).toBeCloseTo(b.bottomX, 9);
  });

  it('never returns a negative design moment', () => {
    for (const [mx, my, mxy] of [[-100, -80, 5], [10, -200, 50], [0, 0, 0]] as const) {
      const d = woodArmer(mx, my, mxy);
      for (const v of [d.bottomX, d.bottomY, d.topX, d.topY]) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Slab minimums and spacing ───────────────────────────────────

describe('§7.6.1 / §8.6.1.1 minimum steel and spacing', () => {
  it('uses 0,0018 A_g', () => {
    expect(SHRINKAGE_RATIO).toBe(0.0018);
    // 200 mm slab, per metre width: 0.0018 × 0.20 = 3.6 cm²/m.
    expect(minimumFlexuralSteel(0.20)).toBeCloseTo(0.00036, 9);
  });

  it('caps one-way spacing at the lesser of 3h and 300 mm', () => {
    expect(maxBarSpacing(0.08, 'oneWay', false).spacing).toBeCloseTo(0.24, 9);
    expect(maxBarSpacing(0.20, 'oneWay', false).spacing).toBeCloseTo(0.30, 9);
  });

  it('tightens two-way spacing to 2h at critical sections', () => {
    expect(maxBarSpacing(0.12, 'twoWay', true).spacing).toBeCloseTo(0.24, 9);
    expect(maxBarSpacing(0.12, 'twoWay', false).spacing).toBeCloseTo(0.30, 9);
  });

  it('allows shrinkage steel the looser 5h / 450 mm limit', () => {
    expect(maxShrinkageSpacing(0.08).spacing).toBeCloseTo(0.40, 9);
    expect(maxShrinkageSpacing(0.20).spacing).toBeCloseTo(0.45, 9);
  });

  it('cites the right clause per behaviour', () => {
    expect(maxBarSpacing(0.2, 'oneWay', false).refs[0].clause).toBe('7.7.2.3');
    expect(maxBarSpacing(0.2, 'twoWay', false).refs[0].clause).toBe('8.7.2.2');
  });
});

describe('slab bar selection', () => {
  const base = {
    thickness: 0.20, behaviour: 'oneWay' as const, critical: false,
    face: 'bottom' as const, direction: 'x' as const,
    maxAggregateSizeMm: 20, edition: '2025' as const,
  };

  it('meets the demand with a spacing on a settable module', () => {
    const l = selectSlabBars({ ...base, asRequired: 0.0006 })!;
    expect(l.asProvided).toBeGreaterThanOrEqual(0.0006);
    // 25 mm module, so a steel fixer can actually set it out.
    expect(Math.round(l.spacing * 1000) % 25).toBe(0);
  });

  it('never exceeds the code maximum spacing', () => {
    const l = selectSlabBars({ ...base, asRequired: 1e-9 })!;
    expect(l.spacing).toBeLessThanOrEqual(maxBarSpacing(0.20, 'oneWay', false).spacing + 1e-9);
  });

  it('falls back to the minimum when the demand is tiny, and says so', () => {
    const l = selectSlabBars({ ...base, asRequired: 1e-9 })!;
    expect(l.minimumGoverns).toBe(true);
    expect(l.asRequired).toBeCloseTo(minimumFlexuralSteel(0.20), 12);
  });

  it('prefers small bars closely spaced over large bars far apart', () => {
    // Better crack distribution, and what a detailer would specify.
    const l = selectSlabBars({ ...base, asRequired: 0.0005 })!;
    expect(l.diameterMm).toBeLessThanOrEqual(12);
  });

  it('escalates the diameter when a small bar cannot deliver the area', () => {
    const small = selectSlabBars({ ...base, asRequired: 0.0005 })!;
    const large = selectSlabBars({ ...base, asRequired: 0.004 })!;
    expect(large.diameterMm).toBeGreaterThan(small.diameterMm);
  });

  it('returns null rather than an illegal layout when nothing fits', () => {
    expect(selectSlabBars({ ...base, asRequired: 0.05 })).toBeNull();
  });
});

// ─── One-way shear ───────────────────────────────────────────────

describe('slab one-way shear', () => {
  it('derives the demand by integrating the load beyond d from the support', () => {
    // The shell output has no transverse shear; this is a free body, not an
    // interpolation. span 5 m, d 0.17 -> a = 2.33 m.
    const r = checkSlabOneWayShear({ qu: 10, span: 5, d: 0.17, fc: 25 });
    expect(r.vu).toBeCloseTo(10 * (2.5 - 0.17), 6);
  });

  it('passes an ordinary slab', () => {
    expect(checkSlabOneWayShear({ qu: 10, span: 5, d: 0.17, fc: 25 }).ok).toBe(true);
  });

  it('fails a thin slab under heavy load, rather than skipping the check', () => {
    const r = checkSlabOneWayShear({ qu: 60, span: 8, d: 0.09, fc: 20 });
    expect(r.ok).toBe(false);
    expect(r.utilization).toBeGreaterThan(1);
  });

  it('reports zero demand when the critical section falls outside the span', () => {
    expect(checkSlabOneWayShear({ qu: 10, span: 0.2, d: 0.17, fc: 25 }).vu).toBe(0);
  });

  it('scales with the load', () => {
    const a = checkSlabOneWayShear({ qu: 10, span: 5, d: 0.17, fc: 25 });
    const b = checkSlabOneWayShear({ qu: 20, span: 5, d: 0.17, fc: 25 });
    expect(b.vu).toBeCloseTo(2 * a.vu, 9);
  });

  it('computes Vc per Table 22.5.5.1 row (c) — the no-shear-reinforcement row', () => {
    // Row (c) for Av < Av,min: 0,66·λs·λ·(ρw)^⅓·√f'c·bw·d, ρw at the 0,0018
    // floor. Pre-fix this used row (a)'s 0,17 form — ~2× the (c) value,
    // unconservative (0,17 is for members WITH minimum shear reinforcement).
    const r = checkSlabOneWayShear({ qu: 10, span: 5, d: 0.17, fc: 25 });
    const lambdaS = Math.min(1, Math.sqrt(2 / (1 + 0.004 * 170)));
    const expectedVc = 0.66 * lambdaS * Math.cbrt(0.0018) * 5 * 0.17 * 1000;
    expect(r.phiVc).toBeCloseTo(0.75 * expectedVc, 6);
  });
});

// ─── Panel design ────────────────────────────────────────────────

function panel(over: Partial<SlabPanelInput> = {}): SlabPanelInput {
  return {
    panelId: 'P1', lx: 5, ly: 5, thickness: 0.20, cover: 0.025, supportedSides: 4,
    fc: 25, fy: 420, maxAggregateSizeMm: 20, edition: '2025',
    moments: { mx: 40, my: 30, mxy: 8 }, qu: 12,
    ...over,
  };
}

describe('slab panel design', () => {
  it('produces four bar layers for a two-way panel', () => {
    const r = designSlabPanel(panel());
    expect(r.behaviour).toBe('twoWay');
    expect(r.layers).toHaveLength(4);
    expect(new Set(r.layers.map((l) => `${l.face}-${l.direction}`)).size).toBe(4);
  });

  it('records the Wood-Armer step in the memo', () => {
    expect(designSlabPanel(panel()).memo.join('\n')).toMatch(/Wood-Armer/);
  });

  it('says when the sign correction was applied', () => {
    const r = designSlabPanel(panel({ moments: { mx: -5, my: 30, mxy: 20 } }));
    expect(r.memo.join('\n')).toMatch(/se transfiere a la otra en lugar de descartarse/);
  });

  it('declares openings unsupported rather than designing the panel as solid', () => {
    // An opening redistributes the moment field; a solid design is wrong exactly where
    // it matters most.
    const r = designSlabPanel(panel({ openings: [{ x: 1, y: 1, w: 1, h: 1 }] }));
    expect(r.unsupported.join(' ')).toMatch(/abertura/);
    expect(r.unsupported.join(' ')).toMatch(/justo donde más importa/);
  });

  it('flags a shear failure as unsupported rather than reporting a pass', () => {
    const r = designSlabPanel(panel({ thickness: 0.09, qu: 60, lx: 8, ly: 8 }));
    expect(r.shear.ok).toBe(false);
    expect(r.unsupported.join(' ')).toMatch(/corte en una dirección no verifica/);
  });

  it('is IMPLEMENTED_PROVISIONAL with a stated promotion path', () => {
    const m = designSlabPanel(panel()).maturity;
    expect(m.maturity).toBe('IMPLEMENTED_PROVISIONAL');
    // KEYS, not prose. These two assertions used to match Spanish sentences, and they passed
    // because the engine really did hold sentences in fields typed `EngineMessage` — so the
    // record's assumption had no `key` and every report containing a slab threw on it. The
    // assertion is now the one a pure engine can satisfy: a key the locales both define.
    expect(m.promotionPath?.key).toBe('slab.maturity.promotionPath');
    expect(m.assumptions.map((a) => a.key)).toContain('slab.maturity.leverArm');
  });

  it('cites only the declared edition', () => {
    for (const ed of ['2025', '2005'] as const) {
      const r = designSlabPanel(panel({ edition: ed }));
      const c = r.refs.filter((x) => x.regulation === 'cirsoc-201' && /^[78]\./.test(x.clause));
      for (const ref of c) expect(ref.edition).toBe(ed);
    }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(designSlabPanel(panel())))
      .toBe(JSON.stringify(designSlabPanel(panel())));
  });
});

// ─── Walls ───────────────────────────────────────────────────────

describe('§11.6.1 minimum wall reinforcement', () => {
  it('applies the reduced ratios only to Ø16 and smaller with fy >= 420', () => {
    const relaxed = minimumWallRatios(12, 420, '2025');
    expect(relaxed.rhoL).toBeCloseTo(0.0012, 9);
    expect(relaxed.rhoT).toBeCloseTo(0.0020, 9);
  });

  it('does NOT give a Ø20 wall the reduced ratio', () => {
    // Applying it anyway under-reinforces the wall.
    const r = minimumWallRatios(20, 420, '2025');
    expect(r.rhoL).toBeCloseTo(0.0015, 9);
    expect(r.rhoT).toBeCloseTo(0.0025, 9);
    expect(r.note).toMatch(/NO corresponden/);
  });

  it('does not give a low-grade steel the reduced ratio either', () => {
    expect(minimumWallRatios(12, 220, '2025').rhoL).toBeCloseTo(0.0015, 9);
  });

  it('caps spacing at the lesser of 3h and 450 mm', () => {
    expect(maxWallSpacing(0.10, '2025').spacing).toBeCloseTo(0.30, 9);
    expect(maxWallSpacing(0.25, '2025').spacing).toBeCloseTo(0.45, 9);
  });

  it('applies the §11.3.1.1 minimum thickness', () => {
    // min(3.0, 6.0)/25 = 120 mm, above the 100 mm floor.
    expect(minimumWallThickness(3.0, 6.0, '2025').thickness).toBeCloseTo(0.12, 9);
    // A short wall is governed by the 100 mm floor.
    expect(minimumWallThickness(2.0, 2.0, '2025').thickness).toBeCloseTo(0.10, 9);
  });
});

describe('wall in-plane shear', () => {
  const base = {
    length: 4, thickness: 0.20, fc: 25, rhoT: 0.0025, fy: 420, edition: '2025' as const,
  };

  it('passes a lightly loaded wall', () => {
    expect(checkWallInPlaneShear({ ...base, vu: 200 }).ok).toBe(true);
  });

  it('recognises the §11.5.4.2 ceiling, where more steel does not help', () => {
    // Above 0,66 √f'c A_cv the wall fails by web crushing (0,83 was the 2005 value).
    const heavy = checkWallInPlaneShear({ ...base, rhoT: 0.02, vu: 100 });
    expect(heavy.atLimit).toBe(true);
    expect(heavy.phiVn).toBeCloseTo(0.75 * heavy.vnLimit, 6);
    expect(heavy.memo).toMatch(/aplastamiento del alma/);
  });

  it('does not send the engineer down the wrong path on an over-stressed wall', () => {
    const r = checkWallInPlaneShear({ ...base, rhoT: 0.02, vu: 99999 });
    expect(r.ok).toBe(false);
    expect(r.atLimit).toBe(true);
  });

  it('scales the shear area with length and thickness', () => {
    expect(checkWallInPlaneShear({ ...base, vu: 100 }).acv).toBeCloseTo(0.8, 9);
    expect(checkWallInPlaneShear({ ...base, length: 8, vu: 100 }).acv).toBeCloseTo(1.6, 9);
  });
});

describe('wall axial-flexural interaction', () => {
  const base = {
    length: 4, thickness: 0.20, fc: 25, fy: 420, rhoL: 0.0015,
    edition: '2025' as const,
  };

  it('passes a lightly loaded wall', () => {
    expect(checkWallAxialFlexure({ ...base, pu: 500, mu: 200 }).ok).toBe(true);
  });

  it('fails an over-loaded wall', () => {
    expect(checkWallAxialFlexure({ ...base, pu: 20000, mu: 8000 }).ok).toBe(false);
  });

  it('increases utilization monotonically with both actions', () => {
    const a = checkWallAxialFlexure({ ...base, pu: 500, mu: 200 }).utilization;
    const morP = checkWallAxialFlexure({ ...base, pu: 2000, mu: 200 }).utilization;
    const morM = checkWallAxialFlexure({ ...base, pu: 500, mu: 900 }).utilization;
    expect(morP).toBeGreaterThan(a);
    expect(morM).toBeGreaterThan(a);
  });

  it('computes Pn0 from the gross section and the steel', () => {
    const r = checkWallAxialFlexure({ ...base, pu: 100, mu: 10 });
    const ag = 0.8;
    const ast = 0.0015 * ag;
    expect(r.pn0).toBeCloseTo((0.85 * 25 * (ag - ast) + 420 * ast) * 1000, 3);
  });
});

// Vu = 100 kN, under 0,04·φ·√f'c·Acv = 0,04·0,75·5·0,80 = 120 kN: the minimum is Tabla 11.6.1 (§11.6.1),
// which the hand values of 'wall design' read. The same wall at 200 kN, past the threshold, is designed by
// §11.6.2 in 'wall design at Vu = 200 kN' below.
function wall(over: Partial<WallDesignInput> = {}): WallDesignInput {
  return {
    wallId: 'W1', length: 4, height: 3, thickness: 0.20, cover: 0.025,
    fc: 25, fy: 420, barDiameterMm: 12, edition: '2025',
    pu: 800, muInPlane: 300, vuInPlane: 100, seismicRequired: false,
    ...over,
  };
}

describe('wall design', () => {
  it('produces the curtains §11.7.2.3 asks for, at legal spacing', () => {
    // 20 cm: one curtain. ρl = 0,0012·0,20 = 2,4 cm²/m against Ø12 = 1,131 cm²: c/45 (the 45 cm cap).
    const r = designWall(wall());
    expect(r.reinforcement.curtains).toBe(1);
    expect(r.verticalSpacing).toBeCloseTo(0.45, 9);
    expect(r.horizontalSpacing).toBeGreaterThan(0);
    expect(r.verticalSpacing).toBeLessThanOrEqual(maxWallSpacing(0.20, '2025').spacing + 1e-9);
    expect(r.memo.join(' ')).toMatch(/Una cortina/);
    // 30 cm: two curtains, each carrying half: 2·1,131/(0,0012·0,30·1e4) = 0,628 → c/60, capped at 45.
    const t = designWall(wall({ thickness: 0.30 }));
    expect(t.reinforcement.curtains).toBe(2);
    expect(t.memo.join(' ')).toMatch(/Dos cortinas/);
  });

  it('flags a wall thinner than the §11.3.1.1 minimum', () => {
    const r = designWall(wall({ thickness: 0.08, height: 4, length: 4 }));
    expect(r.thicknessOk).toBe(false);
    expect(r.unsupported.join(' ')).toMatch(/no alcanza el mínimo/);
  });

  it('declares a seismic wall unsupported rather than giving it a non-seismic boundary element', () => {
    // That would have the appearance of a complete design without being one.
    const r = designWall(wall({ seismicRequired: true }));
    expect(r.unsupported.join(' ')).toMatch(/INPRES-CIRSOC 103 Parte II/);
    expect(r.unsupported.join(' ')).toMatch(/apariencia de diseño completo/);
  });

  it('does not raise the seismic condition on a non-seismic project', () => {
    expect(designWall(wall()).unsupported.join(' ')).not.toMatch(/103 Parte II/);
  });

  it('reinforces its openings (§11.7.5.1) and still declares coupling unsupported', () => {
    const r = designWall(wall({ openings: [{ x: 1, y: 1, w: 1, h: 1 }], coupled: true }));
    expect(r.reinforcement.openings).toEqual({ count: 2, diameter: 16 });
    expect(r.checks.find((c) => c.category === 'Openings (§11.7.5)')?.ok).toBe(true);
    expect(r.unsupported.join(' ')).toMatch(/acoplado/);
  });

  it('checks the bending out of the plane on a metre strip', () => {
    // No axial load; Ø12 c/45 at mid-thickness: As = 2,513 cm²/m, d = 0,10 m.
    // a = 2,513e−4·420/(0,85·25) = 4,967 mm; Mn = 2,513e−4·420 000·(0,10 − 0,002483) = 10,292;
    // εt ≫ 0,005, φ = 0,90: φMn = 9,263 kN·m/m, and 5 kN·m/m uses 0,540 of it.
    const r = designWall(wall({ pu: 0, muInPlane: 0, muOutOfPlane: 5 }));
    const c = r.checks.find((x) => x.category === 'Out-of-plane (vertical bars)')!;
    expect(c.utilization).toBeCloseTo(5 / 9.263, 2);
    expect(c.ok).toBe(true);
  });

  it('concentrates bars at the ends when the distributed steel does not carry the in-plane moment', () => {
    const r = designWall(wall({ muInPlane: 2600 }));
    expect(r.reinforcement.boundary).toBeDefined();
    expect(r.axialFlexure.ok).toBe(true);
  });

  it('is IMPLEMENTED_PROVISIONAL with a stated promotion path', () => {
    const m = designWall(wall()).maturity;
    expect(m.maturity).toBe('IMPLEMENTED_PROVISIONAL');
    expect(m.promotionPath?.key).toBe('wall.maturity.promotionPath');
    expect(m.assumptions.map((a) => a.key))
      .toContain('wall.maturity.simplifiedInteraction');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(designWall(wall()))).toBe(JSON.stringify(designWall(wall())));
  });
});

/*
 * The same wall at Vu = 200 kN > 120 kN: §11.6.2 (capitulo-11-tabiques.md:590-608) governs, not Tabla 11.6.1.
 *   Design: ρt ≥ 0,0025 and ρl ≥ max(0,0025; 0,0025 + 0,5·(2,5 − hw/ℓw)·(ρt − 0,0025)) = 0,0025 at ρt = 0,0025.
 *   One curtain (t = 0,20 ≤ 0,25), Ø12 = 1,1310 cm²: As = 0,0025·0,20 = 5,0 cm²/m → s = 1,1310/5,0 = 0,2262 m,
 *   down to 0,225 m (2,5 cm steps), both directions.
 *   Placed: ρl = ρt = 1,1310e-4/(0,225·0,20) = 0,0025133.
 *   Check (11.6.2 with the ρt placed): hw/ℓw = 3/4 = 0,75,
 *     ρl,req = 0,0025 + 0,5·(2,5 − 0,75)·(0,0025133 − 0,0025) = 0,0025116 → 0,0025116/0,0025133 = 0,99934;
 *     ρt,req = 0,0025 → 0,0025/0,0025133 = 0,99472. Both hold, near the limit (> 0,95): no deficiency.
 *   Out of the plane, 5 kN·m/m, no axial load, Ø12 c/22,5 at mid-thickness: As = 5,0265 cm²/m, d = 0,10 m,
 *     a = 5,0265e-4·420/(0,85·25) = 9,935 mm, εt = 0,0227 → φ = 0,90; φMn = 0,9·5,0265e-4·420 000·(0,10 − 0,004967)
 *     = 18,057 kN·m/m → 5/18,057 = 0,2769 (0,540 at Vu = 100 kN, with Ø12 c/45).
 *   In the plane, Pu = 800 kN, Mu = 2600 kN·m, 18 bars Ø12 (n = ⌊4/0,225⌋ + 1) over 3,914 m, by strain
 *     compatibility at φ·Pn = Pu (worked in a script): c = 0,428 m, εt = 0,0247, φ = 0,90, φMn = 2849 kN·m →
 *     2600/2849 = 0,913: no boundary bars. (At Vu = 100 kN the 9 bars of c/45 give 2206 kN·m, hence the boundary.)
 */
describe('wall design at Vu = 200 kN (§11.6.2)', () => {
  const w200 = (over: Partial<WallDesignInput> = {}) => wall({ vuInPlane: 200, ...over });

  it('designs ρl and ρt to 0,0025, at c/22,5 both ways', () => {
    const r = designWall(w200());
    expect([r.ratios.rhoL, r.ratios.rhoT]).toEqual([0.0025, 0.0025]);
    expect(r.ratios.refs[0]!.clause).toBe('11.6.2');
    expect([r.verticalSpacing, r.horizontalSpacing]).toEqual([0.225, 0.225]);
  });

  it('the bars placed meet 11.6.2, at 0,99934 and 0,99472 of it', () => {
    const r = designWall(w200());
    const v = r.checks.find((c) => c.category === 'Min vertical ratio')!, h = r.checks.find((c) => c.category === 'Min horizontal ratio')!;
    expect(v.utilization).toBeCloseTo(0.99934, 4);
    expect(h.utilization).toBeCloseTo(0.99472, 4);
    expect([v.ok, h.ok]).toEqual([true, true]);
    expect(v.description).toContain('(11.6.2)');
    const rows = wallCheckRows(r).filter((x) => x.title.startsWith('Min '));
    expect(rows.map((x) => [x.clause, x.status])).toEqual([['11.6.2', 'nearLimit'], ['11.6.2', 'nearLimit']]);
  });

  it('out of the plane the closer verticals carry 5 kN·m/m at 0,2769', () => {
    const r = designWall(w200({ pu: 0, muInPlane: 0, muOutOfPlane: 5 }));
    expect(r.checks.find((x) => x.category === 'Out-of-plane (vertical bars)')!.utilization).toBeCloseTo(0.2769, 3);
  });

  it('in the plane the distributed steel carries 2600 kN·m: no boundary bars', () => {
    const r = designWall(w200({ muInPlane: 2600 }));
    expect(r.reinforcement.boundary).toBeUndefined();
    expect(r.axialFlexure.ok).toBe(true);
    expect(r.axialFlexure.utilization).toBeCloseTo(2600 / 2849.1, 2);
  });
});

