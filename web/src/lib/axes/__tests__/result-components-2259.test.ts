import { expect, it } from 'vitest';
import { resultComponents } from '../result-components';
import { allChoices, makeFrame, planeSigns, pseudoToUser, toUser } from '../frame';

it('signed results preserve force and axial-moment directions while magnitudes only permute', () => {
  for (const choice of allChoices()) {
    const frame = makeFrame(choice);
    const p = planeSigns(frame);
    const v = [-1, 0, 3] as const;
    const signed = resultComponents(frame, {});
    expect(signed.vec(...v)).toEqual(toUser(frame, v));
    expect(signed.rot(...v)).toEqual(pseudoToUser(frame, v));
    expect(signed.rot(...v, -1)).toEqual(pseudoToUser(frame, [1, 0, -3]));
    expect(signed.plane(1, 'rot', -1)).toBe(-p.sr);
    expect([signed.plane(1, 'x'), signed.plane(1, 'z'), signed.plane(1, 'rot')]).toEqual([p.sx, p.sz, p.sr]);
    for (const method of ['srss', 'abs']) {
      const magnitude = resultComponents(frame, { magnitude: { method } });
      const values = [0, 2, 3] as const;
      const want = frame.rows.map(row => values[row.findIndex(c => c !== 0)]);
      expect(magnitude.vec(...values)).toEqual(want);
      expect(magnitude.rot(...values)).toEqual(want);
      expect(magnitude.rot(...values, -1)).toEqual(want);
      expect(magnitude.plane(1, 'rot', -1)).toBe(1);
      expect([magnitude.plane(1, 'x'), magnitude.plane(1, 'z'), magnitude.plane(1, 'rot')]).toEqual([1, 1, 1]);
    }
  }
});

it('the plane quantity type rejects vector rotations and axial translations', () => {
  type PlaneQuantity = Parameters<ReturnType<typeof import('../quantity-transform').quantityTransform>['plane']>[0];
  const vectorRotationRejected: { kind: 'vector'; value: number; axis: 'rot' } extends PlaneQuantity ? false : true = true;
  const axialTranslationRejected: { kind: 'pseudovector'; value: number; axis: 'x' } extends PlaneQuantity ? false : true = true;
  const magnitudeRotationAllowed: { kind: 'magnitude'; value: number; axis: 'rot' } extends PlaneQuantity ? true : false = true;
  expect([vectorRotationRejected, axialTranslationRejected, magnitudeRotationAllowed]).toEqual([true, true, true]);
});
