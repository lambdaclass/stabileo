import { declaredTestDemands } from './helpers/declared-demands';
import { afterEach, expect, it } from 'vitest';
import main from './fixtures/issue-2142-main.json';
import { checkTorsion, prepareElementVerification, verifyElement } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { checkTorsion2025 } from '../../codes/cirsoc201/torsion';
import { verifyProvidedReinforcement } from '../station-design-forces';
import { solve, solve3D, solvePDelta, solvePDelta3D } from '../wasm-solver';
import { autoVerifyFromResults } from '../auto-verify';
import { computeStationDemands, setCompactStationTransfer, runUnifiedVerification, runCirsocDesign } from '../verification-service';
import type { SolverInput } from '../types';
import type { SolverInput3D } from '../types-3d';

const p = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const clause = 'CIRSOC 201-2025 §22.7.7.1(a), C22.7.7.1, docs/codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-22-resistencia-de-las-secciones-de-los-elementos.md#c22.7.7.1';
const depth = (h: number, diameter = p.stirrupDia) => h - p.cover - diameter / 1000 - 16 / 2000;
const fixed = { shear: { spacing: 0.05, legs: 4 }, torsion: { AlProv: 100 } };
const demand = (primary: number, secondary: number, torque: number, axis: 'My' | 'Mz' = 'My') => declaredTestDemands([
  { comboId: 1, comboName: 'concurrent', forces: { t: 0, x: 0, n: 0,
    my: axis === 'My' ? 20 : 0, mz: axis === 'Mz' ? 20 : 0,
    vy: axis === 'My' ? secondary : primary, vz: axis === 'My' ? primary : secondary, torsion: torque } },
])[0]!.section(axis);

function reference(primary: number, secondary: number, torque: number, b = p.b, h = p.h, diameter = p.stirrupDia) {
  const x = b - 2 * p.cover - diameter / 1000;
  const y = h - 2 * p.cover - diameter / 1000;
  const Aoh = x * y, ph = 2 * (x + y);
  const limit = 0.75 * (0.17 * Math.sqrt(p.fc) + 0.66 * Math.sqrt(p.fc)) * 1000;
  const v = Math.max(Math.abs(primary) / (b * depth(h, diameter)), Math.abs(secondary) / (h * depth(b, diameter)));
  const torsionPerUnit = ph / (1.7 * Aoh ** 2);
  const capacity = v >= limit ? 0 : Math.sqrt(limit ** 2 - v ** 2) / torsionPerUnit;
  return { sectionRatio: Math.sqrt(v ** 2 + (torque * torsionPerUnit) ** 2) / limit,
    phiTn: capacity, ratio: capacity > 0 ? Math.abs(torque) / capacity : Infinity };
}

