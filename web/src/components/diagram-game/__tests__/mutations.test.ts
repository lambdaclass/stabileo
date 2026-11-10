import { describe, it, expect } from 'vitest';
import { defaultVariant, rng } from '../../edu/exercise-params';
import { resolveGameModel, solveGame, type Solved } from '../game-model';
import { diagramOf, drawnOrdinate, shapeDistance, type DiagramKind } from '../traces';
import { mutate, PHYSICAL_TAGS, MATH_TAGS, type Tag } from '../mutations';
import { LEVELS } from '../levels';
import { tagText, gameStrings } from '../strings';

function solved(id: string, values: Record<string, number> = {}): Solved {
  const t = LEVELS.flatMap((l) => l.templates).find((x) => x.id === id)!;
  const v = defaultVariant(t.params);
  Object.assign(v.values, values);
  return solveGame(resolveGameModel(t.model, v))!;
}

const CASES: Record<Tag, [string, DiagramKind, Record<string, number>?]> = {
  loadMoved: ['ss-point', 'M', { f: 0.25 }],
  loadFlipped: ['ss-combined', 'V'],
  supportChanged: ['propped', 'M'],
  supportsMirrored: ['cantilever-tip', 'M'],
  hingeToggled: ['gerber', 'M'],
  rollerTurned: ['inclined', 'N'],
  resultantLoad: ['ss-uniform', 'M'],
  pointAsUniform: ['ss-point', 'M'],
  signFlipped: ['ss-uniform', 'M'],
  degreeLowered: ['ss-uniform', 'M'],
  degreeRaised: ['ss-point', 'M'],
  vertexWrongEnd: ['cantilever-uniform', 'M'],
  jumpMissing: ['ss-point', 'V'],
  nonZeroAtRelease: ['gerber', 'M'],
  inflectionMisplaced: ['continuous', 'D'],
  supportDisplaced: ['ss-uniform', 'D'],
  memberSignFlipped: ['truss-pratt', 'N'],
  zeroForceLoaded: ['truss-pratt', 'N', { A: 0, D: 0 }],
  loadedShownZero: ['truss-pratt', 'N'],
};

describe('each tag changes the diagram it is applied to', () => {
  for (const tag of [...PHYSICAL_TAGS, ...MATH_TAGS]) {
    it(tag, () => {
      const [id, kind, values] = CASES[tag];
      const s = solved(id, values);
      const correct = diagramOf(s, kind);
      const d = mutate(tag, { solved: s, correct, kind, next: rng(7) });
      expect(d, `${tag} on ${id}`).not.toBeNull();
      expect(shapeDistance(d!, correct)).toBeGreaterThan(0.1);
      expect(tagText(tag, kind)).not.toMatch(/^tag\./);
    });
  }
});

