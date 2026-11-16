import { afterEach, expect, it, vi } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { checkSteelMember, type SteelMemberDemand } from '../verification-service';
import * as kernel from '../codes/argentina/cirsoc301-kernel';
import * as adapter from '../codes/argentina/cirsoc301';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';

const section = { ...profileToSectionFull(profileByName('IPE 300')!), fabrication: 'rolled' as const };
const steel = { fy: 250, fu: 400, e: 200000 };
const lengths = { L: 8, Lb: 1, LbNeg: 8, loadPosition: 'web' as const };
function demand(count: number): SteelMemberDemand {
  const concurrent = ConcurrentDemand.fromTuples(Array.from({ length: count }, (_, i) => ({
    comboId: i + 1, comboName: `C${i + 1}`, forces: { n: i % 3 ? -i : i,
      my: i % 2 ? -20 : 20, mz: i % 2 ? 3 : -3, vy: i % 7, vz: i % 11,
      torsion: 0, t: count === 1 ? 0.5 : i / (count - 1), x: count === 1 ? 4 : 8 * i / (count - 1) },
  })));
  return { concurrent, Nc: count, Nt: count, MuStrong: 20, MuWeak: 3, Vu: 10, diagram: [] };
}
afterEach(() => vi.restoreAllMocks());
it('known wrong result: #2080 steel reports trace only governing stations', () => {
  const calls = vi.spyOn(kernel, 'engineCheckMembers');
  const result = checkSteelMember(1, demand(64), section, steel, lengths)!;
  expect(result.engine.available).toBe(true);
  expect(calls).toHaveBeenCalledTimes(2);
  expect(calls.mock.calls.filter(([, , opts]) => opts?.steps !== false).reduce((n, [members]) => n + members.length, 0)).toBeLessThanOrEqual(8);
});
for (const count of [1, 2, 255, 256, 257]) {
  for (const declared of [false, true]) {
    it(`all ${count} concurrent stations retain the full traced answer declared=${declared}`, () => {
      const sec = declared ? section : { ...section, fabrication: undefined };
      const len = declared ? lengths : { ...lengths, loadPosition: undefined };
      const data = demand(count);
      const expected = checkSteelMember(1, data, sec, steel, len);
      const original = adapter.verifyFlangeCases;
      const all = vi.spyOn(adapter, 'verifyFlangeCases').mockImplementation((inputs) => original(inputs, { trace: true }));
      expect(checkSteelMember(1, data, sec, steel, len)).toEqual(expected);
      expect(all).toHaveBeenCalled();
    });
  }
}
it.fails('known wrong result: #2080 still refuses an empty concurrent demand', () => {
  expect(() => checkSteelMember(1, demand(0), section, steel, lengths)).toThrow('Concurrent steel demands are required');
});
for (const phase of ['screen', 'trace']) for (const failure of ['missing', 'reordered', 'unavailable']) {
  it(`a ${failure} ${phase} batch cannot publish a passing member`, () => {
    const real = kernel.engineCheckMembers;
    vi.spyOn(kernel, 'engineCheckMembers').mockImplementation((members, forces, opts) => {
      const out = real(members, forces, opts);
      if ((opts?.steps === false ? 'screen' : 'trace') !== phase || !out) return out;
      return failure === 'missing' ? out.slice(1) : failure === 'reordered' ? out.reverse() : null;
    });
    const result = checkSteelMember(1, demand(64), section, steel, lengths)!;
    expect(result.overallStatus).toBe('fail');
    expect(result.engine.available).toBe(false);
  });
}
it('a correct single-station input still receives its certified answer', () => {
  const result = checkSteelMember(1, demand(1), section, steel, lengths)!;
  expect(result.overallStatus).toBe('ok');
  expect(result.engineRecheck.certifiedOk).toBe(true);
});
for (const axis of ['My', 'Mz'] as const) for (const n of [-10, 0, 10]) for (const sign of [-1, 1]) {
  it(`reuses the exact scalar interaction including its trace for ${axis} n=${n} sign=${sign}`, () => {
    const params: adapter.SteelDesignParams = { Fy: steel.fy, Fu: steel.fu, E: steel.e,
      A: section.a!, Iz: section.iy!, Iy: section.iz!, h: section.h!, b: section.b!, tw: section.tw!, tf: section.tf!,
      J: section.j!, shape: 'I', builtUp: false, ...lengths };
    const source = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'C1', forces: {
      n, my: sign * 20, mz: n === 0 ? 0 : sign * 3, vy: 2, vz: 5, torsion: 0, t: 0.5, x: 4,
    } }])[0]!.section(axis);
    expect(adapter.verifyFlangeCases([{ elementId: 1, params, demand: source }])[0]!.interaction)
      .toEqual(adapter.checkSteelInteraction(params, source));
  });
}
