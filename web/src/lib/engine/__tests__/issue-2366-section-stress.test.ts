import { describe, expect, it } from 'vitest';
import type { Section } from '../../store/model.svelte';
import { analyzeSectionStress3D, analyzeSectionStressFromForces } from '../section-stress-3d';
import type { ElementForces3D } from '../types-3d';

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

function station(vy: number, vz: number, mx: number): ElementForces3D {
  return {
    elementId: 1, length: 1,
    nStart: 0, nEnd: 0,
    vyStart: vy, vyEnd: vy, vzStart: vz, vzEnd: vz,
    mxStart: mx, mxEnd: mx, myStart: 0, myEnd: vz, mzStart: 0, mzEnd: -vy,
    qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
    distributedLoadsY: [], distributedLoadsZ: [],
    pointLoadsX: [], pointLoadsY: [], pointLoadsZ: [],
  } as ElementForces3D;
}

const issue2366 = process.env.RUN_KNOWN_WRONG === '2366' ? it : it.skip;

describe('3D section stress with torsion and transverse shear', () => {
  for (const [entry, analyze] of [
    ['raw forces', (vy: number, vz: number, mx: number, y: number, z: number) =>
      analyzeSectionStressFromForces(0, vy, vz, mx, 0, 0, section, fy, y, z)],
    ['member station', (vy: number, vz: number, mx: number, y: number, z: number) =>
      analyzeSectionStress3D(station(vy, vz, mx), section, fy, 0, y, z)],
  ] as const) {
    issue2366(`#2366 ${entry} refuses fibre values and the verdict for both torque signs`, () => {
      for (const mx of [torque, -torque]) {
        const result = analyze(0, 1, mx, 0, radius - wall / 2);
        expect(result.tauTotal, JSON.stringify(result.failure)).toBeNull();
        expect(result.mohr).toBeNull();
        expect(result.failure).toBeNull();
        expect(result).toHaveProperty('refusal', 'combinedTorsionAndTransverseShear');
      }
    });

    issue2366(`#2366 ${entry} refuses the affected cut pointwise and evaluates a zero-shear edge`, () => {
      const result = analyze(1, 0, torque, 0, radius);
      expect(result.tauTotal).toBe(result.tauTorsion);
      expect(result.failure?.ok).toBe(true);
      const width = result.distributionZ;
      expect(width[Math.floor(width.length / 2)]).toMatchObject({
        tauTotal: null, vonMises: null, refusal: 'combinedTorsionAndTransverseShear',
      });
      expect(width[0]).toMatchObject({ tauTotal: result.tauTorsion, refusal: null });
      expect(result.distributionY.every(point => point.tauTotal === result.tauTorsion)).toBe(true);
    });
  }
});
