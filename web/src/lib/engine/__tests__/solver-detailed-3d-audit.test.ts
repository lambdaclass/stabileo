/**
 * The 3D step-by-step solver: every support, every release, and every
 * example the app ships.
 *
 * Hand-built models, one feature at a time, against the analysis solver; then
 * each 3D example from the menu. An example the wizard cannot show honestly —
 * shells, constraints, connectors, or too many DOFs to print — must be refused
 * by `stepByStepScope`, not solved as something else.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { solve3D } from '../wasm-solver';
import { solveDetailed3D } from '../solver-detailed-3d';
import { stepByStepScope } from '../step-by-step-scope';
import { historyStore, modelStore, uiStore } from '../../store';
import type { SolverInput3D, SolverSupport3D } from '../types-3d';

type Rel = Partial<Record<'releaseMyStart' | 'releaseMyEnd' | 'releaseMzStart' | 'releaseMzEnd' | 'releaseTStart' | 'releaseTEnd', boolean>>;
const el = (id: number, i: number, j: number, type: 'frame' | 'truss' = 'frame', rel: Rel = {}) => ({
  id, type, nodeI: i, nodeJ: j, materialId: 1, sectionId: 1,
  releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false, ...rel,
});
const sup = (nodeId: number, flags: string, extra: Partial<SolverSupport3D> = {}): SolverSupport3D => ({
  nodeId, rx: flags[0] === '1', ry: flags[1] === '1', rz: flags[2] === '1',
  rrx: flags[3] === '1', rry: flags[4] === '1', rrz: flags[5] === '1', ...extra,
});
function model(nodes: Array<[number, number, number, number]>, elements: ReturnType<typeof el>[], supports: SolverSupport3D[], loads: SolverInput3D['loads']): SolverInput3D {
  return {
    nodes: new Map(nodes.map(([id, x, y, z]) => [id, { id, x, y, z }])),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 2e-4, j: 1.5e-4 }]]),
    elements: new Map(elements.map((e) => [e.id, e])),
    supports: new Map(supports.map((s, i) => [i, s])),
    loads,
  } as unknown as SolverInput3D;
}
const P = (nodeId: number, fx: number, fy: number, fz: number, mx = 0, my = 0, mz = 0) =>
  ({ type: 'nodal' as const, data: { nodeId, fx, fy, fz, mx, my, mz } });
const PORTAL: Array<[number, number, number, number]> = [[1, 0, 0, 0], [2, 0, 0, 3], [3, 4, 0, 3], [4, 4, 2, 3], [5, 4, 2, 0]];
const PORTAL_EL = () => [el(1, 1, 2), el(2, 2, 3), el(3, 3, 4), el(4, 4, 5)];

const CASES: Record<string, SolverInput3D> = {
  'fixed feet': model(PORTAL, PORTAL_EL(), [sup(1, '111111'), sup(5, '111111')], [P(3, 5, -3, -10, 1, 2, -1)]),
  'pinned feet (translations only)': model(PORTAL, PORTAL_EL(), [sup(1, '111000'), sup(5, '111111')], [P(3, 5, -3, -10)]),
  'a roller that holds only z': model(PORTAL, PORTAL_EL(), [sup(1, '111111'), sup(5, '001000')], [P(3, 2, 1, -10)]),
  'springs on all six components': model(PORTAL, PORTAL_EL(), [sup(1, '111111'), sup(5, '000000', { kx: 2e3, ky: 3e3, kz: 5e3, krx: 400, kry: 600, krz: 800 })], [P(4, 3, -2, -8, 1)]),
  'settlements and imposed rotations': model(PORTAL, PORTAL_EL(), [sup(1, '111111', { dz: -0.004, dry: 0.001 }), sup(5, '111111', { dx: 0.002 })], []),
  'inclined support': model(PORTAL, PORTAL_EL(), [sup(1, '111111'), sup(5, '000111', { isInclined: true, normalX: 0.3, normalY: 0.2, normalZ: 1 })], [P(3, 4, 2, -10)]),
  'My released at one start': model(PORTAL, [el(1, 1, 2), el(2, 2, 3, 'frame', { releaseMyStart: true }), el(3, 3, 4), el(4, 4, 5)], [sup(1, '111111'), sup(5, '111111')], [P(3, 3, -2, -10)]),
  'Mz released at one end': model(PORTAL, [el(1, 1, 2), el(2, 2, 3, 'frame', { releaseMzEnd: true }), el(3, 3, 4), el(4, 4, 5)], [sup(1, '111111'), sup(5, '111111')], [P(3, 3, -2, -10)]),
  'torsion released at both ends': model(PORTAL, [el(1, 1, 2), el(2, 2, 3, 'frame', { releaseTStart: true, releaseTEnd: true }), el(3, 3, 4), el(4, 4, 5)], [sup(1, '111111'), sup(5, '111111')], [P(3, 3, -2, -10, 2)]),
  'a pin-ended member (My and Mz, both ends)': model(PORTAL, [el(1, 1, 2), el(2, 2, 3, 'frame', { releaseMyStart: true, releaseMzStart: true, releaseMyEnd: true, releaseMzEnd: true }), el(3, 3, 4), el(4, 4, 5)], [sup(1, '111111'), sup(5, '111111')], [P(3, 3, -2, -10), { type: 'distributed', data: { elementId: 2, qYI: 0, qYJ: 0, qZI: -6, qZJ: -6 } }]),
  'beam ends pinned into a continuous column': model(PORTAL, [el(1, 1, 2), el(2, 2, 3, 'frame', { releaseMyStart: true, releaseMzStart: true, releaseTStart: true }), el(3, 3, 4), el(4, 4, 5)], [sup(1, '111111'), sup(5, '111111')], [P(2, 3, 2, -5), P(3, 0, 0, -8)]),
  'truss bars braced to a frame': model([...PORTAL, [6, 0, 2, 0]], [...PORTAL_EL(), el(5, 6, 2, 'truss'), el(6, 6, 4, 'truss')], [sup(1, '111111'), sup(5, '111111'), sup(6, '111111')], [P(3, 5, 5, -10)]),
  'thermal load, with a release': model(PORTAL, [el(1, 1, 2), el(2, 2, 3, 'frame', { releaseMzEnd: true }), el(3, 3, 4), el(4, 4, 5)], [sup(1, '111111'), sup(5, '111111')], [{ type: 'thermal', data: { elementId: 2, dtUniform: 15, dtGradientY: 5, dtGradientZ: 8 } }]),
};

function compare(name: string, input: SolverInput3D) {
  const r = solve3D(input) as never as { displacements: Array<Record<string, number>>; reactions: Array<Record<string, number>> };
  const d = solveDetailed3D(input);
  const keys = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  const frames = new Map((d.nodeFrames3D ?? []).map((f) => [f.nodeId, f.R]));
  const uAt = (nodeId: number, ld: number) => {
    const info = d.dofNumbering.dofs.find((q) => q.nodeId === nodeId && q.localDof === ld);
    return info ? d.uAll[info.globalIndex] : 0;
  };
  const global = (nodeId: number, ld: number) => {
    const R = frames.get(nodeId);
    if (!R || ld > 2) return uAt(nodeId, ld);
    return R[0][ld] * uAt(nodeId, 0) + R[1][ld] * uAt(nodeId, 1) + R[2][ld] * uAt(nodeId, 2);
  };
  const scale = (from: number) => Math.max(1e-12, ...r.displacements.flatMap((x) => keys.slice(from, from + 3).map((k) => Math.abs(x[k]))));
  for (const x of r.displacements) {
    keys.forEach((k, ld) => {
      if (!d.dofNumbering.dofs.some((q) => q.nodeId === x.nodeId && q.localDof === ld)) return;
      const got = global(x.nodeId, ld);
      expect(Math.abs(got - x[k]) / scale(ld < 3 ? 0 : 3), `${name}: ${k}@${x.nodeId} ${got} vs ${x[k]}`).toBeLessThan(1e-8);
    });
  }
  return d;
}

describe('3D wizard = 3D analysis solver, feature by feature', () => {
  for (const [name, input] of Object.entries(CASES)) {
    it(name, () => { compare(name, input); });
  }
});

/** Σ reactions + Σ nodal loads = 0, force and moment about the origin. */
function expectEquilibrium(input: SolverInput3D) {
  const d = solveDetailed3D(input);
  const tot = [0, 0, 0, 0, 0, 0];
  const add = (nodeId: number, f: number[]) => {
    const n = input.nodes.get(nodeId)!;
    tot[0] += f[0]; tot[1] += f[1]; tot[2] += f[2];
    tot[3] += f[3] + n.y * f[2] - n.z * f[1];
    tot[4] += f[4] + n.z * f[0] - n.x * f[2];
    tot[5] += f[5] + n.x * f[1] - n.y * f[0];
  };
  for (const l of input.loads) if (l.type === 'nodal') add(l.data.nodeId, [l.data.fx, l.data.fy, l.data.fz, l.data.mx, l.data.my, l.data.mz]);
  for (const q of d.dofNumbering.dofs.filter((x) => !x.isFree)) {
    const f = [0, 0, 0, 0, 0, 0];
    f[q.localDof] = d.reactionsRaw[q.globalIndex - d.dofNumbering.nFree];
    add(q.nodeId, f);
  }
  for (const v of tot) expect(Math.abs(v)).toBeLessThan(1e-8);
  return d;
}

