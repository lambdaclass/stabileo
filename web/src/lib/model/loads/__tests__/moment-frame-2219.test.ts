import { beforeAll, expect, it } from 'vitest';
import { initSolver, solve3D, solvePDelta3D, solveCorotational3D } from '../../../engine/wasm-solver';
import { buildSolverInput2D, buildSolverInput3D, loadRefusal, memberRef3D } from '../../../engine/solver-service';
import { distributedGlobalMoments } from '../../../engine/member-loads';
import { evaluateDiagramAt } from '../../../engine/diagrams-3d';
import { reframedDistributed } from '../load-frame';
import { modelStore, type DistributedLoad3D } from '../../../store/model.svelte';
import { uiStore } from '../../../store/ui.svelte';
import { setMemberLoadFrame } from '../../../store/load-ops';
import '../../../store/index';

beforeAll(async () => { await initSolver(); });

const regression = it.skip;

for (const leftHand of [false, true]) for (const frame of ['global', 'local', 'projected'] as const) {
  regression(`known wrong result: #2219 axial density components leftHand=${leftHand} frame=${frame}`, () => {
    const axes = { ex: [0, 1, 0] as [number, number, number], ey: [-1, 0, 0] as [number, number, number], ez: [0, 0, 1] as [number, number, number], L: 6 };
    const d = { elementId: 1, frame, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, moments: { x: [1, 2, 3], y: [4, 5, 6], z: [7, 8, 9] } } satisfies Omit<DistributedLoad3D, 'id'>;
    const sign = leftHand ? -1 : 1;
    const expected = frame === 'local' ? { x: [-4, -5, -6], y: [sign, 2 * sign, 3 * sign], z: [7 * sign, 8 * sign, 9 * sign] }
      : frame === 'projected' ? { ...d.moments, y: [0, 0, 0] } : d.moments;
    expect(distributedGlobalMoments(d, axes, leftHand)).toEqual(expected);
    const global = reframedDistributed(d, axes, 'global', leftHand);
    expect(global.moments).toEqual(expected);
    const local = reframedDistributed({ ...d, ...global }, axes, 'local', leftHand);
    expect(local.moments).toEqual({ x: expected.y.map(v => sign * v || 0), y: expected.x.map(v => -v || 0), z: expected.z.map(v => sign * v || 0) });
    expect(distributedGlobalMoments({ ...d, ...local }, axes, leftHand)).toEqual(expected);
  });
}

