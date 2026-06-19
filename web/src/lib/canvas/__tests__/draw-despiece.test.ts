import { describe, it, expect } from 'vitest';
import {
  memberAxes, shrinkMember, despieceScales, drawDespiece,
  computeDespieceVectors, computeDespieceSegments, momentArrowhead,
  inspectMember, inspectNode, DESPIECE_MAX_GAP_FRAC,
  despieceElementSpan, remapLoadSpanToShrunk, distributedResultant, distributedResultantVector,
  type DespieceCtx, type DespieceElementForces, type DespieceElement,
  type DespieceReaction, type DespieceVectorMode, type DespieceBasis,
} from '../draw-despiece';

// ── Helpers for the vector-model tests ──
function vecArgs(opts: {
  nodes: Map<number, { x: number; y: number }>;
  elements: DespieceElement[];
  forces: Map<number, DespieceElementForces>;
  reactions?: Map<number, DespieceReaction>;
  vectorMode: DespieceVectorMode;
  basis?: DespieceBasis;
  showReactions?: boolean;
  resultant?: boolean;
  sep?: number;
}) {
  return {
    elements: opts.elements,
    getNode: (id: number) => opts.nodes.get(id),
    getElementForces: (id: number) => opts.forces.get(id),
    reactions: opts.reactions ?? new Map<number, DespieceReaction>(),
    sep: opts.sep ?? 1,
    vectorMode: opts.vectorMode,
    basis: opts.basis ?? ('local' as DespieceBasis),
    showReactions: opts.showReactions ?? false,
    resultant: opts.resultant ?? false,
    fmt: (v: number) => v.toFixed(1),
  };
}
const simpleJoint = () => ({
  // two collinear members sharing node 2
  nodes: new Map([[1, { x: 0, y: 0 }], [2, { x: 4, y: 0 }], [3, { x: 8, y: 0 }]]),
  elements: [{ id: 1, nodeI: 1, nodeJ: 2 }, { id: 2, nodeI: 2, nodeJ: 3 }] as DespieceElement[],
  forces: new Map<number, DespieceElementForces>([
    [1, { elementId: 1, nStart: 10, nEnd: -10, vStart: 5, vEnd: -5, mStart: 0, mEnd: 8 }],
    [2, { elementId: 2, nStart: 6, nEnd: -6, vStart: 3, vEnd: -3, mStart: 8, mEnd: 0 }],
  ]),
});

describe('memberAxes', () => {
  it('horizontal member: ux=1, perpendicular +90° = (0,1)', () => {
    const a = memberAxes({ x: 0, y: 0 }, { x: 4, y: 0 });
    expect(a.ux).toBeCloseTo(1, 9); expect(a.uy).toBeCloseTo(0, 9);
    expect(a.px).toBeCloseTo(0, 9); expect(a.py).toBeCloseTo(1, 9);
    expect(a.len).toBeCloseTo(4, 9);
  });
  it('vertical member: ux=0, perpendicular = (-1,0)', () => {
    const a = memberAxes({ x: 0, y: 0 }, { x: 0, y: 3 });
    expect(a.ux).toBeCloseTo(0, 9); expect(a.uy).toBeCloseTo(1, 9);
    expect(a.px).toBeCloseTo(-1, 9); expect(a.py).toBeCloseTo(0, 9);
  });
  it('zero-length member: safe fallback', () => {
    const a = memberAxes({ x: 1, y: 1 }, { x: 1, y: 1 });
    expect(a.len).toBe(0);
    expect(Number.isFinite(a.ux)).toBe(true);
  });
});

describe('shrinkMember', () => {
  it('sep=0 → endpoints unchanged (no gap)', () => {
    const r = shrinkMember({ x: 0, y: 0 }, { x: 10, y: 0 }, 0);
    expect(r.i).toEqual({ x: 0, y: 0 });
    expect(r.j).toEqual({ x: 10, y: 0 });
  });
  it('sep=1 → each end pulled toward midpoint by maxGapFrac', () => {
    const r = shrinkMember({ x: 0, y: 0 }, { x: 10, y: 0 }, 1, 0.16);
    expect(r.i.x).toBeCloseTo(0.8, 9);  // 0 + (5-0)*0.16
    expect(r.j.x).toBeCloseTo(9.2, 9);  // 10 + (5-10)*0.16
    // gap stays centered; midpoint unchanged
    expect((r.i.x + r.j.x) / 2).toBeCloseTo(5, 9);
  });
  it('sep is clamped to [0,1]', () => {
    const r = shrinkMember({ x: 0, y: 0 }, { x: 10, y: 0 }, 5, 0.16);
    expect(r.i.x).toBeCloseTo(0.8, 9); // same as sep=1
  });
  it('default separation is increased (more visible gap)', () => {
    expect(DESPIECE_MAX_GAP_FRAC).toBeGreaterThan(0.16);
    const r = shrinkMember({ x: 0, y: 0 }, { x: 10, y: 0 }, 1); // default gap
    expect(r.i.x).toBeCloseTo(5 * DESPIECE_MAX_GAP_FRAC, 9); // 1.4 at 0.28
  });
});

