import { describe, it, expect } from 'vitest';
import { specialLoads, type SpecialModel } from '../special-loads';
import { generateCombinations } from '../../../codes/cirsoc101/combinations';

/** A 6 × 4 m box, 3 m deep: four vertical quads and a bottom quad. */
function box(): SpecialModel {
  const pts: Array<[number, number, number]> = [[0, 0, 0], [6, 0, 0], [6, 4, 0], [0, 4, 0], [0, 0, 3], [6, 0, 3], [6, 4, 3], [0, 4, 3]];
  const nodes = new Map(pts.map(([x, y, z], i) => [i + 1, { id: i + 1, x, y, z }]));
  const quads = new Map([
    [1, { id: 1, nodes: [1, 2, 6, 5] }], [2, { id: 2, nodes: [2, 3, 7, 6] }],
    [3, { id: 3, nodes: [3, 4, 8, 7] }], [4, { id: 4, nodes: [4, 1, 5, 8] }],
    [5, { id: 5, nodes: [1, 2, 3, 4] }],
  ]);
  return { nodes, elements: new Map([[1, { id: 1 }], [2, { id: 2, type: 'truss' as const }]]), quads };
}

describe('T, H and F', () => {
  it('soil: K γ H²/2 per metre of wall, pushing inward, nothing above grade', () => {
    const m = box();
    const out = specialLoads(m, { soil: { gradeZ: 3, gamma: 18, k: 0.5, surcharge: 0 } });
    // The wall at y = 0 (nodes 1, 2 at its foot): pushed toward +Y, 0,5·18·9/2 kN/m over 6 m.
    const wall = out.soil.filter((n) => n.nodeId === 1 || n.nodeId === 2);
    const fy = out.soil.filter((n) => m.nodes.get(n.nodeId)!.y === 0 && Math.abs(n.fy) > 1e-9 && Math.abs(n.fx) < 1e-9).reduce((s, n) => s + n.fy, 0);
    expect(wall.length).toBeGreaterThan(0);
    expect(fy).toBeCloseTo(0.5 * 18 * 9 / 2 * 6, 6);
    // Consistent nodal forces: the triangle's resultant at H/3 above the base.
    const wall1 = out.soil.filter((n) => m.nodes.get(n.nodeId)!.y === 0 && Math.abs(n.fx) < 1e-9);
    expect(wall1.reduce((t, n) => t + n.fy * m.nodes.get(n.nodeId)!.z!, 0) / fy).toBeCloseTo(1, 9);
  });

  it('fluid: outward on the walls, γ·depth on the bottom', () => {
    const out = specialLoads(box(), { fluid: { levelZ: 2, gamma: 10 } });
    const m = box();
    const fy0 = out.fluid.filter((n) => m.nodes.get(n.nodeId)!.y === 0 && Math.abs(n.fx) < 1e-9).reduce((s, n) => s + n.fy, 0);
    expect(fy0).toBeLessThan(0);   // the wall at y = 0 is pushed toward −Y, away from the fluid
    expect(out.fluidBottom).toEqual([{ quadId: 5, q: 20 }]);
  });

  it('temperature on every member and shell, no gradient on a truss', () => {
    const out = specialLoads(box(), { thermal: { dtUniform: 20, dtGradient: 10 } });
    expect(out.thermal.filter((x) => x.elementId !== undefined)).toEqual([
      { elementId: 1, dtUniform: 20, dtGradient: 10 }, { elementId: 2, dtUniform: 20, dtGradient: 0 },
    ]);
    expect(out.thermal.filter((x) => x.quadId !== undefined)).toHaveLength(5);
  });

  it('§2.3.4: T enters the two combinations of the commentary, never at less than 1,0', () => {
    const specs = generateCombinations({ present: { L: true, Lr: false, S: false, R: false, W: false, E: false, F: false, H: false, T: true } });
    const t = specs.filter((s) => s.terms.some((x) => x.symbol === 'T'));
    expect(t.map((s) => s.label)).toEqual(['1.2 D + 1.2 T + 0.5 L', '1.2 D + 1.6 L + 1.0 T']);
    expect(t.every((s) => s.terms.find((x) => x.symbol === 'T')!.factor >= 1)).toBe(true);
  });
});

