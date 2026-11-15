import { afterEach, expect, it, vi } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import * as engine from '../codes/argentina/cirsoc201-engine';

afterEach(() => vi.restoreAllMocks());

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const elementType of ['beam', 'column', 'wall'] as const) {
  const test = elementType === 'beam' ? it : it.fails;
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
