import { afterEach, expect, it, vi } from 'vitest';
import { REBAR_DB } from '../codes/argentina/cirsoc201';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { computeBiaxialCapacity, computeColumnLayout, withBiaxialCapacityCache } from '../station-design-forces';
import * as engine from '../codes/argentina/cirsoc201-engine';

afterEach(() => vi.restoreAllMocks());

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
  const test = it;
  test(`known wrong result: #2080 reuse each complete biaxial section ${edition} ${axis} ${elementType}`, () => {
    const inputs = ConcurrentDemand.fromTuples([20, 100].map((m, i) => ({ comboId: i + 1, comboName: `C${i + 1}`,
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