for (const edition of ['2005', '2025'] as const) {
  it(`exact column witness ${edition}: ${clause}`, () => {
    const d = demand(0, 100, 57), expected = reference(0, 100, 57);
    expect(expected.sectionRatio).toBeGreaterThan(1);
    expect(expected.ratio).toBeGreaterThan(1);
    const v = verifyElement({ ...p, edition, elementId: 1, elementType: 'column', demand: d }, fixed);
    expect(v.torsion!.phiTn).toBeCloseTo(expected.phiTn, 11);
    expect(v.torsion!.ratio).toBeCloseTo(expected.ratio, 12);
    expect(v.torsion!.status).toBe('fail');
    expect(v.overallStatus).toBe('fail');
    expect(v.diagnostics).toContainEqual(expect.objectContaining({ code: 'VERIF_FAIL_TORSION' }));
  });
  for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
    for (const entry of ['torsion', 'direct', 'prepared', 'concurrent'] as const) {
      for (const shearAxis of ['primary', 'secondary', 'both'] as const) for (const factor of [1 - 1e-5, 1 + 1e-5]) {
        it(`section boundary ${edition} ${axis} ${elementType} ${entry} ${shearAxis} ${factor}: ${clause}`, () => {
          const primary = shearAxis === 'secondary' ? 0 : 100;
          const secondary = shearAxis === 'primary' ? 0 : -100;
          const torque = reference(primary, secondary, 0).phiTn * factor;
          const expected = reference(primary, secondary, torque);
          const input = { ...p, edition, elementId: 1, elementType, demand: demand(primary, secondary, torque, axis) };
          const v = entry === 'direct' ? verifyElement(input, fixed) : entry === 'prepared' ? prepareElementVerification(input)(fixed)
            : entry === 'concurrent' ? verifyConcurrentElement([input]) : undefined;
          if (entry !== 'torsion') expect(v?.torsion).toBeDefined();
          const t = entry === 'torsion' ? checkTorsion(p, input.demand, edition) : v!.torsion!;
          expect(t.phiTn).toBeCloseTo(expected.phiTn, 11);
          expect(t.ratio).toBeCloseTo(expected.ratio, 12);
          if (factor > 1) {
            expect(t.status).toBe('fail');
            if (v) expect(v.overallStatus).toBe('fail');
          } else {
            expect(t.status).not.toBe('fail');
          }
        });
      }
      it(`zero secondary shear preserves main ${edition} ${axis} ${elementType} ${entry}`, () => {
        const input = { ...p, edition, elementId: 1, elementType, demand: demand(100, 0, 30, axis) };
        const v = entry === 'direct' ? verifyElement(input, fixed) : entry === 'prepared' ? prepareElementVerification(input)(fixed)
          : entry === 'concurrent' ? verifyConcurrentElement([input]) : undefined;
        if (entry !== 'torsion') expect(v?.torsion).toBeDefined();
        const t = entry === 'torsion' ? checkTorsion(p, input.demand, edition) : v!.torsion!;
        const { steps: _steps, status: _status, ...baseline } = main.results[edition].control.torsion;
        expect(t).toMatchObject(baseline);
        expect(t.phiTn).toBeCloseTo(reference(100, 0, 30).phiTn, 11);
        expect(t.ratio).toBeCloseTo(reference(100, 0, 30).ratio, 12);
        expect(t.status).not.toBe('fail');
      });
    }
  }
}

for (const axis of ['My', 'Mz'] as const) for (const factor of [1 - 1e-5, 1 + 1e-5]) {
  it(`provided steel module ${axis} ${factor}: ${clause}`, () => {
    const diameter = 16;
    const dSecondary = depth(p.b, diameter);
    const torque = reference(0, 100, 0, p.b, p.h, diameter).phiTn * factor;
    const r = checkTorsion2025({ ...p, d: depth(p.h, diameter), dSecondary, stirrupDiaMm: diameter,
      fyt: p.fy, demand: demand(0, 100, torque, axis), stirrup: { diameter, legs: 4, spacing: 0.05 } });
    expect(r.sectionRatio).toBeCloseTo(reference(0, 100, torque, p.b, p.h, diameter).sectionRatio, 12);
    const vc = 0.17 * Math.sqrt(p.fc) * 1000;
    const vsSecondary = Math.max(0, 100 / 0.75 - vc * p.h * dSecondary);
    const requiredShear = vsSecondary / (p.fy * 1000 * dSecondary);
    const Aoh = (p.b - 2 * p.cover - diameter / 1000) * (p.h - 2 * p.cover - diameter / 1000);
    const requiredTorsion = torque / (0.75 * 2 * 0.85 * Aoh * p.fy * 1000);
    expect(r.transverseRequired).toBeCloseTo(Math.max(requiredShear + 2 * requiredTorsion, Math.max(0.062 * Math.sqrt(p.fc), 0.35) * p.h / p.fy), 15);
    expect(r.ratio > 1).toBe(factor > 1);
  });
}

