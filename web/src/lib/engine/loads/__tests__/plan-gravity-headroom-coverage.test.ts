import { describe, it, expect } from 'vitest';
import { gravityLayout, type GravityModel } from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';

type Node = { id: number; x: number; y: number; z: number };
type Element = { id: number; nodeI: number; nodeJ: number; type?: 'frame' | 'truss' };

function builder() {
  const nodes = new Map<number, Node>();
  const elements = new Map<number, Element>();
  let n = 1, e = 1;
  const node = (x: number, y: number, z: number) => {
    for (const p of nodes.values()) if (p.x === x && p.y === y && p.z === z) return p.id;
    nodes.set(n, { id: n, x, y, z });
    return n++;
  };
  const bar = (a: number, b: number, type: 'frame' | 'truss' = 'frame') => { elements.set(e, { id: e++, nodeI: a, nodeJ: b, type }); };
  return { nodes, elements, node, bar, model: (): GravityModel => ({ nodes, elements }) };
}

const sum = (m: Map<number, number>) => [...m.values()].reduce((s, a) => s + a, 0);
const keys = (l: ReturnType<typeof gravityLayout>) => l.notes.map((x) => x.key);

/**
 * A 6 × 6 m floor at 3 m: a storey over its right half (a ring at 6 m over x = 3–6), open sky over
 * the left half, and one beam at 4 m over its front edge there.
 */
function floorUnderOneLowBeam(): GravityModel {
  const b = builder();
  const corners: Array<[number, number]> = [[0, 0], [6, 0], [6, 6], [0, 6]];
  const floor = corners.map(([x, y]) => b.node(x, y, 3));
  corners.forEach(([x, y], i) => b.bar(b.node(x, y, 0), floor[i]!));
  floor.forEach((id, i) => b.bar(id, floor[(i + 1) % 4]!));
  const upper = ([[3, 0], [6, 0], [6, 6], [3, 6]] as Array<[number, number]>).map(([x, y]) => b.node(x, y, 6));
  upper.forEach((id, i) => b.bar(id, upper[(i + 1) % 4]!));
  b.bar(b.node(0.5, 0, 4), b.node(2.5, 0, 4));
  return b.model();
}

/** A 6 × 6 m floor at 3 m with a beam at 4 m over its whole front edge and nothing else above. */
function floorUnderCanopy(): GravityModel {
  const b = builder();
  const corners: Array<[number, number]> = [[0, 0], [6, 0], [6, 6], [0, 6]];
  const floor = corners.map(([x, y]) => b.node(x, y, 3));
  corners.forEach(([x, y], i) => b.bar(b.node(x, y, 0), floor[i]!));
  floor.forEach((id, i) => b.bar(id, floor[(i + 1) % 4]!));
  const p0 = b.node(0, 0, 4), p1 = b.node(6, 0, 4);
  b.bar(floor[0]!, p0); b.bar(floor[1]!, p1); b.bar(p0, p1);
  return b.model();
}

/**
 * A 10 × 6 m ring of beams at 4 m under two gable trusses (truss members) at y = 0 and y = 6,
 * `depth` deep at the ridge, with frame purlins every 1.25 m when `purlins`, and a 1 m frame beam
 * over the centre when `stub`.
 */
function trussedRing(depth: number, purlins: boolean, stub = false): GravityModel {
  const b = builder();
  const corners: Array<[number, number]> = [[0, 0], [10, 0], [10, 6], [0, 6]];
  const ring = corners.map(([x, y]) => b.node(x, y, 4));
  corners.forEach(([x, y], i) => b.bar(b.node(x, y, 0), ring[i]!));
  ring.forEach((id, i) => b.bar(id, ring[(i + 1) % 4]!));
  const roofZ = (x: number) => 4 + depth * (1 - Math.abs(x - 5) / 5);
  for (const y of [0, 6]) {
    const xs = [0, 1.25, 2.5, 3.75, 5, 6.25, 7.5, 8.75, 10];
    for (let i = 0; i + 1 < xs.length; i++) b.bar(b.node(xs[i]!, y, roofZ(xs[i]!)), b.node(xs[i + 1]!, y, roofZ(xs[i + 1]!)), 'truss');
    b.bar(b.node(5, y, 4), b.node(5, y, 4 + depth), 'truss');
  }
  if (purlins) for (const x of [1.25, 2.5, 3.75, 5, 6.25, 7.5, 8.75]) b.bar(b.node(x, 0, roofZ(x)), b.node(x, 6, roofZ(x)));
  if (stub) b.bar(b.node(5, 2.5, 5), b.node(5, 3.5, 5));
  return b.model();
}

