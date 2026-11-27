import { beforeAll, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { modelStore, uiStore } from '../../store';
import { deserializeProject } from '../file';
import { initSolver, solve, solve3D, solvePDelta, solvePDelta3D } from '../../engine/wasm-solver';

import { axesStore } from '../../axes/axes.svelte';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { DEFAULT_AXES, allChoices } from '../../axes/frame';

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

it.each([false, true])('#1986 saved projects match exact origin/main inputs and results with global axes %s', (enabled) => {
  vi.stubGlobal('__PUBLIC_FEATURES__', enabled ? featuresForMode('test') : featuresForMode('production'));
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
        expect(axesStore.choice).toEqual(enabled ? c : DEFAULT_AXES);
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
  } finally { vi.unstubAllGlobals(); axesStore.reset(); }
});

it.skip('known wrong result: #1551 — review preserves the member and global warnings in the portal reference', () => {
  const portal = JSON.parse(readFileSync(out, 'utf8'))['portal-second-order'];
  for (const result of [portal.linear, portal.nonlinear.linearResults]) {
    const warnings = result.structuredDiagnostics.filter((d: { phase: string }) => d.phase === 'LIN-SECOND-ORDER');
    expect(warnings.map((d: { elementIds?: number[]; elementKind?: string }) => [d.elementIds, d.elementKind]))
      .toEqual([[[1, 3], 'frame'], [undefined, undefined]]);
  }
});