for (const axis of ['My', 'Mz'] as const) for (const factor of [1 - 1e-5, 1 + 1e-5]) {
  it(`shear alone fills the section ${axis} ${factor}: ${clause}`, () => {
    const secondary = p.h * depth(p.b) * 0.75 * (0.17 + 0.66) * Math.sqrt(p.fc) * 1000 * factor;
    const t = checkTorsion(p, demand(0, secondary, 6, axis), '2025');
    const expected = reference(0, secondary, 6);
    expect(t.phiTn).toBeCloseTo(expected.phiTn, 10);
    if (expected.ratio === Infinity) expect(t.ratio).toBe(Infinity);
    else expect(t.ratio).toBeCloseTo(expected.ratio, 8);
    expect(t.status).toBe('fail');
  });
}
for (const axis of ['My', 'Mz'] as const) for (const factor of [1 - 1e-3, 1 + 1e-3]) {
  it(`provided beam sweep ${axis} ${factor}: ${clause}`, () => {
    const shearOnly = reference(0, 100, 0).sectionRatio;
    const torsionOnly = reference(0, 0, 1).sectionRatio;
    const torque = Math.sqrt(factor ** 2 - shearOnly ** 2) / torsionOnly;
    const d = demand(0, 100, torque, axis);
    const stations = { elementId: 1, length: 0.4, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'C1',
      stations: [0, 1].map(t => ({ ...d.source.forces, t, x: t * 0.4 })) }] };
    const r = verifyProvidedReinforcement(1, 'beam', { regions: {
      bottomSpan: { count: 4, diameter: 16 }, topStart: { count: 4, diameter: 16 }, topEnd: { count: 4, diameter: 16 },
      stirrupsSpan: { diameter: 8, legs: 4, spacing: 0.05 }, stirrupsSupport: { diameter: 8, legs: 4, spacing: 0.05 },
    } }, undefined, {}, p, stations, undefined, { axes: {
      flexure: axis, shear: axis === 'My' ? 'Vz' : 'Vy', secondaryFlexure: axis === 'My' ? 'Mz' : 'My',
      secondaryShear: axis === 'My' ? 'Vy' : 'Vz', bFlex: p.b, hFlex: p.h, biaxial: false,
      sagCategory: `${axis}+`, hogCategory: `${axis}-`, basis: 'stress-proxy', secondaryRatio: 0,
    } });
    const checks = r.checks.filter(c => c.category.startsWith('Torsion ') && !c.category.startsWith('Torsion Al'));
    expect(checks.length).toBeGreaterThan(0);
    for (const c of checks) {
      expect(c.ratio).toBeCloseTo(reference(0, 100, torque).sectionRatio, 12);
      expect(c.status === 'fail').toBe(factor > 1);
    }
  });
}

const model = {
  elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.4, y: 0, z: 0 }]]),
  sections: new Map([[1, { id: 1, name: 'RC', b: p.b, h: p.h, a: p.b * p.h,
    iy: p.b * p.h ** 3 / 12, iz: p.h * p.b ** 3 / 12, j: 0.001 }]]),
  materials: new Map([[1, { id: 1, name: 'H25', fc: p.fc, fy: p.fy, e: 25000, nu: 0.2 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
};
afterEach(() => setCompactStationTransfer(true));
for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  it(`3D WASM concurrent secondary shear nonlinear=${nonlinear} compact=${compact}`, () => {
    const solver: SolverInput3D = { ...model,
      elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 100, fz: 0, mx: 57, my: 20, mz: 0 } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    setCompactStationTransfer(compact);
    const ds = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], model).demands.get(1)!.concurrent!;
    expect(ds.length).toBeGreaterThan(0);
    for (const source of ds) {
      const d = source.section('My');
      expect(d.Vu).toBeCloseTo(0, 10);
      expect(d.VuSecondary).toBeCloseTo(100, 10);
      expect(d.Tu).toBeCloseTo(57, 10);
      for (const elementType of ['beam', 'column', 'wall'] as const) {
        const input = { ...p, elementId: 1, elementType, demand: d };
        for (const v of [verifyElement(input, fixed), prepareElementVerification(input)(fixed), verifyConcurrentElement(ds.map(source => ({ ...p, elementId: 1, elementType, demand: source.section('My') })))]) {
          expect(v.torsion!.ratio).toBeCloseTo(reference(d.Vu, d.VuSecondary, d.Tu).ratio, 12);
          expect(v.torsion!.status).toBe('fail');
          expect(v.overallStatus).toBe('fail');
        }
      }
    }
  });
}
for (const nonlinear of [false, true]) for (const compact of [false, true]) for (const entry of ['auto', 'unified', 'design'] as const) {
  it(`3D WASM ${entry} retains secondary shear nonlinear=${nonlinear} compact=${compact}`, () => {
    const m = { ...model, nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.04, y: 0, z: 0 }]]) };
    const solver: SolverInput3D = { ...m,
      elements: new Map([[1, { ...m.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 100, fz: 0, mx: 57, my: 20, mz: 0 } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    setCompactStationTransfer(compact);
    const complete = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], m);
    const v = { auto: () => autoVerifyFromResults(raw, m, null, undefined, complete.demands).concrete[0]!,
      unified: () => runUnifiedVerification(raw, m, null, complete.demands)[0]!,
      design: () => runCirsocDesign(raw, m, complete.demands, new Map(), null).concrete[0]! }[entry]();
    expect(v.flexureAxis).toBe('My');
    expect(v.torsion!.ratio).toBeCloseTo(reference(0, 100, 57).ratio, 12);
    expect(v.torsion!.status).toBe('fail');
    expect(v.overallStatus).toBe('fail');
  });
}
for (const nonlinear of [false, true]) it(`2D WASM torsion-free valid control nonlinear=${nonlinear}`, () => {
  const solver: SolverInput = { nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0.4, z: 0 }]]),
    materials: model.materials, sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
    elements: new Map([[1, { ...model.elements.get(1)!, hingeStart: false, hingeEnd: false }]]), supports: model.supports,
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 10, my: 20 } }] };
  const raw = nonlinear ? solvePDelta(solver).results : solve(solver);
  const ef = raw.elementForces[0]!;
  expect(Math.abs(ef.mStart)).toBeCloseTo(24, 10);
  const inputs = declaredTestDemands(([0, 1] as const).map(t => ({ comboId: 1, comboName: '2D', forces: {
    t, x: t * ef.length, n: t ? ef.nEnd : ef.nStart, my: t ? ef.mEnd : ef.mStart, mz: 0,
    vy: 0, vz: t ? ef.vEnd : ef.vStart, torsion: 0,
  } }))).map(d => ({ ...p, elementId: 1, elementType: 'beam' as const, demand: d.section('My') }));
  for (const v of [verifyElement(inputs[0]!), prepareElementVerification(inputs[0]!)(), verifyConcurrentElement(inputs)]) {
    expect(v.torsion).toBeUndefined();
    expect(v.flexure.Mu).toBeCloseTo(24, 10);
    expect(v.overallStatus).not.toBe('fail');
  }
});

