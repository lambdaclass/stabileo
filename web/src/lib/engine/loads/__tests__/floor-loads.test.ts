/**
 * Floor loads by tributary area, against the closed forms.
 *
 * A rectangular panel lx × ly (lx ≥ ly) under q, two way: each short side carries a triangle of
 * peak q·ly/2, total q·ly²/4; each long side a trapezoid rising over ly/2 at each end to the same
 * peak, total q·ly·(2·lx − ly)/4. One way: the two sides the slab spans between carry q·L/2
 * uniform and the others nothing. Every case adds up to q times the loaded area.
 */
import { describe, it, expect } from 'vitest';
import { floorLoad, type FloorBeam } from '../floor-loads';

function panelModel(pts: Array<[number, number]>, z = 3, reverse: number[] = []) {
  const nodes = new Map(pts.map(([x, y], i) => [i + 1, { x, y, z }]));
  const beams: FloorBeam[] = pts.map((_, i) => {
    const a = i + 1, b = ((i + 1) % pts.length) + 1;
    const [nodeI, nodeJ] = reverse.includes(i + 1) ? [b, a] : [a, b];
    return { id: i + 1, nodeI, nodeJ, type: 'frame', sectionId: 1 };
  });
  return { nodes, beams };
}

const totals = (r: ReturnType<typeof floorLoad>) => Object.fromEntries([...r.perBeam].map(([k, v]) => [k, Math.round(v * 1e6) / 1e6]));

describe('two way', () => {
  it('a 6 × 4 panel: triangles on the short sides, trapezoids on the long', () => {
    const q = 5;
    const r = floorLoad({ ...panelModel([[0, 0], [6, 0], [6, 4], [0, 4]]), q, distribution: 'twoWay' });
    expect(r.panels).toHaveLength(1);
    expect(r.loadedArea).toBeCloseTo(24, 9);
    expect(r.totalKN).toBeCloseTo(q * 24, 6);
    const long = (q * 4 * (2 * 6 - 4)) / 4, short = (q * 4 * 4) / 4;
    expect(totals(r)).toEqual({ 1: long, 2: short, 3: long, 4: short });
    // The short side: 0 → q·ly/2 at mid-span → 0.
    const s = r.loads.filter((l) => l.elementId === 2).sort((a, b) => (a.a ?? 0) - (b.a ?? 0));
    expect(s.map((l) => [l.a, l.b, l.qI, l.qJ])).toEqual([[0, 2, 0, 10], [2, 4, 10, 0]]);
    // The long side: rises over 2 m, flat over 2 m, falls over 2 m.
    const l1 = r.loads.filter((l) => l.elementId === 1).sort((a, b) => (a.a ?? 0) - (b.a ?? 0));
    expect(l1.map((l) => [l.a, l.b, l.qI, l.qJ])).toEqual([[0, 2, 0, 10], [2, 4, 10, 10], [4, 6, 10, 0]]);
  });

  it('a square gives four equal triangles', () => {
    const r = floorLoad({ ...panelModel([[0, 0], [5, 0], [5, 5], [0, 5]]), q: 4, distribution: 'twoWay' });
    for (const v of r.perBeam.values()) expect(v).toBeCloseTo((4 * 25) / 4, 6);
  });

  it('a member drawn backwards gets the same load, measured from its own node I', () => {
    const r = floorLoad({ ...panelModel([[0, 0], [6, 0], [6, 4], [0, 4]], 3, [1]), q: 5, distribution: 'twoWay' });
    const l1 = r.loads.filter((l) => l.elementId === 1).sort((a, b) => (a.a ?? 0) - (b.a ?? 0));
    expect(l1.map((l) => [l.a, l.b, l.qI, l.qJ])).toEqual([[0, 2, 0, 10], [2, 4, 10, 10], [4, 6, 10, 0]]);
    expect(r.perBeam.get(1)).toBeCloseTo(40, 6);
  });

  it('a side made of two members splits its load between them', () => {
    // The long side y = 0 is two members, 0→3 and 3→6.
    const nodes = new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 3, y: 0, z: 0 }], [3, { x: 6, y: 0, z: 0 }], [4, { x: 6, y: 4, z: 0 }], [5, { x: 0, y: 4, z: 0 }]]);
    const beams: FloorBeam[] = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 1]].map(([i, j], k) => ({ id: k + 1, nodeI: i!, nodeJ: j!, type: 'frame', sectionId: 1 }));
    const r = floorLoad({ nodes, beams, q: 5, distribution: 'twoWay' });
    expect((r.perBeam.get(1) ?? 0) + (r.perBeam.get(2) ?? 0)).toBeCloseTo(40, 6);
    expect(r.perBeam.get(1)).toBeCloseTo(20, 6);
  });

  it('a triangle panel: each side takes the region nearest to it, and the sum is q·A', () => {
    const r = floorLoad({ ...panelModel([[0, 0], [4, 0], [0, 3]]), q: 2, distribution: 'twoWay' });
    expect(r.totalKN).toBeCloseTo(2 * 6, 6);
    // The incircle splits the triangle into three regions of area r·side/2, r = 1.
    expect(totals(r)).toEqual({ 1: 4, 2: 5, 3: 3 });
  });

  it('two panels share their middle beam, which takes load from both', () => {
    const nodes = new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 4, y: 0, z: 0 }], [3, { x: 8, y: 0, z: 0 }], [4, { x: 8, y: 4, z: 0 }], [5, { x: 4, y: 4, z: 0 }], [6, { x: 0, y: 4, z: 0 }]]);
    const pairs = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1], [2, 5]];
    const beams: FloorBeam[] = pairs.map(([i, j], k) => ({ id: k + 1, nodeI: i!, nodeJ: j!, type: 'frame', sectionId: 1 }));
    const r = floorLoad({ nodes, beams, q: 3, distribution: 'twoWay' });
    expect(r.panels.filter((p) => p.loaded)).toHaveLength(2);
    expect(r.totalKN).toBeCloseTo(3 * 32, 6);
    expect(r.perBeam.get(7)).toBeCloseTo(2 * (3 * 16) / 4, 6);
  });
});

