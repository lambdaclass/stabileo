/**
 * The slab–column punching collector, driven the way production drives it.
 *
 * The free body under test is the one `slab-punching.ts` states:
 *
 *     ΔN = V_u + F_direct + q_u · A_enclosed
 *
 * so every case here supplies real forces on the left and checks what comes out on the right.
 * Nothing asserts against a number this module produced and then recorded as expected; each
 * expectation is either an independent hand calculation, an equilibrium identity, or a
 * classification that can be read off the geometry.
 */

import { describe, it, expect } from 'vitest';
import {
  RESIDUAL_TOL, checkSlabJointPunching, slabJointPosition,
  type AdjoiningShell, type SlabColumnJoint, type SlabJointForce, type SlabPunchingInput,
} from '../slab-punching';
import { criticalSection, punchingResistance, PHI_SHEAR } from '../punching-shear';
import type { FloorNode } from '../run-floor-design';

// ─── Geometry helpers: a 6 × 6 mesh of 3 m panels around node 5 ──
//
//   7──8──9        Node 5 is the centre. Four panels meet it, so it is INTERIOR.
//   │  │  │        Dropping panels changes the coverage angle, and that is the whole
//   4──5──6        point: the position is measured, never assumed.
//   │  │  │
//   1──2──3

const GRID: Record<number, FloorNode> = {
  1: { x: 0, y: 0, z: 3 }, 2: { x: 3, y: 0, z: 3 }, 3: { x: 6, y: 0, z: 3 },
  4: { x: 0, y: 3, z: 3 }, 5: { x: 3, y: 3, z: 3 }, 6: { x: 6, y: 3, z: 3 },
  7: { x: 0, y: 6, z: 3 }, 8: { x: 3, y: 6, z: 3 }, 9: { x: 6, y: 6, z: 3 },
};

/** The four quadrant panels at node 5, keyed by the quadrant they occupy. */
const PANELS: Record<'ne' | 'nw' | 'sw' | 'se', AdjoiningShell> = {
  sw: { elementId: 1, nodeIds: [1, 2, 5, 4], points: [GRID[1], GRID[2], GRID[5], GRID[4]] },
  se: { elementId: 2, nodeIds: [2, 3, 6, 5], points: [GRID[2], GRID[3], GRID[6], GRID[5]] },
  ne: { elementId: 3, nodeIds: [5, 6, 9, 8], points: [GRID[5], GRID[6], GRID[9], GRID[8]] },
  nw: { elementId: 4, nodeIds: [4, 5, 8, 7], points: [GRID[4], GRID[5], GRID[8], GRID[7]] },
};

const at5 = (...which: Array<keyof typeof PANELS>) => which.map((k) => PANELS[k]);

// ─── Force helpers ──────────────────────────────────────────────

const COL = { b: 0.4, h: 0.4 };
const SLAB = { thickness: 0.22, cover: 0.025, topBarDiameterMm: 12 };
/** d = 0,220 − 0,025 − 0,012 = 0,183 m. */
const D = SLAB.thickness - SLAB.cover - SLAB.topBarDiameterMm / 1000;
const FC = 25;

function force(over: Partial<SlabJointForce> = {}): SlabJointForce {
  return {
    combinationId: 1, combinationName: '1,2D + 1,6L',
    axialBelow: 900, axialAbove: 600,
    directlyDelivered: 0,
    unbalancedMomentX: 0, unbalancedMomentY: 0,
    ...over,
  };
}

function joint(over: Partial<SlabColumnJoint> = {}): SlabColumnJoint {
  return {
    nodeId: 5, at: { x: GRID[5].x, y: GRID[5].y }, columnElementId: 101,
    b: COL.b, h: COL.h,
    elementBelow: 101, elementAbove: 102,
    forces: [force()],
    ...over,
  };
}

function punchInput(over: Partial<SlabPunchingInput> = {}): SlabPunchingInput {
  return {
    panelId: 'P10',
    joint: joint(),
    position: slabJointPosition(5, at5('sw', 'se', 'ne', 'nw')),
    ...SLAB,
    fc: FC,
    qu: 0,
    staleAnalysis: false,
    ...over,
  };
}

