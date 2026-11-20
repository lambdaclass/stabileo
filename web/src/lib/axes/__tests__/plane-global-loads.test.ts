import { afterEach, describe, expect, it } from 'vitest';
import { axesStore } from '../axes.svelte';
import { along, planeGlobalAngle, planeGlobalValue } from '../display';
import { planePointLoad3D } from '../../engine/member-point-loads';
import type { AxesChoice } from '../frame';

afterEach(() => { axesStore.reset(); });

const FRAMES: AxesChoice[] = [
  { up: '+Z', right: '+X', hand: 'right' },
  { up: '-Z', right: '+X', hand: 'right' },
  { up: '+Z', right: '-X', hand: 'left' },
  { up: '-Y', right: '-X', hand: 'right' },
  { up: '+Y', right: '-X', hand: 'left' },
];

describe('a 2D global member load typed in the user axes', () => {
  for (const frame of FRAMES) {
    it(`acts along the direction the user typed, ${JSON.stringify(frame)}`, () => {
      axesStore.choice = frame;
      const sh = along(0).sign, sv = along(2).sign;
      for (const [base, alpha, v] of [[0, 0, -10], [0, 30, 7], [90, 0, 5], [90, -20, -3]] as const) {
        const typed = base + alpha;
        const p = planeGlobalValue(v);
        const angle = planeGlobalAngle(typed);
        const out = planePointLoad3D({ elementId: 1, a: 1, p, angle, isGlobal: true }, 4, 0, true);
        const user = [Math.sin((typed * Math.PI) / 180) * v, Math.cos((typed * Math.PI) / 180) * v];
        expect(out.px).toBeCloseTo(sh * user[0], 10);
        expect(out.pz).toBeCloseTo(sv * user[1], 10);
        expect(planeGlobalValue(p)).toBe(v);
        expect(planeGlobalAngle(angle) + 0).toBe(typed);
      }
    });
  }
});