describe('a panel only partly under low roof structure keeps its area load', () => {
  it('a floor with one low beam over an edge is loaded, and the derivation says so', () => {
    const layout = gravityLayout(floorUnderOneLowBeam(), { mode: 'panels', tributaryWidth: 3 });
    expect(layout.areaByLevel.get(3)).toBeCloseTo(36, 6);
    expect(sum(layout.areaOf)).toBeCloseTo(36, 6);
    expect(keys(layout)).not.toContain('loadPlan.gravity.lowHeadroom');
    expect(keys(layout)).toContain('loadPlan.gravity.headroomUnclear');
  });

  it('by width, the beam under the low one keeps its load', () => {
    const layout = gravityLayout(floorUnderOneLowBeam(), { mode: 'width', tributaryWidth: 3 });
    const floorBeams = [5, 6, 7, 8];
    for (const id of floorBeams) {
      const m = layout.widthMembers.find((w) => w.elementId === id)!;
      expect(m.spans).toBeUndefined();
      expect((layout.areaOf.get(id) ?? 0) + (layout.roofAreaOf.get(id) ?? 0)).toBeCloseTo(3 * 6, 9);
    }
    expect(keys(layout)).not.toContain('loadPlan.gravity.membersLowHeadroom');
  });

  it('by width, the beam under a canopy keeps its load, the floor beside it not being roof structure', () => {
    const layout = gravityLayout(floorUnderCanopy(), { mode: 'width', tributaryWidth: 3 });
    expect(layout.widthMembers.find((m) => m.elementId === 5)?.spans).toBeUndefined();
    expect((layout.areaOf.get(5) ?? 0) + (layout.roofAreaOf.get(5) ?? 0)).toBeCloseTo(3 * 6, 9);
    expect(keys(layout)).not.toContain('loadPlan.gravity.membersLowHeadroom');
    const panels = gravityLayout(floorUnderCanopy(), { mode: 'panels', tributaryWidth: 3 });
    expect(panels.areaByLevel.get(3)).toBeCloseTo(36, 6);
    expect(panels.roofAreaOf.size).toBeGreaterThan(0);
    expect(keys(panels)).toContain('loadPlan.gravity.headroomUnclearRoof');
    expect(keys(panels)).not.toContain('loadPlan.gravity.headroomUnclear');
  });
});

/** A 6 × 6 m ring at 3 m under four beams 1 m above it along x, at y = 0, 2, 2.5 and 6. */
function clusteredBeams(): GravityModel {
  const b = builder();
  const corners: Array<[number, number]> = [[0, 0], [6, 0], [6, 6], [0, 6]];
  const floor = corners.map(([x, y]) => b.node(x, y, 3));
  corners.forEach(([x, y], i) => b.bar(b.node(x, y, 0), floor[i]!));
  floor.forEach((id, i) => b.bar(id, floor[(i + 1) % 4]!));
  for (const y of [0, 2, 2.5, 6]) b.bar(b.node(0, y, 4), b.node(6, y, 4));
  return b.model();
}

describe('roof structure that does not carry all of a panel', () => {
  it('beams clustered over part of a ring do not stand in for its whole area', () => {
    const layout = gravityLayout(clusteredBeams(), { mode: 'panels', tributaryWidth: 3 });
    expect(keys(layout)).not.toContain('loadPlan.gravity.lowHeadroom');
    expect(keys(layout)).toContain('loadPlan.gravity.headroomUnclearRoof');
    expect(layout.areaByLevel.get(3)).toBeCloseTo(36, 6);
  });

  it('a ring whose whole area the low beams above carry is the roof\'s structure', () => {
    const m = clusteredBeams();
    const b = [...m.nodes.values()].length + 1;
    m.nodes.set(b, { id: b, x: 0, y: 3, z: 4 });
    m.nodes.set(b + 1, { id: b + 1, x: 6, y: 3, z: 4 });
    m.elements.set(99, { id: 99, nodeI: b, nodeJ: b + 1, type: 'frame' });
    const layout = gravityLayout(m, { mode: 'panels', tributaryWidth: 3 });
    expect(keys(layout)).toContain('loadPlan.gravity.lowHeadroom');
    expect(keys(layout)).not.toContain('loadPlan.gravity.roofFringe');
    expect(layout.areaByLevel.get(3)).toBeUndefined();
    const carriers = [...m.elements.values()].filter((e) => m.nodes.get(e.nodeI)!.z === 4 && m.nodes.get(e.nodeJ)!.z === 4).map((e) => e.id);
    expect(carriers.reduce((t, id) => t + (layout.roofAreaOf.get(id) ?? 0), 0)).toBeCloseTo(5 * 6 * 3, 6);
  });
});