/** φV_c as a FORCE, computed independently of the module under test. */
function phiVcForce(position: 'interior' | 'edge' | 'corner'): number {
  const crit = criticalSection(COL.b, COL.h, D, position);
  const res = punchingResistance(FC, crit, position);
  return PHI_SHEAR * res.vc * crit.bo * crit.d * 1000;
}

// ─── Position, measured from the slab around the joint ───────────

describe('joint position is measured, not assumed', () => {
  it('four panels meeting the node is an INTERIOR joint at 360°', () => {
    const p = slabJointPosition(5, at5('sw', 'se', 'ne', 'nw'));
    expect(p.position).toBe('interior');
    expect(p.coverageDeg).toBeCloseTo(360, 3);
    expect(p.truncatedSides).toBe(0);
    // Nothing is truncated, so there is no free edge to face.
    expect(p.openBearingDeg).toBeNull();
  });

  it('two adjacent panels is an EDGE joint at 180°, truncated on one side', () => {
    const p = slabJointPosition(5, at5('sw', 'se'));
    expect(p.position).toBe('edge');
    expect(p.coverageDeg).toBeCloseTo(180, 3);
    expect(p.truncatedSides).toBe(1);
    // Slab occupies y < 3; the free edge faces +y, i.e. 90°.
    expect(p.openBearingDeg).toBeCloseTo(90, 3);
  });

  it('one panel is a CORNER joint at 90°, truncated on two sides', () => {
    const p = slabJointPosition(5, at5('sw'));
    expect(p.position).toBe('corner');
    expect(p.coverageDeg).toBeCloseTo(90, 3);
    expect(p.truncatedSides).toBe(2);
  });

  it('preserves the regression: two OPPOSITE runs is not a corner', () => {
    // 90° + 90° = 180°, the same total as an edge column and the same count as a corner —
    // and a strip-like perimeter that is neither. §22.6.5.3 tabulates no α_s for it.
    const p = slabJointPosition(5, at5('sw', 'ne'));
    expect(p.position).toBeNull();
    expect(p.pattern).toBe('oppositeRuns');
    expect(p.runs).toBe(2);
    expect(p.coverageDeg).toBeCloseTo(180, 3);
  });

  it('refuses a re-entrant corner rather than calling 270° interior', () => {
    const p = slabJointPosition(5, at5('sw', 'se', 'ne'));
    expect(p.position).toBeNull();
    expect(p.pattern).toBe('reEntrant');
    expect(p.coverageDeg).toBeCloseTo(270, 3);
  });

  it('reports no slab at all as its own condition', () => {
    const p = slabJointPosition(5, []);
    expect(p.pattern).toBe('noSlab');
    expect(p.coverageDeg).toBe(0);
  });

  it('ignores a shell that does not list the node', () => {
    // Node 1's own panel is `sw`, but node 5 is a corner of it. A shell that does not contain
    // the node subtends nothing at it.
    expect(slabJointPosition(9, at5('sw')).pattern).toBe('noSlab');
  });

  it('is independent of the order the adjoining shells arrive in', () => {
    const a = slabJointPosition(5, at5('sw', 'se', 'ne', 'nw'));
    const b = slabJointPosition(5, at5('ne', 'sw', 'nw', 'se'));
    expect(b).toEqual(a);
  });

  it('measures the interior angle of a non-square panel correctly', () => {
    // A triangular plate with a 45° corner at the node: half of a 90° quadrant.
    const tri: AdjoiningShell = {
      elementId: 7, nodeIds: [5, 2, 3],
      points: [GRID[5], GRID[2], GRID[3]],
    };
    const p = slabJointPosition(5, [tri]);
    expect(p.coverageDeg).toBeCloseTo(45, 1);
    // 45° is none of the four tabulated coverages, so it is refused rather than rounded.
    expect(p.position).toBeNull();
    expect(p.pattern).toBe('skewed');
  });
});

// ─── The free body ──────────────────────────────────────────────

