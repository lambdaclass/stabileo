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

afterEach(() => { setLocale('en'); modelStore.clear(); });

describe('the flange option', () => {
  it('offers every beam or the chosen ones, listing those by name', () => {
    setLocale('es');
    modelStore.clear();
    expect(render(DesignOptionsSections).body).not.toContain('data-testid="dd-flange-beams"');
    setRcOption('flange', true);
    const all = render(DesignOptionsSections).body;
    expect(all).toMatch(/checked[^>]*data-testid="dd-flange-all"/);
    const g = modelStore.addGroup('V7', PHYSICAL_GROUP_KIND, { elements: [] }, { data: { kind: 'beam', provenance: 'declared' } });
    setFlangeBeams([g]);
    const chosen = render(DesignOptionsSections).body;
    expect(chosen).toMatch(/checked[^>]*data-testid="dd-flange-chosen"/);
    expect(chosen).toMatch(/data-testid="dd-flange-beam">V7/);
  });
});
