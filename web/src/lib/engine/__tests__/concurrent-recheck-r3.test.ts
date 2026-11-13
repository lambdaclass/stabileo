import { afterEach, expect, it, vi } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import * as gate from '../codes/argentina/cirsoc201-engine-gate';

const inputs = ConcurrentDemand.fromTuples([1, 2].map(comboId => ({ comboId, comboName: `comb ${comboId}`,
  forces: { n: 0, my: 0, mz: 20 / comboId, vy: 5, vz: 0, torsion: 0, t: 0, x: 0 },
}))).map(d => ({ elementId: 1, elementType: 'beam' as const, b: 0.4, h: 0.4, fc: 30, fy: 420,
  cover: 0.025, stirrupDia: 8, demand: d.section('Mz') }));
afterEach(() => vi.restoreAllMocks());

for (const missing of [false, true]) {
  it(`#2080 — aggregate RC certification includes a later ${missing ? 'missing' : 'refused'} certificate`, () => {
    let k = 0;
    vi.spyOn(gate, 'engineRecheckElement').mockImplementation(v => ({ ...v, engineRecheck: {
      edition: '2025', unavailable: false, disagreements: k === 0 ? [] : ['shear'], notRechecked: [],
      certified: k++ === 0 ? { ok: true, lower: 0.1, upper: 0.2 } : missing ? undefined : { ok: false, lower: 0.4, upper: 1.1, reason: 'later refusal' },
    } }));
    const v = verifyConcurrentElement(inputs);
    expect(v.engineRecheck!.certified!.ok).toBe(false);
    expect(v.engineRecheck!.disagreements).toEqual(['shear']);
    if (!missing) expect(v.engineRecheck!.certified).toMatchObject({ lower: 0.4, upper: 1.1, reason: 'later refusal' });
  });
}

it('#2080 — aggregate RC certification preserves an all-certified pass', () => {
  vi.spyOn(gate, 'engineRecheckElement').mockImplementation(v => ({ ...v, engineRecheck: {
    edition: '2025', unavailable: false, disagreements: [], notRechecked: [], certified: { ok: true, lower: 0.1, upper: 0.2 },
  } }));
  expect(verifyConcurrentElement(inputs).engineRecheck!.certified).toEqual({ ok: true, lower: 0.1, upper: 0.2 });
});
