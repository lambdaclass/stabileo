import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../../store';
import { isSolverReady } from '../../../wasm-solver';
import { methodContext } from '../../../../store/explained-steps.svelte';
import '../../../../course/course-route';
import { setDynamicsSettings, resetDynamicsSettings } from '../../../dynamics/course/settings';
import { resolveMdof } from '../mdof-build';
import { buildMdof, superpositionPlotOf } from '../mdof-doc';

const quiet: Array<ReturnType<typeof vi.spyOn>> = [];
beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(isSolverReady()).toBe(true);
  for (const k of ['log', 'warn', 'info'] as const) quiet.push(vi.spyOn(console, k).mockImplementation(() => {}));
});
afterAll(() => { quiet.forEach((s) => s.mockRestore()); });
beforeEach(() => resetDynamicsSettings());

function pinnedBeamWithEndCouple() {
  uiStore.analysisMode = '2d';
  historyStore.clear();
  modelStore.clear();
  modelStore.batch(() => {
    const a = modelStore.addNode(0, 0);
    const b = modelStore.addNode(5, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned');
    modelStore.addSupport(b, 'pinned');
    modelStore.addNodalLoad(b, 0, 0, 10);
  });
}

describe('a model whose only free degrees of freedom are rotations', () => {
  for (const excitation of ['free', 'harmonic'] as const) {
    it(`${excitation}: a pinned–pinned beam with consistent mass and an end couple has its response at a rotation, drawn in rad`, () => {
      pinnedBeamWithEndCouple();
      setDynamicsSettings({ mdof: { source: 'model', excitation }, mass: { massModel: 'consistent', nPerMember: 1 } });
      const c = resolveMdof(methodContext('mdofModal')!);
      expect('refusal' in c ? c.refusal : null).toBeNull();
      if ('refusal' in c) return;
      expect(c.dofs.every((d) => d.dir === 'ry')).toBe(true);
      expect(c.dofs[c.at].dir).toBe('ry');
      expect(c.sol.modes[0].omega).toBeGreaterThan(0);
      const peak = Math.max(...c.modal.map((u) => Math.abs(u[c.at])));
      expect(peak).toBeGreaterThan(0);
      c.modal.forEach((u, i) => expect(Math.abs(u[c.at] - c.direct[i][c.at])).toBeLessThan(0.02 * peak));
      const plot = superpositionPlotOf(c, 'θ2');
      expect(JSON.stringify(plot)).toContain('(rad)');
      expect(JSON.stringify(plot)).not.toContain('(mm)');
      const total = plot.series.find((s) => !s.dashed)!;
      expect(Math.max(...total.points.map((p) => Math.abs(p[1])))).toBeCloseTo(peak, 12);
      const doc = buildMdof(methodContext('mdofModal')!);
      const table = doc.steps[doc.steps.length - 1].blocks.find((b) => b.kind === 'table');
      expect(JSON.stringify(table)).toContain('mdof.sup.modalColRad');
    });
  }
});
