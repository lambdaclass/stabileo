/**
 * Design data › the slab as a beam's flange: off, it offers nothing more; on, every beam or the
 * beams chosen, listed by name.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import DesignOptionsSections from '../pro/design/DesignOptionsSections.svelte';
import { setLocale } from '../../lib/i18n';
import { modelStore } from '../../lib/store/model.svelte';
import '../../lib/store';
import { setFlangeBeams, setRcOption } from '../../lib/store/rc-sheets.svelte';
import { PHYSICAL_GROUP_KIND } from '../../lib/model/physical/types';
import { beamsByName, beamsHolding, parseBeamNames } from '../../lib/rc-sheets/flange-beams';

afterEach(() => { setLocale('en'); modelStore.clear(); });

describe('the flange option', () => {
  it('explains itself and offers every beam or a list, typed or taken from the model, listed by name and level', () => {
    setLocale('es');
    modelStore.clear();
    const off = render(DesignOptionsSections).body;
    expect(off).not.toContain('data-testid="dd-flange-beams"');
    expect(off).toContain('data-testid="dd-flange-explain"');
    setRcOption('flange', true);
    expect(render(DesignOptionsSections).body).toMatch(/aria-checked="true"[^>]*data-testid="dd-flange-all"/);
    const g = modelStore.addGroup('V7', PHYSICAL_GROUP_KIND, { elements: [] }, { data: { kind: 'beam', provenance: 'declared', levelFrom: 'P1' } });
    setFlangeBeams([]);
    const empty = render(DesignOptionsSections).body;
    expect(empty).toMatch(/aria-checked="true"[^>]*data-testid="dd-flange-chosen"/);
    expect(empty).toContain('data-testid="dd-flange-type"');
    expect(empty).toContain('data-testid="dd-flange-empty"');
    setFlangeBeams([g]);
    const listed = render(DesignOptionsSections).body;
    expect(listed).toMatch(/data-testid="dd-flange-beam"[\s\S]*<strong>V7<\/strong>[\s\S]*P1/);
    expect(listed).toContain('data-testid="dd-flange-remove"');
    const list = /list="([^"]+)"/.exec(empty)![1]!;
    expect(empty).toContain(`<datalist id="${list}"`);
    expect(list).not.toBe('fb-names');
  });

  it('reads typed names one by one, finds the beams a selection holds, and sorts them as people read', () => {
    const groups = [
      { id: 1, name: 'V10', kind: PHYSICAL_GROUP_KIND, data: { kind: 'beam' }, members: { elements: [11] } },
      { id: 2, name: 'V2', kind: PHYSICAL_GROUP_KIND, data: { kind: 'beam' }, members: { elements: [12] } },
      { id: 3, name: 'C1', kind: PHYSICAL_GROUP_KIND, data: { kind: 'column' }, members: { elements: [13] } },
    ];
    const beams = beamsByName(groups);
    expect(beams.map((b) => b.name)).toEqual(['V2', 'V10']);
    expect(parseBeamNames('v2, V10; V99', beams)).toEqual({ ids: [2, 1], unknown: ['V99'] });
    expect(beamsHolding(groups, new Set([12, 13]))).toEqual([2]);
  });

  it('sums up the analysis by its options only, the torsion left to its own choice inside', () => {
    setLocale('es');
    modelStore.clear();
    const html = render(DesignOptionsSections).body;
    const summary = /data-testid="design-options-analysis-summary"[^>]*>([^<]*)</.exec(html)![1]!;
    expect(summary.toLowerCase()).not.toContain('torsi');
    expect(html).toContain('data-testid="dd-opt-torsion"');
  });
});

