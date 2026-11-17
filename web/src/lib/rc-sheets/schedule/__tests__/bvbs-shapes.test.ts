import { describe, it, expect } from 'vitest';
import { closedHoop, crankedBar, crossTie, developedLength, hookedStraight, bentBar, uBar, type BarShape } from '../../shape';
import { bvbsChecksum, bvbsRecord } from '../bvbs';
import { bvbsLegs } from '../exports';

/** The cut length a bending machine works out from a record's legs, turns and mandrel, mm. */
function machineLength(legs: Array<{ l: number; w: number }>, mandrelMm: number, dia: number): number {
  const r = (mandrelMm + dia) / 2;
  return legs.reduce((s, x) => s + x.l, 0) - legs.reduce((s, x) => {
    const t = (Math.abs(x.w) * Math.PI) / 180;
    return s + (t > 0 ? 2 * r * Math.tan(t / 2) - r * t : 0);
  }, 0);
}

const SHAPES: Array<[string, BarShape, number[]]> = [
  ['straight', hookedStraight(0, 5.2, 0, 12, 0.072, [false, false], 1, 0), [0]],
  ['hooked both ends', hookedStraight(0, 4, 0, 16, 0.096, [true, true], -1, 0.192), [90, 90, 0]],
  ['bent-up', bentBar({ x0: 0, x1: 6, yLow: 0.05, yHigh: 0.55, riseAt: 2, angleDeg: 45, rising: true, dia: 16, mandrel: 0.096, hooks: [false, true], extension: 0.192 }), [45, 45, 90, 0]],
  ['closed hoop', closedHoop(0.24, 0.44, 8, 0.032, 0.075), [135, 90, 90, 90, 135, 0]],
  ['cross tie', crossTie(0.44, 8, 0.032, [135, 90], [0.075, 0.075]), [135, 90, 0]],
  ['U-bar', uBar(0.13, 0.55, 10, 0.06), [90, 90, 0]],
  ['cranked', crankedBar(3, 0.05, 0.8, 20, 0.12), [9, 9, 0]],
];

describe('BVBS records of every shape', () => {
  for (const [name, shape, turns] of SHAPES) {
    it(`${name}: the legs and turns give the machine the developed length`, () => {
      const legs = bvbsLegs(shape);
      expect(legs.map((x) => Math.round(Math.abs(x.w)))).toEqual(turns);
      const L = developedLength(shape) * 1000;
      expect(machineLength(legs, shape.mandrel * 1000, shape.dia)).toBeCloseTo(L, 6);
      const rec = bvbsRecord({ mark: 'A', count: 3, diameterMm: shape.dia, lengthMm: L, weightKg: 1, legs, mandrelMm: shape.mandrel * 1000 }, { project: 'p', plan: 'V1', index: '', grade: 'ADN 420' });
      expect(rec).toContain(`@l${Math.round(L)}@`);
      const body = rec.slice(0, rec.indexOf('C') + 1);
      expect(rec).toBe(`${body}${bvbsChecksum(body)}@\r\n`);
    });
  }
});