const phiTth = 0.75 * 0.083 * Math.sqrt(p.fc) * 1000 * (p.b * p.h) ** 2 / (2 * (p.b + p.h));
const cage = { diameter: p.stirrupDia, legs: 4, spacing: 0.05 };
function providedBeam(torque: number, axis: 'My' | 'Mz', edition: '2005' | '2025', layout: 'none' | 'support' | 'span' | 'all' | 'legacy', stations?: Parameters<typeof verifyProvidedReinforcement>[6]) {
  const d = demand(0, 0, torque, axis);
  return verifyProvidedReinforcement(1, 'beam', {
    ...(layout === 'legacy' ? { stirrups: cage } : {}),
    regions: {
      bottomSpan: { count: 4, diameter: 16 }, topStart: { count: 4, diameter: 16 }, topEnd: { count: 4, diameter: 16 },
      ...(layout === 'support' || layout === 'all' ? { stirrupsSupport: cage } : {}),
      ...(layout === 'span' || layout === 'all' ? { stirrupsSpan: cage } : {}),
    },
  }, undefined, {}, p, stations ?? { elementId: 1, length: 6, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'pure torque',
    stations: [0, 0.5, 1].map(t => ({ ...d.source.forces, t, x: t * 6 })) }] }, undefined, {
    spacingRule: { edition, maxAggregateSizeMm: 0 },
    axes: { flexure: axis, shear: axis === 'My' ? 'Vz' : 'Vy', secondaryFlexure: axis === 'My' ? 'Mz' : 'My',
      secondaryShear: axis === 'My' ? 'Vy' : 'Vz', bFlex: p.b, hFlex: p.h, biaxial: false,
      sagCategory: `${axis}+`, hogCategory: `${axis}-`, basis: 'stress-proxy', secondaryRatio: 0 },
  });
}
for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) {
  for (const layout of ['none', 'support', 'span'] as const) {
    for (const torque of [phiTth, phiTth * (1 + 1e-5), reference(0, 0, 0).phiTn * (1 - 1e-5), reference(0, 0, 0).phiTn * (1 + 1e-5)]) {
      it(`known wrong result: #2142 zero-shear beam reports missing torsion stirrups ${edition} ${axis} ${layout} ${torque}`, () => {
        const r = providedBeam(torque, axis, edition, layout);
        const rows = r.checks.filter(c => c.category.startsWith('Torsion ') && !c.category.startsWith('Torsion Al'));
        expect(rows).toHaveLength(2);
        expect(r.checkedAxes).toContain('T');
        for (const c of rows) {
          expect(c.description).toContain(`sección ${reference(0, 0, torque).sectionRatio.toFixed(2)}`);
          expect(c.missingReinforcement).toBe(true);
          expect(c.status).toBe('fail');
          expect(c.ratio).toBe(Infinity);
          expect(c.description).toContain('no stirrups provided');
        }
        expect(r.overallStatus).toBe('fail');
      });
    }
  }
  for (const layout of ['none', 'support', 'span', 'all', 'legacy'] as const) {
    for (const torque of [0, phiTth * (1 - 1e-5)]) {
      it(`zero-shear negligible torsion remains answered ${edition} ${axis} ${layout} ${torque}`, () => {
        const r = providedBeam(torque, axis, edition, layout);
        expect(r.checks.some(c => c.category.startsWith('Torsion'))).toBe(false);
        expect(r.overallStatus).not.toBe('fail');
      });
    }
  }
  for (const layout of ['all', 'legacy'] as const) {
    for (const factor of [1 - 1e-3, 1 + 1e-3]) {
      it(`zero-shear provided torsion cage retains section boundary ${edition} ${axis} ${layout} ${factor}`, () => {
        const torque = reference(0, 0, 0).phiTn * factor;
        const r = providedBeam(torque, axis, edition, layout);
        const rows = r.checks.filter(c => c.category.startsWith('Torsion ') && !c.category.startsWith('Torsion Al'));
        expect(rows).toHaveLength(2);
        for (const c of rows) {
          expect(c.ratio).toBeCloseTo(reference(0, 0, torque).sectionRatio, 12);
          expect(c.status === 'fail').toBe(factor > 1);
          expect(c.missingReinforcement).not.toBe(true);
        }
      });
    }
  }
}
for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  it(`known wrong result: #2142 3D WASM pure torque cannot omit missing stirrups nonlinear=${nonlinear} compact=${compact}`, () => {
    const torque = reference(0, 0, 0).phiTn * (1 + 1e-3);
    const solver: SolverInput3D = { ...model,
      elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: torque, my: 20, mz: 0 } }],
    };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    setCompactStationTransfer(compact);
    const complete = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], model);
    const ds = complete.demands.get(1)!.concurrent!;
    expect(ds.length).toBeGreaterThan(0);
    for (const source of ds) {
      const d = source.section('My');
      expect(d.Vu).toBeCloseTo(0, 10);
      expect(d.VuSecondary).toBeCloseTo(0, 10);
      expect(d.Tu).toBeCloseTo(torque, 10);
      const r = providedBeam(d.Tu, 'My', '2025', 'none', complete.stations.get(1)!);
      expect(r.checks).toContainEqual(expect.objectContaining({ limiting: 'torsion', missingReinforcement: true, status: 'fail' }));
      expect(r.overallStatus).toBe('fail');
    }
  });
}

