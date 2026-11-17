import { expect, it } from 'vitest';
import { checkShear, prepareElementVerification, verifyElement } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { declaredTestDemands } from './helpers/declared-demands';
import { solve, solve3D, solvePDelta, solvePDelta3D } from '../wasm-solver';

const section = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const entries = ['direct', 'prepared', 'concurrent'] as const;
const verify = (input: Parameters<typeof verifyElement>[0], spacing: number, entry: typeof entries[number], legs = 4) => {
  const fixed = { shear: { spacing, legs, secondaryLegs: legs } };
  return entry === 'direct' ? verifyElement(input, fixed) : entry === 'prepared' ? prepareElementVerification(input)(fixed) : verifyConcurrentElement([input], fixed);
};

for (const entry of entries) for (const axis of ['My', 'Mz'] as const) {
  it.skip(`known wrong result: #2198 fixed beam primary passes while secondary spacing fails ${entry} ${axis}`, () => {
    const demand = declaredTestDemands([{ comboId: 1, comboName: 'fixed cage', forces: {
      t: 0, x: 0, n: 0, my: 0, mz: 0, vy: 1, vz: 1, torsion: 0,
    } }])[0]!.section(axis);
    const v = verify({ ...section, elementId: 1, elementType: 'beam', demand }, 0.2, entry);
    expect(v.shear.d).toBeCloseTo(0.559, 12);
    expect(v.shear.status).toBe('ok');
    expect(v.shearSecondary!.d).toBeCloseTo(0.259, 12);
    expect(v.shearSecondary!.stirrupLegs).toBe(4);
    expect(v.shearSecondary!.ratio).toBeLessThan(1);
    expect(v.shearSecondary!.status).toBe('fail');
    expect(v.shearSecondary!.steps).toContain('⚠ s = 20.00 cm > s,max = 12.95 cm (§9.7.6.2.2)');
    expect(v.overallStatus).toBe('fail');
    expect(v.diagnostics?.some(d => d.code === 'VERIF_FAIL_SHEAR')).toBe(true);
  });
}

for (const entry of entries) for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const)
  for (const direction of ['primary', 'secondary'] as const) for (const row of [1, 2]) for (const factor of [0.999, 1, 1.001]) {
    it.skip(`known wrong result: #2198 fixed beam spacing boundary ${entry} ${edition} ${axis} ${direction} row${row} ${factor}`, () => {
      const sec = direction === 'secondary' ? section : { ...section, b: section.h, h: section.b };
      const target = { ...section, b: section.h, h: section.b };
      const d = target.h - target.cover - target.stirrupDia / 1000 - 16 / 2000;
      const limit = d / (row === 1 ? 2 : 4);
      const load = row === 1 ? 1 : checkShear(target, 0, 0, { edition }).phiVc + 0.75 * 1.01 * 0.33 * Math.sqrt(target.fc) * target.b * d * 1000;
      const forceAxis = (axis === 'My') === (direction === 'primary') ? 'vz' : 'vy';
      const demand = declaredTestDemands([{ comboId: 1, comboName: 'spacing boundary', forces: {
        t: 0, x: 0, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: 0, [forceAxis]: load,
      } }])[0]!.section(axis);
      const v = verify({ ...sec, edition, elementId: 1, elementType: 'beam', demand }, limit * factor, entry, row === 1 ? 4 : 12);
      const s = direction === 'primary' ? v.shear : v.shearSecondary!;
      expect(s.ratio).toBeLessThan(1);
      expect(s.status).toBe(factor > 1 ? 'fail' : 'ok');
      expect(v.overallStatus).toBe(factor > 1 ? 'fail' : 'ok');
      expect(s.steps.some(step => typeof step === 'string' && step.includes('s,max'))).toBe(factor > 1);
    });
  }

for (const factor of [0.999, 1, 1.001]) {
  it.skip(`known wrong result: #2198 standalone beam shear fixed spacing ${factor}`, () => {
    const d = section.h - section.cover - section.stirrupDia / 1000 - 16 / 2000;
    const s = checkShear(section, 1, 0, { spacing: d / 2 * factor, legs: 4 });
    expect(s.ratio).toBeLessThan(1);
    expect(s.status).toBe(factor > 1 ? 'fail' : 'ok');
  });
}

for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const entry of entries) {
  it.skip(`known wrong result: #2198 solved fixed beam spacing ${spatial ? '3D' : '2D'} ${nonlinear ? 'P-Delta' : 'linear'} ${entry}`, () => {
    const p = spatial ? section : { ...section, b: section.h, h: section.b };
    const model = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.04, y: 0, z: 0 }]]),
      elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1,
        releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      sections: new Map([[1, { id: 1, name: 'RC', ...p, a: p.b * p.h, iy: p.b * p.h ** 3 / 12, iz: p.h * p.b ** 3 / 12, j: 0.001 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fc: p.fc, fy: p.fy, e: 25000, nu: 0.2 }]]),
    };
    const raw = spatial ? (() => {
      const solver = { ...model, supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fy: 1, fz: 1, mx: 0, my: 0, mz: 0 } }] };
      return nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    })() : (() => {
      const solver = { ...model,
        nodes: new Map([...model.nodes].map(([id, { x, z }]) => [id, { id, x, z }])),
        elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, hingeStart: false, hingeEnd: false }]]),
        supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
        loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fz: 1, my: 0 } }] };
      return nonlinear ? solvePDelta(solver).results : solve(solver);
    })();
    const ef = raw.elementForces[0]!;
    const demand = declaredTestDemands([{ comboId: 1, comboName: 'solved', forces: spatial ? {
      t: 0, x: 0, n: ef.nStart, my: 'myStart' in ef ? ef.myStart : 0, mz: 'mzStart' in ef ? ef.mzStart : 0,
      vy: 'vyStart' in ef ? ef.vyStart : 0, vz: 'vzStart' in ef ? ef.vzStart : 0, torsion: 0,
    } : { t: 0, x: 0, n: ef.nStart, my: 'mStart' in ef ? ef.mStart : 0, mz: 0, vy: 0, vz: 'vStart' in ef ? ef.vStart : 0, torsion: 0 } }])[0]!.section('My');
    const input = { ...p, elementId: 1, elementType: 'beam' as const, demand };
    for (const spacing of [0.1, 0.2]) {
      const v = verify(input, spacing, entry);
      const s = spatial ? v.shearSecondary! : v.shear;
      expect(s.Vu).toBeCloseTo(1, 12);
      expect(s.ratio).toBeLessThan(1);
      expect(s.status).toBe(spacing === 0.2 ? 'fail' : 'ok');
      expect(v.overallStatus).toBe(spacing === 0.2 ? 'fail' : 'ok');
      if (spatial) expect(v.shear.status).toBe('ok');
    }
  });
}
