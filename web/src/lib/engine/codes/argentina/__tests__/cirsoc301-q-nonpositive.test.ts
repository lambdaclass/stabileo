import { describe, it, expect } from 'vitest';
import { type SteelDesignParams } from '../cirsoc301';
import { verifySteelElement } from '../../../__tests__/helpers/manual-interactions';

const ISSUE_467_BOX: SteelDesignParams = {
  Fy: 235, Fu: 352.5, E: 200_000, A: 0.004154258317613479, Iz: 0.00018670605799131143, Iy: 0.00018670373863284803,
  h: 0.52128444, b: 0.5212801394033699, tw: 0.002, tf: 0.00417027552, L: 0.5, Lb: 0, shape: 'box', builtUp: false,
};

describe('CIRSOC 301 E.7 with Qa ≤ 0 (#467)', () => {
  it('holds the member and never reports a capacity above the squash load', () => {
    const squash = ISSUE_467_BOX.A * ISSUE_467_BOX.Fy * 1000;
    const v = verifySteelElement({ elementId: 1, Nu: 0.003, Muz: 0, Muy: 0, Vu: 0, params: ISSUE_467_BOX });
    expect(v.compression!.status).toBe('held');
    expect(v.compression!.notEvaluatedMessage?.key).toBe('c301.refuse.qNonPositive');
    expect(v.compression!.phiPn).toBeLessThanOrEqual(squash);
    expect(v.overallStatus).not.toBe('ok');
  });

  it('fails a compact box whose demand reaches the squash load', () => {
    const a = 0.2 ** 2 - 0.18 ** 2;
    const i = (0.2 ** 4 - 0.18 ** 4) / 12;
    const p: SteelDesignParams = { Fy: 235, Fu: 370, E: 200_000, A: a, Iz: i, Iy: i, h: 0.2, b: 0.2, tw: 0.01, tf: 0.01, L: 3, Lb: 0, shape: 'box' };
    const squash = a * 235 * 1000;
    const atSquash = verifySteelElement({ elementId: 1, Nu: squash, Muz: 0, Muy: 0, Vu: 0, params: p });
    expect(atSquash.compression!.phiPn).toBeCloseTo(1409.35, 1);
    expect(atSquash.compression!.status).toBe('fail');
    expect(atSquash.overallStatus).toBe('fail');
  });
});
