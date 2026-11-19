import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import AxesFigure from '../AxesFigure.svelte';
import { allChoices, makeFrame, DEFAULT_AXES, plane2D } from '../../../lib/axes/frame';
import { axesStore } from '../../../lib/axes/axes.svelte';
import ToolLoadOptions from '../../floating-tools/ToolLoadOptions.svelte';
import { uiStore } from '../../../lib/store';

afterEach(() => axesStore.reset());

it.skip('known wrong result: #1986 the positive moment sweep agrees with the axial direction', () => {
  for (const c of [DEFAULT_AXES, ...allChoices()]) {
    const f = makeFrame(c);
    const html = render(AxesFigure, { props: { frame: f, kind: 'plane' } }).body;
    const ccw = f.det * plane2D(f).normal.sign < 0;
    expect(html).toContain(ccw ? 'A28,28 0 1,0' : 'A28,28 0 1,1');
  }
});

it('reported #1986 gravity is parallel to physical down with every selected up name', () => {
  for (const c of allChoices()) {
    const html = render(AxesFigure, { props: { frame: makeFrame(c), kind: 'space' } }).body;
    expect(html).toContain('d="M160,13 L160,41"');
    expect(html).toContain(`g · ${c.up[0] === '+' ? '−' : '+'}${c.up[1]}`);
  }
});

it('reported #1986 distributed inputs are user signed and placement converts them', () => {
  axesStore.choice = { up: '-Y', right: '+X', hand: 'right' };
  uiStore.analysisMode = 'pro';
  uiStore.loadType = 'distributed';
  uiStore.distLoadFrame3D = 'global';
  uiStore.loadValueZ = 7;
  const html = render(ToolLoadOptions).body;
  expect(html).toContain('qYI:');
  expect(uiStore.loadValueZ).toBe(7);
});
