// Inclined shell / ramp (PR [10] PART 4 audit): existing MITC4 quad shells
// already represent inclined slabs / ramps / stair flights when their nodes are
// placed in 3D — no new solver work needed. This locks that capability: an
// inclined quad (30° tilt) plus raking edge beams solves with finite results and
// recovers shell stresses. (A pure-shell model is rejected by the pre-solve gate
// which requires ≥1 frame element, so a ramp is modelled with its edge beams.)
import { describe, it, expect } from 'vitest';
import { validateAndSolve3D } from '../solver-service';

describe('inclined shell ramp — existing quad elements in 3D', () => {
  it('a 30°-inclined quad slab with raking edge beams solves with finite shell stresses', () => {
    const a = (30 * Math.PI) / 180;
    const dy = 4 * Math.cos(a), dz = 4 * Math.sin(a);
    const m: any = {
      name: '', nodes: new Map(), materials: new Map([[1, { id: 1, name: 'C', e: 30_000_000, nu: 0.2, rho: 0, fy: 25_000 }]]),
      sections: new Map([[1, { id: 1, name: 'S', a: 0.04, iy: 1.3e-4, iz: 1.3e-4, j: 2e-4, b: 0.2, h: 0.2 }]]),
      elements: new Map(), supports: new Map(), loads: [] as any[], plates: new Map(), quads: new Map(),
      constraints: [] as any[], loadCases: [], combinations: [],
    };
    m.nodes.set(1, { id: 1, x: 0, y: 0, z: 0 });
    m.nodes.set(2, { id: 2, x: 4, y: 0, z: 0 });
    m.nodes.set(3, { id: 3, x: 4, y: dy, z: dz }); // top edge raised → genuinely inclined
    m.nodes.set(4, { id: 4, x: 0, y: dy, z: dz });
    m.quads.set(1, { id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.15 });
    m.elements.set(1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 4, materialId: 1, sectionId: 1, releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false } });
    m.elements.set(2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false } });
    m.supports.set(1, { id: 1, nodeId: 1, type: 'fixed' });
    m.supports.set(2, { id: 2, nodeId: 2, type: 'fixed' });
    m.loads.push({ type: 'surface3d', data: { id: 1, quadId: 1, q: -5, caseId: 1 } }); // gravity area load

    const r = validateAndSolve3D(m, false) as any;
    expect(typeof r).not.toBe('string');
    // The quad is genuinely inclined (top edge out of the XY plane).
    expect(dz).toBeGreaterThan(1);
    // Finite displacements everywhere (no mechanism / NaN on the tilted shell).
    expect(r.displacements.length).toBe(4);
    for (const d of r.displacements) {
      expect(Number.isFinite(d.ux)).toBe(true);
      expect(Number.isFinite(d.uy)).toBe(true);
      expect(Number.isFinite(d.uz)).toBe(true);
    }
    // Shell stress recovery works for the inclined quad.
    const qs = r.quadStresses;
    const n = qs ? (Array.isArray(qs) ? qs.length : (qs.size ?? Object.keys(qs).length)) : 0;
    expect(n).toBeGreaterThan(0);
  });
});
