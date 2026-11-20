import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { modelStore } from '../../store/model.svelte';
import { buildSolverInput3D } from '../../engine/solver-service';
import * as wasm from '../../engine/wasm-solver';
import type { AnalysisResults3D, SolverInput3D } from '../../engine/types-3d';
import { rowsOf } from '../../engine/result-tables';
import { axesStore } from '../axes.svelte';
import { allChoices, DEFAULT_AXES } from '../frame';
import { modelLoad3D, userRot, userVec, type UserComponent } from '../display';
import { nodeShown3D } from '../node-coords';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasm.isSolverReady(), 'real WASM solver required').toBe(true);
});
beforeEach(() => modelStore.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  axesStore.reset();
});

type V = [number, number, number];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const TYPED: Array<[number, UserComponent, number]> = [[2, 'fx', 7], [3, 'fy', -12], [3, 'fz', 5], [2, 'mz', 3], [3, 'mx', -4]];

function build() {
  modelStore.restore({
    nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 1, z: 4 }], [3, { id: 3, x: 6, y: 2, z: 4 }], [4, { id: 4, x: 6, y: 3, z: 0 }]],
    materials: [[1, { id: 1, name: 'M', e: 200000, nu: 0.3, rho: 0 }]],
    sections: [[1, { id: 1, name: 'S', a: 0.0054, iz: 8.4e-6, iy: 8.4e-5, j: 1e-6 }]],
    elements: [
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 }],
      [3, { id: 3, type: 'frame', nodeI: 4, nodeJ: 3, materialId: 1, sectionId: 1 }],
    ],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 4, type: 'fixed3d' }]],
    loads: [], loadCases: [{ id: 1, type: 'D', name: 'D' }], combinations: [],
    nextId: { node: 10, material: 10, section: 10, element: 10, support: 10, load: 1 },
  } as never);
  for (const [node, dir, v] of TYPED) {
    const m = modelLoad3D(dir, v);
    modelStore.addNodalLoad3D(node, m.fx, m.fy, m.fz, m.mx, m.my, m.mz, 1);
  }
}

function solveSecondOrder(input: SolverInput3D): AnalysisResults3D {
  const nonlinear = wasm.solvePDelta3D(input);
  expect(nonlinear.converged).toBe(true);
  expect(nonlinear.isStable).toBe(true);
  return nonlinear.results;
}

function expectEquilibrium(r: AnalysisResults3D, includeMoment: boolean) {
  const opts = { axes: axesStore.choice };
  const pos = (id: number) => nodeShown3D(modelStore.nodes.get(id)!, false) as V;
  let F: V = [0, 0, 0], M: V = [0, 0, 0];
  for (const [node, dir, v] of TYPED) {
    const u: V = [0, 0, 0];
    u['xyz'.indexOf(dir[1])] = v;
    if (dir[0] === 'f') { F = add(F, u); M = add(M, cross(pos(node), u)); } else M = add(M, u);
  }
  const reactions = rowsOf('reactions', r, opts);
  for (const row of reactions) {
    const f = row.values.slice(0, 3) as V, m = row.values.slice(3, 6) as V;
    F = add(F, f); M = add(M, add(m, cross(pos(row.entity), f)));
  }
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(F[i]), `ΣF${'xyz'[i]}`).toBeLessThan(1e-6);
    if (includeMoment) expect(Math.abs(M[i]), `ΣM${'xyz'[i]}`).toBeLessThan(1e-6);
  }
  for (const row of reactions) {
    const raw = r.reactions.find(x => x.nodeId === row.entity)!;
    expect(row.values).toEqual([...userVec(raw.fx, raw.fy, raw.fz), ...userRot(raw.mx, raw.my, raw.mz)]);
  }
  const d = rowsOf('displacements', r, opts).find(x => x.entity === 3)!;
  const raw = r.displacements.find(x => x.nodeId === 3)!;
  expect(d.values.slice(0, 3)).toEqual(userVec(raw.ux, raw.uy, raw.uz));
  expect(d.values.slice(3, 6)).toEqual(userRot(raw.rx, raw.ry, raw.rz));
}

describe.each(['production', 'test'] as const)('a model typed, solved and read back in the user axes (%s)', (mode) => {
  beforeEach(() => vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode(mode)));

  for (const choice of allChoices()) {
    for (const analysis of ['linear', 'P-Delta'] as const) {
      const check = analysis === 'linear' ? 'balances forces and moments' : 'balances forces and projects second-order moments';
      it(`#2364 ${check} in the user frame ${choice.up} ${choice.right} ${choice.hand} (${analysis})`, () => {
        axesStore.choice = choice;
        expect(axesStore.choice).toEqual(mode === 'production' ? DEFAULT_AXES : choice);
        build();
        const input = buildSolverInput3D({
          nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports, loads: modelStore.loads,
          materials: modelStore.materials, sections: modelStore.sections, quads: modelStore.quads, plates: modelStore.plates,
          constraints: modelStore.constraints, connectors: modelStore.connectors, analysis: modelStore.model.analysis, groups: modelStore.model.groups,
        } as never, false, false, { expandMemberOffsets: false })!;
        const r = analysis === 'linear' ? wasm.solve3D(input) : solveSecondOrder(input);
        expectEquilibrium(r, analysis === 'linear');
      });
    }
  }
});