describe('where the analysis solver refuses and the wizard does not', () => {
  /*
   * A node reached only by truss bars, in a model that also has frames, has
   * three rotations nothing resists. The analysis solver, fed these inputs
   * raw, reports the whole structure as a mechanism; it is not one. (The app
   * no longer feeds it raw: `buildSolverInput3D` adds the vanishing springs —
   * see orphan-rotations-3d.test.ts.) The wizard gives those rotations
   * the vanishing spring the analysis solver gives a fully hinged node, and
   * the answer is checked here by equilibrium, the one referee both accept.
   */
  it('a pinned node reached only by truss bars', () => {
    const input = model([...PORTAL, [6, 0, 2, 0]], [...PORTAL_EL(), el(5, 6, 2, 'truss'), el(6, 6, 4, 'truss')],
      [sup(1, '111111'), sup(5, '111111'), sup(6, '111000')], [P(3, 5, 5, -10)]);
    expect(() => solve3D(input)).toThrow();
    const d = expectEquilibrium(input);
    expect(d.nullModes).toEqual([]);
  });

  it('a node where every member releases both bending moments', () => {
    const input = model(PORTAL, [el(1, 1, 2, 'frame', { releaseMyEnd: true, releaseMzEnd: true }), el(2, 2, 3, 'frame', { releaseMyStart: true, releaseMzStart: true }), el(3, 3, 4), el(4, 4, 5)],
      [sup(1, '111111'), sup(5, '111111')], [P(2, 3, 2, -5)]);
    expect(() => solve3D(input)).toThrow();
    const d = expectEquilibrium(input);
    expect(d.nullModes).toEqual([]);
  });
});