describe('the punching free body', () => {
  it('derives V_u as the axial STEP, not as either axial force', () => {
    const r = checkSlabJointPunching(punchInput());
    // 900 kN below, 600 kN above, nothing standing inside the perimeter: 300 kN crosses it.
    expect(r.Vu).toBeCloseTo(300, 6);
    expect(r.axialBelow).toBe(900);
    expect(r.axialAbove).toBe(600);
    expect(r.status).not.toBe('UNSUPPORTED');
  });

  it('closes: ΔN = V_u + F_direct + q_u·A_enclosed, for every contribution', () => {
    const r = checkSlabJointPunching(punchInput({
      qu: 10,
      joint: joint({ forces: [force({ directlyDelivered: 45 })] }),
    }));
    for (const c of r.contributions) {
      const closes = c.axialStep - (c.Vu + c.directlyDelivered + c.loadInsidePerimeter);
      expect(Math.abs(closes)).toBeLessThan(1e-9);
      expect(Math.abs(c.equilibriumResidual) / c.residualDenominator)
        .toBeLessThanOrEqual(RESIDUAL_TOL);
    }
  });

  it('deducts the load standing inside the critical perimeter', () => {
    const bare = checkSlabJointPunching(punchInput({ qu: 0 }));
    const laden = checkSlabJointPunching(punchInput({ qu: 10 }));
    const area = (COL.b + D) * (COL.h + D);
    expect(laden.Vu).toBeCloseTo(bare.Vu - 10 * area, 6);
    expect(laden.perimeter!.enclosedArea).toBeCloseTo(area, 9);
  });

  it('deducts what beams deliver directly, because it never crosses the perimeter', () => {
    // 300 kN steps into the column; 120 of it arrives through beams framing into the joint.
    const r = checkSlabJointPunching(punchInput({
      joint: joint({ forces: [force({ directlyDelivered: 120 })] }),
    }));
    expect(r.Vu).toBeCloseTo(180, 6);
    expect(r.contributions[0].directlyDelivered).toBe(120);
  });

  it('is invariant under SIGN REVERSAL of the axial pair', () => {
    // Uplift: both columns in tension, the step unchanged in magnitude. The transferred force
    // is a step, so its sign convention cannot change the demand.
    const down = checkSlabJointPunching(punchInput());
    const up = checkSlabJointPunching(punchInput({
      joint: joint({ forces: [force({ axialBelow: -900, axialAbove: -600 })] }),
    }));
    expect(up.Vu).toBeCloseTo(down.Vu, 9);
    // And swapping which column carries more reverses nothing either.
    const swapped = checkSlabJointPunching(punchInput({
      joint: joint({ forces: [force({ axialBelow: 600, axialAbove: 900 })] }),
    }));
    expect(swapped.Vu).toBeCloseTo(down.Vu, 9);
  });

  it('compares against the resistance an independent calculation gives', () => {
    const r = checkSlabJointPunching(punchInput());
    expect(r.phiVc).toBeCloseTo(phiVcForce('interior'), 6);
    expect(r.utilization).toBeCloseTo(r.Vu / r.phiVc, 6);
    expect(r.perimeter!.bo).toBeCloseTo(2 * ((COL.b + D) + (COL.h + D)), 9);
    expect(r.perimeter!.d).toBeCloseTo(D, 9);
  });

  it('a truncated perimeter has less capacity, so position changes the answer', () => {
    const interior = checkSlabJointPunching(punchInput());
    const corner = checkSlabJointPunching(punchInput({
      position: slabJointPosition(5, at5('sw')),
    }));
    // Same demand, smaller perimeter and a smaller α_s: the corner joint is worse off. Using
    // the interior perimeter for a corner column is the single most common punching error.
    expect(corner.Vu).toBeCloseTo(interior.Vu, 6);
    expect(corner.phiVc).toBeLessThan(interior.phiVc);
    expect(corner.utilization).toBeGreaterThan(interior.utilization);
    expect(corner.position).toBe('corner');
  });

  it('fails a joint whose demand exceeds its capacity, rather than capping it', () => {
    const r = checkSlabJointPunching(punchInput({
      joint: joint({ forces: [force({ axialBelow: 8000, axialAbove: 0 })] }),
    }));
    expect(r.status).toBe('FAIL');
    expect(r.utilization).toBeGreaterThan(1);
  });
});

// ─── Storey boundaries ──────────────────────────────────────────