/** One vertical wall quad in the plane y = 0, x 0..6, z 0..H, its nodes in either order. */
function wall(H: number, reversed: boolean): SpecialModel {
  const pts: Array<[number, number, number]> = [[0, 0, 0], [6, 0, 0], [6, 0, H], [0, 0, H]];
  const nodes = new Map(pts.map(([x, y, z], i) => [i + 1, { id: i + 1, x, y, z }]));
  return { nodes, elements: new Map(), quads: new Map([[1, { id: 1, nodes: reversed ? [1, 4, 3, 2] : [1, 2, 3, 4] }]]) };
}
const sumFy = (l: Array<{ fy: number }>) => l.reduce((t, n) => t + n.fy, 0);

describe('soil and fluid: which walls, from which side, and the consistent nodal forces', () => {
  it('a lone retaining wall says no side: none without a point, and the point decides it, not the node order', () => {
    const soil = { gradeZ: 3, gamma: 18, k: 0.5, surcharge: 0 };
    const none = specialLoads(wall(3, false), { soil });
    expect(none.soil).toHaveLength(0);
    expect(none.notes.map((n) => n.key)).toContain('loadPlan.note.soilSideUnknown');
    // The soil at +Y pushes the wall toward −Y, whichever way its nodes go round.
    for (const reversed of [false, true]) {
      const out = specialLoads(wall(3, reversed), { soil: { ...soil, side: { x: 3, y: 2 } } });
      expect(sumFy(out.soil)).toBeCloseTo(-0.5 * 18 * 9 / 2 * 6, 6);
    }
  });

  it('one quad high, hydrostatic: ½γH² and its moment γH³/6 about the base, per metre', () => {
    const H = 3, gamma = 10, m = wall(H, false);
    const out = specialLoads(m, { fluid: { levelZ: H, gamma, inside: { x: 3, y: -1 } } });
    expect(sumFy(out.fluid)).toBeCloseTo(0.5 * gamma * H * H * 6, 6);   // toward +Y, away from the fluid
    const moment = out.fluid.reduce((t, n) => t + n.fy * m.nodes.get(n.nodeId)!.z!, 0);
    expect(moment).toBeCloseTo((gamma * H ** 3) / 6 * 6, 6);
  });

  it('a quad cut by the level takes the submerged part only: ½γd², at d/3 above the base', () => {
    const m = wall(3, false);
    const out = specialLoads(m, { fluid: { levelZ: 2, gamma: 10, inside: { x: 3, y: -1 } } });
    const total = sumFy(out.fluid);
    expect(total).toBeCloseTo(0.5 * 10 * 2 * 2 * 6, 6);   // 120 kN, not p(bottom)·A/2 = 180
    expect(out.fluid.reduce((t, n) => t + n.fy * m.nodes.get(n.nodeId)!.z!, 0) / total).toBeCloseTo(2 / 3, 6);
  });

  it('a surcharge acts from the grade down: K q H plus K γ H²/2, and nothing on a quad above the grade', () => {
    const above = specialLoads(wall(3, false), { soil: { gradeZ: 0, gamma: 18, k: 0.5, surcharge: 10, side: { x: 3, y: 2 } } });
    expect(above.soil).toHaveLength(0);
    const out = specialLoads(wall(3, false), { soil: { gradeZ: 3, gamma: 18, k: 0.5, surcharge: 10, side: { x: 3, y: 2 } } });
    expect(sumFy(out.soil)).toBeCloseTo(-(0.5 * 10 * 3 + 0.5 * 18 * 9 / 2) * 6, 6);
  });

  it('a basement: the soil on the outer walls only, never on an interior one', () => {
    const m = box();
    // A partition across the box at x = 3.
    for (const [id, x, y, z] of [[9, 3, 0, 0], [10, 3, 4, 0], [11, 3, 4, 3], [12, 3, 0, 3]] as const) m.nodes.set(id, { id, x, y, z });
    m.quads!.set(6, { id: 6, nodes: [9, 10, 11, 12] });
    const out = specialLoads(m, { soil: { gradeZ: 3, gamma: 18, k: 0.5, surcharge: 0 } });
    expect(out.soil.some((n) => n.nodeId >= 9)).toBe(false);
    // Each outer wall pushed inward: the four resultants cancel.
    expect(out.soil.reduce((t, n) => t + n.fx, 0)).toBeCloseTo(0, 6);
    expect(sumFy(out.soil)).toBeCloseTo(0, 6);
    expect(out.soil.filter((n) => m.nodes.get(n.nodeId)!.x === 0 && Math.abs(n.fy) < 1e-9).reduce((t, n) => t + n.fx, 0)).toBeGreaterThan(0);
  });

  it('a tank: the bottom inside takes the fluid, a slab outside it does not', () => {
    const m = box();
    for (const [id, x, y] of [[9, 6, 0], [10, 10, 0], [11, 10, 4], [12, 6, 4]] as const) m.nodes.set(id, { id, x, y, z: 0 });
    m.quads!.set(6, { id: 6, nodes: [9, 10, 11, 12] });   // a slab beside the tank, at its bottom
    expect(specialLoads(m, { fluid: { levelZ: 2, gamma: 10 } }).fluidBottom).toEqual([{ quadId: 5, q: 20 }]);
    // From a point inside, the same.
    expect(specialLoads(m, { fluid: { levelZ: 2, gamma: 10, inside: { x: 3, y: 2 } } }).fluidBottom).toEqual([{ quadId: 5, q: 20 }]);
  });
});