describe('one way', () => {
  it('spanning along X, the load goes to the sides at x = 0 and x = lx', () => {
    const r = floorLoad({ ...panelModel([[0, 0], [6, 0], [6, 4], [0, 4]]), q: 5, distribution: 'oneWay', spanAxis: 'x' });
    expect(totals(r)).toEqual({ 2: 60, 4: 60 });
    const l = r.loads.find((x) => x.elementId === 2)!;
    expect([l.a, l.b, l.qI, l.qJ]).toEqual([undefined, undefined, 15, 15]);
  });

  it('spanning along Y, the long sides', () => {
    const r = floorLoad({ ...panelModel([[0, 0], [6, 0], [6, 4], [0, 4]]), q: 5, distribution: 'oneWay', spanAxis: 'y' });
    expect(totals(r)).toEqual({ 1: 60, 3: 60 });
  });

  it('a trapezoid panel still adds up to q·A', () => {
    const r = floorLoad({ ...panelModel([[0, 0], [6, 0], [5, 4], [1, 4]]), q: 2, distribution: 'oneWay', spanAxis: 'y' });
    expect(r.totalKN).toBeCloseTo(2 * 20, 6);
  });
});

describe('what is not loaded', () => {
  const overlapping = () => {
    const m = panelModel([[0, 0], [4, 0], [4, 4], [0, 4]]);
    const other = panelModel([[2, 2], [6, 2], [6, 6], [2, 6]]);
    for (const [id, n] of other.nodes) m.nodes.set(id + 4, n);
    m.beams.push(...other.beams.map((b) => ({ ...b, id: b.id + 4, nodeI: b.nodeI + 4, nodeJ: b.nodeJ + 4 })));
    return m;
  };

  it.each(['oneWay', 'twoWay'] as const)('refuses crossing loops instead of double-loading their overlap (%s)', (distribution) => {
    const r = floorLoad({ ...overlapping(), q: 5, distribution });
    expect(r.skipped.crossings).toBe(2);
    expect(r.panels).toHaveLength(2);
    expect(r.panels.every((p) => !p.loaded && p.reason === 'crossing')).toBe(true);
    expect(r.loads).toHaveLength(0);
    expect(r.loadedArea).toBe(0);
    expect(r.totalKN).toBe(0);
  });

  it('still loads a separate valid component beside crossing loops', () => {
    const m = overlapping();
    const safe = panelModel([[10, 0], [14, 0], [14, 4], [10, 4]]);
    for (const [id, n] of safe.nodes) m.nodes.set(id + 8, n);
    m.beams.push(...safe.beams.map((b) => ({ ...b, id: b.id + 8, nodeI: b.nodeI + 8, nodeJ: b.nodeJ + 8 })));
    const r = floorLoad({ ...m, q: 5, distribution: 'twoWay' });
    expect(r.skipped.crossings).toBe(2);
    expect(r.loadedArea).toBe(16);
    expect(r.totalKN).toBeCloseTo(80);
    expect(r.loads.every((l) => l.elementId > 8)).toBe(true);
  });

  it('does not hide a crossing by pruning its dangling beam', () => {
    const m = panelModel([[0, 0], [4, 0], [4, 4], [0, 4]]);
    m.nodes.set(5, { x: 2, y: -1, z: 3 });
    m.nodes.set(6, { x: 2, y: 2, z: 3 });
    m.beams.push({ id: 5, nodeI: 5, nodeJ: 6, type: 'frame', sectionId: 1 });
    const r = floorLoad({ ...m, q: 5, distribution: 'twoWay' });
    expect(r.skipped.crossings).toBe(1);
    expect(r.loads).toHaveLength(0);
  });

  it('rejects unconnected crossing diagonals but accepts their shared centre node', () => {
    const m = panelModel([[0, 0], [4, 0], [4, 4], [0, 4]]);
    m.beams.push({ id: 5, nodeI: 1, nodeJ: 3, type: 'frame', sectionId: 1 }, { id: 6, nodeI: 2, nodeJ: 4, type: 'frame', sectionId: 1 });
    expect(floorLoad({ ...m, q: 5, distribution: 'twoWay' }).loads).toHaveLength(0);
    m.beams.splice(4);
    m.nodes.set(5, { x: 2, y: 2, z: 3 });
    for (let i = 1; i <= 4; i++) m.beams.push({ id: 4 + i, nodeI: i, nodeJ: 5, type: 'frame', sectionId: 1 });
    const r = floorLoad({ ...m, q: 5, distribution: 'twoWay' });
    expect(r.skipped.crossings).toBe(0);
    expect(r.panels.filter((p) => p.loaded)).toHaveLength(4);
    expect(r.totalKN).toBeCloseTo(80);
  });

  it('an L-shaped panel is loaded by its skeleton: all of its area, the corner bisector between the arms', () => {
    const r = floorLoad({ ...panelModel([[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]]), q: 5, distribution: 'twoWay' });
    expect(r.panels[0]!.loaded).toBe(true);
    expect(r.loadedArea).toBeCloseTo(27, 6);
    expect(r.totalKN).toBeCloseTo(5 * 27, 6);
    // Symmetric about y = x: the two long outer sides alike, and the two sides at the re-entrant corner.
    const t = totals(r);
    expect(t[1]).toBeCloseTo(t[6]!, 6);
    expect(t[3]! + (r.nodal.filter((n) => n.elementId === 3).reduce((s, n) => s - n.fz, 0))).toBeCloseTo(t[4]! + r.nodal.filter((n) => n.elementId === 4).reduce((s, n) => s - n.fz, 0), 6);
    // The share past the sides' ends at the re-entrant corner goes to its node.
    expect(r.nodal.every((n) => n.nodeId === 4)).toBe(true);
  });

  it('a cantilever beam bounds nothing', () => {
    const m = panelModel([[0, 0], [6, 0], [6, 4], [0, 4]]);
    m.nodes.set(9, { x: 8, y: 0, z: 3 });
    m.beams.push({ id: 9, nodeI: 2, nodeJ: 9, type: 'frame', sectionId: 1 });
    const r = floorLoad({ ...m, q: 5, distribution: 'twoWay' });
    expect(r.skipped.open).toBe(1);
    expect(r.perBeam.has(9)).toBe(false);
    expect(r.totalKN).toBeCloseTo(120, 6);
  });

  it('columns, trusses and other levels are left out and counted', () => {
    const m = panelModel([[0, 0], [6, 0], [6, 4], [0, 4]]);
    m.nodes.set(10, { x: 0, y: 0, z: 0 });
    m.nodes.set(11, { x: 0, y: 0, z: 6 });
    m.nodes.set(12, { x: 6, y: 0, z: 6 });
    m.beams.push({ id: 10, nodeI: 10, nodeJ: 1, type: 'frame', sectionId: 1 });
    m.beams.push({ id: 11, nodeI: 11, nodeJ: 12, type: 'frame', sectionId: 1 });
    m.beams.push({ id: 12, nodeI: 1, nodeJ: 3, type: 'truss', sectionId: 1 });
    const r = floorLoad({ ...m, q: 5, distribution: 'twoWay' });
    expect(r.z).toBe(3);
    expect(r.skipped).toMatchObject({ notHorizontal: 1, otherLevel: 1, trusses: 1 });
  });
});