describe('a narrow gap between the strips of the beams above', () => {
  it('stays on the ring as roof load: the 0.05 × 6 m gap alone, where it lies', () => {
    const b = builder();
    const corners: Array<[number, number]> = [[0, 0], [6, 0], [6, 6], [0, 6]];
    const ring = corners.map(([x, y]) => b.node(x, y, 3));
    corners.forEach(([x, y], i) => b.bar(b.node(x, y, 0), ring[i]!));
    const ringIds = new Set(ring.map((id, i) => { b.bar(id, ring[(i + 1) % 4]!); return b.elements.size; }));
    for (const y of [0, 3, 6.05]) b.bar(b.node(0, y, 4), b.node(6, y, 4));
    const model = b.model();
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 3 });
    expect(keys(layout)).toContain('loadPlan.gravity.roofFringe');
    expect(layout.areaByLevel.get(3)).toBeCloseTo(0.05 * 6, 9);
    expect(sum(layout.areaOf)).toBe(0);
    let force = 0, mx = 0, my = 0;
    for (const p of layout.pieces.filter((q) => ringIds.has(q.elementId))) {
      const e = model.elements.get(p.elementId)!;
      const n0 = model.nodes.get(e.nodeI)!, n1 = model.nodes.get(e.nodeJ)!;
      const L = Math.hypot(n1.x - n0.x, n1.y - n0.y), s = (p.a! + p.b!) / 2, f = p.wI * (p.b! - p.a!);
      force += f; mx += f * (n0.x + ((n1.x - n0.x) * s) / L); my += f * (n0.y + ((n1.y - n0.y) * s) / L);
    }
    for (const p of layout.points.filter((q) => ringIds.has(q.elementId))) {
      const n = model.nodes.get(p.nodeId)!;
      force += p.w; mx += p.w * n.x; my += p.w * n.y;
    }
    expect(force).toBeCloseTo(0.3, 9);
    expect(mx / force).toBeCloseTo(3, 6);
    expect(my / force).toBeCloseTo(4.525, 6);
  });
});

describe('a narrow panel above a wider ring', () => {
  it('carries only its own area: the ring keeps, as roof, what the panel and the strips above do not carry', () => {
    const b = builder();
    const corners: Array<[number, number]> = [[0, 0], [6, 0], [6, 4], [0, 4]];
    const ring = corners.map(([x, y]) => b.node(x, y, 3));
    corners.forEach(([x, y], i) => b.bar(b.node(x, y, 0), ring[i]!));
    ring.forEach((id, i) => b.bar(id, ring[(i + 1) % 4]!));
    const lower = new Set(b.elements.keys());
    const narrow = ([[0, 1.5], [6, 1.5], [6, 2.5], [0, 2.5]] as Array<[number, number]>).map(([x, y]) => b.node(x, y, 4));
    narrow.forEach((id, i) => b.bar(id, narrow[(i + 1) % 4]!));
    for (const y of [0, 4]) b.bar(b.node(0, y, 4), b.node(6, y, 4));
    const layout = gravityLayout(b.model(), { mode: 'panels', tributaryWidth: 2 });
    expect(keys(layout)).toContain('loadPlan.gravity.roofFringe');
    expect(keys(layout)).not.toContain('loadPlan.gravity.lowHeadroom');
    const kept = [...lower].reduce((s, id) => s + (layout.roofAreaOf.get(id) ?? 0), 0);
    expect(kept).toBeCloseTo(2 * 0.5 * 6, 9);
    expect(layout.areaByLevel.get(3)).toBeCloseTo(kept, 9);
    expect(sum(layout.areaOf)).toBe(0);
  });
});