for (const initialFrame of ['local', 'global'] as const) for (const leftHand of [false, true]) for (const axis of ['x', 'y', 'z', 'none'] as const) for (const segments of [2, 4]) for (const angle of [0, 0.37]) for (const mirror of [1, -1]) {
  regression(`known wrong result: #2219 member hand solution initialFrame=${initialFrame} leftHand=${leftHand} axis=${axis} segments=${segments} angle=${angle} mirror=${mirror}`, () => {
    modelStore.clear();
    uiStore.analysisMode = '3d';
    uiStore.viewportPresentation3D = 'native3d';
    uiStore.axisConvention3D = leftHand ? 'leftHand' : 'rightHand';
    const c = mirror * Math.cos(angle), s = mirror * Math.sin(angle), L = 6, density = 0.002;
    const materialId = modelStore.addMaterial({ name: 'hand', e: 1e6, nu: 0, rho: 0 });
    const sectionId = modelStore.addSection({ name: 'hand', a: 0.1, iy: 0.001, iz: 0.001, j: 0.002 });
    const nodes = Array.from({ length: segments + 1 }, (_, k) => modelStore.addNode(c * L * k / segments, s * L * k / segments, 3));
    modelStore.addSupport(nodes[0]!, 'fixed3d');
    modelStore.addSupport(nodes.at(-1)!, 'fixed3d');
    const ids: number[] = [];
    for (let k = 0; k < segments; k++) {
      const elementId = modelStore.addElement(nodes[k]!, nodes[k + 1]!);
      modelStore.updateElement(elementId, { materialId, sectionId });
      const globalVector = axis === 'x' ? [c * density, s * density, 0] : axis === 'y' ? [-s * density, c * density, 0] : axis === 'z' ? [0, 0, density] : [0, 0, 0];
      const vector = initialFrame === 'global' ? globalVector : ['x', 'y', 'z'].map(component => component === axis ? density * (leftHand && component !== 'y' ? -1 : 1) : 0);
      ids.push(modelStore.addDistributedLoad3D(elementId, 0, 0, -1, -1, undefined, undefined, undefined, {
        frame: initialFrame, moments: { x: [vector[0]!, vector[0]!, vector[0]!], y: [vector[1]!, vector[1]!, vector[1]!], z: [vector[2]!, vector[2]!, vector[2]!] },
      }));
    }
    for (const frame of [initialFrame, 'local', 'global', 'local'] as const) {
      for (const id of ids) setMemberLoadFrame(id, frame);
      const input = buildSolverInput3D(modelStore.model, false, leftHand)!;
      const solvers = [solve3D, (i: typeof input) => solvePDelta3D(i, 100, 1e-10).results];
      if (axis === 'x') solvers.push(i => solveCorotational3D({ ...i, loads: i.loads.map(l => l.type === 'distributed' ? { ...l, data: { ...l.data, qZI: 0, qZJ: 0 } } : l) }, 100, 1e-10, 4).results);
      for (const [solverIndex, solve] of solvers.entries()) {
        const result = solve(input);
        for (const ef of result.elementForces) {
          const element = modelStore.elements.get(ef.elementId)!;
          const start = modelStore.nodes.get(element.nodeI)!;
          const offset = start.x * c + start.y * s;
          for (const t of [0, 0.25, 0.5, 0.75, 1]) {
            const x = offset + t * L / segments;
            expect(evaluateDiagramAt(ef, 'torsion', t), `frame=${frame} solver=${solverIndex} element=${ef.elementId} t=${t}`).toBeCloseTo(axis === 'x' ? density * (x - L / 2) : 0, 8);
            expect(evaluateDiagramAt(ef, 'shearZ', t), `frame=${frame} solver=${solverIndex} element=${ef.elementId} t=${t}`).toBeCloseTo(solverIndex === 2 ? 0 : L / 2 - x - (axis === 'y' ? density : 0), 8);
            expect(evaluateDiagramAt(ef, 'momentY', t), `frame=${frame} solver=${solverIndex} element=${ef.elementId} t=${t}`).toBeCloseTo(solverIndex === 2 ? 0 : -L * L / 12 + L * x / 2 - x * x / 2, 8);
            expect(evaluateDiagramAt(ef, 'shearY', t), `frame=${frame} solver=${solverIndex} element=${ef.elementId} t=${t}`).toBeCloseTo(axis === 'z' ? density : 0, 8);
            expect(evaluateDiagramAt(ef, 'momentZ', t), `frame=${frame} solver=${solverIndex} element=${ef.elementId} t=${t}`).toBeCloseTo(0, 8);
          }
        }
        const middle = result.displacements.find(d => d.nodeId === nodes[segments / 2])!;
        expect(middle.uz).toBeCloseTo(solverIndex === 2 ? 0 : -(L ** 4) / (384 * 1e9 * 0.001), 10);
        expect(middle.rx * c + middle.ry * s).toBeCloseTo(axis === 'x' ? density * L * L / (8 * 0.5e9 * 0.002) : 0, 10);
        expect(middle.ux * -s + middle.uy * c).toBeCloseTo(0, 10);
      }
      for (const l of modelStore.loads) {
        if (l.type !== 'distributed3d') throw new Error('Expected member density');
        const axes = memberRef3D(modelStore.model, l.data.elementId, false)!.axes;
        const local = reframedDistributed(l.data, axes, 'local', leftHand).moments!;
        for (const component of ['x', 'y', 'z'] as const) for (const value of local[component]) expect(value).toBeCloseTo(component === axis ? density * (leftHand && component !== 'y' ? -1 : 1) : 0, 12);
      }
    }
  });
}

regression('known wrong result: #2219 plane input refuses a nonzero axial density and accepts force only', () => {
  modelStore.clear();
  uiStore.analysisMode = '2d';
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0), e = modelStore.addElement(a, b);
  modelStore.addSupport(a, 'fixed');
  const id = modelStore.addDistributedLoad3D(e, 0, 0, -1, -1, undefined, undefined, undefined, { moments: { x: [1, 1, 1], y: [0, 0, 0], z: [0, 0, 0] } });
  try { buildSolverInput2D(modelStore.model); throw new Error('Accepted spatial moments'); } catch (e) { expect(loadRefusal(e)).toContain('spatial'); }
  modelStore.model.loads = modelStore.loads.filter(l => l.data.id !== id);
  modelStore.addDistributedLoad(e, -1);
  expect(buildSolverInput2D(modelStore.model)).not.toBeNull();
});