describe('computeDespieceVectors — vector filter + action/reaction', () => {
  it("vectorMode='members' draws member-side vectors only", () => {
    const j = simpleJoint();
    const v = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'members' }));
    expect(v.length).toBeGreaterThan(0);
    expect(v.every(x => x.side === 'member')).toBe(true);
  });
  it("vectorMode='nodes' draws node-side vectors only", () => {
    const j = simpleJoint();
    const v = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'nodes' }));
    expect(v.length).toBeGreaterThan(0);
    expect(v.every(x => x.side === 'node')).toBe(true);
  });
  it("vectorMode='all' draws both member-side and node-side", () => {
    const j = simpleJoint();
    const v = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'all' }));
    expect(v.some(x => x.side === 'member')).toBe(true);
    expect(v.some(x => x.side === 'node')).toBe(true);
  });
  it('node-side vector is opposite to the member-side vector at a joint', () => {
    const j = simpleJoint();
    const v = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'all' }));
    // element 1, axial (N) at end I (node 1): member-side along +x, node-side −x
    const mem = v.find(x => x.side === 'member' && x.glyph === 'force' && x.value === 10);
    const nod = v.find(x => x.side === 'node' && x.glyph === 'force' && x.value === 10);
    expect(mem && nod).toBeTruthy();
    expect(nod!.dirx).toBeCloseTo(-(mem!.dirx ?? 0), 9);
    expect(nod!.diry).toBeCloseTo(-(mem!.diry ?? 0), 9);
    // and moments rotate oppositely
    const memM = v.find(x => x.side === 'member' && x.glyph === 'moment');
    const nodM = v.find(x => x.side === 'node' && x.glyph === 'moment');
    expect(memM!.ccw).toBe(!nodM!.ccw);
  });
  it('high-valence node yields distinct node-side origins (not stacked)', () => {
    const nodes = new Map([
      [1, { x: 0, y: 0 }], [2, { x: 4, y: 0 }], [3, { x: 0, y: 4 }], [4, { x: 4, y: 4 }], [5, { x: -4, y: 0 }],
    ]);
    const elements: DespieceElement[] = [
      { id: 1, nodeI: 1, nodeJ: 2 }, { id: 2, nodeI: 1, nodeJ: 3 }, { id: 3, nodeI: 1, nodeJ: 4 }, { id: 4, nodeI: 1, nodeJ: 5 },
    ];
    const forces = new Map<number, DespieceElementForces>(
      elements.map(e => [e.id, { elementId: e.id, nStart: 10, nEnd: -10, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0 }]),
    );
    const v = computeDespieceVectors(vecArgs({ nodes, elements, forces, vectorMode: 'nodes' }));
    // node-side origins near node 1 (origin), one per member, must be distinct
    const near = v.filter(x => Math.hypot(x.origin.x, x.origin.y) < 1.5);
    const keys = new Set(near.map(x => `${x.origin.x.toFixed(3)},${x.origin.y.toFixed(3)}`));
    expect(keys.size).toBe(4);
  });
  it('reactions are gated by showReactions', () => {
    const j = simpleJoint();
    const reactions = new Map<number, DespieceReaction>([[1, { rx: 0, rz: 25, my: 4 }]]);
    const off = computeDespieceVectors(vecArgs({ ...j, reactions, vectorMode: 'all', showReactions: false }));
    const on = computeDespieceVectors(vecArgs({ ...j, reactions, vectorMode: 'all', showReactions: true }));
    expect(off.some(x => x.side === 'reaction')).toBe(false);
    expect(on.some(x => x.side === 'reaction')).toBe(true);
  });
  it('sep<=0.05 produces no vectors yet', () => {
    const j = simpleJoint();
    expect(computeDespieceVectors(vecArgs({ ...j, vectorMode: 'all', sep: 0 }))).toHaveLength(0);
  });
});

