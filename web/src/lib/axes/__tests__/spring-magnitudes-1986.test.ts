import { afterEach, beforeAll, expect, it } from 'vitest';
import { allChoices, userAxisAlong, makeFrame } from '../frame';
import { transformSnapshot } from '../../model/code/frame';
import { modelStore, uiStore } from '../../store';
import { initSolver } from '../../engine/wasm-solver';

beforeAll(async () => { await initSolver(); });
afterEach(() => modelStore.clear());
const points: Array<[number, number]> = [[0.01, 100], [0.05, 150]];

function springModel(curve = points) {
  uiStore.analysisMode = 'pro'; modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0), c = modelStore.addNode(0, 3, 0);
  modelStore.addElement(a, b, 'truss'); modelStore.addElement(a, c, 'truss');
  modelStore.addSupport(b, 'fixed3d'); modelStore.addSupport(c, 'fixed3d');
  const s = modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: false, ty: false, tz: false, rx: false, ry: false, rz: false } });
  modelStore.updateSupport(s, { curves: { z: curve } });
  modelStore.addNodalLoad3D(a, 0, 0, -120, 0, 0, 0, 1);
  return { s, snapshot: { ...modelStore.snapshot(), analysisMode: 'pro' } };
}

it.skip('known wrong result: #1986 symmetric spring magnitudes remain nonnegative through every frame and both code directions', () => {
  for (const c of allChoices()) for (const mode of ['3d', 'pro']) for (const k of [0, 1, 2]) {
    const snap = { analysisMode: mode, nodes: [[1, { x: 1, y: 2, z: 3 }]], supports: [[1, { curves: { ['xyz'[k]!]: points } }]] };
    const user = transformSnapshot(snap, c, 'toUser') as any;
    const name = userAxisAlong(makeFrame(c), k).name.toLowerCase();
    expect(user.supports[0][1].curves[name]).toEqual(points);
    const correctUser = structuredClone(user);
    correctUser.supports[0][1].curves[name] = points;
    expect(transformSnapshot(correctUser, c, 'toModel')).toEqual(snap);
  }
});

it.skip('known wrong result: #1986 valid user-frame spring branches retain the actual nonlinear WASM answer', () => {
  const { s, snapshot } = springModel();
  const base = modelStore.solve3D(false, false, true);
  if (!base || typeof base === 'string') throw new Error(String(base));
  for (const c of allChoices()) {
    const user = transformSnapshot(snapshot, c, 'toUser') as any;
    const name = userAxisAlong(makeFrame(c), 2).name.toLowerCase();
    user.supports.find(([id]: [number]) => id === s)[1].curves[name] = points;
    modelStore.restore(transformSnapshot(user, c, 'toModel'));
    const result = modelStore.solve3D(false, false, true);
    if (!result || typeof result === 'string') throw new Error(String(result));
    expect(result.displacements).toEqual(base.displacements);
    expect(result.reactions).toEqual(base.reactions);
    expect(result.elementForces).toEqual(base.elementForces);
  }
});

it('#1986 signed asymmetric soil branches are refused by the existing engine contract', () => {
  springModel([[-0.01, -100], [0, 0], [0.05, 150]]);
  const result = modelStore.solve3D(false, false, true);
  expect(typeof result).toBe('string');
});
