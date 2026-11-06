import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { setLocale } from '../../../lib/i18n';
import { solveForceMethod } from '../../../lib/engine/force-method/solve';
import type { SolverInput } from '../../../lib/engine/types';

const portal = (): SolverInput => ({
  nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: 4 }], [3, { id: 3, x: 6, z: 4 }], [4, { id: 4, x: 6, z: 0 }]]),
  materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
  sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
  elements: new Map([[1, 1, 2], [2, 2, 3], [3, 3, 4]].map(([id, nodeI, nodeJ]) => [id, { id, type: 'frame', nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }])),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 4, type: 'fixed' }]]),
  loads: [{ type: 'nodal', data: { nodeId: 2, fx: 15, fz: 0, my: 0 } }, { type: 'distributed', data: { elementId: 2, qI: -20, qJ: -20 } }],
} as unknown as SolverInput);

async function verdicts(rigidOk: boolean | undefined, ok = false) {
  setLocale('en');
  const base = solveForceMethod(portal(), { axial: false });
  expect(base.verification.axialOff).toBe(true);
  expect(base.verification.ok).toBe(false);
  const r = { ...base, verification: { ...base.verification, rigidOk, ok } };
  const { default: Solution } = await import('../FmStepsSolution.svelte');
  const body = render(Solution, { props: { r, step: 9 } }).body;
  const verdict = /<p class="([^"]*)" data-testid="fm-verdict">([\s\S]*?)<\/p>/.exec(body);
  expect(verdict).not.toBeNull();
  return { cls: verdict![1], text: verdict![2], rigid: body.includes('data-testid="fm-verdict-rigid"') };
}

describe('step 9 with the axial term left out', () => {
  it('confirmed by the axially rigid reference: the agreement and the axial explanation', async () => {
    const v = await verdicts(true);
    expect(v.rigid).toBe(true);
    expect(v.cls).toContain('fm-axial-off');
    expect(v.cls).not.toContain('bad');
  });

  it('contradicted by the axially rigid reference: a failed verdict, with no axial excuse', async () => {
    const v = await verdicts(false);
    expect(v.rigid).toBe(false);
    expect(v.cls).toContain('bad');
    expect(v.cls).not.toContain('fm-axial-off');
  });

  it('contradicted by the axially rigid reference while the flexible one agrees: still a failed verdict, never green', async () => {
    const v = await verdicts(false, true);
    expect(v.rigid).toBe(false);
    expect(v.cls).toContain('bad');
    expect(v.cls).not.toContain('fm-axial-off');
    expect(v.text).toContain('not verified');
  });

  it('with no reference to compare: not verified, never a silent pass', async () => {
    const v = await verdicts(undefined);
    expect(v.rigid).toBe(false);
    expect(v.cls).toContain('bad');
    expect(v.cls).not.toContain('fm-axial-off');
    expect(v.text).not.toContain('course.statics.fm.s9.axialUnverified');
  });
});
