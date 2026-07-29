import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STOCK_LENGTH_M, barMass, buildStraightBarWithHooks, centrelineRadius,
  developedLength, hookDevelopedLength, minMandrelDiameter, planCuts, samplePath,
  standardHook, straightSegment, type BarPath, type Point3,
} from '../../../codes/cirsoc201/bar-geometry';
import {
  DEFAULT_TOLERANCES, checkCover, detectCollisions, type SectionPrism,
} from '../collision';

const X: Point3 = { x: 1, y: 0, z: 0 };
const Z: Point3 = { x: 0, y: 0, z: 1 };
const p = (x: number, y = 0, z = 0): Point3 => ({ x, y, z });

describe('§25.3 Table 25.3.1 — longitudinal bar mandrels and hooks', () => {
  it('uses 6 d_b up to Ø25', () => {
    for (const d of [10, 16, 20, 25]) {
      expect(minMandrelDiameter(d, 'longitudinal').value).toBeCloseTo(6 * d / 1000, 9);
    }
  });

  it('steps to 8 d_b at Ø32 and 10 d_b at Ø40 and above', () => {
    expect(minMandrelDiameter(32, 'longitudinal').value).toBeCloseTo(8 * 0.032, 9);
    expect(minMandrelDiameter(40, 'longitudinal').value).toBeCloseTo(10 * 0.040, 9);
    expect(minMandrelDiameter(50, 'longitudinal').value).toBeCloseTo(10 * 0.050, 9);
  });

  it('gives a 90° hook a 12 d_b straight extension', () => {
    expect(standardHook(20, 90, 'longitudinal').extension).toBeCloseTo(12 * 0.020, 9);
  });

  it('gives a 180° hook max(4 d_b, 65 mm)', () => {
    // Ø10: 4 d_b = 40 mm, so the 65 mm floor governs.
    expect(standardHook(10, 180, 'longitudinal').extension).toBeCloseTo(0.065, 9);
    // Ø25: 4 d_b = 100 mm governs.
    expect(standardHook(25, 180, 'longitudinal').extension).toBeCloseTo(0.100, 9);
  });

  it('flags the untabulated 135° longitudinal hook instead of inventing a value', () => {
    const h = standardHook(20, 135, 'longitudinal');
    expect(h.refs.some((r) => r.note?.includes('no tabula'))).toBe(true);
  });
});

describe('§25.3 Table 25.3.2 — stirrup mandrels and hooks', () => {
  it('uses 4 d_be up to Ø16 and 6 d_be from Ø20', () => {
    expect(minMandrelDiameter(10, 'transverse').value).toBeCloseTo(4 * 0.010, 9);
    expect(minMandrelDiameter(16, 'transverse').value).toBeCloseTo(4 * 0.016, 9);
    expect(minMandrelDiameter(20, 'transverse').value).toBeCloseTo(6 * 0.020, 9);
    expect(minMandrelDiameter(25, 'transverse').value).toBeCloseTo(6 * 0.025, 9);
  });

  it('does not confuse the two tables', () => {
    // A Ø16 stirrup bends around 4 d_b; a Ø16 main bar around 6 d_b. Using the wrong
    // one produces a cage that is the wrong size for its section.
    expect(minMandrelDiameter(16, 'transverse').value)
      .toBeLessThan(minMandrelDiameter(16, 'longitudinal').value);
  });

  it('gives a 135° stirrup hook max(6 d_be, 75 mm)', () => {
    expect(standardHook(8, 135, 'transverse').extension).toBeCloseTo(0.075, 9);
    expect(standardHook(16, 135, 'transverse').extension).toBeCloseTo(0.096, 9);
  });

  it('gives a 90° stirrup hook 12 d_be from Ø20', () => {
    expect(standardHook(20, 90, 'transverse').extension).toBeCloseTo(12 * 0.020, 9);
  });

  it('cites 2025 tables ONLY, because they are the only bend rules implemented', () => {
    // This test asserted the opposite. `standardHook(…, '2005')` used to relabel Tables
    // 25.3.1/25.3.2 as CIRSOC 201-2005 §7.1/§7.2 while returning the SAME numbers — the 2025
    // rule under a 2005 label, with a clause identifier the 2005 edition does not contain.
    // The 2005 text is not supplied, so its bend rules cannot be implemented; the edition
    // parameter is gone from these functions rather than silently ignored.
    for (const role of ['transverse', 'longitudinal'] as const) {
      for (const angle of [90, 135, 180] as const) {
        for (const dia of [8, 16, 20, 25, 32]) {
          for (const ref of standardHook(dia, angle, role).refs) {
            expect(ref.edition, `${role} ${angle} Ø${dia}`).toBe('2025');
            expect(ref.regulation).toBe('cirsoc-201');
          }
        }
      }
    }
  });

  it('takes no edition argument at all, so a 2005 stamp is unrepresentable', () => {
    // A compile-time guarantee expressed as a runtime one: the arity is the gate.
    expect(standardHook.length).toBe(3);
    expect(minMandrelDiameter.length).toBe(2);
  });
});

