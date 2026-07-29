/**
 * Physical transverse reinforcement ON THE PRODUCTION PATH.
 *
 * `transverse-cage.test.ts` proves the geometry against the regulation in isolation. This file
 * proves the generator actually emits it, on the two fixtures that exercise both rows of
 * Table 9.7.6.2.2:
 *
 *   rc-design-qa-8      — row 1 throughout, 2 legs, NO crosstie
 *   rc-design-qa-row2   — row 2 at the supports, 3 legs, crosstie REQUIRED
 *
 * Both are run through solve → design → generate, with nothing seeded.
 */

import { describe, expect, it } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import row2 from '../../../templates/fixtures/rc-design-qa-row2.json';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { solveFixture } from '../../design/__tests__/helpers';
import { computeBeamSeed } from '../../design/candidate-enumerate-beam';
import { generateBeamBars } from '../generate-beam';
import {
  bendsWithoutLongitudinalBar, legsProvided, stirrupCentrelineHalfExtents,
} from '../../../codes/cirsoc201/transverse-cage';
import { acrossWidthSpan } from '../../../codes/cirsoc201/transverse-spacing';

/**
 * Solve → design → generate, for every beam, with nothing seeded.
 *
 * The generator input is built the way `run-detailing.ts` builds it, including the field
 * rename the accepted reinforcement needs: the design surface stores `{count, diameter}` while
 * `BeamGenerationInput` takes `{count, diameterMm}`. Passing the former straight through
 * produced `NaN` coordinates for the whole cage — silently, because `NaN <= reach` is simply
 * false, so every containment check "failed" rather than erroring. Mapped explicitly here.
 */
