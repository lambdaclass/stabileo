import { describe, it, expect } from 'vitest';
import { drawVariant } from '../../edu/exercise-params';
import { resolveGameModel, solveGame } from '../game-model';
import { diagramOf, sampleDiagram, shapeDistance, peak } from '../traces';
import { buildRound } from '../round';
import { LEVELS } from '../levels';
import { figure } from '../figure';

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

    it(`level ${l + 1}: three visibly different options, exactly one to choose`, () => {
      let odd = 0;
      for (const seed of SEEDS) {
        const r = buildRound(l, seed);
        expect(r.options).toHaveLength(3);
        expect(r.answer).toBeGreaterThanOrEqual(0);
        if (r.type === 'pick') {
          expect(r.options.filter((o) => o.tag === null)).toHaveLength(1);
          expect(r.options[r.answer]!.tag).toBeNull();
          expect(new Set(r.options.map((o) => o.diagram.kind)).size).toBe(1);
          for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
            expect(shapeDistance(r.options[i]!.diagram, r.options[j]!.diagram), `seed ${seed} ${i}-${j}`).toBeGreaterThanOrEqual(level.minGap);
          }
        } else {
          odd++;
          expect(r.options.filter((o) => o.tag !== null)).toHaveLength(1);
          expect(r.options[r.answer]!.tag).not.toBeNull();
          expect(new Set(r.options.map((o) => o.diagram.kind)).size).toBe(3);
          const bad = r.options[r.answer]!.diagram;
          const truth = diagramOf(solveGame(r.model)!, bad.kind);
          expect(shapeDistance(bad, truth)).toBeGreaterThanOrEqual(level.minGap);
        }
        for (const o of r.options) expect(peak(sampleDiagram(o.diagram))).toBeGreaterThan(0);
        expect(level.tags).toEqual(expect.arrayContaining(r.options.flatMap((o) => (o.tag ? [o.tag] : []))));
      }
      if (level.oddShare > 0) expect(odd).toBeGreaterThan(0);
      else expect(odd).toBe(0);
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

  it('different seeds deal different rounds', () => {
    const seen = new Set(SEEDS.slice(0, 30).map((s) => JSON.stringify(fingerprint(1, s).options.map((o) => o.samples[3]))));
    expect(seen.size).toBeGreaterThan(20);
  });
});
