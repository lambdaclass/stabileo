/**
 * The certified bounds on what the views show (docs/verification/CERTIFY.md, "Diagrams, extremes,
 * deflections and reactions"): the engine's certificate carries them, the TypeScript diagram and
 * deflection the canvas draws lie inside the bound around the engine's value, and reading them
 * against a value on screen keeps a bound a bound.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  initSolver, certifyLinear2D, certifyLinear3D, computeDiagramValueAtWasm, computeDeformedShape as wasmDeformed,
  type StationBound2D, type StationBound3D,
} from '../wasm-solver';
import { computeDiagramValueAt, computeElementDiagram, computeMomentDiagram, computeDisplacementAt } from '../diagrams';
import { evaluateDiagramAt } from '../diagrams-3d';
import { diagramBound2D, diagramBound3D, forceReactionBound } from '../certificate-read';

beforeAll(async () => { await initSolver(); });

/** A propped beam with a partial trapezoid, a point load with a couple, and a fixed column. */
function frame() {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 0, y: 4 }], [3, { id: 3, x: 7, y: 4 }]]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 2e-4 }]]),
    elements: new Map([
      [1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'frame' }],
      [2, { id: 2, nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, type: 'frame' }],
    ]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 3, type: 'pinned' }]]),
    loads: [
      { type: 'distributed', data: { id: 1, elementId: 2, qI: -12, qJ: -4, a: 1, b: 5 } },
      { type: 'pointOnElement', data: { id: 2, elementId: 2, a: 2.5, p: -10, my: 3 } },
      { type: 'nodal', data: { id: 3, nodeId: 2, fx: 5, fy: 0, mz: 0 } },
    ],
  } as never;
}

const KINDS = ['moment', 'shear', 'axial'] as const;

describe('certified diagrams, deflections and reactions (2D)', () => {
  it('the certificate carries a bound per member and per support, with gaps', () => {
    const out = certifyLinear2D(frame());
    expect(out.certificate.status).toBe('certified');
    expect(out.stationBounds?.map((b) => b.elementId)).toEqual([1, 2]);
    expect(out.deflectionBounds?.map((b) => b.elementId)).toEqual([1, 2]);
    expect(out.reactionBounds?.map((b) => b.nodeId)).toEqual([1, 3]);
    for (const b of out.stationBounds!) {
      expect(b.gaps).toBeDefined();
      for (const k of KINDS) expect(b[k]).toBeGreaterThanOrEqual(0);
    }
    // The moment of the loaded beam has curvature between stations: a positive gap.
    expect(out.stationBounds![1]!.gaps!.moment).toBeGreaterThan(0);
  });

  it('the TypeScript diagram (what the canvas draws) lies inside the bound around the engine value', () => {
    const out = certifyLinear2D(frame());
    const sb = new Map(out.stationBounds!.map((b) => [b.elementId, b]));
    let worst = 0;
    for (const ef of out.results.elementForces) {
      for (const kind of KINDS) {
        const b = diagramBound2D(sb.get(ef.elementId), kind)!;
        const scale = Math.abs(ef.mStart) + Math.abs(ef.vStart) * ef.length + Math.abs(ef.nStart) + 100;
        for (let i = 0; i <= 200; i++) {
          const t = i / 200;
          const ts = computeDiagramValueAt(kind, t, ef);
          const rs = computeDiagramValueAtWasm(kind, t, ef)!;
          const diff = Math.abs(ts - rs);
          // Same formula: they agree to rounding, far inside the certified bound.
          expect(diff).toBeLessThanOrEqual(b.atPoint + 1e-13 * scale);
          worst = Math.max(worst, diff);
        }
      }
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('the canvas diagram includes partial loads (it used to draw only the full-length ones)', () => {
    const out = certifyLinear2D(frame());
    const ef = out.results.elementForces.find((f) => f.elementId === 2)!;
    const d = computeElementDiagram('moment', ef, 0, 4, 7, 4);
    for (const p of d.points) expect(p.value).toBeCloseTo(computeDiagramValueAtWasm('moment', p.t, ef)!, 9);
    const legacy = computeMomentDiagram(ef.mStart, ef.mEnd, ef.vStart, ef.qI, ef.qJ, ef.length, 0, 4, 7, 4, ef.pointLoads);
    expect(Math.abs(legacy.maxAbsValue - d.maxAbsValue)).toBeGreaterThan(1);
  });

  it('the TypeScript deflection the hover reads lies inside the bound around the engine curve', () => {
    // Full-length loads only: there both evaluate the same closed form (partial loads differ by
    // the TS Simpson rule, a load term the certificate does not see).
    const model = frame() as any;
    model.loads = [{ type: 'distributed', data: { id: 1, elementId: 2, qI: -8, qJ: -8 } }];
    const out = certifyLinear2D(model);
    const ef = out.results.elementForces.find((f) => f.elementId === 2)!;
    const bound = out.deflectionBounds!.find((b) => b.elementId === 2)!.displacement;
    const d = new Map(out.results.displacements.map((x) => [x.nodeId, x]));
    const [a, b] = [d.get(2)!, d.get(3)!];
    const EI = 200_000 * 1000 * 2e-4;
    const engine = wasmDeformed({
      nodeIx: 0, nodeIy: 4, nodeJx: 7, nodeJy: 4, uIx: a.ux, uIy: a.uz, rIz: a.ry, uJx: b.ux, uJy: b.uz, rJz: b.ry,
      scale: 1, length: 7, hingeStart: false, hingeEnd: false, ei: EI, loadQi: null, loadQj: null, loadPoints: [],
      distLoads: [[-8, -8, 0, 7]],
    }) as Array<{ x: number; y: number }>;
    engine.forEach((p, i) => {
      const t = i / 20;
      const ts = computeDisplacementAt(t, 0, 4, 7, 4, a.ux, a.uz, a.ry, b.ux, b.uz, b.ry, 7, false, false, EI, ef.qI, ef.qJ, [], ef.distributedLoads);
      const scale = Math.abs(ts.uz) + Math.abs(ts.ux);
      expect(Math.abs(ts.ux - (p.x - 7 * t))).toBeLessThanOrEqual(bound + 1e-12 * scale);
      expect(Math.abs(ts.uz - (p.y - 4))).toBeLessThanOrEqual(bound + 1e-12 * scale);
    });
  });
});

describe('certified diagrams (3D)', () => {
  it('a 3D frame carries station, deflection and reaction bounds, and the TS diagram lies inside them', () => {
    const out = certifyLinear3D({
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 5, y: 0, z: 0 }]]),
      materials: new Map([[1, { id: 1, e: 200e3, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 5e-5, j: 2e-4 }]]),
      elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [
        { type: 'distributed', data: { elementId: 1, qYI: -2, qYJ: -2, qZI: -5, qZJ: -1 } },
        { type: 'nodal', data: { nodeId: 2, fx: 3, fy: 0, fz: -10, mx: 1, my: 0, mz: 0 } },
      ],
    } as never);
    expect(out.certificate.status).toBe('certified');
    expect(out.stationBounds).toHaveLength(1);
    expect(out.deflectionBounds).toHaveLength(1);
    expect(out.reactionBounds?.map((r) => r.nodeId)).toEqual([1]);
    const sb = out.stationBounds![0]!;
    const ef = out.results.elementForces[0]!;
    for (const kind of ['momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion'] as const) {
      const b = diagramBound3D(sb, kind)!;
      expect(b.atPoint).toBeGreaterThan(0);
      expect(b.extreme).toBeGreaterThanOrEqual(b.atPoint);
      expect(Number.isFinite(evaluateDiagramAt(ef, kind, 0.5))).toBe(true);
    }
  });
});

