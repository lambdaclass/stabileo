import { describe, it, expect, vi } from 'vitest';
import { render } from 'svelte/server';
import { t, tp } from '../../../lib/i18n';
import { plasticCollapse2D, type PlasticCollapseResult } from '../../../lib/engine/plastic-collapse';
import { collapseMechanism, type MechanismView } from '../../../lib/engine/plastic/mechanism';
import type { SolverInput } from '../../../lib/engine/types';
import type { CurveAxis } from '../../../lib/engine/plastic/curve';

const course = vi.hoisted(() => ({ collapse: null as MechanismView | null, axis: null as CurveAxis | null }));

vi.mock('../../../lib/store/plastic-course.svelte', () => ({
  plasticCourse: {
    get collapse() { return course.collapse; },
    view: 'steps',
    get axis() { return course.axis; },
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

  it('the step trace announces collapse only when it is verified', async () => {
    const { default: Trace } = await import('../plastic/PlasticStepTrace.svelte');
    const end = r.steps.length - 1;
    const ok = render(Trace, { props: { r, step: end } }).body;
    expect(ok).toContain(tp('course.plastic.trace.collapse', { lambda: r.collapseFactor.toFixed(3) }));
    const bad = render(Trace, { props: { r: { ...r, unresolved: true }, step: end } }).body;
    expect(bad).not.toContain(tp('course.plastic.trace.collapse', { lambda: r.collapseFactor.toFixed(3) }));
    expect(bad).toContain(t('course.plastic.unresolved'));
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

const portal = () => ({
  nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: 4 }], [3, { id: 3, x: 6, z: 4 }], [4, { id: 4, x: 6, z: 0 }]]),
  materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
  sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
  elements: new Map([1, 2, 3].map((id) => [id, { id, type: 'frame', nodeI: [1, 2, 4][id - 1], nodeJ: [2, 3, 3][id - 1], materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }])),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 4, type: 'fixed' }]]),
  loads: [{ type: 'nodal', data: { nodeId: 2, fx: 10, fz: 0, my: 0 } }, { type: 'pointOnElement', data: { elementId: 2, a: 3, p: -20 } }],
}) as unknown as SolverInput;

describe('the collapse plateau follows the mechanism along the chosen axis', () => {
  const input = portal();
  const r = plasticCollapse2D(input, { mp: () => 100, np: () => Infinity });
  const plateau = async (axis: CurveAxis) => {
    course.collapse = collapseMechanism(input, r);
    course.axis = axis;
    const { default: Curve } = await import('../plastic/PlasticCurve.svelte');
    const html = render(Curve, { props: { r } }).body;
    const m = html.match(/<line class="ln plateau[^"]*" x1="([-\d.e]+)"[^>]*x2="([-\d.e]+)"/);
    return m ? Math.sign(+m[2] - +m[1]) : 0;
  };
  const formedLast = r.hinges.findIndex((h, i) => h.kind === 'bending' && r.steps.at(-1)!.hingesFormed.includes(h) && i >= 0);

  it('a sway portal: the top sways one way, a restrained support component and a hinge formed last its own way', async () => {
    expect(r.isMechanism && !r.unresolved).toBe(true);
    const view = collapseMechanism(input, r)!;
    expect(await plateau({ kind: 'node', node: 2, dof: 'ux' })).toBe(Math.sign(view.d[2 * view.km.nodePoint.get(2)!]));
    expect(await plateau({ kind: 'node', node: 1, dof: 'ux' })).toBe(0);
    expect(await plateau({ kind: 'node', node: 1, dof: 'ry' })).toBe(0);
    expect(formedLast).toBeGreaterThanOrEqual(0);
    expect(r.steps.at(-1)!.rotations[formedLast] ?? 0).toBe(0);
    const k = r.hinges.map((h, i) => ({ h, i })).filter(({ h }) => h.kind === 'bending' && h.unloadedAt === undefined).findIndex(({ i }) => i === formedLast);
    expect(await plateau({ kind: 'hinge', hinge: formedLast })).toBe(Math.sign(view.hinges[k].theta));
    expect(Math.sign(view.hinges[k].theta)).toBe(-1);
  });
});
