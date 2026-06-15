import { describe, it, expect } from 'vitest';
import { checkModel, memberLoadPerpComponent } from '../model-diagnostics';

// ─────────────────────────────────────────────────────────────────────
// Task 3 (PR [12]): warn when a transverse/perpendicular load is applied to
// an axial-only (truss) member. A pin-pin FRAME beam still transfers shear, so
// it must NOT warn. The warning is educational (severity 'warning'), never blocking.
// ─────────────────────────────────────────────────────────────────────

const node = (id: number, x: number, y: number, z = 0) => [id, { id, x, y, z }] as const;
const sec = [1, { id: 1, name: 'S', a: 0.01, iy: 1e-4, iz: 1e-4 }] as const;
const mat = [1, { id: 1, name: 'M', e: 200e6, nu: 0.3, fy: 355_000, rho: 78.5 }] as const;

function elem(id: number, type: 'frame' | 'truss', nodeI = 1, nodeJ = 2, extra: Record<string, unknown> = {}) {
  return [id, {
    id, type, nodeI, nodeJ, materialId: 1, sectionId: 1,
    releaseI: { my: false, mz: false, t: false },
    releaseJ: { my: false, mz: false, t: false },
    ...extra,
  }] as const;
}

function baseModel(elements: any[], loads: any[]) {
  return {
    nodes: new Map<number, any>([node(1, 0, 0), node(2, 5, 0), node(3, 3, 4)]),
    elements: new Map<number, any>(elements),
    materials: new Map<number, any>([mat as any]),
    sections: new Map<number, any>([sec as any]),
    supports: new Map<number, any>([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads,
    loadCases: [{ id: 1, name: 'LC1', type: 'dead' }],
  } as any;
}

function hasTrussWarning(model: any): boolean {
  return checkModel(model).some(d => d.code === 'MODEL_TRANSVERSE_ON_TRUSS' && d.severity === 'warning');
}

const horizTruss = elem(1, 'truss', 1, 2);   // along +X
const horizFrame = elem(1, 'frame', 1, 2);
const inclTruss = elem(1, 'truss', 1, 3);     // (0,0)→(3,4)
const nodes = new Map<number, any>([node(1, 0, 0), node(2, 5, 0), node(3, 3, 4)]);

describe('memberLoadPerpComponent', () => {
  it('local perpendicular distributed (angle 0) → full magnitude', () => {
    const load = { type: 'distributed', data: { id: 1, elementId: 1, qI: -10, qJ: -10 } };
    expect(memberLoadPerpComponent(load as any, horizTruss[1] as any, nodes)).toBeCloseTo(10, 6);
  });

  it('local axial distributed (angle 90) → ~0 perpendicular', () => {
    const load = { type: 'distributed', data: { id: 1, elementId: 1, qI: -10, qJ: -10, angle: 90 } };
    expect(memberLoadPerpComponent(load as any, horizTruss[1] as any, nodes)).toBeCloseTo(0, 6);
  });

  it('global vertical distributed on a horizontal member → full perpendicular', () => {
    // Global, angle 0 → vertical load; member along X → fully perpendicular.
    const load = { type: 'distributed', data: { id: 1, elementId: 1, qI: -10, qJ: -10, isGlobal: true, angle: 0 } };
    expect(memberLoadPerpComponent(load as any, horizTruss[1] as any, nodes)).toBeCloseTo(10, 6);
  });

  it('global vertical distributed on an inclined member → partial perpendicular', () => {
    // member (0,0)→(3,4): cosθ=0.6, sinθ=0.8. Global vertical q → perp = q·cosθ = 10·0.6
    const load = { type: 'distributed', data: { id: 1, elementId: 1, qI: -10, qJ: -10, isGlobal: true, angle: 0 } };
    expect(memberLoadPerpComponent(load as any, inclTruss[1] as any, nodes)).toBeCloseTo(6, 6);
  });

  it('2D point load: d.p is perpendicular, d.px axial', () => {
    const perp = { type: 'pointOnElement', data: { id: 1, elementId: 1, a: 2.5, p: -8, px: 100 } };
    expect(memberLoadPerpComponent(perp as any, horizTruss[1] as any, nodes)).toBeCloseTo(8, 6);
    const axialOnly = { type: 'pointOnElement', data: { id: 1, elementId: 1, a: 2.5, p: 0, px: 100 } };
    expect(memberLoadPerpComponent(axialOnly as any, horizTruss[1] as any, nodes)).toBeCloseTo(0, 6);
  });

  it('3D distributed3d (local Y/Z) → perpendicular by definition', () => {
    const load = { type: 'distributed3d', data: { id: 1, elementId: 1, qYI: -5, qYJ: -5, qZI: 0, qZJ: 0 } };
    expect(memberLoadPerpComponent(load as any, horizTruss[1] as any, nodes)).toBeCloseTo(5, 6);
  });

  it('3D pointOnElement3d (py/pz) → perpendicular', () => {
    const load = { type: 'pointOnElement3d', data: { id: 1, elementId: 1, a: 2, py: 0, pz: -3 } };
    expect(memberLoadPerpComponent(load as any, horizTruss[1] as any, nodes)).toBeCloseTo(3, 6);
  });
});

describe('checkModel — transverse load on truss', () => {
  it('truss + perpendicular distributed → warning', () => {
    const model = baseModel([horizTruss], [{ type: 'distributed', data: { id: 1, elementId: 1, qI: -10, qJ: -10 } }]);
    expect(hasTrussWarning(model)).toBe(true);
  });

  it('truss + purely axial load → no warning', () => {
    const model = baseModel([horizTruss], [{ type: 'pointOnElement', data: { id: 1, elementId: 1, a: 2.5, p: 0, px: 50 } }]);
    expect(hasTrussWarning(model)).toBe(false);
  });

  it('frame (even pin-pin) + perpendicular load → no warning (solver transfers shear)', () => {
    const pinPin = elem(1, 'frame', 1, 2, { releaseI: { my: false, mz: true, t: false }, releaseJ: { my: false, mz: true, t: false } });
    const model = baseModel([pinPin], [{ type: 'distributed', data: { id: 1, elementId: 1, qI: -10, qJ: -10 } }]);
    expect(hasTrussWarning(model)).toBe(false);
  });

  it('truss + perpendicular point load → warning', () => {
    const model = baseModel([horizTruss], [{ type: 'pointOnElement', data: { id: 1, elementId: 1, a: 2.5, p: -8 } }]);
    expect(hasTrussWarning(model)).toBe(true);
  });

  it('truss + 3D local-Y distributed → warning', () => {
    const model = baseModel([horizTruss], [{ type: 'distributed3d', data: { id: 1, elementId: 1, qYI: -5, qYJ: -5, qZI: 0, qZJ: 0 } }]);
    expect(hasTrussWarning(model)).toBe(true);
  });

  it('warning toggles when member type changes frame→truss for the same load', () => {
    const load = [{ type: 'distributed', data: { id: 1, elementId: 1, qI: -10, qJ: -10 } }];
    expect(hasTrussWarning(baseModel([horizFrame], load))).toBe(false);
    expect(hasTrussWarning(baseModel([horizTruss], load))).toBe(true);
  });
});