describe('bend radius arithmetic', () => {
  it('converts the inside mandrel diameter to a centreline radius', () => {
    // The classic error is off by d_b/2 and produces a cage that will not close.
    // Ø20, mandrel 6 d_b = 120 mm inside -> centreline radius (120 + 20)/2 = 70 mm.
    expect(centrelineRadius(0.120, 20)).toBeCloseTo(0.070, 9);
  });

  it('makes the centreline radius larger than half the mandrel, always', () => {
    for (const d of [8, 10, 16, 20, 25, 32]) {
      const m = minMandrelDiameter(d, 'longitudinal').value;
      expect(centrelineRadius(m, d)).toBeGreaterThan(m / 2);
    }
  });

  it('counts the arc in the hook developed length', () => {
    const h = standardHook(25, 180, 'longitudinal');
    const arc = h.centrelineRadius * Math.PI;
    expect(hookDevelopedLength(h)).toBeCloseTo(arc + h.extension, 9);
    // A schedule that added only the extension would under-order by the arc — about
    // 137 mm on this bar.
    expect(hookDevelopedLength(h) - h.extension).toBeGreaterThan(0.10);
  });
});

describe('bar paths', () => {
  const bar = (over: Partial<Parameters<typeof buildStraightBarWithHooks>[0]> = {}) =>
    buildStraightBarWithHooks({
      id: 'b1', diameterMm: 20, role: 'longitudinal',
      start: p(0), end: p(5), axis: X, hookNormal: Z,
      ownerElementIds: [1], ...over,
    });

  it('gives a plain straight bar its own length', () => {
    const b = bar();
    expect(b.segments).toHaveLength(1);
    expect(b.cuttingLength).toBeCloseTo(5, 9);
  });

  it('adds arc and extension for each hook', () => {
    const plain = bar().cuttingLength;
    const hooked = bar({ endHook: 90 }).cuttingLength;
    const h = standardHook(20, 90, 'longitudinal');
    expect(hooked - plain).toBeCloseTo(hookDevelopedLength(h), 6);
  });

  it('is longer with two hooks than with one', () => {
    expect(bar({ startHook: 90, endHook: 90 }).cuttingLength)
      .toBeGreaterThan(bar({ endHook: 90 }).cuttingLength);
  });

  it('records the treatment at each end', () => {
    const b = bar({ startHook: 180, endHook: 90 });
    expect(b.startTreatment.kind).toBe('hook');
    expect(b.endTreatment.kind).toBe('hook');
    expect(b.startTreatment.kind === 'hook' && b.startTreatment.hook.angle).toBe(180);
  });

  it('keeps developedLength and cuttingLength in agreement', () => {
    const b = bar({ startHook: 90, endHook: 180 });
    expect(developedLength(b.segments)).toBeCloseTo(b.cuttingLength, 12);
  });

  it('samples arcs finely enough for collision testing', () => {
    const b = bar({ endHook: 180 });
    const pts = samplePath(b, 0.005);
    // A single chord across a 180° hook would be useless for clash detection.
    expect(pts.length).toBeGreaterThan(6);
  });

  it('is byte-deterministic — the same input gives an identical path', () => {
    expect(JSON.stringify(bar({ endHook: 90 }))).toBe(JSON.stringify(bar({ endHook: 90 })));
  });
});

