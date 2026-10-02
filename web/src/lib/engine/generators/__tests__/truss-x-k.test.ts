/**
 * The lattice girder's two webs, X and K, in the truss generator: the structures list's
 * "lattice girder" is covered by it, member for member.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_TRUSS_PARAMS, generateTruss, subdivisionApplies, validateTrussParams } from '../truss-topology';
import { generateStructure } from '../structures';

const count = (t: ReturnType<typeof generateTruss>, role: string) => t.members.filter((m) => m.role === role).length;

describe('X and K webs', () => {
  it('X: a post at every station and two crossing diagonals per panel', () => {
    const t = generateTruss({ kind: 'pratt', spanM: 12, depthM: 1.2, panelsPerHalf: 4, webPattern: 'x' });
    expect(count(t, 'post')).toBe(9);
    expect(count(t, 'diagonal')).toBe(16);
    expect(t.assumptions).toContain('generator.assume.xBracingUnconnected');
  });

  it('K: interior posts split at mid-height and continuous through it, two half-diagonals per panel', () => {
    const t = generateTruss({ kind: 'pratt', spanM: 12, depthM: 1.2, panelsPerHalf: 4, webPattern: 'k' });
    expect(count(t, 'post')).toBe(2 + 7 * 2);
    expect(count(t, 'diagonal')).toBe(8 * 2);
    expect(t.members.filter((m) => m.role === 'post' && m.type === 'frame')).toHaveLength(14);
    expect(t.nodes.filter((n) => Math.abs(n.z - 0.6) < 1e-9)).toHaveLength(7);
  });

  it("matches the structures list's lattice girder, member for member", () => {
    for (const bracing of ['x', 'k'] as const) {
      const old = generateStructure('latticeGirder', { span: 12, panels: 8, depth: 1.2, bracing })!;
      const now = generateTruss({ kind: 'pratt', spanM: 12, depthM: 1.2, panelsPerHalf: 4, webPattern: bracing });
      const key = (tp: typeof now) => tp.members.map((m) => {
        const a = tp.nodes[m.a]!, b = tp.nodes[m.b]!;
        const p = [[a.x, a.z], [b.x, b.z]].map((q) => q.map((v) => v.toFixed(6)).join(',')).sort();
        return `${m.role}:${p.join('|')}`;
      }).sort();
      expect(key(now)).toEqual(key(old));
      // An odd panel count is a monopitch girder of that many panels: the same members.
      const odd = generateStructure('latticeGirder', { span: 10.5, panels: 7, depth: 1, bracing })!;
      const half = generateTruss({ kind: 'pratt', spanM: 10.5, depthM: 1, panelsPerHalf: 7, halfTruss: true, webPattern: bracing });
      expect(key(half)).toEqual(key(odd));
    }
  });

  it('K needs two panels, and neither web takes the diagonal subdivision', () => {
    expect(validateTrussParams({ ...DEFAULT_TRUSS_PARAMS, kind: 'pratt', depthM: 1, spanM: 6, panelsPerHalf: 1, halfTruss: true, webPattern: 'k' })
      .map((x) => x.key)).toContain('generator.problem.kPanels');
    expect(subdivisionApplies({ webPattern: 'x', panelsPerHalf: 4 })).toBe(false);
    expect(subdivisionApplies({ webPattern: 'k', panelsPerHalf: 4 })).toBe(false);
  });
});
