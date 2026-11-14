import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import Plot from '../MohrCircle2DPlot.svelte';
import { rotatePlane } from '../../../lib/mohr/plane';
it.skip('known wrong result: #1950 T46 — top shear target agrees with each axis convention', () => {
  for (const tauDown of [true, false]) {
    const { body } = render(Plot, { props: { sx: 100, sy: 0, txy: 0, theta: 0, tauDown, unit: 'MPa' } });
    const label = body.match(/aria-label="[^"]*θ = ([−-]?[\d.,]+)°[^" ]*"[^>]*data-testid="mohr2d-go-tmax"/);
    expect(label).not.toBeNull();
    const theta = Number(label![1].replace('−', '-').replace(',', '.'));
    expect(rotatePlane({ sx: 100, sy: 0, txy: 0 }, theta).txy).toBeCloseTo(tauDown ? -50 : 50, 12);
  }
});
