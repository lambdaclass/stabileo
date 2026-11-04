<script lang="ts">
  /**
   * The title block as the office's template: the standard block with lines of {variables}, or a
   * blank sheet of free size; the values the project states once (the sheet's number, scale and
   * floor are filled per sheet, and what the project data already says fills itself).
   */
  import { t } from '../../../lib/i18n';
  import { DEFAULT_TITLE_TEMPLATE, TITLE_VARIABLES, type TitleBlockTemplate } from '../../../lib/sheets/sheet-entries';

  let { template, onChange }: { template: TitleBlockTemplate | undefined; onChange: (next: TitleBlockTemplate | undefined) => void } = $props();
  const tb = $derived(template ?? DEFAULT_TITLE_TEMPLATE);
  const set = (p: Partial<TitleBlockTemplate>) => onChange({ ...tb, ...p });
  const PER_SHEET = new Set(['plano', 'escala', 'planta']);
</script>

<details class="tb" data-testid="sheets-title-block">
  <summary>{t('sheet.ui.titleBlock')}</summary>
  <div class="row">
    <label>{t('sheet.ui.tbLayout')}<select value={tb.layout} onchange={(e) => set({ layout: e.currentTarget.value as 'standard' | 'blank' })} data-testid="sheets-tb-layout">
      <option value="standard">{t('sheet.ui.tbStandard')}</option><option value="blank">{t('sheet.ui.tbBlank')}</option></select></label>
    {#if tb.layout === 'blank'}
      <label>{t('sheet.ui.tbWidth')}<input type="number" min="100" max="5000" value={tb.size?.width ?? 841} onchange={(e) => set({ size: { width: Number(e.currentTarget.value), height: tb.size?.height ?? 594 } })} data-testid="sheets-tb-width" /> mm</label>
      <label>{t('sheet.ui.tbHeight')}<input type="number" min="100" max="5000" value={tb.size?.height ?? 594} onchange={(e) => set({ size: { width: tb.size?.width ?? 841, height: Number(e.currentTarget.value) } })} /> mm</label>
    {/if}
  </div>
  {#if tb.layout === 'standard'}
    <label class="lines">{t('sheet.ui.tbLines')}<textarea rows="3" value={tb.lines.join('\n')} onchange={(e) => set({ lines: e.currentTarget.value.split('\n').filter((l) => l.trim()) })} data-testid="sheets-tb-lines"></textarea></label>
    <p class="muted">{t('sheet.ui.tbVars')} {TITLE_VARIABLES.map((v) => `{${v}}`).join(' ')}</p>
    <div class="vals">
      {#each TITLE_VARIABLES.filter((v) => !PER_SHEET.has(v)) as v}
        <label>{v}<input value={tb.values[v] ?? ''} placeholder={t('sheet.ui.tbFromProject')} onchange={(e) => set({ values: { ...tb.values, [v]: e.currentTarget.value || undefined } })} data-testid="sheets-tb-{v}" /></label>
      {/each}
    </div>
  {/if}
  <button onclick={() => onChange(undefined)}>{t('sheet.ui.tbReset')}</button>
</details>

<style>
  .tb summary { font-size: 0.68rem; cursor: pointer; color: var(--st-text); }
  .tb { font-size: 0.66rem; color: var(--st-text-2); }
  .row, .vals { display: flex; flex-wrap: wrap; gap: 0.25rem 0.6rem; margin: 0.25rem 0; }
  label { display: flex; flex-direction: column; gap: 0.1rem; }
  .lines textarea { width: 100%; font-size: 0.66rem; }
  input, select, button, textarea { font-size: 0.66rem; padding: 0.05rem 0.3rem; background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; }
  input[type='number'] { width: 4.5rem; }
  .vals input { width: 8rem; }
  button { cursor: pointer; }
  .muted { margin: 0; }
</style>