describe('stock lengths and quantities', () => {
  it('defaults to 12 m, not 6 m', () => {
    // The previous bar-marks layer assumed 6 m, which contradicts what Acindar supplies
    // and roughly doubles the computed splice count.
    expect(DEFAULT_STOCK_LENGTH_M).toBe(12);
  });

  it('nests identical cuts and reports the offcut', () => {
    // 5 m bars from 12 m stock: 2 per bar, 2 m wasted each.
    const plan = planCuts(5, 10);
    expect(plan.perStock).toBe(2);
    expect(plan.stockCount).toBe(5);
    expect(plan.offcut).toBeCloseTo(2, 9);
    expect(plan.totalWaste).toBeCloseTo(10, 9);
  });

  it('flags a bar longer than stock as needing a splice rather than silently truncating', () => {
    const plan = planCuts(14, 3);
    expect(plan.requiresSplice).toBe(true);
    expect(plan.perStock).toBe(0);
  });

  it('respects a project stock length', () => {
    expect(planCuts(5, 10, 6).perStock).toBe(1);
  });

  it('computes steel mass from the nominal diameter', () => {
    // Ø20 is 2.466 kg/m.
    expect(barMass(1, 20)).toBeCloseTo(2.466, 3);
    expect(barMass(1, 12)).toBeCloseTo(0.888, 3);
  });
});

// ─── Collisions ──────────────────────────────────────────────────

function straightBar(id: string, y: number, z: number, dia = 20, owners = [1]): BarPath {
  const seg = straightSegment({ x: 0, y, z }, { x: 4, y, z });
  return {
    id, diameterMm: dia, role: 'longitudinal', segments: [seg],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 4, ownerElementIds: owners, source: 'generated', locked: false, refs: [],
  };
}

