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

  it('the sheets\' panel opens the design data, and the seismic data when its rows follow chapter 18', () => {
    const s = src('rc-sheets/ProRcSheetsTab.svelte');
    expect(s).toContain('<ProDesignDataPanel />');
    expect(s).toContain('<SeismicEditor />');
    expect(s).not.toMatch(/designInPro/);
  });
});
