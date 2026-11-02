import { describe, it, expect, vi } from 'vitest';
import { render } from 'svelte/server';
import { plasticCollapse2D, type PlasticCollapseResult } from '../../../lib/engine/plastic-collapse';
import { collapseMechanism, type MechanismView } from '../../../lib/engine/plastic/mechanism';
import type { SolverInput } from '../../../lib/engine/types';

const course = vi.hoisted(() => ({ collapse: null as MechanismView | null }));

vi.mock('../../../lib/store/plastic-course.svelte', () => ({
  plasticCourse: {
    get collapse() { return course.collapse; },
    view: 'steps',
    axis: null,
    mpOf: () => 100,
  },
}));

const propped = () => ({
  nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 6, z: 0 }]]),
  materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
  sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 2, type: 'rollerX' }]]),
  loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
}) as unknown as SolverInput;

describe('collapse is presented only when it is verified', () => {
  const input = propped();
  const r = plasticCollapse2D(input, { mp: () => 100, np: () => Infinity });
  const unverified: Array<[string, PlasticCollapseResult]> = [
    ['unresolved', { ...r, unresolved: true }],
    ['with no finite λc', { ...r, collapseFactor: Infinity }],
  ];

  it('the verified propped cantilever shows its plateau and its mechanism', async () => {
    expect(r.isMechanism && !r.unresolved && Number.isFinite(r.collapseFactor)).toBe(true);
    course.collapse = collapseMechanism(input, r);
    expect(course.collapse).not.toBeNull();
    const { default: Curve } = await import('../plastic/PlasticCurve.svelte');
    const { default: Mechanism } = await import('../plastic/PlasticMechanism.svelte');
    expect(render(Curve, { props: { r } }).body).toContain('ln plateau');
    expect(render(Mechanism, { props: { r } }).body).toContain('data-testid="plastic-mechanism"');
  });

  for (const [name, bad] of unverified) {
    it(`a mechanism ${name} gets neither the plateau nor the mechanism and its virtual-work check`, async () => {
      course.collapse = collapseMechanism(input, r);
      const { default: Curve } = await import('../plastic/PlasticCurve.svelte');
      const { default: Mechanism } = await import('../plastic/PlasticMechanism.svelte');
      expect(render(Curve, { props: { r: bad } }).body).not.toContain('ln plateau');
      expect(render(Mechanism, { props: { r: bad } }).body).not.toContain('data-testid="plastic-mechanism"');
    });
  }
});
