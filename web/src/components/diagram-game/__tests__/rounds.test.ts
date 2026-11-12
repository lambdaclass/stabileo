import { describe, it, expect } from 'vitest';
import { drawVariant } from '../../edu/exercise-params';
import { resolveGameModel, solveGame } from '../game-model';
import { apparentGap, barsChangingState, diagramOf, negated, sampleDiagram, shapeDistance, peak } from '../traces';
import { buildRound, dealRound } from '../round';
import { LEVELS } from '../levels';
import { figure } from '../figure';
import { MAX_LEVEL } from '../scoring';

const SEEDS = Array.from({ length: 120 }, (_, k) => (k * 2654435761) >>> 0);

function fingerprint(level: number, seed: number) {
  const r = buildRound(level, seed);
  return {
    type: r.type, template: r.template, kind: r.kind, answer: r.answer, model: r.model,
    options: r.options.map((o) => ({ tag: o.tag, kind: o.diagram.kind, samples: sampleDiagram(o.diagram).map(([x, y]) => [x.toPrecision(10), y.toPrecision(10)]) })),
  };
}

describe('level templates', () => {
  for (const [l, level] of LEVELS.entries()) {
    for (const t of level.templates) {
      it(`level ${l + 1} ${t.id} solves for every drawn variant`, () => {
        for (const seed of SEEDS.slice(0, 60)) {
          const s = solveGame(resolveGameModel(t.model, drawVariant(t.params, seed)));
          expect(s, `${t.id} seed ${seed}`).not.toBeNull();
          for (const k of t.kinds) for (const [x, y] of sampleDiagram(diagramOf(s!, k))) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        }
      });
    }
  }
});

