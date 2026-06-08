/**
 * CP6 — curved shell / curved beam productization.
 *  - arcPolyline: web-side arc→chords (so curved-beam results render via the
 *    existing frame machinery; the Rust preprocessor's ids can't map back).
 *  - serializeInput3D: curved shells reach the WASM payload under `curvedShells`
 *    (the engine field is camelCase) so the solver actually treats them as
 *    degenerated-continuum shells.
 */
import { describe, it, expect } from 'vitest';
import { arcPolyline, type V3 } from '../curved-beam';
import { serializeInput3D } from '../wasm-solver';
import type { SolverInput3D } from '../types-3d';

const r = (p: V3) => Math.hypot(p.x, p.y, p.z);

describe('arcPolyline', () => {
  it('semicircle through (1,0,0)-(0,1,0)-(-1,0,0): unit-radius samples, mid hit', () => {
    const pts = arcPolyline({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, 4);
    expect(pts.length).toBe(5);
    expect(pts[0]).toEqual({ x: 1, y: 0, z: 0 });
    expect(pts[4]).toEqual({ x: -1, y: 0, z: 0 });
    // midpoint of the arc is the top of the circle
    expect(pts[2].x).toBeCloseTo(0, 6);
    expect(pts[2].y).toBeCloseTo(1, 6);
    for (const p of pts) expect(r(p)).toBeCloseTo(1, 6); // all on the unit circle
  });

  it('collinear points fall back to a straight line', () => {
    const pts = arcPolyline({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, 2);
    expect(pts).toEqual([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }]);
  });

  it('segments clamps to ≥ 1 and endpoints are pinned', () => {
    const pts = arcPolyline({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, 0);
    expect(pts.length).toBe(2);
    expect(pts[0]).toEqual({ x: 1, y: 0, z: 0 });
    expect(pts[1]).toEqual({ x: -1, y: 0, z: 0 });
  });
});

describe('serializeInput3D curved shells', () => {
  it('emits a curvedShells map (camelCase) for the WASM payload', () => {
    const input = {
      nodes: new Map(), materials: new Map(), sections: new Map(),
      elements: new Map(), supports: new Map(), loads: [],
      quads: new Map([[1, { id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.2 }]]),
      curvedShells: new Map([[5, { id: 5, nodes: [5, 6, 7, 8], materialId: 1, thickness: 0.25 }]]),
    } as unknown as SolverInput3D;
    const json = JSON.parse(serializeInput3D(input));
    expect(json.curvedShells['5']).toMatchObject({ id: 5, nodes: [5, 6, 7, 8], thickness: 0.25 });
    expect(json.quads['1']).toMatchObject({ id: 1, thickness: 0.2 });
  });
});
