/**
 * A floor as a building's exchange file carries it, read as a model of calculation.
 *
 * Two columns 40 × 30 at x = 0 and x = 6 (y = 0), from the base (0,00) to under a 35 cm slab
 * (+3,15); a beam 30 × 35 between them whose axis runs 0,10 m off the columns' (y = 0,10), its
 * axis at half its depth (+3,325), in two pieces cut at a crossing beam at x = 3; the slab in two
 * panels that stop at the beam's face, typed as a waffle; a drop round each column.
 */
import { describe, it, expect } from 'vitest';
import { analyticalFromIfc, ribbedFromType, ribbedVolume } from '../ifc-analytical';
import type { IfcMember, IfcSurface } from '../ifc-mapper';

const levels = [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3.5 }];
const col = (id: number, x: number): IfcMember => ({ id, type: 'column', name: `C${id}`, start: { x, y: 0, z: 0 }, end: { x, y: 0, z: 3.15 }, profileName: '40×30', profileDims: { shape: 'rect', b: 0.4, h: 0.3 } });
const beam = (id: number, x0: number, x1: number, y0 = 0.1, y1 = 0.1): IfcMember => ({ id, type: 'beam', name: `V${id}`, start: { x: x0, y: y0, z: 3.325 }, end: { x: x1, y: y1, z: 3.325 }, profileName: '30×35', profileDims: { shape: 'rect', b: 0.3, h: 0.35 } });
const slab = (id: number, pts: Array<[number, number]>, objectType: string, t = 0.35): IfcSurface => ({ id, type: 'slab', name: `L${id}`, outline: pts.map(([x, y]) => ({ x, y, z: 3.5 - t / 2 })), thickness: t, storey: 'P1', objectType });
const WAFFLE = 'Reticular 30+5, nervio 12, intereje 82';

describe('a building file read as a model of calculation', () => {
  const members = [col(1, 0), col(2, 6), beam(3, 0.2, 3), beam(4, 3, 5.8), beam(5, 3, 3, -3, 3)];
  // The crossing beam runs along y at x = 3, through the line.
  members[4] = { ...members[4]!, start: { x: 3, y: -3, z: 3.325 }, end: { x: 3, y: 3, z: 3.325 } };
  const surfaces = [
    slab(10, [[0, 0.25], [6, 0.25], [6, 4], [0, 4]], WAFFLE),
    slab(11, [[0, -4], [6, -4], [6, -0.05], [0, -0.05]], WAFFLE),
    slab(12, [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]], 'Ábaco de 35 cm'),
  ];
  const a = analyticalFromIfc(members, surfaces, levels);

  it('runs a column from the level under its foot to the level over its head', () => {
    const c = a.members.find((m) => m.name === 'C1')!;
    expect([c.start.z, c.end.z]).toEqual([0, 3.5]);
  });

  it('lays a beam on its level, cut at the columns and the crossing, its nodes on the columns\' axes', () => {
    const line = a.members.filter((m) => m.type === 'beam' && Math.abs(m.start.y - m.end.y) < 0.2 && m.name !== 'V5');
    const xs = line.flatMap((m) => [m.start.x, m.end.x]).map((x) => +x.toFixed(3)).sort((p, q) => p - q);
    expect([...new Set(xs)]).toEqual([0, 3, 6]);
    for (const m of line) expect([m.start.z, m.end.z]).toEqual([3.5, 3.5]);
    // On a column the node is on its axis and the insertion is the eccentricity, the top flush.
    const first = line.find((m) => Math.abs(Math.min(m.start.x, m.end.x)) < 1e-9)!;
    const atCol = Math.abs(first.start.x) < 1e-9 ? first.offset!.i : first.offset!.j;
    expect(atCol.x).toBeCloseTo(0, 9); expect(atCol.y).toBeCloseTo(0.1, 9); expect(atCol.z).toBeCloseTo(-0.175, 9);
    expect(Math.abs(first.start.y)).toBeLessThan(1e-9);
  });

  it('makes the floor one region reaching the beam\'s axis, a waffle with its drop', () => {
    expect(a.floors).toHaveLength(1);
    const f = a.floors[0]!;
    expect(f.ribbed).toEqual({ h: 0.35, c: 0.05, spacingX: 0.82, spacingY: 0.82, ribBottom: 0.12, filler: 'permanent' });
    expect(f.thickness).toBeCloseTo(ribbedVolume(f.ribbed!), 9);
    expect(f.zones).toHaveLength(1);
    // The two panels and the beam's foot between them, one outline, no gap along the beam.
    const ys = f.outer.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(-4, 6); expect(Math.max(...ys)).toBeCloseTo(4, 6);
    expect(f.holes).toEqual([]);
  });
});

describe('a waffle\'s system from its type', () => {
  it('reads depth and topping, rib width and spacing, in cm', () => {
    expect(ribbedFromType('Reticular 30+5, nervio 12, intereje 82')).toMatchObject({ h: 0.35, c: 0.05, ribBottom: 0.12, spacingX: 0.82 });
    expect(ribbedFromType('Waffle 25+5, rib 15, spacing 80')).toMatchObject({ h: 0.3, ribBottom: 0.15, spacingX: 0.8 });
    expect(ribbedFromType('Losa maciza 20')).toBeNull();
  });

  it('weighs a waffle by its topping and its ribs both ways, the crossings once', () => {
    // 0,05 + 2·0,12·0,30/0,82 − 0,12²·0,30/0,82² = 0,13138
    expect(ribbedVolume({ h: 0.35, c: 0.05, spacingX: 0.82, spacingY: 0.82, ribBottom: 0.12, filler: 'permanent' })).toBeCloseTo(0.13138, 5);
  });
});