describe('collision engine', () => {
  it('passes bars that are comfortably clear', () => {
    const r = detectCollisions([straightBar('a', 0, 0), straightBar('b', 0.2, 0)]);
    expect(r.conflicts).toEqual([]);
    expect(r.constructible).toBe(true);
  });

  it('reports an overlap when centrelines are closer than the two radii', () => {
    const r = detectCollisions([straightBar('a', 0, 0), straightBar('b', 0.015, 0)]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].severity).toBe('overlap');
    expect(r.conflicts[0].clearance).toBeLessThan(0);
  });

  it('reports a clearance shortfall with the numbers, not a bare boolean', () => {
    // Ø20 bars 32 mm apart: surface gap 12 mm against 25 mm required. No placement is
    // deducted — the decided default additional margin is zero, so what is measured is
    // what is compared.
    const r = detectCollisions([straightBar('a', 0, 0), straightBar('b', 0.032, 0)]);
    expect(r.conflicts).toHaveLength(1);
    const c = r.conflicts[0];
    expect(c.severity).toBe('clearance');
    expect(c.clearance).toBeCloseTo(0.012, 4);
    expect(c.required).toBeCloseTo(0.025, 4);
    expect(c.shortfall).toBeCloseTo(0.013, 4);
  });

  it('a code-minimum pair is clean at the zero default', () => {
    // Exactly 25 mm clear. Under the old hardcoded 10 mm this reported a conflict against
    // the very requirement it satisfies.
    const r = detectCollisions([straightBar('a', 0, 0), straightBar('b', 0.045, 0)]);
    expect(r.conflicts).toEqual([]);
  });

  it('a positive project margin is deducted when the project asks for one', () => {
    // The margin is opt-in and only ever makes the check stricter.
    const r = detectCollisions(
      [straightBar('a', 0, 0), straightBar('b', 0.045, 0)],
      { tolerances: { placement: 0.010, requiredClear: 0.025, marginalBand: 0.005 } },
    );
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].clearance).toBeCloseTo(0.015, 4);
  });

  it('grades a near miss as marginal rather than failing it', () => {
    // Available 22 mm against 25 mm required -> 3 mm short, inside the 5 mm band.
    const r = detectCollisions([straightBar('a', 0, 0), straightBar('b', 0.042, 0)]);
    expect(r.conflicts[0].severity).toBe('marginal');
    expect(r.constructible).toBe(true);
  });

  it('subtracts the placement tolerance, so a paper-perfect cage can still fail', () => {
    const bars = [straightBar('a', 0, 0), straightBar('b', 0.048, 0)];
    const strict = detectCollisions(bars, { tolerances: { ...DEFAULT_TOLERANCES, placement: 0.010 } });
    const naive = detectCollisions(bars, { tolerances: { ...DEFAULT_TOLERANCES, placement: 0 } });
    expect(strict.conflicts.length).toBeGreaterThan(0);
    expect(naive.conflicts).toEqual([]);
  });

  it('does NOT exempt bars that share an owner element', () => {
    // Sharing a member is exactly the case the layout code should catch.
    const r = detectCollisions([straightBar('a', 0, 0, 20, [7]), straightBar('b', 0.015, 0, 20, [7])]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].elementIds).toEqual([7]);
  });

  it('accepts a per-pair required clearance from the code rule', () => {
    const bars = [straightBar('a', 0, 0), straightBar('b', 0.055, 0)];
    // 35 mm surface gap at the zero default. Fine against 25 mm, short against 40 mm.
    expect(detectCollisions(bars, { tolerances: DEFAULT_TOLERANCES, requiredClearFor: () => 0.025 }).conflicts).toEqual([]);
    expect(detectCollisions(bars, { tolerances: DEFAULT_TOLERANCES, requiredClearFor: () => 0.040 }).conflicts).toHaveLength(1);
  });

  it('reports each pair once, worst first, deterministically', () => {
    const bars = [
      straightBar('a', 0, 0), straightBar('b', 0.015, 0),
      straightBar('c', 0.045, 0), straightBar('d', 1.0, 0),
    ];
    const r1 = detectCollisions(bars);
    const r2 = detectCollisions([...bars].reverse());
    const key = (x: typeof r1) => x.conflicts.map((c) => `${c.barA}|${c.barB}`).join(',');
    expect(key(r1)).toBe(key(r2));
    expect(r1.conflicts[0].shortfall).toBeGreaterThanOrEqual(r1.conflicts[1].shortfall);
  });

  it('lets the broad phase keep the narrow-phase count well below O(n²)', () => {
    // 60 bars in two well-separated clusters. Every cross-cluster pair is impossible,
    // and the spatial hash must not pay for them.
    const bars: BarPath[] = [];
    for (let i = 0; i < 30; i++) bars.push(straightBar(`l${i}`, i * 0.1, 0));
    for (let i = 0; i < 30; i++) bars.push(straightBar(`r${i}`, 100 + i * 0.1, 0));
    const r = detectCollisions(bars);
    const naivePairs = (60 * 59) / 2;  // 1770
    // barPairsTested is the number that measures the broad phase; narrowPhaseTests
    // counts segment pairs and is in different units.
    expect(r.barPairsTested).toBeLessThan(naivePairs / 2);
    expect(r.conflicts).toEqual([]);
  });

  it('finds a clash between a hooked bar and a bar the hook turns into', () => {
    const hooked = buildStraightBarWithHooks({
      id: 'h', diameterMm: 20, role: 'longitudinal',
      start: p(0), end: p(2), axis: X, hookNormal: Z, endHook: 90,
      ownerElementIds: [1],
    });
    // Place an obstruction where the hook leg descends. The straight-only bar would miss.
    const leg = hooked.segments[hooked.segments.length - 1];
    const obstruction = straightBar('o', 0, leg.end.z, 20, [2]);
    const moved: BarPath = {
      ...obstruction,
      segments: [straightSegment(
        { x: leg.end.x - 0.5, y: 0, z: leg.end.z },
        { x: leg.end.x + 0.5, y: 0, z: leg.end.z })],
    };
    const r = detectCollisions([hooked, moved]);
    expect(r.conflicts.length).toBeGreaterThan(0);
  });
});