function generated(fixture: unknown) {
  const solved = solveFixture(fixture as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  const out = new Map<number, ReturnType<typeof generateBeamBars>>();
  for (const [id, ctx] of solved.contexts) {
    if (ctx.elementType !== 'beam') continue;
    const acc = summary.outcomes.get(id)?.accepted;
    if (!acc?.regions) continue;
    const st = acc.regions;
    const el = ctx.modelData.elements.get(id)!;
    const nI = ctx.modelData.nodes.get(el.nodeI)!;
    const nJ = ctx.modelData.nodes.get(el.nodeJ)!;
    const L = Math.hypot(nJ.x - nI.x, nJ.y - nI.y, (nJ.z ?? 0) - (nI.z ?? 0));
    // REAL solved demands, so the zones select the row the structure actually is in. Using
    // hand-written station shears here first made the row-2 fixture look like row 1.
    const seed = computeBeamSeed(ctx);
    const g = (d: { count: number; diameter: number }) =>
      ({ count: d.count, diameterMm: d.diameter });
    out.set(id, generateBeamBars({
      elementId: id, L,
      b: ctx.axes.bFlex, h: ctx.axes.hFlex,
      d: ctx.axes.hFlex - ctx.material.cover - ctx.material.stirrupDia / 1000,
      cover: ctx.material.cover, stirrupDia: st.stirrupsSupport!.diameter,
      fc: ctx.material.fc, fy: ctx.material.fy, maxAggregateSizeMm: 19,
      edition: '2025',
      stations: [
        { x: 0, mPos: 0, mNeg: seed.MuStart, v: seed.VuSupport },
        { x: L / 2, mPos: seed.MuSpan, mNeg: 0, v: seed.VuSpan },
        { x: L, mPos: 0, mNeg: seed.MuEnd, v: seed.VuSupport },
      ],
      supportI: 'continuous', supportJ: 'continuous',
      vn: Math.max(seed.VuSupport, 1),
      bottom: g(st.bottomSpan!), topStart: g(st.topStart!), topEnd: g(st.topEnd!),
      lateralSystem: false,
      ld: (dia: number) => 40 * dia / 1000,
      origin: { x: nI.x, y: nI.y, z: nI.z ?? 0 },
      axis: {
        x: (nJ.x - nI.x) / L, y: (nJ.y - nI.y) / L, z: ((nJ.z ?? 0) - (nI.z ?? 0)) / L,
      },
      up: { x: 0, y: 0, z: 1 },
      bentUp: { seismicDesign: 'notRequired', optOut: true },
    } as never));
  }
  return { solved, summary, out };
}

describe('qa-8 — row 1 everywhere, so real stirrups and NO crossties', () => {
  const { out } = generated(qa8);

  it('emits physical transverse pieces for every beam', () => {
    expect(out.size).toBe(4);
    for (const [id, g] of out) {
      expect(g.transverse.length, `element ${id}`).toBeGreaterThan(0);
      // Every piece is a real bar with geometry and a fabricated length.
      for (const p of g.transverse) {
        expect(p.path.segments.length).toBeGreaterThan(0);
        expect(p.path.cuttingLength).toBeGreaterThan(0);
        expect(p.path.role).toBe('transverse');
        expect(p.path.ownerElementIds).toEqual([id]);
      }
    }
  });

  it('every piece is a closed stirrup — a 300 mm web in row 1 needs no crosstie', () => {
    for (const [id, g] of out) {
      const ties = g.transverse.filter((p) => p.shape === 'crosstie');
      expect(ties, `element ${id}`).toEqual([]);
      expect(g.transverse.every((p) => p.legsContributed === 2)).toBe(true);
    }
  });

  it('§25.7.1.2 is FULLY satisfied — every bend contains a longitudinal bar', () => {
    // Row 1 throughout, so 2 legs and no crossties. Spreading layer 0 seats the outer bar
    // against the leg, so every closed-stirrup corner grips a bar by construction. This block
    // asserted the VIOLATION two commits ago, when the mat was centred and left the corners
    // empty (bar ±93,3 mm against a corner at ±122 mm, 6Ø12 in a 300 mm web).
    for (const [id, g] of out) {
      expect(bendsWithoutLongitudinalBar(g.transverse), `element ${id}`).toEqual([]);
      expect(g.transverseFindings.bendsWithoutBar, `element ${id}`).toBe(0);
      expect(g.unsupported.filter((u) => u.includes('25.7.1.2')), `element ${id}`).toEqual([]);
      for (const p of g.transverse) {
        for (const c of p.cornerContainment) {
          expect(c.longitudinalBarId, `element ${id} ${p.path.id}`).toBeTruthy();
        }
      }
    }
  });

  it('does NOT apply the column clause §25.7.2.3(b) to a beam', () => {
    // §25.7.2.3 is under "Estribos cerrados de COLUMNAS". Reporting it against a beam would
    // be applying a clause to a member it does not govern.
    for (const [id, g] of out) {
      expect(g.unsupported.filter((u) => u.includes('25.7.2.3')), `element ${id}`).toEqual([]);
    }
  });

  it('leg positions match the across-width span the spacing rule uses', () => {
    for (const [, g] of out) {
      const { halfAcross } = stirrupCentrelineHalfExtents(0.3, 0.55, 0.025,
        g.transverse[0].path.diameterMm);
      expect(2 * halfAcross).toBeCloseTo(
        acrossWidthSpan(0.3, 0.025, g.transverse[0].path.diameterMm), 12);
      for (const p of g.transverse) {
        expect(Math.min(...p.legOffsets)).toBeCloseTo(-halfAcross, 9);
        expect(Math.max(...p.legOffsets)).toBeCloseTo(halfAcross, 9);
      }
    }
  });

  it('hook anchorage §25.7.1.3 is satisfied — no condition reported for it', () => {
    for (const [id, g] of out) {
      expect(g.unsupported.filter((u) => u.includes('25.7.1.3')), `element ${id}`).toEqual([]);
    }
  });
});

describe('row-2 fixture — crossties are FABRICATED, not counted', () => {
  const { out } = generated(row2);

  it('emits crossties, with a real path each', () => {
    expect(out.size).toBe(4);
    for (const [id, g] of out) {
      const ties = g.transverse.filter((p) => p.shape === 'crosstie');
      expect(ties.length, `element ${id}`).toBeGreaterThan(0);
      for (const t of ties) {
        // The whole point: a required third leg is a fabricated piece, not a number.
        expect(t.path.segments.length).toBeGreaterThanOrEqual(3);
        expect(t.path.cuttingLength).toBeGreaterThan(0.4);
        expect(t.legsContributed).toBe(1);
        expect(t.path.startTreatment.kind).toBe('hook');
        expect(t.path.endTreatment.kind).toBe('hook');
      }
    }
  });

  it('a three-leg set is one stirrup plus one crosstie at the same station', () => {
    const g = [...out.values()][0];
    const byStation = new Map<number, typeof g.transverse>();
    for (const p of g.transverse) {
      const k = +p.station.toFixed(4);
      byStation.set(k, [...(byStation.get(k) ?? []), p]);
    }
    const threeLegStations = [...byStation.values()].filter((set) => legsProvided(set) === 3);
    expect(threeLegStations.length).toBeGreaterThan(0);
    for (const set of threeLegStations) {
      expect(set.filter((p) => p.shape === 'closedStirrup')).toHaveLength(1);
      expect(set.filter((p) => p.shape === 'crosstie')).toHaveLength(1);
      // The crosstie sits on the section centreline, between the two stirrup legs.
      expect(set.find((p) => p.shape === 'crosstie')!.legOffsets[0]).toBeCloseTo(0, 9);
    }
  });

  it('crosstie hooks are 135° at one end and 90° at the other — §25.3.5(b),(c)', () => {
    // Not 135° at both ends, and not justified by the column clause §25.7.2.3(a).
    for (const [id, g] of out) {
      for (const t of g.transverse.filter((p) => p.shape === 'crosstie')) {
        const angles = [t.path.startTreatment, t.path.endTreatment]
          .map((x) => (x.kind === 'hook' ? x.hook.angle : 0))
          .sort((a, b) => a - b);
        expect(angles, `element ${id} ${t.path.id}`).toEqual([90, 135]);
      }
    }
  });

  it('§25.3.5(e): the 90° end alternates between successive crossties', () => {
    // NORMATIVE — "deben quedar con los extremos alternados".
    const g = [...out.values()][0];
    const ties = g.transverse.filter((p) => p.shape === 'crosstie')
      .sort((a, b) => a.station - b.station);
    expect(ties.length).toBeGreaterThan(2);
    const ninetyAtStart = ties.map((t) =>
      t.path.startTreatment.kind === 'hook' && t.path.startTreatment.hook.angle === 90);
    // Consecutive ties must not put the 90° end on the same side.
    let alternations = 0;
    for (let i = 1; i < ninetyAtStart.length; i++) {
      if (ninetyAtStart[i] !== ninetyAtStart[i - 1]) alternations++;
    }
    expect(alternations).toBeGreaterThan(0);
  });

  it('SOURCE GATE: no column-only clause on a beam transverse bar', () => {
    for (const [id, g] of out) {
      for (const p of g.transverse) {
        const bad = p.path.refs.filter((r) => r.clause.startsWith('25.7.2'));
        expect(bad.map((r) => r.clause), `element ${id} ${p.shape}`).toEqual([]);
      }
    }
  });

  it('§25.7.1.2: satisfied at every STIRRUP bend; the centreline crosstie is the exception', () => {
    // MEASURED, and the exception is real rather than a tolerance artefact.
    //
    // Spreading layer 0 fixed every closed-stirrup corner: the outer bar now seats against the
    // leg. What remains is the CROSSTIE. Row 2 needs a third leg, and the interior leg falls on
    // the section centreline, where this fixture has no bar to embrace — its bottom mat is 6Ø12,
    // an EVEN count, so no bar sits at across = 0. The top mat is 7Ø10 and does have one.
    //
    // The cage tries to snap the interior leg to an offset carrying a bar on BOTH faces
    // (§25.3.5(d)), but no such offset also satisfies Table 9.7.6.2.2's 200 mm across-width
    // limit here, and that limit wins because both are mandatory. So the leg stays on the even
    // division and reports that it grips only one face.
    //
    // The fix is a DESIGN change, not a geometry one: the candidate search must be able to offer
    // an odd bottom count so a centreline bar exists. That is the named next step.
    for (const [id, g] of out) {
      const loose = bendsWithoutLongitudinalBar(g.transverse);
      const stirrupBends = g.transverse.filter((p) => p.shape === 'closedStirrup');
      // Every closed-stirrup corner now grips a bar.
      expect(bendsWithoutLongitudinalBar(stirrupBends), `element ${id} stirrups`).toEqual([]);
      // What is left is crossties only, and it is reported as a blocker.
      expect(loose.length, `element ${id}`).toBeGreaterThan(0);
      const looseIds = new Set(loose.map((b) => b.pieceId));
      for (const pid of looseIds) expect(pid).toContain('crosstie');
      // Reported under §25.3.5(d): every loose bend here belongs to a crosstie, and that
      // clause states both the requirement and the remedy — the hooks must embrace peripheral
      // bars, so the missing thing is a bar line, not a different cage.
      expect(g.unsupported.some((u) => u.includes('25.3.5(d)')), `element ${id}`).toBe(true);
    }
  });

  it('every closed-stirrup bend names the bar it restrains', () => {
    for (const [id, g] of out) {
      for (const p of g.transverse.filter((x) => x.shape === 'closedStirrup')) {
        for (const c of p.cornerContainment) {
          expect(c.longitudinalBarId, `element ${id} ${p.path.id}`).toBeTruthy();
        }
      }
    }
  });

  it('does NOT apply the column clause §25.7.2.3(b) to a beam', () => {
    // §25.7.2.3 is under "Estribos cerrados de COLUMNAS". Reporting it against a beam would
    // be applying a clause to a member it does not govern.
    for (const [id, g] of out) {
      expect(g.unsupported.filter((u) => u.includes('25.7.2.3')), `element ${id}`).toEqual([]);
    }
  });

  it('hooks stagger between consecutive stations (C 25.7.2.3.1 — practice)', () => {
    const g = [...out.values()][0];
    const stirrups = g.transverse
      .filter((p) => p.shape === 'closedStirrup')
      .sort((a, b) => a.station - b.station);
    expect(stirrups.length).toBeGreaterThan(3);
    const orientations = stirrups.slice(0, 4).map((p) => p.hookOrientation);
    expect(new Set(orientations).size).toBe(2);
  });

  it('no two pieces of the same shape share a station within a zone', () => {
    // The duplicate-at-a-boundary defect: one point must get one bar.
    for (const [id, g] of out) {
      const keys = g.transverse.map((p) => `${p.zoneId}|${p.shape}|${p.station.toFixed(6)}`);
      expect(new Set(keys).size, `element ${id}`).toBe(keys.length);
    }
  });

  it('quantities are derived from the generated paths, not from a formula', () => {
    for (const [, g] of out) {
      const total = g.transverse.length;
      const stirrups = g.transverse.filter((p) => p.shape === 'closedStirrup').length;
      const ties = g.transverse.filter((p) => p.shape === 'crosstie').length;
      expect(stirrups + ties).toBe(total);
      // Total steel length is a sum over real bars.
      const steel = g.transverse.reduce((m, p) => m + p.path.cuttingLength, 0);
      expect(steel).toBeGreaterThan(0);
      expect(steel).toBeCloseTo(
        g.transverse.reduce((m, p) =>
          m + p.path.segments.reduce((q, sg) => q + sg.length, 0), 0), 6);
    }
  });
});

describe('the two fixtures differ in exactly the way the table says', () => {
  it('qa-8 fabricates no crosstie; row2 does', () => {
    const a = generated(qa8), b = generated(row2);
    const aTies = [...a.out.values()].flatMap((g) => g.transverse)
      .filter((p) => p.shape === 'crosstie').length;
    const bTies = [...b.out.values()].flatMap((g) => g.transverse)
      .filter((p) => p.shape === 'crosstie').length;
    expect(aTies).toBe(0);
    expect(bTies).toBeGreaterThan(0);
  });
});