describe('momentArrowhead', () => {
  it('returns a tip on the arc + two distinct barbs (no circular dot)', () => {
    const ah = momentArrowhead(100, 100, 16, true);
    expect(Math.hypot(ah.tip.x - 100, ah.tip.y - 100)).toBeCloseTo(16, 6); // tip on the circle
    expect(ah.barbs).toHaveLength(2);
    expect(ah.barbs[0]).not.toEqual(ah.barbs[1]);
    // barbs sit off the tip (form a V)
    expect(Math.hypot(ah.barbs[0].x - ah.tip.x, ah.barbs[0].y - ah.tip.y)).toBeGreaterThan(1);
  });
  it('rotation sense (ccw) flips the arrowhead tangent', () => {
    const cw = momentArrowhead(0, 0, 16, false);
    const ccw = momentArrowhead(0, 0, 16, true);
    expect(cw.barbs[0]).not.toEqual(ccw.barbs[0]); // direction differs with sign
  });
});

describe('despieceScales', () => {
  it('returns max |N|,|V| and max |M| across all ends', () => {
    const forces: DespieceElementForces[] = [
      { elementId: 1, nStart: -3, nEnd: 3, vStart: 12, vEnd: -12, mStart: 0, mEnd: 20 },
      { elementId: 2, nStart: 40, nEnd: -40, vStart: 5, vEnd: -5, mStart: 8, mEnd: -50 },
    ];
    const s = despieceScales(forces);
    expect(s.maxF).toBeCloseTo(40, 9); // |N|=40 dominates
    expect(s.maxM).toBeCloseTo(50, 9);
  });
});

describe('drawDespiece (smoke + non-mutation)', () => {
  function stubCtx(): CanvasRenderingContext2D {
    // Minimal no-op 2D context recording nothing; just must not throw.
    const noop = () => {};
    return new Proxy({}, { get: () => noop }) as unknown as CanvasRenderingContext2D;
  }

  it('draws without throwing and does NOT mutate node geometry', () => {
    const nodes = new Map<number, { x: number; y: number }>([
      [1, { x: 0, y: 0 }], [2, { x: 4, y: 0 }], [3, { x: 8, y: 0 }],
    ]);
    const snapshot = JSON.stringify([...nodes.entries()]);
    const forces = new Map<number, DespieceElementForces>([
      [1, { elementId: 1, nStart: 0, nEnd: 0, vStart: 10, vEnd: -10, mStart: 0, mEnd: 20 }],
      [2, { elementId: 2, nStart: 0, nEnd: 0, vStart: 8, vEnd: -8, mStart: 20, mEnd: 0 }],
    ]);
    const d: DespieceCtx = {
      ctx: stubCtx(),
      worldToScreen: (wx, wy) => ({ x: wx * 10 + 100, y: 200 - wy * 10 }),
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }, { id: 2, nodeI: 2, nodeJ: 3 }],
      getNode: (id) => nodes.get(id),
      getElementForces: (id) => forces.get(id),
      reactions: new Map([[1, { rx: 0, rz: 25, my: 0 }]]),
      sep: 1,
      fmt: (v) => v.toFixed(1),
    };
    expect(() => drawDespiece(d)).not.toThrow();
    // Visualization must never mutate the model geometry.
    expect(JSON.stringify([...nodes.entries()])).toBe(snapshot);
  });

  it('sep=0 is a no-op-safe early state (no forces drawn yet)', () => {
    const d: DespieceCtx = {
      ctx: stubCtx(),
      worldToScreen: (wx, wy) => ({ x: wx, y: wy }),
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      getNode: (id) => (id === 1 ? { x: 0, y: 0 } : { x: 4, y: 0 }),
      getElementForces: () => ({ elementId: 1, nStart: 0, nEnd: 0, vStart: 10, vEnd: -10, mStart: 0, mEnd: 0 }),
      reactions: new Map(),
      sep: 0,
      fmt: (v) => v.toFixed(1),
    };
    expect(() => drawDespiece(d)).not.toThrow();
  });
});