describe('what the mutations claim', () => {
  it('the simply supported moment is drawn below the beam, where it is in tension, and the shear is positive on the left', () => {
    const s = solved('ss-point', { L: 6, f: 0.5, P: 20 });
    const m = diagramOf(s, 'M'), v = diagramOf(s, 'V');
    expect(m.traces[0]!.at(0.5)[1]).toBeCloseTo(-30, 6);
    expect(drawnOrdinate(s.model, 0, v.traces[0]!.at(0.25), 'V')).toBeCloseTo(10, 6);
  });

  it('a missing jump leaves the shear continuous under the point load', () => {
    const s = solved('ss-point', { f: 0.5 });
    const correct = diagramOf(s, 'V');
    const d = mutate('jumpMissing', { solved: s, correct, kind: 'V', next: rng(1) })!;
    const before = d.traces[0]!.at(0.5 - 1e-4)[1], after = d.traces[0]!.at(0.5 + 1e-4)[1];
    expect(Math.abs(after - before)).toBeLessThan(1e-6);
  });

  it('a moment that does not vanish at the hinge', () => {
    const s = solved('gerber');
    const correct = diagramOf(s, 'M');
    const hingeValue = (d: typeof correct) => Math.max(Math.hypot(...d.traces[0]!.at(1)), Math.hypot(...d.traces[1]!.at(0)));
    expect(hingeValue(correct)).toBeLessThan(1e-6);
    const d = mutate('nonZeroAtRelease', { solved: s, correct, kind: 'M', next: rng(2) })!;
    const ends = (x: typeof correct) => x.traces.flatMap((tr) => [Math.hypot(...tr.at(0)), Math.hypot(...tr.at(1))]);
    const released = ends(correct).map((v, k) => (v < 1e-6 ? k : -1)).filter((k) => k >= 0);
    expect(released.length).toBeGreaterThan(0);
    expect(released.some((k) => ends(d)[k]! > 1)).toBe(true);
  });

  it('a deflection that does not vanish at a support', () => {
    const s = solved('ss-uniform');
    const correct = diagramOf(s, 'D');
    const d = mutate('supportDisplaced', { solved: s, correct, kind: 'D', next: rng(3) })!;
    expect(Math.abs(correct.traces[0]!.at(0)[1]) + Math.abs(correct.traces[0]!.at(1)[1])).toBeLessThan(1e-9);
    expect(Math.max(Math.abs(d.traces[0]!.at(0)[1]), Math.abs(d.traces[0]!.at(1)[1]))).toBeGreaterThan(0);
  });

  it('a lower degree turns the parabola of a uniform load into a straight line', () => {
    const s = solved('ss-uniform');
    const correct = diagramOf(s, 'M');
    const d = mutate('degreeLowered', { solved: s, correct, kind: 'M', next: rng(4) })!;
    const [a, b, c] = [0.2, 0.5, 0.8].map((t) => d.traces[0]!.at(t)[1]);
    expect(b! - (a! + c!) / 2).toBeCloseTo(0, 9);
  });

  it('the vertex on the wrong end puts the flat tangent at the fixed support of a cantilever', () => {
    const s = solved('cantilever-uniform');
    const correct = diagramOf(s, 'M');
    const d = mutate('vertexWrongEnd', { solved: s, correct, kind: 'M', next: rng(5) })!;
    const slope = (f: (t: number) => number, t: number) => Math.abs(f(t + 0.01) - f(t));
    const tr = (x: typeof correct) => (t: number) => x.traces[0]!.at(t)[1];
    expect(slope(tr(correct), 0.98)).toBeLessThan(slope(tr(correct), 0.01));
    expect(slope(tr(d), 0.01)).toBeLessThan(slope(tr(d), 0.98));
    expect(tr(d)(0)).toBeCloseTo(tr(correct)(0), 2);
  });

  it('a zero-force member given a force, and tension and compression swapped', () => {
    const s = solved('truss-pratt', { A: 0, D: 0 });
    const correct = diagramOf(s, 'N');
    const zero = correct.traces.map((tr) => Math.hypot(...tr.at(0.5))).map((v, e) => (v < 1e-6 ? e : -1)).filter((e) => e >= 0);
    expect(zero.length).toBeGreaterThan(0);
    const d = mutate('zeroForceLoaded', { solved: s, correct, kind: 'N', next: rng(6) })!;
    for (const e of zero) expect(Math.hypot(...d.traces[e]!.at(0.5))).toBeGreaterThan(0);
    const f = mutate('memberSignFlipped', { solved: s, correct, kind: 'N', next: rng(6) })!;
    const flipped = correct.traces.filter((tr, e) => Math.hypot(...tr.at(0.5)) > 1e-6 && Math.sign(drawnOrdinate(s.model, e, tr.at(0.5), 'N')) !== Math.sign(drawnOrdinate(s.model, e, f.traces[e]!.at(0.5), 'N')));
    expect(flipped.length).toBeGreaterThan(0);
    expect(flipped.length).toBeLessThan(correct.traces.length);
  });

  it('a mutated structure that is a mechanism yields no distractor', () => {
    const s = solved('ss-point');
    expect(mutate('rollerTurned', { solved: s, correct: diagramOf(s, 'M'), kind: 'M', next: rng(1) })).toBeNull();
  });
});

describe('strings', () => {
  it('every language has every key, and none is empty', () => {
    const keys = Object.keys(gameStrings.en!).sort();
    for (const [locale, table] of Object.entries(gameStrings)) {
      expect(Object.keys(table).sort(), locale).toEqual(keys);
      for (const [k, v] of Object.entries(table)) expect(v.trim(), `${locale} ${k}`).not.toBe('');
    }
    expect(Object.keys(gameStrings).sort()).toEqual(['de', 'en', 'es', 'fr', 'pt', 'tr']);
  });
});
