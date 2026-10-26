<script lang="ts">
  /**
   * The sheet set as an ordered list: each entry a kind of plan with its options (name, scale,
   * levels, tables, format, the setting-out reference), moved up and down, duplicated to have the
   * same kind twice with another configuration, added and removed.
   */
  import { t, tp } from '../../../lib/i18n';
  import { SHEET_FORMATS, SCALES, type SheetFormat } from '../../../lib/sheets/formats';
  import { addEntry, duplicateEntry, moveEntry, patchEntry, removeEntry, type SheetEntry } from '../../../lib/sheets/sheet-entries';
  import { PLAN_KINDS } from '../../../lib/store/work-drawings';

  let { entries, onChange }: { entries: SheetEntry[]; onChange: (next: SheetEntry[]) => void } = $props();
  let open = $state<string | null>(null), adding = $state('');
  const levelsText = (e: SheetEntry) => (e.levels ?? []).join('; ');
  const parseLevels = (v: string) => v.split(/[;,\s]+/).map(Number).filter(Number.isFinite);
</script>

<details class="se" data-testid="sheets-entries">
  <summary>{t('sheet.ui.entries')} <span class="muted">· {tp('sheet.ui.entriesSummary', { n: entries.length })}</span></summary>
  <ol>
    {#each entries as e, i (e.id)}
      <li data-testid="sheets-entry-{e.id}">
        <div class="row">
          <button class="name" onclick={() => (open = open === e.id ? null : e.id)}>{e.label || t(`sheet.kind.${e.kind}`)}{e.label ? ` (${t(`sheet.kind.${e.kind}`)})` : ''}</button>
          <button aria-label={t('sheet.ui.up')} disabled={i === 0} onclick={() => onChange(moveEntry(entries, e.id, i - 1))} data-testid="sheets-entry-up-{e.id}">↑</button>
          <button aria-label={t('sheet.ui.down')} disabled={i === entries.length - 1} onclick={() => onChange(moveEntry(entries, e.id, i + 1))} data-testid="sheets-entry-down-{e.id}">↓</button>
          <button onclick={() => onChange(duplicateEntry(entries, e.id))} data-testid="sheets-entry-dup-{e.id}">{t('sheet.ui.duplicate')}</button>
          <button aria-label={t('sheet.ui.remove')} onclick={() => onChange(removeEntry(entries, e.id))} data-testid="sheets-entry-remove-{e.id}">×</button>
        </div>
        {#if open === e.id}
          <div class="opts">
            <label>{t('sheet.ui.entryLabel')}<input value={e.label ?? ''} onchange={(x) => onChange(patchEntry(entries, e.id, { label: x.currentTarget.value || undefined }))} data-testid="sheets-entry-label-{e.id}" /></label>
            <label>{t('sheet.ui.scale')}<select value={e.scale ?? ''} onchange={(x) => onChange(patchEntry(entries, e.id, { scale: x.currentTarget.value ? Number(x.currentTarget.value) : undefined }))} data-testid="sheets-entry-scale-{e.id}">
              <option value="">{t('sheet.ui.scaleFit')}</option>{#each SCALES as sc}<option value={sc}>1:{sc}</option>{/each}</select></label>
            <label>{t('sheet.ui.levels')}<input placeholder={t('sheet.ui.levelsAll')} value={levelsText(e)} onchange={(x) => onChange(patchEntry(entries, e.id, { levels: parseLevels(x.currentTarget.value).length ? parseLevels(x.currentTarget.value) : undefined }))} /></label>
            <label>{t('sheet.ui.format')}<select value={e.format ?? ''} onchange={(x) => onChange(patchEntry(entries, e.id, { format: (x.currentTarget.value || undefined) as SheetFormat | undefined }))}>
              <option value="">{t('sheet.ui.formatSet')}</option>{#each SHEET_FORMATS as f}<option value={f}>{f}</option>{/each}</select></label>
            <label class="chk"><input type="checkbox" checked={e.tables !== false} onchange={(x) => onChange(patchEntry(entries, e.id, { tables: x.currentTarget.checked ? undefined : false }))} data-testid="sheets-entry-tables-{e.id}" /> {t('sheet.ui.tables')}</label>
            {#if e.kind === 'setout'}
              <label>{t('sheet.ui.setoutRef')}<select value={String(e.options?.ref ?? 'centre')} onchange={(x) => onChange(patchEntry(entries, e.id, { options: { ...e.options, ref: x.currentTarget.value } }))}>
                <option value="centre">{t('sheet.ui.refAxes')}</option><option value="fixed">{t('sheet.ui.refFixed')}</option></select></label>
              {#if e.options?.ref === 'fixed'}
                <label>X<input type="number" step="0.01" value={Number(e.options?.fx ?? 0)} onchange={(x) => onChange(patchEntry(entries, e.id, { options: { ...e.options, fx: Number(x.currentTarget.value) } }))} /></label>
                <label>Y<input type="number" step="0.01" value={Number(e.options?.fy ?? 0)} onchange={(x) => onChange(patchEntry(entries, e.id, { options: { ...e.options, fy: Number(x.currentTarget.value) } }))} /></label>
              {/if}
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ol>
  <div class="row">
    <select bind:value={adding} data-testid="sheets-entry-kind"><option value="">{t('sheet.ui.addKind')}</option>{#each PLAN_KINDS as k}<option value={k}>{t(`sheet.kind.${k}`)}</option>{/each}</select>
    <button disabled={!adding} onclick={() => { onChange(addEntry(entries, adding)); adding = ''; }} data-testid="sheets-entry-add">{t('sheet.ui.add')}</button>
  </div>
</details>

<style>
  .se summary { font-size: 0.68rem; cursor: pointer; color: var(--st-text); }
  .muted { display: inline; font-size: 0.66rem; color: var(--st-text-2); }
  ol { margin: 0.25rem 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.66rem; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.2rem; }
  .name { flex: 1; min-width: 0; text-align: left; }
  button, select, input { font-size: 0.66rem; padding: 0.05rem 0.3rem; background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; }
  button { cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: default; }
  .opts { display: flex; flex-wrap: wrap; gap: 0.25rem 0.6rem; padding: 0.2rem 0 0.3rem; }
  .opts label { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); }
  .opts label.chk { flex-direction: row; align-items: center; }
  .opts input { width: 7rem; }
  .opts input[type='number'] { width: 4rem; }
</style>
