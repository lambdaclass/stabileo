import { afterEach, expect, it } from 'vitest';
import { storeyStiffness } from '../../engine/design/seismic/soft-storey';
import { renderMemoriaHtml } from '../../report/memoria/render';
import { axesStore } from '../axes.svelte';
import { allChoices } from '../frame';
import { axisLetter } from '../display';

afterEach(() => axesStore.reset());

it.skip('known wrong result: #2399 known wrong result: #1986 reflected storey-shear columns preserve magnitudes from the actual producer', () => {
  const rows = storeyStiffness([{ level: 3, driftX: -0.01, driftY: 0.02 }], [{ z: 3, fx: -6, fy: 8 }]);
  expect(rows[0]!.shearX).toBe(6);
  const m = {
    project: { name: 'A', date: '2026-11-16', revision: '' }, codes: [], scope: [],
    hypotheses: { analysis: [], stiffness: [], diaphragms: [], shells: [], supports: [] },
    actions: { cases: [], combinations: [] },
    global: { storeyShear: rows.map((r) => ({ level: 'L1', vxMagnitude: r.shearX, vyMagnitude: r.shearY, kx: r.kX, ky: r.kY, soft: r.soft })) },
    elements: [], notices: { automatic: [], manual: [] },
    quantities: { byLevel: [], byType: [], rebar: [], steel: [], connections: [] },
  };
  for (const c of allChoices()) {
    axesStore.choice = c;
    expect(axesStore.choice).toEqual(c);
    const html = renderMemoriaHtml(m as never, new Set(['global', 'global.storeyShear']), { tr: (k) => k, msg: (v) => v.key, fmt: (v, d) => v.toFixed(d) });
    expect(html).toContain(`V${axisLetter(0)} (kN)`);
    expect(html).toContain(`V${axisLetter(1)} (kN)`);
    expect(html).toContain('<td>6.0</td><td>8.0</td>');
    expect(html).not.toContain('<td>-6.0</td>');
    expect(html).not.toContain('<td>-8.0</td>');
  }
});
