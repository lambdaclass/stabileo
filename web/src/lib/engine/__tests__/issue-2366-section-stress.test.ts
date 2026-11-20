import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import StressStateDetails from '../../../components/stress/StressStateDetails.svelte';
import { t } from '../../i18n';
import type { Section } from '../../store/model.svelte';
import { analyzeSectionStress3D, analyzeSectionStressFromForces } from '../section-stress-3d';
import type { ElementForces3D, SolverInput3D } from '../types-3d';
import { solve3D, solvePDelta3D } from '../wasm-solver';

const radius = 0.100;
const wall = 0.001;
const torque = 0.2009999494975003;
const fy = 9;
const inertia = (Math.PI / 4) * (radius ** 4 - (radius - wall) ** 4);
const section: Section = {
  id: 1, name: 'CHS', shape: 'CHS',
  a: Math.PI * (radius ** 2 - (radius - wall) ** 2),
  b: 2 * radius, h: 2 * radius, t: wall,
  iy: inertia, iz: inertia, j: 2 * inertia,
};

function station(vy: number, vz: number, mx: number): ElementForces3D & { pointLoadsX: [] } {
  return {
    elementId: 1, length: 1,
    nStart: 0, nEnd: 0,
    vyStart: vy, vyEnd: vy, vzStart: vz, vzEnd: vz,
    mxStart: mx, mxEnd: mx, myStart: 0, myEnd: vz, mzStart: 0, mzEnd: -vy,
    releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
    releaseTStart: false, releaseTEnd: false,
    qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
    distributedLoadsY: [], distributedLoadsZ: [],
    pointLoadsX: [], pointLoadsY: [], pointLoadsZ: [],
  };
}

describe('3D section stress with torsion and transverse shear', () => {
  for (const [entry, analyze] of [
    ['raw forces', (vy: number, vz: number, mx: number, y: number, z: number) =>
      analyzeSectionStressFromForces(0, vy, vz, mx, 0, 0, section, fy, y, z)],
    ['member station', (vy: number, vz: number, mx: number, y: number, z: number) =>
      analyzeSectionStress3D(station(vy, vz, mx), section, fy, 0, y, z)],
  ] as const) {
    it(`#2366 ${entry} refuses fibre values and the verdict for both torque signs`, () => {
      for (const mx of [torque, -torque]) {
        const result = analyze(0, 1, mx, 0, radius - wall / 2);
        expect(result.tauTotal, JSON.stringify(result.failure)).toBeNull();
        expect(result.mohr).toBeNull();
        expect(result.failure).toBeNull();
        expect(result).toHaveProperty('refusal', 'combinedTorsionAndTransverseShear');
      }
    });

    it(`#2366 ${entry} preserves pure torsion and pure transverse shear`, () => {
      const midwall = radius - wall / 2;
      const torsionStress = torque / (2 * Math.PI * midwall ** 2 * wall) / 1000;
      const transverseStress = radius ** 2 / inertia / 1000;
      for (const [vz, mx, expected] of [[0, -torque, torsionStress], [1, 0, transverseStress]]) {
        const result = analyze(0, vz, mx, 0, midwall);
        expect(result.refusal).toBeNull();
        expect(result.tauTotal).toBeCloseTo(expected, 12);
        expect(result.mohr?.tauMax).toBeCloseTo(expected, 12);
        expect(result.failure?.vonMises).toBeCloseTo(Math.sqrt(3) * expected, 12);
        expect(result.failure?.ok).toBe(true);
        expect([...result.distributionY, ...result.distributionZ]).not.toContainEqual(
          expect.objectContaining({ tauTotal: null }),
        );
      }
    });

    it(`#2366 ${entry} refuses the affected cut pointwise and evaluates a zero-shear edge`, () => {
      const result = analyze(1, 0, torque, 0, radius);
      expect(result.tauTotal).toBe(result.tauTorsion);
      expect(result.failure?.ok).toBe(true);
      const inside = analyze(1, 0, torque, 0, radius - Number.EPSILON);
      expect(inside.tauVyAtFiber).toBeGreaterThan(0);
      expect(inside.failure).toBeNull();
      const width = result.distributionZ;
      expect(width[Math.floor(width.length / 2)]).toMatchObject({
        tauTotal: null, vonMises: null, refusal: 'combinedTorsionAndTransverseShear',
      });
      expect(width[0]).toMatchObject({ tauTotal: result.tauTorsion, refusal: null });
    });

    for (const [cut, vy, vz] of [['distributionY', 1, 0], ['distributionZ', 0, 1]] as const) {
      it(`#2366 ${entry} refuses ${cut} when the other transverse component is nonzero`, () => {
        for (const mx of [torque, -torque]) {
          const result = analyze(vy, vz, mx, 0, 0);
          expect(result.refusal).toBe('combinedTorsionAndTransverseShear');
          expect(result[cut].length).toBeGreaterThan(2);
          for (const point of result[cut]) {
            expect(point).toMatchObject({
              refusal: result.refusal, tauTotal: null, vonMises: null,
            });
          }
        }
      });
    }
  }

  it('#2366 refuses shear from both linear and P-Delta member forces', () => {
    const input: SolverInput3D = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 1, y: 0, z: 0 }]]),
      materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: section.a, iy: inertia, iz: inertia, j: 2 * inertia }]]),
      elements: new Map([[1, {
        id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
        localYx: 0, localYy: 1, localYz: 0,
        releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
        releaseTStart: false, releaseTEnd: false,
      }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: -1, fy: 0, fz: 1, mx: torque, my: 0, mz: 0 } }],
    };
    const linear = solve3D(input);
    const pdelta = solvePDelta3D(input);
    expect(pdelta.converged).toBe(true);
    for (const results of [linear, pdelta.results]) {
      expect(results.elementForces).toHaveLength(1);
      const result = analyzeSectionStress3D(results.elementForces[0]!, section, fy, 1, 0, radius - wall / 2);
      expect(result.tauTorsion).not.toBe(0);
      expect(result.tauVzAtFiber).not.toBe(0);
      expect(result).toMatchObject({
        refusal: 'combinedTorsionAndTransverseShear', tauTotal: null, mohr: null, failure: null,
      });
      for (const point of result.distributionZ) {
        expect(point).toMatchObject({ refusal: result.refusal, tauTotal: null, vonMises: null });
      }
    }
  });

  it('#2366 shows a translated refusal and omits the pass indicator', () => {
    const mixed = analyzeSectionStressFromForces(0, 0, 1, torque, 0, 0, section, fy, 0, radius - wall / 2);
    const pure = analyzeSectionStressFromForces(0, 0, 1, 0, 0, 0, section, fy, 0, radius - wall / 2);
    const body = (analysis3D: typeof mixed, showTensional: boolean) => render(StressStateDetails, {
      props: { analysis3D, showTensional, is3D: true, isMassive: false, analysis2D: null },
    }).body;
    expect(body(mixed, false)).toContain(t('stress.combinedShearRefused'));
    expect(body(mixed, true)).toContain('role="alert"');
    expect(body(mixed, true)).not.toMatch(/ssp-fy-fill|Tresca:|Rankine:/);
    expect(body(pure, true)).toMatch(/ssp-fy-fill[^"]* ok/);
    expect(body(pure, true)).not.toContain('role="alert"');
  });
});