describe('a missing column is a free-body boundary, not a zero', () => {
  it('a TOP-storey joint has no column above and says so', () => {
    const r = checkSlabJointPunching(punchInput({
      joint: joint({
        elementAbove: null,
        forces: [force({ axialBelow: 450, axialAbove: null })],
      }),
    }));
    // The whole axial force of the column below becomes the step.
    expect(r.Vu).toBeCloseTo(450, 6);
    expect(r.elementAbove).toBeNull();
    expect(r.assumptions.map((m) => m.key))
      .toContain('detailing.slabPunching.noColumnAbove');
  });

  it('a BOTTOM-storey joint has no column below and says so', () => {
    const r = checkSlabJointPunching(punchInput({
      joint: joint({
        elementBelow: null, columnElementId: 102,
        forces: [force({ axialBelow: null, axialAbove: 450 })],
      }),
    }));
    expect(r.Vu).toBeCloseTo(450, 6);
    expect(r.elementBelow).toBeNull();
    expect(r.assumptions.map((m) => m.key))
      .toContain('detailing.slabPunching.noColumnBelow');
  });

  it('records both source columns when both are present', () => {
    const r = checkSlabJointPunching(punchInput());
    expect(r.elementBelow).toBe(101);
    expect(r.elementAbove).toBe(102);
    expect(r.assumptions.map((m) => m.key))
      .not.toContain('detailing.slabPunching.noColumnAbove');
  });

  it('states the averaged mat depth as the assumption it is', () => {
    const r = checkSlabJointPunching(punchInput());
    expect(r.assumptions.map((m) => m.key))
      .toContain('detailing.slabPunching.averageMatDepth');
  });
});

// ─── Several combinations ───────────────────────────────────────

describe('multiple combinations', () => {
  const many: SlabJointForce[] = [
    force({ combinationId: 1, combinationName: '1,4D', axialBelow: 700, axialAbove: 500 }),
    force({ combinationId: 2, combinationName: '1,2D + 1,6L', axialBelow: 1100, axialAbove: 600 }),
    force({ combinationId: 3, combinationName: '1,2D + 1,0W', axialBelow: 800, axialAbove: 550 }),
  ];

  it('governs on the largest V_u and names the combination it came from', () => {
    const r = checkSlabJointPunching(punchInput({ joint: joint({ forces: many }) }));
    expect(r.governingCombination).toBe('1,2D + 1,6L');
    expect(r.Vu).toBeCloseTo(500, 6);
  });

  it('retains every combination CONSIDERED, so the choice is auditable', () => {
    const r = checkSlabJointPunching(punchInput({ joint: joint({ forces: many }) }));
    expect(r.contributions.map((c) => c.combinationId)).toEqual([1, 2, 3]);
    expect(r.contributions.map((c) => c.axialStep)).toEqual([200, 500, 250]);
  });

  it('is DETERMINISTIC under reordering of the combinations', () => {
    const forward = checkSlabJointPunching(punchInput({ joint: joint({ forces: many }) }));
    const shuffled = checkSlabJointPunching(punchInput({
      joint: joint({ forces: [many[2], many[0], many[1]] }),
    }));
    expect(shuffled.governingCombination).toBe(forward.governingCombination);
    expect(shuffled.Vu).toBeCloseTo(forward.Vu, 12);
    expect(shuffled.contributions.map((c) => c.combinationId))
      .toEqual(forward.contributions.map((c) => c.combinationId));
  });

  it('breaks a tie on combination id rather than on arrival order', () => {
    const tied: SlabJointForce[] = [
      force({ combinationId: 9, combinationName: 'later', axialBelow: 800, axialAbove: 500 }),
      force({ combinationId: 4, combinationName: 'earlier', axialBelow: 800, axialAbove: 500 }),
    ];
    expect(checkSlabJointPunching(punchInput({ joint: joint({ forces: tied }) }))
      .governingCombination).toBe('earlier');
  });
});

// ─── The refusals ───────────────────────────────────────────────

