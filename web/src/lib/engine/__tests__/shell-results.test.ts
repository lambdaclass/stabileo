/**
 * The shell result rows: faces, criteria and global axes against what does not depend on how the
 * local axes happen to lie.
 */
import { describe, it, expect } from 'vitest';
import { shellCentreRows, shellLocalAxes, shellNodeRows, shellCornerRows, type ShellModel } from '../shell-results';
import { trescaPlane, vonMisesPlane } from '../shell-stress';
import type { AnalysisResults3D } from '../types-3d';

const result = (quads: AnalysisResults3D['quadStresses'], plates: AnalysisResults3D['plateStresses'] = []): AnalysisResults3D =>
  ({ displacements: [], reactions: [], elementForces: [], quadStresses: quads, plateStresses: plates }) as AnalysisResults3D;

/** A wall panel in the XZ plane (two quads) and a slab triangle in XY. */
const model: ShellModel = {
  nodes: new Map([
    [1, { x: 0, y: 0, z: 0 }], [2, { x: 2, y: 0, z: 0 }], [3, { x: 2, y: 0, z: 3 }], [4, { x: 0, y: 0, z: 3 }],
    [5, { x: 4, y: 0, z: 0 }], [6, { x: 4, y: 0, z: 3 }], [7, { x: 0, y: 2, z: 0 }],
  ]),
  quads: new Map([[1, { id: 1, nodes: [1, 2, 3, 4], thickness: 0.2 }], [2, { id: 2, nodes: [2, 5, 6, 3], thickness: 0.2 }], [9, { id: 9, nodes: [1, 2, 3, 4], thickness: 0.2, curved: true }]]),
  plates: new Map([[1, { id: 1, nodes: [1, 2, 7], thickness: 0.25 }]]),
};
const quad = (id: number, s: Partial<NonNullable<AnalysisResults3D['quadStresses']>[number]>) =>
  ({ elementId: id, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 0, my: 0, mxy: 0, vonMises: 0, ...s });

describe('shell result rows', () => {
  it('Tresca and Von Mises of the plane states everyone knows', () => {
    expect(trescaPlane(100, 0, 0)).toBeCloseTo(100, 12);
    expect(trescaPlane(0, 0, 50)).toBeCloseTo(100, 12);          // pure shear: 2τ
    expect(trescaPlane(100, 60, 0)).toBeCloseTo(100, 12);         // σ3 = 0 governs
    expect(vonMisesPlane(0, 0, 50)).toBeCloseTo(50 * Math.sqrt(3), 12);
  });

  it('a face is the membrane plus and minus 6M/t², top along the local z', () => {
    const [r] = shellCentreRows(result([quad(1, { sigmaXx: 100, mx: 2 })]), model);
    expect(r!.top!.sxx).toBeCloseTo(100 + (6 * 2) / 0.04, 9);
    expect(r!.bottom!.sxx).toBeCloseTo(100 - (6 * 2) / 0.04, 9);
    expect(r!.membrane.vonMises).toBeCloseTo(100, 9);
  });

  it('turns a wall\'s stresses to global axes, keeping the invariants and nothing out of its plane', () => {
    const s = { sigmaXx: 120, sigmaYy: -340, tauXy: 45, mx: 3, my: -7, mxy: 1.5, qx: 12, qy: -4 };
    const [r] = shellCentreRows(result([quad(1, s)]), model);
    const g = r!.global!;
    // The wall is in XZ: nothing in Y.
    for (const c of [g.stress.yy, g.stress.xy, g.stress.yz, g.moment.yy, g.moment.xy, g.moment.yz, g.shear![1]]) expect(Math.abs(c)).toBeLessThan(1e-9);
    expect(g.stress.xx + g.stress.zz).toBeCloseTo(s.sigmaXx + s.sigmaYy, 9);
    expect(vonMisesPlane(g.stress.xx, g.stress.zz, g.stress.zx)).toBeCloseTo(r!.membrane.vonMises, 9);
    expect(Math.hypot(...g.shear!)).toBeCloseTo(Math.hypot(s.qx, s.qy), 9);
  });

  it('uses the engine\'s axes: x along the first edge, z normal', () => {
    const a = shellLocalAxes('quad', [...[1, 2, 3, 4].map((n) => model.nodes.get(n)!)])!;
    expect(a.ex).toEqual([1, 0, 0]);
    expect(Math.abs(a.ez[1])).toBeCloseTo(1, 12);
    const p = shellLocalAxes('plate', [1, 2, 7].map((n) => model.nodes.get(n)!))!;
    expect(p.ez[2]).toBeCloseTo(1, 12);
  });

  it('leaves a curved quad without global values rather than guessing its frame', () => {
    const [r] = shellCentreRows(result([quad(9, { sigmaXx: 10 })]), model);
    expect(r!.global).toBeUndefined();
    expect(r!.top).toBeUndefined();
    expect(r!.bottom).toBeUndefined();
    expect(r!.mx).toBeUndefined();
    expect(r!.membrane.vonMises).toBe(10);
  });

  it('averages at a node in global components, over the elements around it', () => {
    const rows = shellCentreRows(result([quad(1, { sigmaXx: 100 }), quad(2, { sigmaXx: 300 })]), model);
    const nodes = shellNodeRows(rows, model);
    const shared = nodes.find((n) => n.node === 2)!;
    expect(shared.elements).toBe(2);
    expect(shared.stress.xx).toBeCloseTo(200, 9);
    expect(nodes.find((n) => n.node === 1)!.stress.xx).toBeCloseTo(100, 9);
  });

  it('lists the engine\'s corner Von Mises against the corner\'s node', () => {
    const corners = shellCornerRows(result([quad(1, { nodalVonMises: [1, 2, 3, 4] })]), model);
    expect(corners.map((c) => [c.node, c.vonMises])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
  });
});
