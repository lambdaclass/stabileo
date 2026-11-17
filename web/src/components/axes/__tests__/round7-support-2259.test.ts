import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SupportDetails from '../../property/SupportDetails.svelte';
import { modelStore, uiStore } from '../../../lib/store';
import { axesStore } from '../../../lib/axes/axes.svelte';
import { allChoices, makeFrame } from '../../../lib/axes/frame';

afterEach(() => { modelStore.clear(); axesStore.reset(); });
it('known wrong result: #2259 a local member support without dofFrame keeps its own DOFs', () => {
  uiStore.analysisMode = 'pro';
  const sup = { type: 'custom3d', dofLocalElementId: 1, dofRestraints: { tx: true, ty: false, tz: true, rx: false, ry: true, rz: false }, ky: 13, krx: 17, krz: 19 };
  const baseline = render(SupportDetails, { props: { supId: 1, sup } }).body;
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    expect(render(SupportDetails, { props: { supId: 1, sup } }).body).toBe(baseline);
  }
});

it('a global support still permutes its physical restraints into each user frame', () => {
  uiStore.analysisMode = 'pro';
  const sup = { type: 'custom3d', dofRestraints: { tx: true, ty: false, tz: false, rx: false, ry: true, rz: false }, ky: 13, kz: 17, krx: 19, krz: 23 };
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const frame = makeFrame(choice);
    const indices = frame.rows.map(row => row.findIndex(v => v !== 0));
    const html = render(SupportDetails, { props: { supId: 1, sup } }).body;
    const checked = [...html.matchAll(/<input type="checkbox"([^>]*)/g)].map(m => m[1]!.includes('checked'));
    expect(checked).toEqual([...indices.map(i => [true, false, false][i]), ...indices.map(i => [false, true, false][i])]);
    for (const [i, k] of indices.entries()) {
      if (k !== 0) expect(html).toContain(`<span>k${'xyz'[i]}:</span><input type="number" step="100" value="${[0, 13, 17][k]}"`);
    }
  }
});
