/**
 * The cracked torsional stiffness of concrete beams (`AnalysisSettings.beamTorsion`).
 *
 * Beam A runs along x from (0,0) to (4,0) at +3, fixed at both ends; beam B leaves A's midpoint
 * along y to (2,3), on a column fixed at its foot, and carries 20 kN/m. B's end moment on A is
 * compatibility torsion: it is there only because A resists twisting. With J × 0,2 on the
 * concrete beams, A twists more and takes less than half of it.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import '../../store';
import * as wasmSolver from '../wasm-solver';
import { validateAndSolve3D } from '../solver-service';
import { beamTorsionFactor, solveStiffnessFactors } from '../member-behaviour';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasmSolver.isSolverReady()).toBe(true); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

function build() {
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25 } as never);
  const sec = modelStore.addSection({ name: '30×50', a: 0.15, iy: 0.003125, iz: 0.001125, j: 0.00281, b: 0.3, h: 0.5, shape: 'rect' } as never);
  const n = [modelStore.addNode(0, 0, 3), modelStore.addNode(2, 0, 3), modelStore.addNode(4, 0, 3), modelStore.addNode(2, 3, 3), modelStore.addNode(2, 3, 0)];
  const a1 = modelStore.addElement(n[0]!, n[1]!, 'frame'), a2 = modelStore.addElement(n[1]!, n[2]!, 'frame'), b = modelStore.addElement(n[1]!, n[3]!, 'frame');
  const col = modelStore.addElement(n[4]!, n[3]!, 'frame');
  for (const e of [a1, a2, b, col]) modelStore.updateElement(e, { materialId: conc, sectionId: sec } as never);
  for (const k of [0, 2, 4]) modelStore.addSupport(n[k]!, 'fixed3d' as never);
  modelStore.addDistributedLoad3D(b, 0, 0, -20, -20, undefined, undefined, undefined, { frame: 'global' });
  return { a1, b, col };
}
const md = () => ({
  nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports, loads: modelStore.loads,
  materials: modelStore.materials, sections: modelStore.sections, quads: modelStore.quads, plates: modelStore.plates,
  constraints: modelStore.constraints, connectors: modelStore.connectors, analysis: modelStore.analysis,
});
const torque = (id: number) => {
  const r = validateAndSolve3D(md() as never, false, false);
  if (!r || typeof r === 'string') throw new Error(String(r));
  const f = r.elementForces.find((x) => x.elementId === id)!;
  return Math.abs(f.mxStart);
};

describe('the cracked torsional stiffness of concrete beams', () => {
  it('reaches level concrete frames only, and not one that sets its own J', () => {
    const { a1, col } = build();
    modelStore.setAnalysis({ beamTorsion: 0.2 });
    expect(beamTorsionFactor(md() as never, a1)).toBe(0.2);
    expect(beamTorsionFactor(md() as never, col)).toBe(1);
    modelStore.updateElement(a1, { stiffness: { j: 0.5 } } as never);
    expect(solveStiffnessFactors(md() as never, a1).j).toBe(0.5);
  });

  it('sheds compatibility torsion from the beam in the analysis', () => {
    const { a1 } = build();
    const full = torque(a1);
    modelStore.setAnalysis({ beamTorsion: 0.2 });
    const cracked = torque(a1);
    expect(full).toBeGreaterThan(1);
    expect(cracked).toBeLessThan(0.5 * full);
  });
});
