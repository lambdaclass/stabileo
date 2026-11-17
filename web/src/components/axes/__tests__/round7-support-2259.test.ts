import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SupportDetails from '../../property/SupportDetails.svelte';
import { modelStore, uiStore } from '../../../lib/store';
import { axesStore } from '../../../lib/axes/axes.svelte';
import { allChoices } from '../../../lib/axes/frame';

afterEach(() => { modelStore.clear(); axesStore.reset(); });
it.skip('known wrong result: #2259 a local member support without dofFrame keeps its own DOFs', () => {
  uiStore.analysisMode = 'pro';
  const sup = { type: 'custom3d', dofLocalElementId: 1, dofRestraints: { tx: true, ty: false, tz: true, rx: false, ry: true, rz: false }, ky: 13, krx: 17, krz: 19 };
  const baseline = render(SupportDetails, { props: { supId: 1, sup } }).body;
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    expect(render(SupportDetails, { props: { supId: 1, sup } }).body).toBe(baseline);
  }
});