describe('trusses count as the roof\'s structure', () => {
  it('a ring under a deep truss is loaded with a diagnostic, not silently as a storey', () => {
    const layout = gravityLayout(trussedRing(3, true), { mode: 'panels', tributaryWidth: 3 });
    expect(layout.areaByLevel.get(4)).toBeCloseTo(60, 6);
    expect(keys(layout)).toContain('loadPlan.gravity.headroomUnclear');
    expect(keys(layout)).not.toContain('loadPlan.gravity.lowHeadroom');
  });

  it('a ring under a shallow truss with loaded purlins is the roof\'s structure', () => {
    const layout = gravityLayout(trussedRing(1.5, true), { mode: 'panels', tributaryWidth: 3 });
    expect(layout.areaByLevel.get(4)).toBeUndefined();
    expect(sum(layout.areaOf)).toBe(0);
    expect(keys(layout)).toContain('loadPlan.gravity.lowHeadroom');
    expect(sum(layout.roofAreaOf)).toBeGreaterThanOrEqual(60 - 1e-9);
  });

  it('a short beam over the centre does not stand in for the roof the ring carries', () => {
    const layout = gravityLayout(trussedRing(1.5, false, true), { mode: 'panels', tributaryWidth: 3 });
    expect(sum(layout.areaOf)).toBe(0);
    expect(layout.areaByLevel.get(4)).toBeGreaterThanOrEqual(60 - 3 - 1e-9);
    expect(layout.areaByLevel.get(4)).toBeLessThan(60);
    expect(sum(layout.roofAreaOf)).toBeGreaterThanOrEqual(60 - 1e-9);
    expect(keys(layout)).toContain('loadPlan.gravity.roofFringe');
    expect(keys(layout)).not.toContain('loadPlan.gravity.lowHeadroom');
  });

  it('a ring under trusses that carry no area load takes the roof load itself', () => {
    const layout = gravityLayout(trussedRing(1.5, false), { mode: 'panels', tributaryWidth: 3 });
    expect(layout.areaByLevel.get(4)).toBeCloseTo(60, 6);
    expect(sum(layout.roofAreaOf)).toBeCloseTo(60, 6);
    expect(sum(layout.areaOf)).toBe(0);
  });
});

describe('a member under a low shell, by width', () => {
  it('keeps its load: the width mode loads no shell', () => {
    const b = builder();
    const ends = [b.node(0, 0, 3), b.node(6, 0, 3)];
    ends.forEach((id, i) => b.bar(b.node(i * 6, 0, 0), id));
    b.bar(ends[0]!, ends[1]!);
    const member = b.elements.size;
    const shell = [b.node(0, -2, 4), b.node(6, -2, 4), b.node(6, 2, 4.4), b.node(0, 2, 4.4)];
    const model: GravityModel = { ...b.model(), quads: new Map([[1, { id: 1, nodes: shell }]]) };
    const layout = gravityLayout(model, { mode: 'width', tributaryWidth: 3 });
    expect(layout.widthMembers.map((m) => m.elementId)).toContain(member);
    expect((layout.roofAreaOf.get(member) ?? 0) + (layout.areaOf.get(member) ?? 0)).toBeCloseTo(18, 6);
    expect(keys(layout)).not.toContain('loadPlan.gravity.membersLowHeadroom');
  });
});

