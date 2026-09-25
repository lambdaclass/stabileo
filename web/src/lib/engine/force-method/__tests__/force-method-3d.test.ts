/**
 * The force method in space: the plane method's three checks, on space frames
 * with every support and release, and on every 3D example it can show.
 */
import { describe, it, expect } from 'vitest';
import { solveForceMethod3D } from '../solve-3d';
import { ForceMethodError } from '../solve';
import { stepByStepScope } from '../../step-by-step-scope';
import { historyStore, modelStore, uiStore } from '../../../store';
import type { SolverInput3D, SolverSupport3D } from '../../types-3d';

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
const q = (elementId: number, qZ: number) => ({ type: 'distributed' as const, data: { elementId, qYI: 0, qYJ: 0, qZI: qZ, qZJ: qZ } });

const CASES: Record<string, SolverInput3D> = {
  'space portal, fixed feet (GH 6)': model(PORTAL, PORTAL_EL(), [sup(1, '111111'), sup(5, '111111')], [P(3, 5, -3, -10, 1, 2, -1), q(2, -6)]),
  'one foot pinned': model(PORTAL, PORTAL_EL(), [sup(1, '111000'), sup(5, '111111')], [P(3, 5, -3, -10)]),
  'springs on all six components': model(PORTAL, PORTAL_EL(), [sup(1, '111111'), sup(5, '000000', { kx: 2e3, ky: 3e3, kz: 5e3, krx: 400, kry: 600, krz: 800 })], [P(4, 3, -2, -8, 1)]),
  'settlements and an imposed rotation': model(PORTAL, PORTAL_EL(), [sup(1, '111111', { dz: -0.004, dry: 0.001 }), sup(5, '111111', { dx: 0.002 })], [P(3, 0, 0, -5)]),
  'inclined support': model(PORTAL, PORTAL_EL(), [sup(1, '111111'), sup(5, '000111', { isInclined: true, normalX: 0.3, normalY: 0.2, normalZ: 1 })], [P(3, 4, 2, -10)]),
  'releases about each axis': model(PORTAL, [el(1, 1, 2, 'frame', { releaseMyEnd: true }), el(2, 2, 3, 'frame', { releaseMzStart: true }), el(3, 3, 4, 'frame', { releaseTStart: true }), el(4, 4, 5)], [sup(1, '111111'), sup(5, '111111')], [P(3, 3, -2, -10), q(2, -4)]),
  'a pin-ended member': model(PORTAL, [el(1, 1, 2), el(2, 2, 3, 'frame', { releaseMyStart: true, releaseMzStart: true, releaseMyEnd: true, releaseMzEnd: true }), el(3, 3, 4), el(4, 4, 5)], [sup(1, '111111'), sup(5, '111111')], [P(3, 3, -2, -10), q(2, -6)]),
  'truss bracing on a frame': model([...PORTAL, [6, 0, 2, 0]], [...PORTAL_EL(), el(5, 6, 2, 'truss'), el(6, 6, 4, 'truss')], [sup(1, '111111'), sup(5, '111111'), sup(6, '111111')], [P(3, 5, 5, -10)]),
  'temperature': model(PORTAL, PORTAL_EL(), [sup(1, '111111'), sup(5, '111111')], [{ type: 'thermal', data: { elementId: 2, dtUniform: 15, dtGradientY: 5, dtGradientZ: 8 } }]),
  'a closed ring on three legs (a loop to cut)': model(
    [[1, 0, 0, 3], [2, 4, 0, 3], [3, 4, 3, 3], [4, 0, 3, 3], [5, 0, 0, 0], [6, 4, 3, 0], [7, 4, 0, 0]],
    [el(1, 1, 2), el(2, 2, 3), el(3, 3, 4), el(4, 4, 1), el(5, 5, 1), el(6, 6, 3), el(7, 7, 2)],
    [sup(5, '111000'), sup(6, '111000'), sup(7, '111000')], [P(4, 0, 0, -20), q(3, -5)]),
};

const rel = (a: number, b: number, s: number) => Math.abs(a - b) / Math.max(s, 1e-30);

