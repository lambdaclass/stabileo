import { expect, it } from 'vitest';
import { bindRole } from '../../../codes/roles';
import { buildLoadPlan } from '../load-plan';
import { input } from './gravity-width-mass-fixture';
import { mesh } from './snow-surface-round2-fixture';

it('#2328 translating a supported cantilever preserves its static seismic action', () => {
  const length = 4, area = 0.5, density = 4;
  const expected = length * area * density / 2;
  for (const base of [10, -5, 0]) {
    const model = { ...mesh([[[0, 0, base], [0, 0, base + length]]]), supports: new Map([[1, { nodeId: 1 }]]) };
    model.sections.set(1, { id: 1, a: area });
    model.materials.set(1, { id: 1, rho: density });
    const options = input(model, {
      dead: [], tributaryWidth: 0,
      seismic: { enabled: true, coefficient: 1, liveParticipation: 0, directions: { x: true, y: false } },
    });
    options.regulations.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true, state: 'applied' };
    const plan = buildLoadPlan(options);
    expect(plan.outcome).toBe('READY');
    expect(plan.blockedKeys).toEqual([]);
    expect(plan.unsupportedKeys).toEqual([]);
    expect(plan.factors.seismicWeight?.value).toBe(expected);
    expect(plan.factors.baseShear?.value).toBe(expected);
    expect(plan.nodal.filter(load => load.caseType === 'E')).toEqual([]);
    expect(plan.distributed.filter(load => load.caseType === 'E')).toMatchObject([
      { elementId: 1, frame: 'global', a: length / 2, b: length, qX: -2 * area * density, qXJ: 4 * area * density },
    ]);
  }
});
