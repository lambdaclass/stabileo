<script lang="ts">
  /**
   * The choices the design takes before it starts, in the design data: the analysis assumptions
   * (moments at the faces, the slab as a flange, torsion), the detailing (bent-up bars in beams and
   * slabs, denser column ends, the closest stirrup spacing) and chapter 18 beside the seismic data.
   * Each says the clause it applies under the code the sheets design to, and why it does not apply
   * where it does not.
   */
  import Hint from '../Hint.svelte';
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { modelStore } from '../../../lib/store';
  import { designData, patchDesignData } from '../../../lib/store/design-data';
  import { rcSheetsData, setColumnEndZones, setRcOption, setTorsionMode, sheetCode } from '../../../lib/store/rc-sheets.svelte';
  import { optionRule, type DesignOptionFlag, type DesignOptionKey } from '../../../lib/rc-sheets/design-options';
  import { MIN_TIE_SPACING_RANGE } from '../../../lib/model/design-data';
  import type { TorsionMode } from '../../../lib/rc-sheets/types';
  import SeismicEditor from '../desk/seismic/SeismicEditor.svelte';

  const code = $derived.by(() => { void modelStore.designData; return sheetCode(); });
  const d = $derived.by(() => { void modelStore.designData; return designData(); });
  const o = $derived.by(() => { void modelStore.designData; return rcSheetsData(); });
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const rule = (k: DesignOptionKey) => optionRule(k, code);
  const on = (k: DesignOptionFlag | 'endZones') => (k === 'endZones' ? d.columnEndZones === true : o[k] === true);
  const set = (k: DesignOptionFlag | 'endZones', v: boolean) => (k === 'endZones' ? setColumnEndZones(v) : setRcOption(k, v));
  const live = (k: DesignOptionFlag | 'endZones') => on(k) && !rule(k).off;
  const summary = (keys: Array<DesignOptionFlag | 'endZones'>, extra: string[] = []) => {
    const named = [...extra, ...keys.filter(live).map((k) => t(`designData.opt.short.${k}`))];
    return named.length ? named.join(' · ') : t('designData.opt.none');
  };
  const ANALYSIS: DesignOptionFlag[] = ['faces', 'flange'];
  const DETAILING: Array<DesignOptionFlag | 'endZones'> = ['bentBars', 'slabBentBars', 'endZones'];
</script>

{#snippet option(k: DesignOptionFlag | 'endZones')}
  {@const r = rule(k)}
  <div class="do-opt" class:off={!!r.off}>
    <label class="do-chk"><input type="checkbox" checked={on(k)} disabled={!!r.off} onchange={(e) => set(k, e.currentTarget.checked)} data-testid="dd-opt-{k}" /> <span>{t(`rcSheets.opt.${k}`)}</span></label>
    <span class="do-cl" data-testid="dd-opt-{k}-clause">{r.clause}</span>
    {#if r.off}<span class="do-off" data-testid="dd-opt-{k}-off">{t(r.off)}</span>{/if}
  </div>
{/snippet}

<details class="pk-card do" data-testid="design-options-analysis">
  <summary><span class="do-h">{t('designData.analysis')}</span> <span class="do-sum" data-testid="design-options-analysis-summary">{summary(ANALYSIS, [t(`designData.opt.short.torsion.${o.torsion}`)])}</span></summary>
  {@render option('faces')}
  {@render option('flange')}
  <div class="do-opt">
    <label class="do-inline">{t('rcSheets.torsion')}
      <select value={o.torsion} onchange={(e) => setTorsionMode(e.currentTarget.value as TorsionMode)} data-testid="dd-opt-torsion">
        <option value="equilibrium">{t('rcSheets.torsion.equilibrium')}</option>
        <option value="compatibility">{t('rcSheets.torsion.compatibility')}</option>
      </select>
    </label>
    <span class="do-cl">{rule('torsion').clause}</span>
  </div>
</details>

<details class="pk-card do" data-testid="design-options-detailing">
  <summary><span class="do-h">{t('designData.detailing')}</span> <span class="do-sum" data-testid="design-options-detailing-summary">{summary(DETAILING, [`s ≥ ${fmt(d.minTieSpacingMm / 10, Number.isInteger(d.minTieSpacingMm / 10) ? 0 : 1)} cm`])}</span></summary>
  {@render option('bentBars')}
  {@render option('slabBentBars')}
  {@render option('endZones')}
  <div class="do-opt">
    <label class="do-inline">{t('designData.minTieSpacing')}
      <input type="number" min={MIN_TIE_SPACING_RANGE.min} max={MIN_TIE_SPACING_RANGE.max} step="5" value={d.minTieSpacingMm} onchange={(e) => { const v = Number(e.currentTarget.value); if (v >= MIN_TIE_SPACING_RANGE.min && v <= MIN_TIE_SPACING_RANGE.max) patchDesignData({ minTieSpacingMm: v }); else e.currentTarget.value = String(d.minTieSpacingMm); }} data-testid="design-data-min-tie-spacing" /> mm
    </label>
    <span class="do-cl">{rule('minTieSpacing').clause}</span>
    <Hint text={t('designData.minTieSpacingHint')} />
  </div>
</details>

<details class="pk-card do" data-testid="design-options-seismic">
  <summary><span class="do-h">{t('designData.seismicSection')}</span> <span class="do-sum" data-testid="design-options-seismic-summary">{summary(['seismic'])}</span></summary>
  {@render option('seismic')}
  {#if live('seismic')}
    <details class="do-sub" data-testid="rc-seismic-data">
      <summary>{t('rcSheets.seismicData')}</summary>
      <SeismicEditor />
    </details>
  {/if}
</details>

<style>
  .do > summary { cursor: pointer; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
  .do-h { font-size: 0.78rem; font-weight: 500; }
  .do-sum { font-size: 0.68rem; color: var(--st-text-2); }
  .do-opt { display: flex; flex-direction: column; gap: 1px; margin: 6px 0 2px; }
  .do-chk { display: flex; align-items: flex-start; gap: 6px; font-size: 0.72rem; color: var(--st-text-2); line-height: 1.35; }
  .do-inline { display: flex; align-items: center; gap: 4px; font-size: 0.72rem; color: var(--st-text-2); }
  .do-inline input { width: 4.5rem; font-size: 0.72rem; }
  .do-cl { font-size: 0.64rem; font-family: var(--st-mono); color: var(--st-text-2); padding-left: 20px; }
  .do-off { font-size: 0.66rem; color: var(--st-warn); padding-left: 20px; }
  .do-opt.off .do-chk { opacity: 0.6; }
  .do-sub { margin-top: 6px; }
  .do-sub > summary { cursor: pointer; font-size: 0.72rem; }
</style>