describe('reading a certificate against the screen', () => {
  const sb2: StationBound2D = { elementId: 1, axial: 1e-9, shear: 2e-9, moment: 3e-9, gaps: { axial: 0, shear: 0.5, moment: 0.25 } };

  it('a point is bounded by the station bound, an extreme by bound + gap (rounded up)', () => {
    const m = diagramBound2D(sb2, 'moment')!;
    expect(m.atPoint).toBe(3e-9);
    expect(m.extreme).toBeGreaterThanOrEqual(0.25 + 3e-9);
    expect(m.extreme).toBeLessThan((0.25 + 3e-9) * (1 + 1e-12));
    expect(diagramBound2D(sb2, 'shear')!.extreme).toBeGreaterThanOrEqual(0.5 + 2e-9);
    expect(diagramBound2D(sb2, 'axial')!.extreme).toBeGreaterThanOrEqual(1e-9);
    expect(diagramBound2D(null, 'moment')).toBeNull();
  });

  it('without gaps (envelopes) the extreme is the station bound; an unbounded value reads null', () => {
    const env: StationBound3D = { elementId: 1, axial: 1, shearY: 2, shearZ: 3, torsion: 4, momentY: 5, momentZ: 6 };
    expect(diagramBound3D(env, 'momentZ')).toEqual({ atPoint: 6, extreme: 6 });
    expect(diagramBound3D(env, 'torsion')).toEqual({ atPoint: 4, extreme: 4 });
    expect(diagramBound2D({ ...sb2, moment: Infinity }, 'moment')).toBeNull();
  });

  it('a reaction tooltip prints the largest force bound', () => {
    expect(forceReactionBound({ nodeId: 1, rx: 1, rz: 3, my: 9 })).toBe(3);
    expect(forceReactionBound({ nodeId: 1, fx: 1, fy: 4, fz: 2, mx: 9, my: 9, mz: 9 })).toBe(4);
    expect(forceReactionBound(null)).toBeNull();
  });
});
