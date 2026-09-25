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
  it('an L-shaped panel is reported, not loaded', () => {
    const r = floorLoad({ ...panelModel([[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]]), q: 5, distribution: 'twoWay' });
    expect(r.panels[0]!.loaded).toBe(false);
    expect(r.skipped.nonConvex).toBe(1);
    expect(r.loads).toHaveLength(0);
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
