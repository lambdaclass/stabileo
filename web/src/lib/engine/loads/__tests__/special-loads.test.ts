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
    expect(out.soil.every((n) => m.nodes.get(n.nodeId)!.z! < 3)).toBe(true);
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
