import { beforeEach, expect, it } from 'vitest';
import { computeDiagramValueAt } from '../../engine/diagrams';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import { validateAndSolve3D } from '../../engine/solver-service';
import { modelStore, uiStore } from '..';

const issue2411 = process.env.RUN_KNOWN_WRONG === '2411' ? it : it.skip;
const legacyMoment = 5;
const position = 1;
const length = 2;
const before = (position - 1e-6) / length;
const after = (position + 1e-6) / length;
const loadId = 1;

beforeEach(() => {
  uiStore.analysisMode = '3d';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
  modelStore.clear();
});

function cantilever(mode: '2d' | '3d') {
  uiStore.analysisMode = mode;
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(length, 0, 0);
  const member = modelStore.addElement(root, tip);
  modelStore.addSupportEntry({ nodeId: root, type: mode === '2d' ? 'fixed' : 'fixed3d' });
  return member;
}

function restorePointCouple(member: number, moments: { my?: number; mz?: number }) {
  modelStore.restore({
    ...modelStore.snapshot(),
    loads: [{ type: 'pointOnElement', data: { id: loadId, elementId: member, a: position, p: 0, ...moments } }],
  });
}

function momentJump(mode: '2d' | '3d', member: number) {
  if (mode === '2d') {
    const result = modelStore.solve();
    if (!result || typeof result === 'string') throw new Error(String(result));
    const forces = result.elementForces.find(f => f.elementId === member)!;
    return Math.abs(computeDiagramValueAt('moment', after, forces) - computeDiagramValueAt('moment', before, forces));
  }
  const result = validateAndSolve3D(modelStore.model);
  if (!result || typeof result === 'string') throw new Error(String(result));
  const forces = result.elementForces.find(f => f.elementId === member)!;
  return Math.abs(evaluateDiagramAt(forces, 'momentZ', after) - evaluateDiagramAt(forces, 'momentZ', before));
}

for (const mode of ['2d', '3d'] as const) {
  issue2411(`known wrong result: #2411 clears a restored legacy planar point couple (${mode})`, () => {
    const member = cantilever(mode);
    restorePointCouple(member, { mz: legacyMoment });
    expect(modelStore.updateLoad(loadId, { my: 0 })).toBe(true);
    expect(momentJump(mode, member)).toBeCloseTo(0, 4);
  });

  issue2411(`known wrong result: #2411 replaces a restored legacy planar point couple (${mode})`, () => {
    const member = cantilever(mode);
    restorePointCouple(member, { mz: legacyMoment });
    expect(modelStore.updateLoad(loadId, { my: 3 })).toBe(true);
    expect(momentJump(mode, member)).toBeCloseTo(3, 4);
  });

  it(`#2411 edits a restored canonical planar point couple (${mode})`, () => {
    const member = cantilever(mode);
    restorePointCouple(member, { my: legacyMoment });
    expect(modelStore.updateLoad(loadId, { my: 3 })).toBe(true);
    expect(momentJump(mode, member)).toBeCloseTo(3, 4);
    expect(modelStore.updateLoad(loadId, { my: 0 })).toBe(true);
    expect(momentJump(mode, member)).toBeCloseTo(0, 4);
  });
}
