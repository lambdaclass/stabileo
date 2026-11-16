import { describe, it, expect } from 'vitest';
import { defaultVariant } from '../../edu/exercise-params';
import { resolveGameModel, solveGame } from '../game-model';
import { diagramOf } from '../traces';
import { LEVELS } from '../levels';
import { drawnBounds, figure, sharedFrame } from '../figure';
import { dealRound } from '../round';

const solved = (id: string, values: Record<string, number> = {}) => {
  const t = LEVELS.flatMap((l) => l.templates).find((x) => x.id === id)!;
  const v = defaultVariant(t.params);
  Object.assign(v.values, values);
  return solveGame(resolveGameModel(t.model, v))!;
};

describe('figure', () => {
  it('draws the structure, its supports and its loads, and no diagram when none is given', () => {
    const s = solved('ss-point');
    const f = figure(s.model, null);
    expect(f.shapes.filter((x) => x.ink === 'member')).toHaveLength(1);
    expect(f.shapes.filter((x) => x.ink === 'support')).toHaveLength(2);
    expect(f.shapes.filter((x) => x.ink === 'load')).toHaveLength(1);
    expect(f.shapes.some((x) => x.ink === 'curve' || x.ink === 'fill')).toBe(false);
  });

  it('marks the shear of a simply supported beam + on the left and − on the right, and the moment with no sign', () => {
    const s = solved('ss-point', { f: 0.5 });
    expect(figure(s.model, diagramOf(s, 'V')).labels.map((l) => l.text)).toEqual(['+', '−']);
    expect(figure(s.model, diagramOf(s, 'M')).labels).toEqual([]);
  });

  it('a bare figure keeps the members and the diagram and leaves out what would give the structure away', () => {
    const s = solved('gerber');
    const f = figure(s.model, diagramOf(s, 'M'), true);
    expect(f.shapes.filter((x) => x.ink === 'member')).toHaveLength(2);
    expect(f.shapes.some((x) => x.ink === 'curve')).toBe(true);
    expect(f.shapes.some((x) => x.ink === 'support' || x.ink === 'load' || x.ink === 'hinge')).toBe(false);
    expect(f.viewBox).toBe(figure(s.model, diagramOf(s, 'M')).viewBox);
  });

  it('draws a truss bar by bar in the colour of its force, with zero-force bars apart', () => {
    const s = solved('truss-pratt', { A: 0, D: 0 });
    const f = figure(s.model, diagramOf(s, 'N'));
    const inks = f.shapes.filter((x) => ['tension', 'compression', 'zero'].includes(x.ink)).map((x) => x.ink);
    expect(inks).toHaveLength(s.model.elements.length);
    for (const ink of ['tension', 'compression', 'zero']) expect(inks).toContain(ink);
    expect(f.shapes.some((x) => x.ink === 'member')).toBe(false);
  });
});

describe('the frame a round shares', () => {
  const box = (vb: string) => { const [x, y, w, h] = vb.split(' ').map(Number); return { x: x!, y: y!, w: w!, h: h! }; };

  it('holds everything every figure of the round draws, with a thin margin', () => {
    for (let level = 0; level < LEVELS.length; level++) for (let seed = 1; seed <= 12; seed++) {
      const r = dealRound(level, seed * 7919);
      const figs = r.type === 'which'
        ? [figure(r.model, r.shown ?? null, true), ...r.options.flatMap((o) => [figure(o.model!, null), figure(o.model!, o.diagram)])]
        : [figure(r.model, null), ...r.options.map((o) => figure(r.model, o.diagram))];
      const frame = box(sharedFrame(figs).viewBox);
      const unit = Math.max(...figs.map((f) => f.unit));
      const all = figs.map(drawnBounds);
      const at = `level ${level} seed ${seed}`;
      expect(Math.min(...all.map((b) => b.minX)), at).toBeGreaterThanOrEqual(frame.x - 1e-3);
      expect(Math.max(...all.map((b) => b.maxX)), at).toBeLessThanOrEqual(frame.x + frame.w + 1e-3);
      expect(Math.min(...all.map((b) => b.minY)), at).toBeGreaterThanOrEqual(frame.y - 1e-3);
      expect(Math.max(...all.map((b) => b.maxY)), at).toBeLessThanOrEqual(frame.y + frame.h + 1e-3);
      expect(Math.min(...all.map((b) => b.minX)) - frame.x, at).toBeLessThanOrEqual(0.06 * unit);
    }
  });

  it('gives a beam its length back: less margin at the ends than the old fixed padding', () => {
    const s = solved('ss-point');
    const frame = box(sharedFrame([figure(s.model, null), ...(['N', 'V', 'M'] as const).map((k) => figure(s.model, diagramOf(s, k)))]).viewBox);
    const old = box(figure(s.model, null).viewBox);
    expect(frame.w).toBeLessThan(old.w);
  });
});

describe('truss sign labels', () => {
  it('never sit on top of each other', () => {
    for (const id of ['truss-warren', 'truss-pratt', 'truss-howe', 'truss-bracket', 'truss-triangle']) {
      const s = solved(id);
      const f = figure(s.model, diagramOf(s, 'N'));
      for (let i = 0; i < f.labels.length; i++) for (let j = i + 1; j < f.labels.length; j++) {
        expect(Math.hypot(f.labels[i]!.x - f.labels[j]!.x, f.labels[i]!.y - f.labels[j]!.y), id).toBeGreaterThan(0.09 * f.unit);
      }
    }
  });
});
