import { expect, it } from 'vitest';
import { barStates, barsChangingState, type Diagram } from '../traces';
import type { GameModel } from '../game-model';
const model: GameModel = { nodes: [[0, 0], [1, 0], [2, 0]], elements: [[0, 1], [1, 2]], supports: [], allTruss: true };
const diagram = (v: number): Diagram => ({ kind: 'N', traces: [0, 1].map(() => ({ breaks: [], at: () => [0, v] })) });
it('known wrong result: #1926 T38 — unloaded bars have zero state', () => {
  expect(barStates(diagram(0), model)).toEqual([0, 0]);
  expect(barsChangingState(diagram(0), diagram(10), model)).toBe(2);
  expect(barsChangingState(diagram(0), diagram(0), model)).toBe(0);
  expect(barStates(diagram(10), model).every(v => v === 1 || v === -1)).toBe(true);
});
