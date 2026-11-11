import { describe, it, expect } from 'vitest';
import { defaultVariant } from '../../edu/exercise-params';
import { resolveGameModel, solveGame } from '../game-model';
import { diagramOf } from '../traces';
import { LEVELS } from '../levels';
import { figure } from '../figure';

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
