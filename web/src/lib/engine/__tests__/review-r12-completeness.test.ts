import { expect, it, vi } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { extractGoverningDemands, type ElementStationResult } from '../station-design-forces';
import { runOtherCode, certifyOtherCode } from '../design/other-codes/run';
import type { MemberContext, OtherCode, OtherCodeId } from '../design/other-codes/types';

const knownWrong = it.skipIf(!process.env.RUN_KNOWN_WRONG);
const station = { t: 0, x: 0, n: 0, my: 20, mz: 5, vy: 0, vz: 0, torsion: 0 };
const combo = (comboId: number, populated: boolean) => ({ comboId, comboName: `C${comboId}`, stations: populated ? [station] : [] });
const result = (groups: boolean[]): ElementStationResult => ({ elementId: 1, length: 4, stationTs: [0], comboResults: groups.map((p, i) => combo(i + 1, p)) });

for (const groups of [[true, false], [false, true], [false], []]) {
  for (const axis of ['My', 'Mz'] as const) {
    knownWrong(`known wrong result: #2080 incomplete station combinations ${groups} refuse before ${axis} verification`, () => {
      const data = result(groups);
      expect(() => ConcurrentDemand.fromStations(data)).toThrow(/complete|combination/i);
      expect(() => extractGoverningDemands(data)).toThrow(/complete|combination/i);
      expect(() => verifyConcurrentElement(ConcurrentDemand.fromStations(data).map(d => ({
        elementId: 1, elementType: 'beam', demand: d.section(axis), b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8,
      })))).toThrow(/complete|combination/i);
    });
  }
}

it.each([[[true]], [[true, true]]])('complete station groups %s keep every combination including zero forces', groups => {
  const data = result(groups);
  data.comboResults[0]!.stations = [{ ...station, my: 0, mz: 0 }];
  const ds = ConcurrentDemand.fromStations(data);
  expect(ds.map(d => d.comboId)).toEqual(groups.map((_, i) => i + 1));
  expect(ds[0]!.my).toBe(0);
});

const demands = extractGoverningDemands(result([true, true]));
const ctx = { elementId: 1, demands: demands.demands, tuples: demands.concurrent } as unknown as MemberContext;
function code(id: OtherCodeId): OtherCode {
  return { id, family: 'steel', labelKey: '', coverageKey: '', member: () => ({ data: { elementId: 1 } }),
    forces: (_, d) => ({ my: d.my }), run: ({ members }) => members,
    read: () => ({ ratio: 0.5, pass: true, governing: 'interaction', unevaluated: [] }),
    certify: { name: 'certify_ec3_members', bound: () => ({} as never) } };
}
for (const id of ['aisc360', 'ec3', 'aci318', 'ec2', 'aisiS100'] as const) {
  for (const tuples of [undefined, [], ctx.tuples!.filter(t => t.comboId === 1)]) {
    knownWrong(`known wrong result: #2080 ${id} refuses missing or incomplete tuples length=${tuples?.length}`, async () => {
      const c = code(id), input = { ...ctx, tuples };
      const run = vi.spyOn(c, 'run');
      expect(runOtherCode(c, [input]).rows[0]!.status).toBe('skipped');
      expect(run).not.toHaveBeenCalled();
    });
    knownWrong(`known wrong result: #2080 ${id} cannot certify missing or incomplete tuples length=${tuples?.length}`, async () => {
      const c = code(id), input = { ...ctx, tuples };
      const call = vi.fn(async () => [{ elementId: 1, certified: true, utilizationLower: 0.5, utilizationUpper: 0.5 }]);
      expect((await certifyOtherCode(c, [input], () => ({} as never), call)).get(1)?.status).toBe('uncertified');
      expect(call).not.toHaveBeenCalled();
    });
  }
  it(`${id} complete tuples still check and certify`, async () => {
    const c = code(id);
    expect(runOtherCode(c, [ctx]).rows[0]).toMatchObject({ status: 'checked', reading: { ratio: 0.5, pass: true } });
    const call = vi.fn(async () => [{ elementId: 1, certified: true, utilizationLower: 0.5, utilizationUpper: 0.5 }]);
    expect((await certifyOtherCode(c, [ctx], () => ({} as never), call)).get(1)?.status).toBe('ok');
    expect(call).toHaveBeenCalled();
  });
}
