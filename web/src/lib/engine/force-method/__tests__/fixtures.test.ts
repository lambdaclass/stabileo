/**
 * Both step-by-step wizards on every 2D example the app ships.
 *
 * The hand-built models in the other tests each touch one feature. These are
 * the structures a student actually opens from the examples menu, loaded the
 * way the menu loads them and turned into solver input the way an analysis
 * is. On each:
 *
 *   · the stiffness wizard must reproduce the analysis solver's displacements;
 *   · the flexibility wizard must reproduce the stiffness method's answer,
 *     with every coefficient agreeing between its two routes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../../store';
import { solveDetailed } from '../../solver-detailed';
import { solve } from '../../wasm-solver';
import { solveForceMethod, ForceMethodError } from '../solve';

const EXAMPLES = [
  'simply-supported', 'cantilever', 'cantilever-point', 'continuous-beam', 'portal-frame',
  'two-story-frame', 'multi-section-frame', 'color-map-demo', 'truss', 'warren-truss', 'howe-truss',
  'point-loads', 'spring-support', 'thermal', 'settlement', 'three-hinge-arch', 'gerber-beam',
  'frame-cirsoc-dl', 'building-3story-dlw', 'frame-seismic',
];

async function inputFor(name: string) {
  historyStore.clear();
  uiStore.analysisMode = '2d';
  modelStore.clear();
  await modelStore.loadExample(name);
  return modelStore.buildSolverInput(false)!;
}

describe('every 2D example', () => {
  beforeEach(() => { uiStore.analysisMode = '2d'; });

  for (const name of EXAMPLES) {
    it(`${name}: stiffness wizard = analysis solver, flexibility wizard = stiffness`, async () => {
      const input = await inputFor(name);
      expect(input, 'the example builds solver input').toBeTruthy();

      const ref = solve(input);
      const det = solveDetailed(input);
      const scale = Math.max(1e-12, ...ref.displacements.flatMap((d) => [Math.abs(d.ux), Math.abs(d.uz)]));
      for (const d of ref.displacements) {
        const ux = det.dofNumbering.dofs.find((q) => q.nodeId === d.nodeId && q.localDof === 0);
        const uz = det.dofNumbering.dofs.find((q) => q.nodeId === d.nodeId && q.localDof === 1);
        if (ux) expect(Math.abs(det.uAll[ux.globalIndex] - d.ux) / scale, `${name} ux@${d.nodeId}`).toBeLessThan(1e-8);
        if (uz) expect(Math.abs(det.uAll[uz.globalIndex] - d.uz) / scale, `${name} uz@${d.nodeId}`).toBeLessThan(1e-8);
      }

      const r = solveForceMethod(input);
      expect(r.redundants.length).toBe(r.count.gh);
      const n = r.redundants.length;
      const sd = Math.max(1e-30, ...r.delta.flat().map(Math.abs));
      const s0 = Math.max(1e-30, ...r.delta0.map(Math.abs));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          expect(Math.abs(r.delta[i][j] - r.deltaCheck[i][j]) / sd, `${name} δ${i + 1}${j + 1}`).toBeLessThan(1e-9);
        }
        expect(Math.abs(r.delta0[i] - r.delta0Check[i]) / s0, `${name} δ${i + 1}0`).toBeLessThan(1e-9);
      }
      expect(r.verification.ok, `${name}: ${r.verification.maxForceDiff} / ${r.verification.scale}`).toBe(true);
    });
  }

  it('the hidden mechanism is refused, not solved', async () => {
    const input = await inputFor('hidden-mechanism');
    expect(() => solveForceMethod(input)).toThrow(ForceMethodError);
  });
});