describe('rounds', () => {
  for (const [l, level] of LEVELS.entries()) {
    it(`level ${l + 1}: the same seed deals the same round`, () => {
      for (const seed of SEEDS.slice(0, 20)) expect(fingerprint(l, seed)).toEqual(fingerprint(l, seed));
    });

    it(`level ${l + 1}: ${level.options} visibly different options, exactly one to choose, none of them another with its sign reversed`, () => {
      const seen = { pick: 0, odd: 0, which: 0 };
      for (const seed of SEEDS) {
        const r = buildRound(l, seed);
        seen[r.type]++;
        expect(r.answer).toBeGreaterThanOrEqual(0);
        if (r.type === 'odd') {
          expect(r.options.length).toBeGreaterThanOrEqual(3);
          expect(r.options.length).toBeLessThanOrEqual(level.options);
          expect(r.options.filter((o) => o.tag !== null)).toHaveLength(1);
          expect(r.options[r.answer]!.tag).not.toBeNull();
          expect(new Set(r.options.map((o) => o.diagram.kind)).size).toBe(r.options.length);
          const bad = r.options[r.answer]!.diagram;
          const truth = diagramOf(solveGame(r.model)!, bad.kind);
          expect(apparentGap(bad, truth, r.model).rms).toBeGreaterThanOrEqual(level.minGap);
          expect(apparentGap(bad, truth, r.model).max).toBeGreaterThanOrEqual(level.minPeak);
          expect(r.options[r.answer]!.tag).not.toBe('wrongKind');
          expect(shapeDistance(bad, negated(truth))).toBeGreaterThanOrEqual(level.minGap);
        } else {
          expect(r.options).toHaveLength(level.options);
          expect(r.options.filter((o) => o.tag === null)).toHaveLength(1);
          expect(r.options[r.answer]!.tag).toBeNull();
          expect(new Set(r.options.map((o) => o.diagram.kind)).size).toBe(1);
          for (let i = 0; i < r.options.length; i++) for (let j = i + 1; j < r.options.length; j++) {
            const a = r.options[i]!.diagram, b = r.options[j]!.diagram;
            const g = apparentGap(a, b, r.model);
            expect(g.rms, `seed ${seed} ${i}-${j}`).toBeGreaterThanOrEqual(level.minGap);
            expect(g.max, `seed ${seed} ${i}-${j} widest`).toBeGreaterThanOrEqual(level.minPeak);
            expect(shapeDistance(a, negated(b)), `seed ${seed} ${i}-${j} reversed`).toBeGreaterThanOrEqual(level.minGap);
          }
          if (r.type === 'which') {
            expect(r.shown).toBe(r.options[r.answer]!.diagram);
            for (const o of r.options) expect(o.model).toBeDefined();
            expect(new Set(r.options.map((o) => JSON.stringify(o.model))).size).toBe(r.options.length);
            for (const o of r.options) expect(shapeDistance(diagramOf(solveGame(o.model!)!, r.kind!), o.diagram)).toBeLessThan(1e-9);
            for (const o of r.options) expect(['loadScaled', 'rollerTurned']).not.toContain(o.tag);
          }
        }
        for (const o of r.options) expect(peak(sampleDiagram(o.diagram))).toBeGreaterThan(0);
        if (r.type !== 'which') expect(level.tags).toEqual(expect.arrayContaining(r.options.flatMap((o) => (o.tag ? [o.tag] : []))));
      }
      if (level.oddShare > 0) expect(seen.odd).toBeGreaterThan(0);
      else expect(seen.odd).toBe(0);
      expect(seen.which).toBeGreaterThan(0);
      expect(seen.pick).toBeGreaterThan(0);
    });

    it(`level ${l + 1}: every option draws without a non-finite coordinate`, () => {
      for (const seed of SEEDS.slice(0, 30)) {
        const r = buildRound(l, seed);
        for (const o of [null, ...r.options.map((x) => x.diagram)]) {
          const f = figure(r.model, o);
          expect(f.viewBox).not.toMatch(/NaN|Infinity/);
          for (const s of f.shapes) expect(s.d, s.ink).not.toMatch(/NaN|Infinity/);
        }
      }
    });
  }

  it('the first levels lean on blunt traps: another diagram drawn as the one asked for shows up', () => {
    for (const l of [0, 1, 2]) {
      const tags = SEEDS.flatMap((seed) => buildRound(l, seed).options.map((o) => o.tag));
      expect(tags, `level ${l + 1}`).toContain('wrongKind');
    }
  });

  it('a seed that cannot make a round moves on to derived seeds and then to lower levels, so play never stops', () => {
    const tried: Array<[number, number]> = [];
    const flaky = (level: number, seed: number) => {
      tried.push([level, seed]);
      if (tried.length < 11) throw new Error('no round');
      return buildRound(level, seed);
    };
    const r = dealRound(3, 77, flaky);
    expect(r.level).toBe(2);
    expect(new Set(tried.filter(([l]) => l === 3).map(([, s]) => s)).size).toBe(8);
    const pick = ({ type, template, answer, model }: ReturnType<typeof buildRound>) => ({ type, template, answer, model });
    expect(pick(dealRound(3, 77))).toEqual(pick(buildRound(3, 77)));
  });

  it('the scoring ceiling is the last level', () => {
    expect(MAX_LEVEL).toBe(LEVELS.length);
  });

  it('different seeds deal different rounds', () => {
    const seen = new Set(SEEDS.slice(0, 30).map((s) => JSON.stringify(fingerprint(1, s).options.map((o) => o.samples[3]))));
    expect(seen.size).toBeGreaterThan(20);
  });
});

describe('truss rounds', () => {
  it('turn at least one bar between tension, compression and unloaded across every pair of options, at every level', () => {
    let rounds = 0;
    for (let level = 0; level < LEVELS.length; level++) for (let seed = 1; seed <= 160; seed++) {
      const r = dealRound(level, seed * 104729);
      if (!r.model.allTruss || r.kind !== 'N') continue;
      rounds++;
      const ds = r.options.map((o) => o.diagram);
      for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
        expect(barsChangingState(ds[i]!, ds[j]!, r.model), `level ${level + 1} seed ${seed} options ${i + 1} and ${j + 1}`).toBeGreaterThanOrEqual(1);
      }
    }
    expect(rounds).toBeGreaterThan(40);
  });
});
