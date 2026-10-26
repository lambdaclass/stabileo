/**
 * Slab deflections, by hand. A 4 × 4 m panel of four 2 m quads whose centre node sinks 10 mm and
 * whose corners stay put: the centre is 10 mm under the corners' plane and 10 mm under the chord
 * between two opposite edge midpoints; between the quarter points (1, 1) and (3, 3), 5 mm down each
 * by the quads' interpolation, it is 5 mm under the chord, L/566.
 */
import { describe, it, expect } from 'vitest';
import { deflectionBetween, panelDeflection, uzAt, type DeflectionModel } from '../slab-deflection';

const grid = [0, 2, 4];
const nodes = new Map<number, { x: number; y: number }>();
let id = 0;
for (const y of grid) for (const x of grid) nodes.set(++id, { x, y });
const at = (x: number, y: number) => [...nodes].find(([, p]) => p.x === x && p.y === y)![0];
const shells = [[0, 0], [2, 0], [0, 2], [2, 2]].map(([x, y]) => ({ nodes: [at(x!, y!), at(x! + 2, y!), at(x! + 2, y! + 2), at(x!, y! + 2)] }));
const uz = new Map([...nodes.keys()].map((n) => [n, 0]));
uz.set(at(2, 2), -0.010);
const m: DeflectionModel = { nodes, shells, uz };

describe('slab deflections', () => {
  it('reads a point inside its shell', () => {
    expect(uzAt(m, { x: 2, y: 2 })).toBeCloseTo(-0.010, 12);
    expect(uzAt(m, { x: 1, y: 1 })).toBeCloseTo(-0.005, 12);
    expect(uzAt(m, { x: 9, y: 9 })).toBeNull();
  });

  it('between two points: against the chord', () => {
    const r = deflectionBetween(m, { x: 0, y: 2 }, { x: 4, y: 2 })!;
    expect(r.deflection).toBeCloseTo(0.010, 12);
    const s = deflectionBetween(m, { x: 1, y: 1 }, { x: 3, y: 3 })!;
    expect(s.deflection).toBeCloseTo(0.005, 12);
    expect(s.ratio).toBeCloseTo(Math.hypot(2, 2) / 0.005, 6);
  });

  it('a panel: its centre against its corners, cracked and long term', () => {
    const r = panelDeflection({
      m, nodeIds: [...nodes.keys()], box: { x0: 0, x1: 4, y0: 0, y1: 4 },
      thickness: 0.12, cover: 0.02, fc: 25, Ec: 23500, serviceMoment: 1, steelThere: 2.5e-4,
    });
    expect(r.immediate).toBeCloseTo(0.010, 12);
    expect(r.nodeId).toBe(at(2, 2));
    // 1 kN·m/m is under ⅔ of Mcr = 0,62·5·1000·(0,12²/6) = 7,44 kN·m/m: uncracked, Ig/Ie = 1.
    expect(r.crackFactor).toBeCloseTo(1, 12);
    expect(r.lambda).toBe(2);
    expect(r.total).toBeCloseTo(0.030, 12);
    expect(r.limit).toBeCloseTo(4 / 240, 12);
  });
});