describe('local axes', () => {
  it('a horizontal beam in the automatic frame takes the load along −z', () => {
    const r = floorLoad({ ...panelModel([[0, 0], [6, 0], [6, 4], [0, 4]]), q: 5, distribution: 'oneWay', spanAxis: 'x' });
    const l = r.loads.find((x) => x.elementId === 2)!;
    expect(l.qZI).toBeCloseTo(-15, 9);
    expect(Math.abs(l.qYI)).toBeLessThan(1e-9);
  });

  it('a beam rolled 90° takes it along its local y', () => {
    const m = panelModel([[0, 0], [6, 0], [6, 4], [0, 4]]);
    m.beams[1]!.rollAngle = 90;
    const r = floorLoad({ ...m, q: 5, distribution: 'oneWay', spanAxis: 'x' });
    const l = r.loads.find((x) => x.elementId === 2)!;
    expect(Math.abs(l.qZI)).toBeLessThan(1e-9);
    expect(Math.abs(l.qYI)).toBeCloseTo(15, 9);
  });
});

describe('a ring of beams inside a panel, not connected to it', () => {
  it('is an opening of the panel: the ring takes its share of the panel around it, and its own panel once', () => {
    const nodes = new Map<number, { x: number; y: number; z: number }>();
    const beams: FloorBeam[] = [];
    const ring = (first: number, pts: Array<[number, number]>) => {
      pts.forEach(([x, y], k) => nodes.set(first + k, { x, y, z: 3 }));
      pts.forEach((_p, k) => beams.push({ id: first + k, nodeI: first + k, nodeJ: first + ((k + 1) % pts.length), type: 'frame', sectionId: 1 }));
    };
    ring(1, [[0, 0], [10, 0], [10, 10], [0, 10]]);
    ring(11, [[4, 4], [6, 4], [6, 6], [4, 6]]);
    const r = floorLoad({ nodes, beams, q: 2, distribution: 'twoWay' });
    // 96 m² of the panel around the ring, 4 m² of the ring's own: 200 kN, the ring's area once.
    expect(r.totalKN).toBeCloseTo(200, 6);
    expect(r.panels.every((p) => p.loaded)).toBe(true);
    for (const id of [11, 12, 13, 14]) expect(r.perBeam.get(id)!).toBeGreaterThan(2 * 4 / 4 + 1e-6);
  });

  it('one way, a strip crossing the opening rests on the ring', () => {
    const nodes = new Map<number, { x: number; y: number; z: number }>();
    const beams: FloorBeam[] = [];
    const ring = (first: number, pts: Array<[number, number]>) => {
      pts.forEach(([x, y], k) => nodes.set(first + k, { x, y, z: 3 }));
      pts.forEach((_p, k) => beams.push({ id: first + k, nodeI: first + k, nodeJ: first + ((k + 1) % pts.length), type: 'frame', sectionId: 1 }));
    };
    ring(1, [[0, 0], [10, 0], [10, 6], [0, 6]]);
    ring(11, [[4, 2], [6, 2], [6, 4], [4, 4]]);
    const r = floorLoad({ nodes, beams, q: 1, distribution: 'oneWay', spanAxis: 'x' });
    expect(r.totalKN).toBeCloseTo(60, 6);
    // The ring's sides across the span (x = 4 and x = 6) take half of each 4 m strip beside them,
    // and half of the ring's own 2 m strips: 4 + 2 kN each. 56 m² around the ring and its own 4.
    expect(r.perBeam.get(14)).toBeCloseTo(2 * 4 / 2 + 2 * 2 / 2, 6);
    expect(r.perBeam.get(12)).toBeCloseTo(2 * 4 / 2 + 2 * 2 / 2, 6);
  });
});

