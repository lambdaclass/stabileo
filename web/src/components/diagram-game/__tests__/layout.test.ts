import { describe, it, expect } from 'vitest';
import { arrange, type Space } from '../layout';
import { figureAspect } from '../figure';
import { LEVELS } from '../levels';
import { defaultVariant } from '../../edu/exercise-params';
import { resolveGameModel } from '../game-model';

const base = { gap: 10, cardChromeX: 20, cardChromeY: 24, problemChrome: 16, textHeight: 34, textMinWidth: 220, structureInCards: true };
const space = (width: number, height: number, options: number, aspect: number): Space => ({ ...base, width, height, options, aspect });
const aspectOf = (id: string) => {
  const t = LEVELS.flatMap((l) => l.templates).find((x) => x.id === id)!;
  return figureAspect(resolveGameModel(t.model, defaultVariant(t.params)));
};

describe('board arrangement', () => {
  it('a tall column on an upright phone goes beside the options, at least twice the size it had stacked in wide cards', () => {
    const a = arrange(space(358, 470, 3, aspectOf('column-lateral')));
    expect(a.problem).toBe('left');
    expect(a.columns).toBeGreaterThan(1);
    const stackedHeight = (470 * 0.78 - 2 * 10) / 3 - 24;
    expect(a.optionScale).toBeGreaterThan(2 * stackedHeight);
  });

  it('a long beam on an upright phone keeps the structure on top, or in a which round always does', () => {
    expect(arrange({ ...space(358, 470, 3, aspectOf('ss-point')), structureInCards: false }).problem).toBe('top');
    expect(arrange(space(358, 470, 3, aspectOf('ss-point'))).optionScale * aspectOf('ss-point')).toBeGreaterThan(150);
  });

  it('wide cards on a wide screen carry their own explanation', () => {
    expect(arrange(space(1248, 480, 4, aspectOf('portal-lateral')))).toMatchObject({ problem: 'top', columns: 4, text: true });
  });

  it('the structure on its own gives way only on a cramped board, and never when the cards do not show it', () => {
    expect(arrange(space(1248, 480, 4, aspectOf('ss-point'))).problem).not.toBe('none');
    expect(arrange({ ...space(635, 160, 4, aspectOf('ss-point')), structureInCards: false }).problem).not.toBe('none');
    const cramped = arrange(space(635, 160, 4, aspectOf('ss-point')));
    if (cramped.problem === 'none') {
      const kept = arrange({ ...space(635, 160, 4, aspectOf('ss-point')), structureInCards: false });
      expect(cramped.optionScale).toBeGreaterThan(1.35 * Math.min(kept.optionScale, kept.problemScale));
    }
  });

  it('narrow cards hand their explanation to the bar', () => {
    expect(arrange(space(358, 470, 3, aspectOf('column-lateral'))).text).toBe(false);
  });

  it('every template, at every screen the e2e plays, draws its cards at least 45 px tall', () => {
    const ids = [...new Set(LEVELS.flatMap((l) => l.templates.map((t) => t.id)))];
    for (const [w, h] of [[1408, 560], [1248, 420], [736, 760], [358, 470], [328, 410], [812, 220], [635, 190]] as const) {
      for (const id of ids) for (const n of [3, 4]) {
        const a = arrange(space(w, h, n, aspectOf(id)));
        expect(a.optionScale, `${id} ${n} options on ${w}x${h}`).toBeGreaterThan(45);
      }
    }
  });
});