describe('a member carried above over half its length, by width', () => {
  function halfCovered(): GravityModel {
    const b = builder();
    const ends = [b.node(0, 0, 3), b.node(10, 0, 3)];
    ends.forEach((id, i) => b.bar(b.node(i * 10, 0, 0), id));
    b.bar(ends[0]!, ends[1]!);
    b.bar(b.node(0, 0, 4), b.node(5, 0, 4));
    b.bar(b.node(5, 0, 4), b.node(10, 0, 4), 'truss');
    return b.model();
  }

  it('keeps its roof load on the uncarried half only, where it lies', () => {
    const layout = gravityLayout(halfCovered(), { mode: 'width', tributaryWidth: 3 });
    const m = layout.widthMembers.find((w) => w.elementId === 3)!;
    expect(m.spans).toBeDefined();
    expect(Math.min(...m.spans!.map((s) => s.t0))).toBeCloseTo(0.5, 9);
    for (const s of m.spans!) expect(s.width).toBeCloseTo(3, 9);
    expect(layout.roofAreaOf.get(3)).toBeCloseTo(15, 9);
    const area = planAreaLoads({
      layout, tributaryWidth: 3, floor: { dead: 0, lo: 0, liveOf: () => 0 },
      roof: { dead: 1, use: 'maintenance', weight: 'light' as never, slopePercent: 0 },
    });
    const dead = area.distributed.filter((d) => d.elementId === 3 && d.caseType === 'D');
    expect(dead.length).toBeGreaterThan(0);
    for (const d of dead) {
      expect(d.a).toBeGreaterThanOrEqual(5 - 1e-9);
      expect(d.b).toBeLessThanOrEqual(10 + 1e-9);
    }
    expect(dead.reduce((s, d) => s + -d.q * (d.b! - d.a!), 0)).toBeCloseTo(15, 9);
  });
});

describe('three tiers of roof structure, by width', () => {
  it('each stretch of roof load is kept once, by the highest member that carries it', () => {
    const b = builder();
    for (const z of [3, 4]) {
      const ends = [b.node(0, 0, z), b.node(10, 0, z)];
      b.bar(ends[0]!, ends[1]!);
    }
    b.bar(b.node(0, 0, 0), b.node(0, 0, 3)); b.bar(b.node(10, 0, 0), b.node(10, 0, 3));
    b.bar(b.node(0, 0, 3), b.node(0, 0, 4)); b.bar(b.node(10, 0, 3), b.node(10, 0, 4));
    b.bar(b.node(0, 0, 5), b.node(5, 0, 5));
    b.bar(b.node(5, 0, 5), b.node(10, 0, 5), 'truss');
    const [lower, middle, top] = [1, 2, 7];
    const layout = gravityLayout(b.model(), { mode: 'width', tributaryWidth: 3 });
    expect(layout.widthMembers.map((m) => m.elementId)).not.toContain(lower);
    const mid = layout.widthMembers.find((m) => m.elementId === middle)!;
    expect(Math.min(...mid.spans!.map((s) => s.t0))).toBeCloseTo(0.5, 9);
    expect(layout.roofAreaOf.get(middle)).toBeCloseTo(15, 9);
    expect(layout.roofAreaOf.get(top)).toBeCloseTo(15, 9);
    expect(sum(layout.roofAreaOf)).toBeCloseTo(30, 9);
    expect(sum(layout.areaOf)).toBe(0);
  });
});

describe('a roof-structure ring carried above all but its back strip', () => {
  it('puts the strip\'s roof load on the beams that bound the strip, not spread over the ring', () => {
    const b = builder();
    const corners: Array<[number, number]> = [[0, 0], [6, 0], [6, 4], [0, 4]];
    const ring = corners.map(([x, y]) => b.node(x, y, 3));
    corners.forEach(([x, y], i) => b.bar(b.node(x, y, 0), ring[i]!));
    const ids = ring.map((id, i) => { b.bar(id, ring[(i + 1) % 4]!); return b.elements.size; });
    const [front, right, back, left] = ids as [number, number, number, number];
    const upper = ([[0, 0], [6, 0], [6, 3], [0, 3]] as Array<[number, number]>).map(([x, y]) => b.node(x, y, 4));
    upper.forEach((id, i) => b.bar(id, upper[(i + 1) % 4]!));
    b.bar(b.node(0, 4, 4), b.node(6, 4, 4), 'truss');
    const model = b.model();
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 3 });
    expect(keys(layout)).toContain('loadPlan.gravity.roofFringe');
    expect(layout.areaByLevel.get(3)).toBeCloseTo(6, 6);
    const ringIds = new Set([front, right, back, left]);
    let force = 0, mx = 0, my = 0;
    for (const p of layout.pieces.filter((q) => ringIds.has(q.elementId))) {
      const e = model.elements.get(p.elementId)!;
      const n0 = model.nodes.get(e.nodeI)!, n1 = model.nodes.get(e.nodeJ)!;
      const L = Math.hypot(n1.x - n0.x, n1.y - n0.y), s = (p.a! + p.b!) / 2, f = p.wI * (p.b! - p.a!);
      force += f; mx += f * (n0.x + ((n1.x - n0.x) * s) / L); my += f * (n0.y + ((n1.y - n0.y) * s) / L);
    }
    for (const p of layout.points.filter((q) => ringIds.has(q.elementId))) {
      const n = model.nodes.get(p.nodeId)!;
      force += p.w; mx += p.w * n.x; my += p.w * n.y;
    }
    expect(force).toBeCloseTo(6, 6);
    expect(mx / force).toBeCloseTo(3, 6);
    expect(my / force).toBeCloseTo(3.5, 6);
    const on = (id: number) => layout.roofAreaOf.get(id) ?? 0;
    expect(on(left)).toBeCloseTo(on(right), 6);
    expect(on(back)).toBeGreaterThan(on(front));
    expect(on(front)).toBeLessThan(1);
  });
});

