import { expect, it } from 'vitest';
import { runOtherCode } from '../design/other-codes/run';
import type { MemberContext, OtherCode, OtherCodeId } from '../design/other-codes/types';

for (const id of ['aci318', 'ec2', 'aisc360', 'ec3', 'aisiS100'] as OtherCodeId[]) {
  for (const kind of ['beam', 'column', 'wall'] as const) {
    it.skipIf(process.env.RUN_KNOWN_WRONG_1316 !== '1')(`known wrong result: #1316 — ${id} ${kind} dispatcher includes the governing non-extreme concurrent tuple by default`, () => {
      const station = (comboId: number, n: number, my: number) => ({ comboId, comboName: `case ${comboId}`, stationT: 0.5, stationX: 1.5,
        forces: { t: 0.5, x: 1.5, n, my, mz: 0, vy: 0, vz: 0, torsion: 0 } });
      const peak = station(1, -100, 10), middle = station(2, -90, 90);
      const ctx = { elementId: 1, kind, demands: [{ ...peak, category: 'N_compression', value: -100, absValue: 100 }], tuples: [peak, middle] } as MemberContext;
      const code: OtherCode = {
        id, family: 'concrete', labelKey: '', coverageKey: '', member: () => ({ data: {} }),
        forces: (_, d) => ({ n: d.forces.n, m: d.forces.my }),
        run: ({ forces }) => (forces as Array<{ elementId: number; n: number; m: number }>).map(f => ({ elementId: f.elementId, ratio: (Math.abs(f.n) + Math.abs(f.m)) / 100 })),
        read: r => ({ ratio: r.ratio as number, pass: (r.ratio as number) <= 1, governing: 'interaction', unevaluated: [] }),
      };
      const run = runOtherCode(code, [ctx]);
      expect(run.rows[0]).toMatchObject({ status: 'checked', comboName: 'case 2', reading: { ratio: 1.8, pass: false } });
      const control = runOtherCode(code, [{ ...ctx, tuples: [peak] }]);
      expect(control.rows[0]).toMatchObject({ status: 'checked', comboName: 'case 1', reading: { ratio: 1.1 } });
    });
  }
}