describe('T, H and F: an emptied field is not a zero', () => {
  // An emptied number input reaches the plan as null (Svelte 5's bind:value), or NaN.
  const blank = null as unknown as number;

  it('temperature: an emptied ΔT and gradient generate nothing, not {dtUniform: null} on every member', () => {
    const out = specialLoads(box(), { thermal: { dtUniform: blank, dtGradient: blank } });
    expect(out.thermal).toEqual([]);
    // One of the two emptied: the other alone, the empty one as 0.
    const one = specialLoads(box(), { thermal: { dtUniform: 20, dtGradient: blank } });
    expect(one.thermal.find((x) => x.elementId === 1)).toEqual({ elementId: 1, dtUniform: 20, dtGradient: 0 });
    expect(one.thermal.every((x) => Number.isFinite(x.dtUniform) && Number.isFinite(x.dtGradient))).toBe(true);
  });

  it('soil: an emptied grade level, γ or K is refused with a note, not read as 0', () => {
    for (const bad of [{ gradeZ: blank }, { gamma: Number.NaN }, { k: blank }]) {
      const out = specialLoads(box(), { soil: { gradeZ: 3, gamma: 18, k: 0.5, surcharge: 0, ...bad } });
      expect(out.soil).toEqual([]);
      expect(out.notes.map((n) => n.key)).toContain('loadPlan.note.specialEmpty');
    }
    // An emptied surcharge is no surcharge.
    const s = specialLoads(box(), { soil: { gradeZ: 3, gamma: 18, k: 0.5, surcharge: blank } });
    const ref = specialLoads(box(), { soil: { gradeZ: 3, gamma: 18, k: 0.5, surcharge: 0 } });
    expect(s.soil).toEqual(ref.soil);
  });

  it('fluid: an emptied level or γ is refused with a note; an emptied point is no point, and says so', () => {
    for (const bad of [{ levelZ: blank }, { gamma: blank }]) {
      const out = specialLoads(box(), { fluid: { levelZ: 2, gamma: 10, ...bad } });
      expect(out.fluid).toEqual([]);
      expect(out.fluidBottom).toEqual([]);
      expect(out.notes.map((n) => n.key)).toContain('loadPlan.note.specialEmpty');
    }
    const out = specialLoads(box(), { fluid: { levelZ: 2, gamma: 10, inside: { x: blank, y: 2 } } });
    const ref = specialLoads(box(), { fluid: { levelZ: 2, gamma: 10 } });
    expect(out.fluid).toEqual(ref.fluid);
    expect(out.notes.map((n) => n.key)).toContain('loadPlan.note.specialPointEmpty');
  });
});

describe('fluid without a point inside', () => {
  it('says every closed region below the level was taken as holding the fluid', () => {
    const out = specialLoads(box(), { fluid: { levelZ: 2, gamma: 10 } });
    expect(out.fluid.length).toBeGreaterThan(0);
    expect(out.notes.map((n) => n.key)).toContain('loadPlan.note.fluidRegionsAssumed');
    // With the point, nothing was assumed.
    const given = specialLoads(box(), { fluid: { levelZ: 2, gamma: 10, inside: { x: 3, y: 2 } } });
    expect(given.notes.map((n) => n.key)).not.toContain('loadPlan.note.fluidRegionsAssumed');
  });
});