function expectCoherent(name: string, r: ReturnType<typeof solveForceMethod3D>) {
  expect(r.redundants.length).toBe(r.count.gh);
  const n = r.redundants.length;
  const sd = Math.max(...r.delta.flat().map(Math.abs), 1e-30);
  const s0 = Math.max(...r.delta0.map(Math.abs), 1e-30);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      expect(rel(r.delta[i][j], r.deltaCheck[i][j], sd), `${name} δ${i + 1}${j + 1}`).toBeLessThan(1e-9);
      expect(rel(r.delta[i][j], r.delta[j][i], sd), `${name} symmetric`).toBeLessThan(1e-9);
    }
    expect(rel(r.delta0[i], r.delta0Check[i], s0), `${name} δ${i + 1}0: ${r.delta0[i]} vs ${r.delta0Check[i]}`).toBeLessThan(1e-9);
  }
  expect(r.verification.maxForceDiff / r.verification.scale, `${name} forces`).toBeLessThan(1e-9);
  expect(r.verification.maxReactionDiff / r.verification.scale, `${name} reactions`).toBeLessThan(1e-9);
}

describe('3D: Mohr = displacements, Maxwell, and the stiffness method agrees', () => {
  for (const [name, input] of Object.entries(CASES)) {
    it(name, () => expectCoherent(name, solveForceMethod3D(input)));
  }

  it('a space portal with fixed feet has six redundants', () => {
    expect(solveForceMethod3D(CASES['space portal, fixed feet (GH 6)']).count.gh).toBe(6);
  });

  it('a closed ring is opened by a cut through one member', () => {
    const r = solveForceMethod3D(CASES['a closed ring on three legs (a loop to cut)']);
    expect(r.redundants.some((x) => x.kind.startsWith('cut'))).toBe(true);
  });

  it('a structure with a mechanism is refused, and the mechanism named', async () => {
    historyStore.clear(); uiStore.analysisMode = '3d'; modelStore.clear();
    await modelStore.loadExample('3d-space-truss');
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    try { solveForceMethod3D(input); expect.unreachable(); } catch (e) {
      expect(e).toBeInstanceOf(ForceMethodError);
      expect((e as ForceMethodError).dofs).toContain('v11');
    }
  });
});

/*
 * What each 3D example gets from the flexibility wizard, stated rather than
 * discovered: solved; refused because it carries a mechanism (named); or
 * refused because GH is past what can be followed by hand.
 */
const EXAMPLES_3D: Record<string, 'solved' | 'mechanism' | 'tooHyperstatic'> = {
  '3d-portal-frame': 'solved', '3d-cantilever-load': 'solved', '3d-torsion-beam': 'solved', 'torsion-tube': 'solved',
  'rc-beam-flexure': 'solved', 'rc-design-qa-8': 'solved', 'rc-design-qa-row2': 'solved',
  'hinged-arch-3d': 'mechanism',
  '3d-grid-slab': 'tooHyperstatic', '3d-tower': 'tooHyperstatic', '3d-building': 'tooHyperstatic',
  'rc-qa-diagnostic': 'tooHyperstatic', 'grid-beams': 'tooHyperstatic', 'tower-3d-2': 'tooHyperstatic',
  'tower-3d-4': 'tooHyperstatic', 'cable-stayed-bridge-small': 'tooHyperstatic', 'stadium-canopy': 'tooHyperstatic',
};

describe('every 3D example the wizard can show', () => {
  for (const [name, want] of Object.entries(EXAMPLES_3D)) {
    it(`${name}: ${want}`, async () => {
      historyStore.clear(); uiStore.analysisMode = '3d'; modelStore.clear();
      await modelStore.loadExample(name);
      const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
      expect(stepByStepScope(input, true).ok, `${name} is in scope`).toBe(true);
      if (want === 'solved') { expectCoherent(name, solveForceMethod3D(input)); return; }
      try { solveForceMethod3D(input); expect.unreachable(); } catch (e) {
        expect(e).toBeInstanceOf(ForceMethodError);
        const err = e as ForceMethodError;
        if (want === 'mechanism') { expect(err.key).toBe('unstable'); expect(err.dofs.length).toBeGreaterThan(0); }
        else { expect(err.key).toBe('tooHyperstatic'); expect(err.gh).toBeGreaterThan(30); }
      }
    }, 60_000);
  }
});