describe('zones, suction and inclined floors', () => {
  it('a zone: only its outline less its opening is loaded', () => {
    const m = panelModel([[0, 0], [8, 0], [8, 6], [0, 6]]);
    const zone = { outer: [[0, 0, 3], [4, 0, 3], [4, 6, 3], [0, 6, 3]] as Array<[number, number, number]>, holes: [[[1, 2, 3], [3, 2, 3], [3, 4, 3], [1, 4, 3]] as Array<[number, number, number]>] };
    const r = floorLoad({ ...m, q: 3, distribution: 'twoWay', zone });
    expect(r.loadedArea).toBeCloseTo(24 - 4, 6);
    expect(r.totalKN).toBeCloseTo(3 * 20, 6);
    // The right side (x = 8) is outside the zone: nothing reaches it.
    expect(r.perBeam.get(2) ?? 0).toBeCloseTo(0, 9);
  });

  it('one way, a zone edge along the span is exact; across it the panel is reported', () => {
    const m = panelModel([[0, 0], [8, 0], [8, 6], [0, 6]]);
    const along = { outer: [[0, 0, 3], [8, 0, 3], [8, 2, 3], [0, 2, 3]] as Array<[number, number, number]> };
    const r = floorLoad({ ...m, q: 1, distribution: 'oneWay', spanAxis: 'x', zone: along });
    expect(r.totalKN).toBeCloseTo(16, 6);
    const across = { outer: [[0, 0, 3], [3, 0, 3], [3, 6, 3], [0, 6, 3]] as Array<[number, number, number]> };
    const r2 = floorLoad({ ...m, q: 1, distribution: 'oneWay', spanAxis: 'x', zone: across });
    expect(r2.skipped.zoneAcrossSpan).toBe(1);
    expect(r2.totalKN).toBe(0);
  });

  it('a suction lifts: the same pattern upward', () => {
    const r = floorLoad({ ...panelModel([[0, 0], [6, 0], [6, 4], [0, 4]]), q: -2, distribution: 'twoWay' });
    expect(r.totalKN).toBeCloseTo(-48, 6);
    expect(r.loads.every((l) => l.qZI >= 0 && l.qZJ >= 0)).toBe(true);
  });

  it('an inclined floor: per true area, or per plan area', () => {
    // A 6 × 4 m plan rising 3 m along y: the slope's true length is 5 m.
    const nodes = new Map<number, { x: number; y: number; z: number }>([[1, { x: 0, y: 0, z: 0 }], [2, { x: 6, y: 0, z: 0 }], [3, { x: 6, y: 4, z: 3 }], [4, { x: 0, y: 4, z: 3 }]]);
    const beams: FloorBeam[] = [1, 2, 3, 4].map((i) => ({ id: i, nodeI: i, nodeJ: (i % 4) + 1, type: 'frame', sectionId: 1 }));
    const t = floorLoad({ nodes, beams, q: 1, distribution: 'twoWay' });
    expect(t.loadedArea).toBeCloseTo(30, 6);
    expect(t.totalKN).toBeCloseTo(30, 6);
    expect(t.normal[2]).toBeCloseTo(0.8, 9);
    const p = floorLoad({ nodes, beams, q: 1, distribution: 'twoWay', perPlanArea: true });
    expect(p.totalKN).toBeCloseTo(24, 6);
    // The load is vertical whatever the member: its global Z resultant is the total.
    const l = t.loads.find((x) => x.elementId === 2)!;
    expect(Math.hypot(l.qYI, l.qZI)).toBeCloseTo(Math.abs(l.qI), 9);
  });
});
