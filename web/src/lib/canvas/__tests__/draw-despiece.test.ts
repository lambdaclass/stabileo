import { describe, it, expect } from 'vitest';
import {
  memberAxes, shrinkMember, despieceScales, drawDespiece,
  computeDespieceVectors, computeDespieceSegments, momentArrowhead,
  inspectMember, inspectNode, DESPIECE_MAX_GAP_FRAC,
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

  it('dashed remnant segment exists from each original node to its shrunken end', () => {
    const j = simpleJoint();
    const segs = computeDespieceSegments({ elements: j.elements, getNode: (id) => j.nodes.get(id), sep: 1 });
    // 2 elements × 2 ends = 4 remnants
    expect(segs.length).toBe(4);
    const e1I = segs.find(s => s.elementId === 1 && s.end === 'I')!;
    expect(e1I.from).toEqual({ x: 0, y: 0 });          // original node
    expect(e1I.to.x).toBeGreaterThan(0);                // shrunken end pulled inward
    expect(e1I.to.x).toBeLessThan(2);
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
    // end I: F = u*(N) + p*V, u=(c,c), p=(-c,c), c=√2/2, N=10, V=4 → Fx=c*10-c*4=4.24, Fz=c*10+c*4=9.9
    const c = Math.SQRT1_2;
    const fx = v.find(x => x.component === 'Fx' && x.end === 'I')!;
    const fz = v.find(x => x.component === 'Fz' && x.end === 'I')!;
    expect(fx.value).toBeCloseTo(c * 10 - c * 4, 6);
    expect(fz.value).toBeCloseTo(c * 10 + c * 4, 6);
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
