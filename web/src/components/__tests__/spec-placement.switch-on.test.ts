/**
 * Specifications › Fixed points: the three level references drawn and the one in force marked,
 * the joint it casts the columns up to, and each column of more than one storey with its point.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SpecPlacement from '../pro/spec/SpecPlacement.svelte';
import { setLocale } from '../../lib/i18n';
import { modelStore } from '../../lib/store/model.svelte';
import '../../lib/store';
import { setColumnFixedPoint, setLevelReference } from '../../lib/store/placement';
import { stackKey } from '../../lib/rc-sheets/fixed-points';

const text = (html: string) => html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
afterEach(() => { setLocale('en'); modelStore.clear(); });

describe('the fixed points part', () => {
  it('says none is stated until one is, then marks it and the joint the columns are cast up to', () => {
    setLocale('es');
    modelStore.clear();
    const unset = render(SpecPlacement).body;
    expect(unset).toContain('data-testid="placement-unset"');
    for (const r of ['slabTop', 'slabAxis', 'axes']) expect(unset).toContain(`data-testid="placement-ref-${r}"`);
    setLevelReference('slabTop');
    const set = render(SpecPlacement).body;
    expect(set).toMatch(/aria-checked="true"[^>]*data-testid="placement-ref-slabTop"/);
    expect(text(set)).toContain('Las columnas se hormigonan hasta el nivel');
  });

  it('lists each column of more than one storey with its fixed point', () => {
    setLocale('es');
    modelStore.clear();
    const s = modelStore.addSection({ name: '30×30', a: 0.09, iy: 1, iz: 1, j: 1, b: 0.3, h: 0.3, shape: 'rect' } as never);
    const n = [0, 3, 6].map((z) => modelStore.addNode(4.2, 8.5, z));
    for (let k = 0; k < 2; k++) modelStore.updateElementSection(modelStore.addElement(n[k]!, n[k + 1]!, 'frame'), s);
    setColumnFixedPoint(stackKey([4.2, 8.5]), 'pxpy');
    const html = render(SpecPlacement).body;
    expect(html.match(/data-testid="placement-stack"/g)).toHaveLength(1);
    expect(text(html)).toContain('x 4,20 · y 8,50');
    expect(text(html)).not.toContain('420,850');
    expect(html).toMatch(/<option value="pxpy"[^>]*selected/);
  });
});
