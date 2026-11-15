import { afterEach, expect, it, vi } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyByFlange, verifyByFlanges, type SteelDesignParams } from '../codes/argentina/cirsoc301';
import * as kernel from '../codes/argentina/cirsoc301-kernel';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';

const section = profileToSectionFull(profileByName('IPE 300')!);
const params: SteelDesignParams = { Fy: 250, Fu: 400, E: 200000, A: section.a!, Iz: section.iy!, Iy: section.iz!,
  h: section.h!, b: section.b!, tw: section.tw!, tf: section.tf!, J: section.j!, shape: 'I', builtUp: false,
  L: 8, Lb: 1, LbNeg: 8, loadPosition: 'web' };
const inputs = (count: number) => Array.from({ length: count }, (_, i) => ({ elementId: i % 2 ? 19 : 7,
  params: { ...params, Cb: i % 3 ? 1 : 2 }, combinedShear: i % 2 === 0,
  demand: ConcurrentDemand.fromTuples([{ comboId: i + 1, comboName: `C${i + 1}`, forces: {
    t: 0.5, x: 4, n: i % 3 ? -i : i, my: i % 2 ? -20 : 20, mz: i % 2 ? 3 : -3, vy: i % 7, vz: i % 11, torsion: 0,
  } }])[0]!.section(i % 2 ? 'Mz' : 'My'),
}));
afterEach(() => vi.restoreAllMocks());
for (const trace of [false, true]) for (const count of [0, 1, 255, 256, 257]) {
  it(`every batched steel result equals its scalar result trace=${trace} count=${count}`, () => {
    const data = inputs(count), expected = data.map(i => verifyByFlange(i, { trace }));
    const call = vi.spyOn(kernel, 'engineCheckMembers');
    expect(verifyByFlanges(data, { trace })).toEqual(expected);
    expect(call).toHaveBeenCalledTimes(Math.ceil(count / 256));
  });
}
for (const failure of ['missing', 'reordered', 'unavailable'] as const) {
  it(`a ${failure} engine batch cannot return a passing member`, () => {
    const data = inputs(2), real = kernel.engineCheckMembers;
    vi.spyOn(kernel, 'engineCheckMembers').mockImplementation((...args) => {
      const out = real(...args)!;
      return failure === 'missing' ? out.slice(1) : failure === 'reordered' ? out.reverse() : null;
    });
    const actual = verifyByFlanges(data);
    expect(actual).toHaveLength(2);
    expect(actual.map(v => v.elementId)).toEqual(data.map(i => i.elementId));
    expect(actual.every(v => v.overallStatus === 'fail' && !v.engine.available)).toBe(true);
  });
}

it('screening omits calculation rendering while retaining every engineering field', () => {
  const data = inputs(8);
  const strip = (value: unknown): unknown => Array.isArray(value) ? value.map(strip)
    : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== 'steps' && key !== 'messages').map(([key, v]) => [key, strip(v)])) : value;
  const screen = verifyByFlanges(data, { trace: false });
  expect(screen.every(v => v.steps.length === 0)).toBe(true);
  expect(strip(screen)).toEqual(strip(verifyByFlanges(data)));
});
