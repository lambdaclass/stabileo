import { declaredTestDemands } from './helpers/declared-demands';
import { afterEach, expect, it, vi } from 'vitest';
import { REBAR_DB } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { computeBiaxialCapacity, computeColumnCapacity, computeColumnLayout, withBiaxialCapacityCache } from '../station-design-forces';
import { getColumnCapacityKernel, registerColumnCapacityKernel } from '../column-capacity-kernel';
import * as engine from '../codes/argentina/cirsoc201-engine';

afterEach(() => vi.restoreAllMocks());

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
  const test = it;
  test(`known wrong result: #2080 reuse each complete biaxial section ${edition} ${axis} ${elementType}`, () => {
    const inputs = declaredTestDemands([20, 100].map((m, i) => ({ comboId: i + 1, comboName: `C${i + 1}`,
      forces: { t: i, x: i * 0.4, n: 0, my: m, mz: m, vy: 1, vz: 1, torsion: 0 } })))
      .map(demand => ({ elementId: 1, elementType, edition, demand: demand.section(axis), b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 }));
    const get = engine.cirsoc201Engine;
    let sections = 0;
    const Section = new Proxy(get('Section'), { construct(target, args) { sections++; return Reflect.construct(target, args); } });
    vi.spyOn(engine, 'cirsoc201Engine').mockImplementation(key => key === 'Section' ? Section : get(key));
    const result = verifyConcurrentElement(inputs);
    expect(result.concurrentChecks).toHaveLength(2);
    expect(result.engineRecheck?.unavailable).toBe(false);
    expect(sections).toBe(elementType === 'beam' ? 0 : 1);
  });
}

for (const field of ['b', 'h', 'fc', 'fy', 'x', 'y', 'diameter', 'edition'] as const) {
  it(`section cache distinguishes exact ${field} inputs, matches uncached values and frees its sections`, () => {
    const base = { b: 0.4, h: 0.4, fc: 30, fy: 420, edition: '2025' as '2005' | '2025',
      bars: computeColumnLayout(8, 16, 0.4, 0.4, 0.025, 8).bars };
    const changed = { ...base, bars: base.bars.map(bar => ({ ...bar })) };
    if (field === 'edition') changed.edition = '2005';
    else if (field === 'x' || field === 'y' || field === 'diameter') changed.bars[0]![field] *= 1 + Number.EPSILON;
    else changed[field] *= 1 + Number.EPSILON;
    const run = (v: typeof base) => computeBiaxialCapacity(8 * REBAR_DB.find(bar => bar.diameter === 16)!.area, v.b, v.h, v.fc, v.fy, 0.025, 8, 0, 20, 100, v.bars, v.edition);
    const expected = [run(base), run(changed)];
    const get = engine.cirsoc201Engine;
    let created = 0, freed = 0;
    const Section = new Proxy(get('Section'), { construct(target, args) {
      created++;
      const section = Reflect.construct(target, args);
      const free = section.free.bind(section);
      section.free = () => { freed++; free(); };
      return section;
    } });
    vi.spyOn(engine, 'cirsoc201Engine').mockImplementation(key => key === 'Section' ? Section : get(key));
    expect(withBiaxialCapacityCache(() => [run(base), run(changed), run(base)])).toEqual([...expected, expected[0]]);
    expect({ created, freed }).toEqual({ created: 2, freed: 2 });
    expect(() => withBiaxialCapacityCache(() => { run(base); throw new Error('interrupted'); })).toThrow('interrupted');
    expect({ created, freed }).toEqual({ created: 3, freed: 3 });
    withBiaxialCapacityCache(() => { run(base); withBiaxialCapacityCache(() => run(base)); run(base); });
    expect({ created, freed }).toEqual({ created: 5, freed: 5 });
  });
}

it('a verification scope asks the section engine once per exact biaxial demand', () => {
  const bars = computeColumnLayout(8, 16, 0.4, 0.4, 0.025, 8).bars;
  const As = 8 * REBAR_DB.find(bar => bar.diameter === 16)!.area;
  const run = (Nu: number, My: number, Mz: number) => computeBiaxialCapacity(As, 0.4, 0.4, 30, 420, 0.025, 8, Nu, My, Mz, bars, '2025');
  const demands: Array<[number, number, number]> = [[300, 20, 100], [300 * (1 + Number.EPSILON), 20, 100], [300, 20 * (1 + Number.EPSILON), 100], [300, 100, 20], [-50, 0, 60], [-50, -0, 60]];
  const expected = demands.map(d => run(...d));
  const get = engine.cirsoc201Engine;
  let asked = 0;
  const Section = new Proxy(get('Section'), { construct(target, args) {
    const section = Reflect.construct(target, args);
    const biaxialFast = section.biaxialFast.bind(section);
    section.biaxialFast = (...demand: Parameters<typeof biaxialFast>) => { asked++; return biaxialFast(...demand); };
    return section;
  } });
  vi.spyOn(engine, 'cirsoc201Engine').mockImplementation(key => key === 'Section' ? Section : get(key));
  expect(withBiaxialCapacityCache(() => [...demands, ...demands, ...demands].map(d => run(...d)))).toEqual([...expected, ...expected, ...expected]);
  expect(asked).toBe(5);
  asked = 0;
  run(...demands[0]!); run(...demands[0]!);
  expect(asked).toBe(2);
});

it('a verification scope solves a column section once per exact section and axial force', () => {
  const kernel = getColumnCapacityKernel()!;
  let solved = 0;
  registerColumnCapacityKernel((...args) => { solved++; return kernel(...args); });
  try {
    const As = 8 * REBAR_DB.find(bar => bar.diameter === 16)!.area;
    const layout = computeColumnLayout(8, 16, 0.4, 0.5, 0.025, 8).bars;
    const moved = layout.map((bar, i) => i ? bar : { ...bar, y: bar.y * (1 + 1e-12) });
    const run = (c: { Nu: number; bars: typeof layout; axis: 'z' | 'y'; fc: number; edition: '2005' | '2025' }) =>
      computeColumnCapacity(As, 0.4, 0.5, c.fc, 420, 0.025, 8, c.Nu, 80, c.bars, c.axis, c.edition);
    const base = { Nu: 400, bars: layout, axis: 'z' as const, fc: 30, edition: '2025' as const };
    const cases = [base, { ...base, Nu: 400 * (1 + Number.EPSILON) }, { ...base, bars: moved }, { ...base, axis: 'y' as const },
      { ...base, fc: 30 * (1 + Number.EPSILON) }, { ...base, edition: '2005' as const }, { ...base, Nu: -30 }];
    const expected = cases.map(run);
    solved = 0;
    expect(withBiaxialCapacityCache(() => [...cases, ...cases].map(run))).toEqual([...expected, ...expected]);
    expect(solved).toBe(cases.length);
    solved = 0;
    run(base); run(base);
    expect(solved).toBe(2);
    withBiaxialCapacityCache(() => { run(base); withBiaxialCapacityCache(() => run(base)); run(base); });
    expect(solved).toBe(4);
  } finally { registerColumnCapacityKernel(kernel); }
});