describe('an infinitesimal mechanism the loads do not excite', () => {
  it('is solved, named, and its reactions are the analysis solver\'s', async () => {
    historyStore.clear(); uiStore.analysisMode = '3d'; modelStore.clear();
    await modelStore.loadExample('3d-space-truss');
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const d = expectEquilibrium(input);
    /* The top chord can sway in y without straining a bar: v11 … v18. */
    expect(d.nullModes).toEqual(expect.arrayContaining(['v11', 'v18']));
    /*
     * Displacements are NOT compared: the analysis solver returns a sway of
     * −0,43 mm along the mode with no lateral load at all — round-off,
     * amplified through a pivot of 7e-17. Reactions carry no mode, and those
     * must agree.
     */
    const r = solve3D(input) as never as { reactions: Array<Record<string, number>> };
    const keys = ['fx', 'fy', 'fz'];
    const scale = Math.max(...r.reactions.flatMap((x) => keys.map((k) => Math.abs(x[k]))));
    for (const x of r.reactions) {
      keys.forEach((k, ld) => {
        const q = d.dofNumbering.dofs.find((y) => y.nodeId === x.nodeId && y.localDof === ld && !y.isFree);
        if (!q) return;
        const got = d.reactionsRaw[q.globalIndex - d.dofNumbering.nFree];
        expect(Math.abs(got - x[k]) / scale, `${k}@${x.nodeId}`).toBeLessThan(1e-6);
      });
    }
  });
});

const EXAMPLES_3D = [
  '3d-portal-frame', '3d-space-truss', '3d-cantilever-load', '3d-grid-slab', '3d-tower', '3d-torsion-beam',
  'torsion-tube', 'rc-beam-flexure', '3d-nave-industrial', '3d-building', 'pro-edificio-7p', 'rc-qa-diagnostic',
  'rc-qa-diagnostic-shells', 'torre-irregular-con-retiros', 'rc-design-frame', 'rc-design-qa-8', 'rc-design-qa-row2',
  'pipe-rack', 'mat-foundation', 'cable-stayed-bridge', 'offshore-platform', 'geodesic-dome', 'space-frame',
  'grid-beams', 'tower-3d-2', 'tower-3d-4', 'hinged-arch-3d', 'cable-stayed-bridge-small', 'stadium-canopy',
];

describe('every 3D example: shown faithfully, or refused with a reason', () => {
  beforeEach(() => { uiStore.analysisMode = '3d'; });
  for (const name of EXAMPLES_3D) {
    it(name, async () => {
      historyStore.clear(); uiStore.analysisMode = '3d'; modelStore.clear();
      await modelStore.loadExample(name);
      const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
      const scope = stepByStepScope(input, true);
      if (!scope.ok) {
        expect(['shells', 'constraints', 'connectors', 'tooBig']).toContain(scope.reason);
        return;
      }
      /* The space truss's mechanism makes its displacements incomparable; see above. */
      if (name === '3d-space-truss') { expectEquilibrium(input); return; }
      compare(name, input);
    }, 60_000);
  }
});