describe('cover checking', () => {
  const prism: SectionPrism = {
    elementId: 1,
    halfWidth: 0.15, halfHeight: 0.30,
    origin: p(0), axis: X,
    uAxis: { x: 0, y: 1, z: 0 }, vAxis: Z,
    requiredCover: 0.025,
  };

  it('passes a bar inside the cover envelope', () => {
    // y = 0.10 -> 150 - 100 - 10 = 40 mm cover, above the 25 mm required.
    expect(checkCover([straightBar('a', 0.10, 0)], [prism])).toEqual([]);
  });

  it('flags a bar that breaches cover', () => {
    // y = 0.135 -> 150 - 135 - 10 = 5 mm.
    const breaches = checkCover([straightBar('a', 0.135, 0)], [prism]);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].actualCover).toBeCloseTo(0.005, 4);
  });

  it('flags a bar outside the section with negative cover', () => {
    const breaches = checkCover([straightBar('a', 0.20, 0)], [prism]);
    expect(breaches[0].actualCover).toBeLessThan(0);
  });

  it('ignores the part of a continuous bar that has left the member', () => {
    // A bar running back past the member origin legitimately exits at a support;
    // flagging that would report a breach on every coordinated bar.
    const back = straightSegment({ x: -2, y: 0.10, z: 0 }, { x: -0.5, y: 0.10, z: 0 });
    const bar: BarPath = { ...straightBar('c', 0.10, 0), segments: [back] };
    expect(checkCover([bar], [prism])).toEqual([]);
  });

  it('catches a hook turned out of the section', () => {
    const outward = buildStraightBarWithHooks({
      id: 'bad', diameterMm: 20, role: 'longitudinal',
      start: p(1), end: p(2), axis: X,
      hookNormal: { x: 0, y: 0, z: 1 }, endHook: 90,
      ownerElementIds: [1],
    });
    // The hook rises 90°+extension in +z; the section only reaches z = 0.30.
    const breaches = checkCover([outward], [prism]);
    expect(breaches.length).toBeGreaterThan(0);
  });
});

// ─── Provenance of the bend rules ────────────────────────────────

describe('bend-rule provenance — 2025 only, and never mislabelled', () => {
  it('cites 2025 for every bar size and hook angle, longitudinal and transverse', () => {
    // Tables 25.3.1 and 25.3.2 are the only bend rules implemented. This module used to take
    // an `edition` argument and relabel them as CIRSOC 201-2005 §7.1/§7.2 while returning
    // identical numbers, and one `clause()` call stamped the 2025 TABLE IDENTIFIER with
    // whatever edition was passed — so a 2005 project cited "CIRSOC 201 2005 Tabla 25.3.1",
    // naming a table that edition does not contain. The 2005 text is not supplied, so its
    // bend rules cannot be implemented.
    //
    // The companion gate over the SPACING rules lives on the regulations branch, which owns
    // them; this one owns the bend rules.
    for (const role of ['transverse', 'longitudinal'] as const) {
      for (const angle of [90, 135, 180] as const) {
        for (const dia of [6, 8, 10, 12, 16, 20, 25, 32, 40]) {
          const refs = standardHook(dia, angle, role).refs;
          expect(refs.length, `${role} ${angle} Ø${dia}`).toBeGreaterThan(0);
          for (const r of refs) {
            expect(r.regulation).toBe('cirsoc-201');
            expect(r.edition, `${role} ${angle} Ø${dia}`).toBe('2025');
            // Chapter 25 is a 2025 structure. A chapter-7 identifier here would be the
            // cross-edition mislabelling itself.
            expect(r.clause).toMatch(/^(Tabla )?25\./);
          }
        }
      }
    }
  });

  it('takes no edition argument, so a 2005 stamp is unrepresentable', () => {
    // The defect was a PARAMETER. Removing it removes the class, not just the instance.
    expect(standardHook.length).toBe(3);
    expect(minMandrelDiameter.length).toBe(2);
  });
});
