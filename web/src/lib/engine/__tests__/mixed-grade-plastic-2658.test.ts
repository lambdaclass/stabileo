import { describe, expect, it } from 'vitest';
import { modelStore, resultsStore, uiStore, historyStore } from '../../store';
import { centerlineInput } from '../../store/dynamic-input';
import { plasticCourse } from '../../store/plastic-course.svelte';
import { runPlasticCollapse } from '../../actions/plastic';
import { mpOfContext } from '../steps/plastic-common';
import { certifyJobOf } from '../certify-tags';
import { plasticModulus, plasticModulusWeak, plasticInput3D } from '../plastic-moments';
import { plasticForSolve, pushoverNonSteel } from '../advanced-analyses';
import { solvePlastic3D } from '../wasm-solver';
import { knownIssueResultDisposition } from '../known-issues';

function cantilevers(mode: '2d' | 'pro', idleFy: number, weak = false, modified = false) {
  historyStore.clear();
  uiStore.analysisMode = mode;
  uiStore.includeSelfWeight = false;
  modelStore.clear();
  const root = modelStore.addNode(0, 0, 3);
  const opposite = modelStore.addNode(-4, 0, 3);
  const tip = modelStore.addNode(4, 0, 3);
  const idle = modelStore.addElement(root, opposite, 'frame');
  const loaded = modelStore.addElement(root, tip, 'frame');
  const steel = (fy: number) => modelStore.addMaterial({ name: `S${fy}`, e: 200000, nu: 0.3, rho: 78.5, fy, fu: 510 });
  modelStore.updateElementMaterial(idle, steel(idleFy));
  modelStore.updateElementMaterial(loaded, steel(235));
  if (modified) {
    const el = modelStore.elements.get(loaded)!;
    modelStore.elements.set(loaded, { ...el, stiffness: { iy: 0.5, iz: 0.5 } });
  }
  if (mode === 'pro') {
    modelStore.addSupport(root, 'fixed3d');
    modelStore.addNodalLoad3D(tip, 0, weak ? -10 : 0, weak ? 0 : -10, 0, 0, 0);
  } else {
    modelStore.addSupport(root, 'fixed');
    modelStore.addNodalLoad(tip, 0, -10);
  }
  const section = modelStore.sections.get(modelStore.elements.get(loaded)!.sectionId)!;
  const zp = (weak ? plasticModulusWeak : plasticModulus)(section).zp;
  return { loaded, idle, mp: 235 * 1000 * zp, idleMp: idleFy * 1000 * zp };
}

describe('#2658 member plastic capacity', () => {
  it.each([355, 235])('uses each cantilever’s material in Basic, teaching, history and certificate with unloaded grade %s', idleFy => {
    const { loaded, idle, mp, idleMp } = cantilevers('2d', idleFy);
    const input = modelStore.buildSolverInput(false)!;
    const run = runPlasticCollapse()!;
    expect.soft(run.result.isMechanism).toBe(true);
    expect.soft(run.result.collapseFactor).toBeCloseTo(mp / (10 * 4), 9);
    expect.soft(run.result.steps[0].loadFactor).toBeCloseTo(mp / (10 * 4), 9);
    const lookup = mpOfContext({ input } as Parameters<typeof mpOfContext>[0]);
    resultsStore.setPlasticResult(run.result);
    const job = certifyJobOf(run.result)!;
    expect(job.name).toBe('certify_plastic_2d');
    const wire = JSON.parse(String(job.args[0]));
    for (const [id, expected] of [[loaded, mp], [idle, idleMp]]) {
      expect.soft(lookup(id)).toBeCloseTo(expected, 9);
      expect.soft(plasticCourse.mpOf(id)).toBeCloseTo(expected, 9);
      expect.soft(wire.mpOverrides[wire.solver.elements[id].sectionId]).toBeCloseTo(expected, 9);
      expect.soft(wire.sections[wire.solver.elements[id].sectionId].materialId).toBe(wire.solver.elements[id].materialId);
    }
  });

  it.each([[355, false, false], [355, true, false], [355, false, true], [235, false, false]] as const)(
    'solves Pro through WASM with unloaded grade %s, weak axis %s, modified stiffness %s', (idleFy, weak, modified) => {
      const { mp, loaded } = cantilevers('pro', idleFy, weak, modified);
      expect(pushoverNonSteel(modelStore.elements.values(), modelStore.materials as never)).toEqual([]);
      const solver = centerlineInput({ caseDisplacements: false });
      const p = plasticForSolve(plasticInput3D(modelStore.sections, modelStore.materials, modelStore.elements), solver);
      const r = solvePlastic3D({ ...p, maxHinges: 20 });
      expect(knownIssueResultDisposition(r).refused).toBe(false);
      expect(r.isMechanism).toBe(true);
      expect(r.hinges[0].elementId).toBe(loaded);
      expect(r.collapseFactor).toBeCloseTo(mp / (10 * 4), 4);
    },
  );
});
