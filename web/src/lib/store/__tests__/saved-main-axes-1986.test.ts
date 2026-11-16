import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { modelStore, uiStore } from '../../store';
import { deserializeProject } from '../file';
import { initSolver, solve, solve3D, solvePDelta, solvePDelta3D } from '../../engine/wasm-solver';

import { axesStore } from '../../axes/axes.svelte';
import { allChoices } from '../../axes/frame';

const out = new URL('./fixtures/saved-main-axes-1986.json', import.meta.url);
const clean = (v: any): any => {
  if (v === undefined) return { $undefined: true };
  if (typeof v === 'number' && Object.is(v, -0)) return { $number: '-0' };
  if (typeof v === 'number' && !Number.isFinite(v)) return { $number: String(v) };
  if (v instanceof Map) return [...v].map(([k, x]) => [k, clean(x)]);
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'timings').map(([k, x]) => [k, clean(x)]));
  return v;
};
beforeAll(async () => { await initSolver(); });

it('#1986 projects saved before global axes retain canonical inputs and exact linear and nonlinear results', async () => {
  const expected = JSON.parse(readFileSync(out, 'utf8'));
  const choices = allChoices();
  try {
    for (const [name, mode] of [['cantilever', '2d'], ['portal-second-order', '2d'], ['3d-portal-frame', 'pro']] as const) {
      uiStore.analysisMode = mode;
      axesStore.reset();
      const savedProject = readFileSync(new URL(`./fixtures/pre-axes-${name}.ded.json`, import.meta.url), 'utf8');
      for (const c of choices) {
        axesStore.choice = c;
        expect(deserializeProject(savedProject)).toBe(true);
        expect(axesStore.choice).toEqual(c);
        const input = mode === '2d' ? modelStore.buildSolverInput(false)! : modelStore.buildSolverInput3D(false)!;
        expect(input).not.toBeNull();
        const r = mode === '2d' ? solve(input as never) : solve3D(input as never);
        const pd = mode === '2d' ? solvePDelta(input as never) : solvePDelta3D(input as never);
        const actual = clean({ input, linear: r, nonlinear: pd });
        expect(actual.linear.displacements.length).toBeGreaterThan(0);
        expect(actual.nonlinear.converged).toBe(true);
        expect(actual, `${name} ${JSON.stringify(c)}`).toEqual(expected[name]);
      }
    }
  } finally { axesStore.reset(); }
});