describe('a member whose cover above ends inside one of its stretches, by width', () => {
  function coveredTo(x: number): GravityModel {
    const b = builder();
    const ends = [b.node(0, 0, 3), b.node(10, 0, 3)];
    ends.forEach((id, i) => b.bar(b.node(i * 10, 0, 0), id));
    b.bar(ends[0]!, ends[1]!);
    b.bar(b.node(0, 0, 4), b.node(x, 0, 4));
    b.bar(b.node(x, 0, 4), b.node(10, 0, 4), 'truss');
    return b.model();
  }

  it('loads only the uncovered end, so the reactions match a hand calculation', () => {
    const layout = gravityLayout(coveredTo(9.5), { mode: 'width', tributaryWidth: 3 });
    const area = planAreaLoads({
      layout, tributaryWidth: 3, floor: { dead: 0, lo: 0, liveOf: () => 0 },
      roof: { dead: 1, use: 'maintenance', weight: 'light' as never, slopePercent: 0 },
    });
    const dead = area.distributed.filter((d) => d.elementId === 3 && d.caseType === 'D');
    for (const d of dead) expect(d.a).toBeGreaterThanOrEqual(9.5 - 1e-6);
    const force = dead.reduce((s, d) => s + -d.q * (d.b! - d.a!), 0);
    const right = dead.reduce((s, d) => s + (-d.q * (d.b! - d.a!) * (d.a! + d.b!)) / 2, 0) / 10;
    expect(force).toBeCloseTo(3 * 0.5, 6);
    expect(right).toBeCloseTo(1.5 * 9.75 / 10, 6);
    expect(force - right).toBeCloseTo(1.5 * 0.25 / 10, 6);
  });
});

describe('a member turned in plan whose cover above ends inside one of its stretches, by width', () => {
  it('keeps the reactions of the uncovered end, as a hand calculation gives them', () => {
    const r = Math.PI / 6, at = (d: number): [number, number] => [d * Math.cos(r), d * Math.sin(r)];
    const b = builder();
    const ends = [b.node(...at(0), 3), b.node(...at(10), 3)];
    ends.forEach((id, i) => b.bar(b.node(...at(i * 10), 0), id));
    b.bar(ends[0]!, ends[1]!);
    b.bar(b.node(...at(0), 4), b.node(...at(9.5), 4));
    b.bar(b.node(...at(9.5), 4), b.node(...at(10), 4), 'truss');
    const layout = gravityLayout(b.model(), { mode: 'width', tributaryWidth: 3 });
    const area = planAreaLoads({
      layout, tributaryWidth: 3, floor: { dead: 0, lo: 0, liveOf: () => 0 },
      roof: { dead: 1, use: 'maintenance', weight: 'light' as never, slopePercent: 0 },
    });
    const dead = area.distributed.filter((d) => d.elementId === 3 && d.caseType === 'D');
    const force = dead.reduce((s, d) => s + -d.q * (d.b! - d.a!), 0);
    const right = dead.reduce((s, d) => s + (-d.q * (d.b! - d.a!) * (d.a! + d.b!)) / 2, 0) / 10;
    expect(force).toBeGreaterThanOrEqual(1.5 - 1e-6);
    expect(force).toBeLessThanOrEqual(1.5 + 3 * 0.05 * 2 + 1e-6);
    expect(right / force).toBeGreaterThanOrEqual(9.5 / 10 + 0.02);
    expect(right / force).toBeLessThanOrEqual(1);
    expect(right).toBeCloseTo((force * 9.75) / 10, 1);
  });
});