describe('despiece refinements — remnants, positioning, basis, inspection', () => {
  // inclined 45° single member: node 1 (0,0) → node 2 (4,4)
  const inclined = () => ({
    nodes: new Map([[1, { x: 0, y: 0 }], [2, { x: 4, y: 4 }]]),
    elements: [{ id: 1, nodeI: 1, nodeJ: 2 }] as DespieceElement[],
    forces: new Map<number, DespieceElementForces>([
      [1, { elementId: 1, nStart: 10, nEnd: -10, vStart: 4, vEnd: -4, mStart: 6, mEnd: -6 }],
    ]),
  });

  it('dashed remnant starts PAST the node-side vector (REMNANT_START_FRAC), not at the node', () => {
    const j = simpleJoint();
    const segs = computeDespieceSegments({ elements: j.elements, getNode: (id) => j.nodes.get(id), sep: 1 });
    // 2 elements × 2 ends = 4 remnants
    expect(segs.length).toBe(4);
    const e1I = segs.find(s => s.elementId === 1 && s.end === 'I')!;
    const aI = shrinkMember({ x: 0, y: 0 }, { x: 4, y: 0 }, 1).i;
    expect(e1I.from.x).toBeGreaterThan(0);              // does NOT start at the node
    expect(e1I.from.x).toBeLessThan(aI.x);              // ends before the shrunken end
    expect(e1I.from.x / aI.x).toBeCloseTo(0.35, 6);     // REMNANT_START_FRAC of the way in
    expect(e1I.to).toEqual(aI);                          // runs to the shrunken member end
  });

  it('member-side vector anchors AT the shrunken member end', () => {
    const j = simpleJoint();
    const v = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'all' }));
    const memN = v.find(x => x.side === 'member' && x.component === 'N' && x.elementId === 1 && x.end === 'I')!;
    // element 1: node1(0,0)→node2(4,0), sep=1 → shrunken end at x = 4*0.28/2*... = 0.56
    const aI = shrinkMember({ x: 0, y: 0 }, { x: 4, y: 0 }, 1).i;
    expect(Math.hypot(memN.origin.x - aI.x, memN.origin.y - aI.y)).toBeLessThan(1e-9);
  });

  it('node-side vector anchors on the NODE side of the remnant (near the node)', () => {
    const j = simpleJoint();
    const v = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'all' }));
    const node = { x: 0, y: 0 };
    const aI = shrinkMember({ x: 0, y: 0 }, { x: 4, y: 0 }, 1).i;
    const n = v.find(x => x.side === 'node' && x.component === 'N' && x.elementId === 1 && x.end === 'I')!;
    const dNode = Math.hypot(n.origin.x - node.x, n.origin.y - node.y);
    const dEnd = Math.hypot(n.origin.x - aI.x, n.origin.y - aI.y);
    expect(dNode).toBeLessThan(dEnd); // closer to the node than to the member end
  });

  it('member-side and node-side axial anchors differ for the same joint/member', () => {
    const j = simpleJoint();
    const v = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'all' }));
    const m = v.find(x => x.side === 'member' && x.component === 'N' && x.elementId === 1 && x.end === 'I')!;
    const n = v.find(x => x.side === 'node' && x.component === 'N' && x.elementId === 1 && x.end === 'I')!;
    expect(Math.hypot(m.origin.x - n.origin.x, m.origin.y - n.origin.y)).toBeGreaterThan(0.1);
  });

  // ── Free-body end-face convention (member equilibrium) ──
  // Horizontal member I(0,0)→J(4,0); local-z perp p = (0,1) (up). ElementForces
  // are diagram values: axial same-sign at both ends, shear opposite-sign.
  const horizFB = (f: Partial<DespieceElementForces>) => ({
    nodes: new Map([[1, { x: 0, y: 0 }], [2, { x: 4, y: 0 }]]),
    elements: [{ id: 1, nodeI: 1, nodeJ: 2 }] as DespieceElement[],
    forces: new Map<number, DespieceElementForces>([[1, {
      elementId: 1, nStart: 0, nEnd: 0, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0, ...f,
    }]]),
  });

  it('axial tension points OUT at BOTH ends (I→−x, J→+x), per end-face convention', () => {
    // Constant tension ⇒ nStart = nEnd = +T (same sign; matches solver output e.g. diagrams.test nStart:80,nEnd:80).
    const v = computeDespieceVectors(vecArgs({ ...horizFB({ nStart: 10, nEnd: 10 }), vectorMode: 'members' }));
    const nI = v.find(x => x.component === 'N' && x.end === 'I')!;
    const nJ = v.find(x => x.component === 'N' && x.end === 'J')!;
    expect(nI.dirx!).toBeLessThan(0);     // toward node I (−x), out of the member
    expect(nJ.dirx!).toBeGreaterThan(0);  // toward node J (+x), out of the member
  });

  it('shear (vStart=+, vEnd=−) points the SAME physical way at both ends ⇒ member balances', () => {
    const v = computeDespieceVectors(vecArgs({ ...horizFB({ vStart: 10, vEnd: -10 }), vectorMode: 'all' }));
    const mI = v.find(x => x.side === 'member' && x.component === 'V' && x.end === 'I')!;
    const mJ = v.find(x => x.side === 'member' && x.component === 'V' && x.end === 'J')!;
    expect(mI.diry!).toBeGreaterThan(0);                      // +local z (up)
    expect(Math.sign(mJ.diry!)).toBe(Math.sign(mI.diry!));    // both ends up → equilibrium
    const nI = v.find(x => x.side === 'node' && x.component === 'V' && x.end === 'I')!;
    expect(Math.sign(nI.diry!)).toBe(-Math.sign(mI.diry!));   // node-side equal & opposite
  });

  it('moment: I and J member-side senses are OPPOSITE for the same stored sign (balances)', () => {
    const v = computeDespieceVectors(vecArgs({ ...horizFB({ mStart: 5, mEnd: 5 }), vectorMode: 'all' }));
    const mI = v.find(x => x.side === 'member' && x.component === 'M' && x.end === 'I')!;
    const mJ = v.find(x => x.side === 'member' && x.component === 'M' && x.end === 'J')!;
    expect(mI.ccw).toBe(!mJ.ccw);                              // opposite glyph sense
    expect(mI.ccw).toBe(false);                                // requested: I positive ⇒ clockwise
    const nI = v.find(x => x.side === 'node' && x.component === 'M' && x.end === 'I')!;
    expect(nI.ccw).toBe(!mI.ccw);                              // node-side opposite to member
  });

  it('loads: despieceElementSpan gives shrunken endpoints inside the original member', () => {
    const span = despieceElementSpan({ x: 0, y: 0 }, { x: 4, y: 0 }, 1);
    expect(span.aI.x).toBeGreaterThan(0);          // pulled in from node I
    expect(span.aJ.x).toBeLessThan(4);             // pulled in from node J
    expect(span.lenShrunk).toBeLessThan(span.lenOrig);
    expect(span.lenOrig).toBeCloseTo(4, 9);
    // endpoints match shrinkMember (loads ride the same shortened segment as the member)
    const sm = shrinkMember({ x: 0, y: 0 }, { x: 4, y: 0 }, 1);
    expect(span.aI.x).toBeCloseTo(sm.i.x, 9);
    expect(span.aJ.x).toBeCloseTo(sm.j.x, 9);
  });

  it('loads: full-span distributed load maps onto the whole shrunk segment', () => {
    const r = remapLoadSpanToShrunk(0, 4, 4, 2);
    expect(r.a).toBeCloseTo(0, 9);
    expect(r.b).toBeCloseTo(2, 9);                 // never beyond the shrunk segment
  });

  it('loads: partial distributed range stays proportional on the shrunk segment', () => {
    const r = remapLoadSpanToShrunk(1, 2, 4, 2);  // [1,2] of 4 → same fraction of 2
    expect(r.a).toBeCloseTo(0.5, 9);
    expect(r.b).toBeCloseTo(1.0, 9);
  });

  it('loads (resultant): uniform load → R = q·L at the span middle', () => {
    const r = distributedResultant(10, 10, 0, 4);
    expect(r.magnitude).toBeCloseTo(40, 9);
    expect(r.centroid).toBeCloseTo(2, 9);
  });

  it('loads (resultant): triangular load → centroid at 2/3 from the zero end', () => {
    const r = distributedResultant(0, 9, 0, 3);   // R = 13.5; x̄ = 2
    expect(r.magnitude).toBeCloseTo(13.5, 9);
    expect(r.centroid).toBeCloseTo(2, 9);
  });

  it('loads (resultant): partial trapezoid centroid stays inside [a,b]', () => {
    const a = 1, b = 3;
    const r = distributedResultant(4, 8, a, b);
    expect(r.centroid).toBeGreaterThanOrEqual(a);
    expect(r.centroid).toBeLessThanOrEqual(b);
    expect(r.centroid).toBeCloseTo(a + (b - a) / 3 * (4 + 2 * 8) / (4 + 8), 9);
  });

  // ── Loads Resultant VECTOR (applied direction, not equilibrium) ──
  it('loads-resultant vector: points along sign(magnitude)·forceDir (fix for the inverted arrow)', () => {
    // Horizontal member, local load (angle 0): forceDir = (0, 1). A net-negative
    // (downward) load must point along −forceDir = (0,−1). The earlier bug pointed
    // it +forceDir (up), which looked like an equilibrium/end-action arrow.
    const r = distributedResultantVector(-10, -10, 0, 4, 0, false, 1, 0);
    expect(r.wx).toBeCloseTo(0, 9);
    expect(r.wy).toBeCloseTo(-1, 9);            // downward
    expect(r.magnitude).toBeCloseTo(-40, 9);
    expect(r.centroid).toBeCloseTo(2, 9);
  });

  it('loads-resultant vector: upward load flips the direction', () => {
    const down = distributedResultantVector(-10, -10, 0, 4, 0, false, 1, 0);
    const up = distributedResultantVector(10, 10, 0, 4, 0, false, 1, 0);
    expect(Math.sign(up.wy)).toBe(-Math.sign(down.wy));
  });

  it('loads-resultant vector: partial range → centroid inside the partial span', () => {
    const r = distributedResultantVector(-6, -6, 1, 3, 0, false, 1, 0);
    expect(r.centroid).toBeGreaterThanOrEqual(1);
    expect(r.centroid).toBeLessThanOrEqual(3);
    expect(r.centroid).toBeCloseTo(2, 9);
  });

  it('loads-resultant vector: derives from the load only — no ElementForces input', () => {
    // Same load + geometry ⇒ identical vector regardless of any solver state.
    expect(distributedResultantVector(-10, -10, 0, 4, 0, false, 1, 0))
      .toEqual(distributedResultantVector(-10, -10, 0, 4, 0, false, 1, 0));
  });

  it('resultant mode: ONE composed force (F) per side instead of separate N/V', () => {
    const v = computeDespieceVectors(vecArgs({ ...horizFB({ nStart: 10, nEnd: 10, vStart: 6, vEnd: -6, mStart: 4, mEnd: 4 }), vectorMode: 'members', resultant: true }));
    const forcesI = v.filter(x => x.glyph === 'force' && x.end === 'I');
    expect(forcesI.length).toBe(1);                       // composed, not N + V
    expect(forcesI[0].component).toBe('F');
    expect(forcesI[0].value).toBeCloseTo(Math.hypot(10, 6), 6);  // |F| = √(N²+V²)
    // The moment stays as its own glyph (so the end shows 2 glyphs total).
    expect(v.some(x => x.glyph === 'moment' && x.end === 'I')).toBe(true);
  });

  it('tension (N>0): member-side axial points OUT toward the node; node-side opposite', () => {
    // Horizontal member node1(0,0)→node2(4,0). End I node is at x=0, member end at x>0.
    const nodes = new Map([[1, { x: 0, y: 0 }], [2, { x: 4, y: 0 }]]);
    const elements = [{ id: 1, nodeI: 1, nodeJ: 2 }] as DespieceElement[];
    const forces = new Map<number, DespieceElementForces>([
      [1, { elementId: 1, nStart: 10, nEnd: -10, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0 }],
    ]);
    const v = computeDespieceVectors(vecArgs({ nodes, elements, forces, vectorMode: 'all' }));
    const mem = v.find(x => x.side === 'member' && x.component === 'N' && x.end === 'I')!;
    const nod = v.find(x => x.side === 'node' && x.component === 'N' && x.end === 'I')!;
    // member-side points toward the node (−x), away from the member end.
    expect(mem.dirx!).toBeCloseTo(-1, 9);
    expect(mem.diry!).toBeCloseTo(0, 9);
    // node-side is equal/opposite (+x, toward the member).
    expect(nod.dirx!).toBeCloseTo(1, 9);
    expect(nod.diry!).toBeCloseTo(0, 9);
  });

  it('compression (N<0): member-side axial points INTO the member; node-side opposite', () => {
    const nodes = new Map([[1, { x: 0, y: 0 }], [2, { x: 4, y: 0 }]]);
    const elements = [{ id: 1, nodeI: 1, nodeJ: 2 }] as DespieceElement[];
    const forces = new Map<number, DespieceElementForces>([
      [1, { elementId: 1, nStart: -10, nEnd: 10, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0 }],
    ]);
    const v = computeDespieceVectors(vecArgs({ nodes, elements, forces, vectorMode: 'all' }));
    const mem = v.find(x => x.side === 'member' && x.component === 'N' && x.end === 'I')!;
    const nod = v.find(x => x.side === 'node' && x.component === 'N' && x.end === 'I')!;
    // member-side points into the member (+x, away from the node).
    expect(mem.dirx!).toBeCloseTo(1, 9);
    // node-side opposite (−x).
    expect(nod.dirx!).toBeCloseTo(-1, 9);
  });

  it('node-side vector sits BEFORE the dashed remnant start (no overlap with the ghost)', () => {
    const j = simpleJoint();
    const v = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'all' }));
    const segs = computeDespieceSegments({ elements: j.elements, getNode: (id) => j.nodes.get(id), sep: 1 });
    const node = { x: 0, y: 0 };
    const nod = v.find(x => x.side === 'node' && x.component === 'N' && x.elementId === 1 && x.end === 'I')!;
    const rem = segs.find(s => s.elementId === 1 && s.end === 'I')!;
    const dNodeAnchor = Math.hypot(nod.origin.x - node.x, nod.origin.y - node.y);
    const dRemnantStart = Math.hypot(rem.from.x - node.x, rem.from.y - node.y);
    // node anchor (NODE_ANCHOR_FRAC) is closer to the node than where the remnant begins.
    expect(dNodeAnchor).toBeLessThan(dRemnantStart);
  });

  it('vectorMode changes the vector counts exactly (members + nodes = all)', () => {
    const j = simpleJoint();
    const all = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'all' }));
    const mem = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'members' }));
    const nod = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'nodes' }));
    expect(mem.every(x => x.side === 'member')).toBe(true);
    expect(nod.every(x => x.side === 'node')).toBe(true);
    // No reactions here → all = members + nodes exactly.
    expect(all.length).toBe(mem.length + nod.length);
    expect(mem.length).toBe(nod.length);
  });

  it('support reactions are drawn ONCE (not mirrored/doubled), independent of vectorMode', () => {
    const j = simpleJoint();
    const reactions = new Map<number, DespieceReaction>([[1, { rx: 3, rz: 25, my: 4 }]]);
    const count = (mode: DespieceVectorMode) =>
      computeDespieceVectors(vecArgs({ ...j, reactions, vectorMode: mode, showReactions: true })).filter(x => x.side === 'reaction').length;
    // 3 nonzero components → exactly 3 reaction vectors, no inverse pairs.
    expect(count('all')).toBe(3);
    expect(count('members')).toBe(3);
    expect(count('nodes')).toBe(3);
  });

  it('local basis → N / V components with member-local directions', () => {
    const j = inclined();
    const v = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'members', basis: 'local' }));
    const comps = new Set(v.filter(x => x.glyph === 'force').map(x => x.component));
    expect(comps.has('N')).toBe(true);
    expect(comps.has('V')).toBe(true);
    expect(comps.has('Fx')).toBe(false);
    const n = v.find(x => x.component === 'N')!;
    // axial direction is along the member (45°): equal x & y components
    expect(Math.abs(Math.abs(n.dirx!) - Math.abs(n.diry!))).toBeLessThan(1e-9);
  });

  it('global basis → transforms inclined N/V into Fx/Fz components', () => {
    const j = inclined();
    const v = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'members', basis: 'global' }));
    const labels = new Set(v.filter(x => x.glyph === 'force').map(x => x.component));
    expect(labels.has('Fx')).toBe(true);
    expect(labels.has('Fz')).toBe(true);
    expect(labels.has('N')).toBe(false);
    // Standard free-body axial sign (Option A): F = −u*(N) + p*V, u=(c,c),
    // p=(-c,c), c=√2/2, N=10, V=4 → Fx=−c*10−c*4=−9.90, Fz=−c*10+c*4=−4.24.
    const c = Math.SQRT1_2;
    const fx = v.find(x => x.component === 'Fx' && x.end === 'I')!;
    const fz = v.find(x => x.component === 'Fz' && x.end === 'I')!;
    expect(fx.value).toBeCloseTo(-c * 10 - c * 4, 6);
    expect(fz.value).toBeCloseTo(-c * 10 + c * 4, 6);
    // Decomposition preserves force magnitude: |F| = √(N²+V²).
    expect(Math.hypot(fx.value, fz.value)).toBeCloseTo(Math.hypot(10, 4), 6);
  });

  it('inspectMember returns both ends with basis-aware components', () => {
    const j = inclined();
    const local = inspectMember({ elements: j.elements, getNode: (id) => j.nodes.get(id), getElementForces: (id) => j.forces.get(id), basis: 'local' }, 1)!;
    expect(local.ends.map(e => e.end)).toEqual(['I', 'J']);
    expect(local.ends[0].components.map(c => c.label)).toEqual(['N', 'V', 'M']);
    const global = inspectMember({ elements: j.elements, getNode: (id) => j.nodes.get(id), getElementForces: (id) => j.forces.get(id), basis: 'global' }, 1)!;
    expect(global.ends[0].components.map(c => c.label)).toEqual(['Fx', 'Fz', 'M']);
  });

  it('inspectNode returns every connected member-end action at the node', () => {
    const nodes = new Map([[1, { x: 0, y: 0 }], [2, { x: 4, y: 0 }], [3, { x: 0, y: 4 }], [4, { x: -4, y: 0 }]]);
    const elements: DespieceElement[] = [{ id: 1, nodeI: 1, nodeJ: 2 }, { id: 2, nodeI: 1, nodeJ: 3 }, { id: 3, nodeI: 4, nodeJ: 1 }];
    const forces = new Map<number, DespieceElementForces>(
      elements.map(e => [e.id, { elementId: e.id, nStart: 5, nEnd: -5, vStart: 1, vEnd: -1, mStart: 2, mEnd: -2 }]),
    );
    const res = inspectNode({ elements, getNode: (id) => nodes.get(id), getElementForces: (id) => forces.get(id), basis: 'local' }, 1);
    // 3 members connect to node 1 (E1·I, E2·I, E3·J)
    expect(res.actions.length).toBe(3);
    expect(new Set(res.actions.map(a => `${a.elementId}${a.end}`))).toEqual(new Set(['1I', '2I', '3J']));
  });

  // Regression (#2): the click-inspector's GLOBAL Fx/Fz must match the drawn
  // member-side arrows exactly. The old endComponents used (+ax.ux*n, towardJ on
  // n only), which flipped the axial sign and dropped towardJ from shear, so the
  // inspected number contradicted the rendered arrow at BOTH ends.
  it('inspector global Fx/Fz agree with the drawn member-side arrows (value + sign)', () => {
    const j = inclined();
    const args = { elements: j.elements, getNode: (id: number) => j.nodes.get(id), getElementForces: (id: number) => j.forces.get(id), basis: 'global' as DespieceBasis };
    const inspected = inspectMember(args, 1)!;
    const drawn = computeDespieceVectors(vecArgs({ ...j, vectorMode: 'members', basis: 'global' }));
    for (const endAction of inspected.ends) {
      for (const label of ['Fx', 'Fz'] as const) {
        const insp = endAction.components.find(c => c.label === label)!;
        const arrow = drawn.find(d => d.elementId === 1 && d.end === endAction.end && d.component === label)!;
        // Same signed magnitude…
        expect(insp.value).toBeCloseTo(arrow.value, 9);
        // …and the rendered arrow direction agrees with that sign (Fx→x, Fz→y).
        const arrowSign = label === 'Fx' ? Math.sign(arrow.dirx!) : Math.sign(arrow.diry!);
        expect(arrowSign).toBe(Math.sign(insp.value) || 1);
      }
    }
  });
});

