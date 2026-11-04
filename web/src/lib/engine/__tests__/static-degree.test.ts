/**
 * GH, counted the classic way, on the structures a course counts by hand,
 * and the same number wherever the app shows it.
 */
import { describe, it, expect } from 'vitest';
import { ghReport } from '../static-degree';
import { countIndeterminacy } from '../force-method/primary';
import { staticClassificationBlocks } from '../steps/dsm-extras';
import type { SolverInput } from '../types';

type Sup = [number, string, Record<string, number>?];
type El = [number, number, number, 'frame' | 'truss', boolean?, boolean?];

function model(nodes: Array<[number, number, number]>, elements: El[], supports: Sup[]): SolverInput {
  return {
    nodes: new Map(nodes.map(([id, x, z]) => [id, { id, x, z }])),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map(elements.map(([id, nodeI, nodeJ, type, hs, he]) => [id, {
      id, type, nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: !!hs, hingeEnd: !!he,
    }])),
    supports: new Map(supports.map(([nodeId, type, extra], k) => [k + 1, { id: k + 1, nodeId, type: type as never, ...extra }])),
    loads: [],
  } as unknown as SolverInput;
}

const CASES: Array<{ name: string; input: SolverInput; gh: number; ext: number; int: number; subst: string }> = [
  {
    name: 'propped cantilever', gh: 1, ext: 1, int: 0, subst: 'GH = 3×1 + 4 − 3×2 − 0',
    input: model([[1, 0, 0], [2, 6, 0]], [[1, 1, 2, 'frame']], [[1, 'fixed'], [2, 'rollerX']]),
  },
  {
    name: 'two-span continuous beam', gh: 1, ext: 1, int: 0, subst: 'GH = 3×2 + 4 − 3×3 − 0',
    input: model([[1, 0, 0], [2, 5, 0], [3, 10, 0]], [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']], [[1, 'pinned'], [2, 'rollerX'], [3, 'rollerX']]),
  },
  {
    name: 'portal frame on fixed feet', gh: 3, ext: 3, int: 0, subst: 'GH = 3×3 + 6 − 3×4 − 0',
    input: model([[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]], [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame']], [[1, 'fixed'], [4, 'fixed']]),
  },
  {
    name: 'closed frame on two supports', gh: 3, ext: 0, int: 3, subst: 'GH = 3×4 + 3 − 3×4 − 0',
    input: model([[1, 0, 0], [2, 4, 0], [3, 4, 3], [4, 0, 3]], [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame'], [4, 4, 1, 'frame']], [[1, 'pinned'], [2, 'rollerX']]),
  },
  {
    name: 'closed frame with a hinge', gh: 2, ext: 0, int: 2, subst: 'GH = 3×4 + 3 − 3×4 − 1',
    input: model([[1, 0, 0], [2, 4, 0], [3, 4, 3], [4, 0, 3]], [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame', false, true], [4, 4, 1, 'frame']], [[1, 'pinned'], [2, 'rollerX']]),
  },
  {
    name: 'three-hinged arch', gh: 0, ext: 0, int: 0, subst: 'GH = 3×2 + 4 − 3×3 − 1',
    input: model([[1, 0, 0], [2, 4, 3], [3, 8, 0]], [[1, 1, 2, 'frame', false, true], [2, 2, 3, 'frame']], [[1, 'pinned'], [3, 'pinned']]),
  },
  {
    name: 'Gerber beam on four supports', gh: 1, ext: 1, int: 0, subst: 'GH = 3×3 + 5 − 3×4 − 1',
    input: model([[1, 0, 0], [2, 4, 0], [3, 8, 0], [4, 12, 0]], [[1, 1, 2, 'frame'], [2, 2, 3, 'frame', false, true], [3, 3, 4, 'frame']], [[1, 'pinned'], [2, 'rollerX'], [3, 'rollerX'], [4, 'rollerX']]),
  },
  {
    name: 'truss with both diagonals', gh: 1, ext: 0, int: 1, subst: 'GH = 6 + 3 − 2×4',
    input: model([[1, 0, 0], [2, 4, 0], [3, 4, 3], [4, 0, 3]], [[1, 1, 2, 'truss'], [2, 2, 3, 'truss'], [3, 3, 4, 'truss'], [4, 4, 1, 'truss'], [5, 1, 3, 'truss'], [6, 2, 4, 'truss']], [[1, 'pinned'], [2, 'rollerX']]),
  },
  {
    name: 'king-post beam (mixed: a node only bielas reach takes two equations)', gh: 1, ext: 0, int: 1, subst: 'GH = 3×2 + 3 + 3 − 3×3 − 2×1 − 0',
    input: model([[1, 0, 0], [2, 4, 0], [3, 8, 0], [4, 4, -1]], [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 1, 4, 'truss'], [4, 4, 3, 'truss'], [5, 2, 4, 'truss']], [[1, 'pinned'], [3, 'rollerX']]),
  },
  {
    name: 'beam on a spring (the spring is a reaction)', gh: 1, ext: 1, int: 0, subst: 'GH = 3×1 + 4 − 3×2 − 0',
    input: model([[1, 0, 0], [2, 6, 0]], [[1, 1, 2, 'frame']], [[1, 'fixed'], [2, 'spring', { ky: 3000 }]]),
  },
  {
    name: 'three bars hinged at one node (k − 1 = 2 conditions)', gh: 1, ext: 1, int: 0, subst: 'GH = 3×3 + 6 − 3×4 − 2',
    input: model([[1, 0, 0], [2, 4, 0], [3, 8, 0], [4, 4, -3]], [[1, 1, 2, 'frame', false, true], [2, 2, 3, 'frame', true, false], [3, 4, 2, 'frame', false, true]], [[1, 'pinned'], [3, 'pinned'], [4, 'pinned']]),
  },
];

describe('GH by the classic formula', () => {
  for (const c of CASES) {
    it(`${c.name}: GH = ${c.gh} (external ${c.ext}, internal ${c.int})`, () => {
      const rep = ghReport(c.input, 0, { split: true });
      expect(rep.gh).toBe(c.gh);
      expect(rep.subst.text).toBe(c.subst);
      expect(rep.split).toMatchObject({ external: c.ext, internal: c.int });
      expect(countIndeterminacy(c.input).gh).toBe(c.gh);
      const calc = staticClassificationBlocks(c.input).find((b) => b.kind === 'calc');
      expect(calc && 'result' in calc ? calc.result : '').toContain(`GH = ${c.gh}`);
    });
  }

  it('classifies, and counts the hinge conditions per node', () => {
    const arch = ghReport(CASES[5].input);
    expect(arch.classification).toBe('isostatic');
    expect(arch.hinges).toEqual([{ nodeId: 2, k: 2, j: 1, c: 1, restrained: false }]);
    const three = ghReport(CASES[10].input);
    expect(three.hinges).toEqual([{ nodeId: 2, k: 3, j: 3, c: 2, restrained: false }]);
    expect(ghReport(CASES[9].input).springs).toBe(1);
    const mech = ghReport(model([[1, 0, 0], [2, 6, 0]], [[1, 1, 2, 'frame']], [[1, 'pinned']]));
    expect(mech.classification).toBe('hypostatic');
  });

  it('writes the formula of its kind', () => {
    expect(ghReport(CASES[0].input).formula.tex).toBe('GH = 3m + r - 3n - c');
    expect(ghReport(CASES[7].input).formula.tex).toBe('GH = m + r - 2n');
    expect(ghReport(CASES[8].input).formula.tex).toBe('GH = 3m + m_b + r - 3n - 2n_b - c');
  });
});