describe('what it refuses, and why each refusal is not a pass', () => {
  it('refuses a joint whose free body cannot close', () => {
    // 300 kN steps in, but 500 kN is said to arrive directly. V_u would be −200 floored to 0:
    // a passing check produced by arithmetic rather than by capacity.
    const r = checkSlabJointPunching(punchInput({
      joint: joint({ forces: [force({ directlyDelivered: 500 })] }),
    }));
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.Vu).toBe(0);
    expect(r.utilization).toBe(0);
    expect(r.maturity).toBe('UNSUPPORTED');
    expect(r.unsupported.map((m) => m.key))
      .toContain('detailing.slabPunching.residualNotEstablished');
    // The failed combination travels with the result: a residual nobody can see is a
    // limitation the reader is asked to take on trust.
    expect(r.contributions).toHaveLength(1);
    expect(r.contributions[0].equilibriumResidual).toBeCloseTo(-200, 6);
  });

  it('keeps the balanced combinations when only SOME fail the residual', () => {
    const r = checkSlabJointPunching(punchInput({
      joint: joint({
        forces: [
          force({ combinationId: 1, combinationName: 'ok', directlyDelivered: 100 }),
          force({ combinationId: 2, combinationName: 'broken', directlyDelivered: 500 }),
        ],
      }),
    }));
    expect(r.status).not.toBe('UNSUPPORTED');
    expect(r.governingCombination).toBe('ok');
    expect(r.Vu).toBeCloseTo(200, 6);
    expect(r.unsupported.map((m) => m.key))
      .toContain('detailing.slabPunching.someCombinationsUnbalanced');
    // Both are reported; only one governed.
    expect(r.contributions).toHaveLength(2);
  });

  it('refuses a STALE analysis before reading a single force', () => {
    const r = checkSlabJointPunching(punchInput({ staleAnalysis: true }));
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.unsupported.map((m) => m.key))
      .toContain('detailing.slabPunching.staleAnalysis');
    expect(r.contributions).toHaveLength(0);
  });

  it('refuses MISSING GEOMETRY rather than running on a dimension it does not have', () => {
    for (const over of [
      { thickness: 0.02 },                              // d would be negative
      { joint: joint({ b: 0, h: 0.4 }) },               // no column width
      { fc: 0 },                                        // no concrete strength
    ] as Array<Partial<SlabPunchingInput>>) {
      const r = checkSlabJointPunching(punchInput(over));
      expect(r.status).toBe('UNSUPPORTED');
      expect(r.perimeter).toBeNull();
      expect(r.unsupported.map((m) => m.key))
        .toContain('detailing.slabPunching.missingGeometry');
    }
  });

  it('refuses a joint with NO column forces at all', () => {
    const r = checkSlabJointPunching(punchInput({ joint: joint({ forces: [] }) }));
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.unsupported.map((m) => m.key))
      .toContain('detailing.slabPunching.noColumnForces');
  });

  it('refuses the two-opposite-runs perimeter with its own reason', () => {
    const r = checkSlabJointPunching(punchInput({
      position: slabJointPosition(5, at5('sw', 'ne')),
    }));
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.unsupported.map((m) => m.key))
      .toContain('detailing.slabPunching.oppositeRuns');
  });

  it('refuses a joint transferring an unbalanced moment, per §8.4.4.2', () => {
    const r = checkSlabJointPunching(punchInput({
      joint: joint({ forces: [force({ unbalancedMomentX: 80, unbalancedMomentY: 0 })] }),
    }));
    // UNSUPPORTED, not FAIL: no capacity comparison was made for the eccentric shear, so
    // reporting a failure would claim a check nobody performed.
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.maturity).toBe('UNSUPPORTED');
    expect(r.unsupported.map((m) => m.key))
      .toContain('detailing.slabPunching.momentTransfer');
    // The moment is retained, so the reader can see how far from negligible it was.
    expect(r.contributions[0].unbalancedMoment).toBeCloseTo(80, 6);
  });

  it('does not refuse a NEGLIGIBLE unbalanced moment', () => {
    const r = checkSlabJointPunching(punchInput({
      joint: joint({ forces: [force({ unbalancedMomentX: 0.05 })] }),
    }));
    expect(r.status).not.toBe('UNSUPPORTED');
  });

  it('never claims a maturity above IMPLEMENTED_PROVISIONAL', () => {
    expect(checkSlabJointPunching(punchInput()).maturity).toBe('IMPLEMENTED_PROVISIONAL');
  });

  it('carries clause provenance on every verified result', () => {
    const refs = checkSlabJointPunching(punchInput()).refs;
    expect(refs.length).toBeGreaterThan(0);
    const clauses = refs.map((r) => r.clause);
    expect(clauses.some((c) => c.includes('22.6.4'))).toBe(true);
    expect(clauses.some((c) => c.includes('22.6.5.3'))).toBe(true);
    expect(refs.every((r) => r.regulation === 'cirsoc-201')).toBe(true);
  });
});
