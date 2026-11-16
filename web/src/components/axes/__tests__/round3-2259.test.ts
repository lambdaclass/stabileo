import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import WhatIfPanel from '../../WhatIfPanel.svelte';
import ToolLoadOptions from '../../floating-tools/ToolLoadOptions.svelte';
import { axesStore } from '../../../lib/axes/axes.svelte';
import { uiStore } from '../../../lib/store';
import { i18n } from '../../../lib/i18n/store.svelte';
import { allChoices, makeFrame, planeSigns } from '../../../lib/axes/frame';

vi.mock('../../../lib/store/whatif.svelte', () => ({ whatIf: { baseline: { loads: [{ type: 'nodal', data: { fx: 7, fz: 11, my: 13 } }] }, loadFactors: [1], all: { e: 1, a: 1, iy: 1 }, releases: {}, supportTypes: {}, isMemberChanged: () => false, memberFactors: () => ({ e: 1, a: 1, iy: 1 }) } }));
afterEach(() => { axesStore.reset(); i18n.locale = 'en'; });

it.skip('known wrong result: #2259 Explore renders nonzero plane nodal forces and moments in every frame', () => {
  uiStore.analysisMode = '2d';
  uiStore.showWhatIf = true;
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const p = planeSigns(makeFrame(choice));
    const html = render(WhatIfPanel, { props: { docked: true } }).body;
    expect(html).toContain(`F${p.h.toLowerCase()}=${p.sx * 7}`);
    expect(html).toContain(`F${p.v.toLowerCase()}=${p.sz * 11}`);
    expect(html).toContain(`${p.sr * 13}`);
  }
});

it.skip('known wrong result: #2259 global and projected creation fields share the permuted axes while local fields retain member axes', () => {
  uiStore.analysisMode = '3d';
  uiStore.loadType = 'distributed';
  axesStore.choice = { up: '+Y', right: '-Z', hand: 'left' };
  for (const frame of ['global', 'projected', 'local'] as const) {
    uiStore.distLoadFrame3D = frame;
    const html = render(ToolLoadOptions).body;
    for (const axis of frame === 'local' ? ['Y', 'Z'] : ['X', 'Y']) expect(html).toContain(`q${axis}I:`);
  }
});

it.skip('known wrong result: #2259 section descriptions name the actual translated figure abbreviations in every locale', async () => {
  const dictionaries = import.meta.glob('../../../lib/i18n/locales/{en,es,pt,de,fr,hu,tr}.ts', { eager: true }) as Record<string, { default: Record<string, string> }>;
  for (const [path, { default: dict }] of Object.entries(dictionaries)) for (const key of ['landing.secKern', 'landing.secNeutralAxis', 'landing.secPressureCenter']) expect(dict['landing.secDesc'], `${path} ${key}`).toContain(dict[key]);
});
