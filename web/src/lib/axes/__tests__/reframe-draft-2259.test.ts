import { expect, it } from 'vitest';
import { allChoices, makeFrame } from '../frame';
import { reframeDraft } from '../reframe-draft';

it('#2259 every draft frame pair preserves populated, zero and absent vector and couple components', () => {
  const choices = allChoices();
  for (const a of choices) for (const b of choices) {
    const from = makeFrame(a), to = makeFrame(b);
    const forward = reframeDraft(from, to), backward = reframeDraft(to, from);
    for (const kind of ['vector', 'pseudovector', 'magnitude'] as const) {
      for (const source of [{ x: 2, y: -3, z: 5 }, { x: null, y: 0, z: -7 }, { x: null, y: null, z: null }]) {
        const result = forward.fields(source, ['x', 'y', 'z'], kind);
        expect(backward.fields(result, ['x', 'y', 'z'], kind)).toEqual(source);
        const model = (frame: typeof from, values: Record<'x' | 'y' | 'z', number | null>) => [0, 1, 2].map(k => {
          const i = frame.rows.findIndex(row => row[k] !== 0);
          const value = values[(['x', 'y', 'z'] as const)[i]!];
          return value === null ? null : value * (kind === 'magnitude' ? 1 : frame.rows[i]![k]! * (kind === 'pseudovector' ? frame.det : 1)) + 0;
        });
        expect(model(to, result)).toEqual(model(from, source));
      }
    }
    for (const axis of ['X', 'Y', 'Z'] as const) for (const [min, max] of [[-2, 5], [0, 0], [5, -2]]) {
      const moved = forward.range(axis, min!, max!);
      const source = 'XYZ'.indexOf(axis);
      const modelAxis = from.rows[source]!.findIndex(v => v !== 0);
      const target = to.rows.findIndex(row => row[modelAxis] !== 0);
      const sign = from.rows[source]![modelAxis]! * to.rows[target]![modelAxis]!;
      expect(moved).toEqual({ axis: 'XYZ'[target], min: sign > 0 ? min : -max! + 0, max: sign > 0 ? max : -min! + 0 });
      expect(backward.range(moved.axis, moved.min, moved.max)).toEqual({ axis, min, max });
      expect(moved.min <= moved.max).toBe(min! <= max!);
    }
  }
});

it('#2259 text, nullable node coordinates, physical planes and DOF flags retain their meaning in every frame pair', () => {
  for (const a of allChoices()) for (const b of allChoices()) {
    const from = makeFrame(a), to = makeFrame(b), forward = reframeDraft(from, to), backward = reframeDraft(to, from);
    for (const values of [['2', '-3', '4'], ['', '-', '0'], ['2,5', '', '-4']] as const) {
      const actual = forward.text(values);
      expect(backward.text(actual)).toEqual(values);
      const flags = [true, false, true, false, true, false];
      expect(backward.flags(forward.flags(flags))).toEqual(flags);
      for (const p of ['XY', 'XZ', 'YZ'] as const) expect(backward.plane(forward.plane(p))).toBe(p);
    }
    for (const values of [[0, 0], [2, -3]] as const) expect(backward.planeVector(forward.planeVector(values))).toEqual(values);
    for (const values of [['', '-'], ['2,5', '-3']] as const) expect(backward.planText(forward.planText(values))).toEqual(values);
  }
});