for (const nonlinear of [false, true]) it(`2D WASM provided beam without stirrups remains torsion-free nonlinear=${nonlinear}`, () => {
  const solver: SolverInput = { nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 6, z: 0 }]]),
    materials: model.materials, sections: new Map([[1, { ...model.sections.get(1)!, iz: model.sections.get(1)!.iy }]]),
    elements: new Map([[1, { ...model.elements.get(1)!, hingeStart: false, hingeEnd: false }]]), supports: model.supports,
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: 20 } }] };
  const raw = nonlinear ? solvePDelta(solver).results : solve(solver);
  const ef = raw.elementForces[0]!;
  expect(Math.abs(ef.mStart)).toBeCloseTo(20, 10);
  expect(ef.vStart).toBeCloseTo(0, 10);
  expect(ef.vEnd).toBeCloseTo(0, 10);
  const stations = { elementId: 1, length: ef.length, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: '2D',
    stations: [0, 0.5, 1].map(t => ({ t, x: t * ef.length, n: ef.nStart + t * (ef.nEnd - ef.nStart),
      my: ef.mStart + t * (ef.mEnd - ef.mStart), mz: 0, vy: 0, vz: ef.vStart + t * (ef.vEnd - ef.vStart), torsion: 0 })) }] };
  const r = providedBeam(0, 'My', '2025', 'none', stations);
  expect(r.checks.some(c => c.category.startsWith('Torsion'))).toBe(false);
  expect(r.overallStatus).not.toBe('fail');
});