describe('despiece size controls affect drawing', () => {
  // Recording ctx that captures arrow segment lengths and the last font set.
  function recordingCtx() {
    const lines: Array<[number, number, number, number]> = [];
    const fonts: string[] = [];
    let cx = 0, cy = 0;
    const ctx: any = {
      set font(v: string) { fonts.push(v); }, get font() { return fonts[fonts.length - 1] ?? ''; },
      strokeStyle: '', fillStyle: '', lineWidth: 0, textAlign: '', textBaseline: '',
      beginPath() {}, moveTo(x: number, y: number) { cx = x; cy = y; }, lineTo(x: number, y: number) { lines.push([cx, cy, x, y]); cx = x; cy = y; },
      stroke() {}, fill() {}, closePath() {}, arc() {}, save() {}, restore() {}, setLineDash() {}, strokeText() {}, fillText() {},
    };
    return { ctx, lines, fonts };
  }
  function draw(vectorSize: number, labelSize: number) {
    const r = recordingCtx();
    // Short member so the (fixed-px) axial arrow shaft is the longest segment,
    // not the member line — lets us assert the arrow scales with vectorSize.
    const nodes = new Map([[1, { x: 0, y: 0 }], [2, { x: 2, y: 0 }]]);
    const d: DespieceCtx = {
      ctx: r.ctx as unknown as CanvasRenderingContext2D,
      worldToScreen: (wx, wy) => ({ x: wx * 10 + 100, y: 200 - wy * 10 }),
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      getNode: (id) => nodes.get(id),
      getElementForces: () => ({ elementId: 1, nStart: 12, nEnd: -12, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0 }),
      reactions: new Map(), sep: 1, fmt: (v) => v.toFixed(1),
      vectorMode: 'members', basis: 'local', showReactions: false, vectorSize, labelSize,
    };
    drawDespiece(d);
    // longest drawn segment ≈ the arrow shaft
    const segs = r.lines.slice();
    const arrow = segs.reduce((a, b) => (Math.hypot(b[2] - b[0], b[3] - b[1]) > Math.hypot(a[2] - a[0], a[3] - a[1]) ? b : a));
    const maxLen = Math.hypot(arrow[2] - arrow[0], arrow[3] - arrow[1]);
    const fontPx = Math.max(...r.fonts.map(f => parseFloat((f.match(/(\d+(\.\d+)?)px/) ?? ['', '0'])[1])));
    return { maxLen, fontPx, arrow };
  }
  it('vector size slider scales arrow length', () => {
    expect(draw(2, 1).maxLen).toBeGreaterThan(draw(1, 1).maxLen + 5);
  });
  it('label size slider scales label font px', () => {
    expect(draw(1, 2).fontPx).toBeGreaterThan(draw(1, 1).fontPx);
  });
  it('perpendicular stagger stays small relative to arrow length', () => {
    const { maxLen, arrow } = draw(1, 1);
    // member-end anchor (shrunken end) in this helper's screen mapping
    const aI = shrinkMember({ x: 0, y: 0 }, { x: 2, y: 0 }, 1).i;
    const A = { x: aI.x * 10 + 100, y: 200 - aI.y * 10 };
    // perpendicular distance from the anchor to the arrow line
    const [x0, y0, x1, y1] = arrow;
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
    const cross = Math.abs((A.x - x0) * dy - (A.y - y0) * dx) / Math.sqrt(L2);
    expect(cross).toBeLessThan(0.5 * maxLen); // small perpendicular offset, not detached
  });
});
