/**
 * The reinforcement sheets live in the Analyse stage with no design gate, and read the covers, the
 * steel, the diameters, the stirrup and the seismic data. Wherever those are edited outside the
 * design desk, they are not behind `uiStore.designInPro`; the e2e in `e2e/design-data.spec.ts`
 * edits them with design off.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(process.cwd(), 'src/components/pro', p), 'utf8');

describe('the data the sheets read is editable whenever the sheets are reachable', () => {
  it('the building\'s general data carry the design data panel and the steel grade with design off', () => {
    const s = src('building/BuildingGeneral.svelte');
    expect(s).toContain('<ProDesignDataPanel />');
    expect(s).toContain('data-testid="building-rebar-grade"');
    expect(s).not.toMatch(/designInPro/);
  });

  it('the sheets\' panel opens the design data from one button, without restating them, and keeps no option of its own', () => {
    const s = src('rc-sheets/ProRcSheetsTab.svelte');
    expect(s).toContain('<ProDesignDataPanel />');
    expect(s).not.toContain('rc-dd-summary');
    expect(s).toMatch(/<summary class="rcp-dd-btn"[^>]*data-testid="rc-dd-edit"><Icon name="settings"/);
    expect(s).not.toMatch(/rc-opt-|setRcOption|setTorsionMode|setColumnEndZones/);
    expect(s).not.toMatch(/designInPro/);
  });

  it('the design data hold the options the design takes before it starts, and the seismic data beside chapter 18', () => {
    expect(src('ProDesignDataPanel.svelte')).toContain('<DesignOptionsSections />');
    const o = src('design/DesignOptionsSections.svelte');
    for (const k of ['faces', 'flange', 'bentBars', 'slabBentBars', 'endZones', 'seismic']) expect(o).toContain(`option('${k}')`);
    expect(o).toContain('data-testid="dd-opt-torsion"');
    expect(o).toContain('<SeismicEditor />');
    expect(o).toMatch(/<details class="pk-card do"/);
  });

  it('the design data say what beams and slabs carry for their deflection, how long the load lasts, its sustained share, the creep coefficient and whether to calculate always', () => {
    const o = src('design/DesignOptionsSections.svelte');
    for (const id of ['design-options-deflection', 'dd-defl-supports', 'dd-defl-months', 'dd-defl-sustained', 'dd-defl-creep', 'dd-defl-always']) expect(o).toContain(`data-testid="${id}"`);
    expect(o).toContain('setDeflectionSettings');
  });
});
