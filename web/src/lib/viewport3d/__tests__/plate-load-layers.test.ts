import { describe, it, expect } from 'vitest';
import { shellLoadSamples } from '../../engine/shell-load-integration';
import { plateLoadLayers, type PieceLoad } from '../plate-load-layers';

const on = (id: number, shell: string, q = 5, plate = 1, caseId = 1): PieceLoad => ({ id, key: `${plate}:${caseId}:${q}`, shell, plate, q, caseId });
const shells = new Map([[1, 3]]);

describe('area loads drawn once over a plate', () => {
  it('take a load on every shell as one layer and leave one more on a single shell drawn on its own', () => {
    const layers = plateLoadLayers([on(1, 'q1'), on(2, 'q2'), on(3, 'q3'), on(4, 'q2')], shells);
    expect(layers).toEqual([{ plate: 1, q: 5, caseId: 1, ids: [1, 2, 3] }]);
  });

  it('take as many layers as every shell carries', () => {
    const layers = plateLoadLayers([on(1, 'q1'), on(2, 'q2'), on(3, 'q3'), on(4, 'q1'), on(5, 'q2'), on(6, 'q3'), on(7, 'q3')], shells);
    expect(layers.map((l) => l.ids)).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it('take nothing when one shell has none, and keep values and cases apart', () => {
    expect(plateLoadLayers([on(1, 'q1'), on(2, 'q2'), on(3, 'q2')], shells)).toEqual([]);
    expect(plateLoadLayers([on(1, 'q1'), on(2, 'q2'), on(3, 'q3', 4)], shells)).toEqual([]);
    expect(plateLoadLayers([on(1, 'q1'), on(2, 'q2'), on(3, 'q3', 5, 1, 2)], shells)).toEqual([]);
  });
});

it.skip.each(['plate', 'quad'] as const)('known wrong result: #1928 — opposite local pressures on reversed %s shells stay separate', (kind) => {
  const quad = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }];
  const corners = kind === 'plate' ? quad.slice(0, 3) : quad;
  const q = 5;
  const dir = shellLoadSamples(kind, corners, { frame: 'local', q })!.dir;
  const reversed = shellLoadSamples(kind, [...corners].reverse(), { frame: 'local', q })!.dir;
  expect(reversed[1]).toBe(-dir[1]);
  const left = { ...on(1, '1'), dir };
  const right = { ...on(2, '2'), dir: reversed };
  const shellCounts = new Map([[1, 2]]);
  expect(plateLoadLayers([left, right], shellCounts)).toEqual([]);
  expect(plateLoadLayers([left, { ...right, dir }], shellCounts)).toEqual([{ plate: 1, q, caseId: 1, ids: [1, 2], dir }]);
});
