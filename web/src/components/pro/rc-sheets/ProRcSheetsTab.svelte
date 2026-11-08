<script lang="ts">
  import { t, tp, i18n } from '../../../lib/i18n';
  import { modelStore, resultsStore } from '../../../lib/store';
  import { buildSheetRows, downloadRcSheets, rcSheetsData, setTorsionMode, type SheetRow } from '../../../lib/store/rc-sheets.svelte';
  import { recognizePhysicalElements, physicalGroups } from '../../../lib/store/physical';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { SHEET_FAMILIES, type SheetFamily, type TorsionMode } from '../../../lib/rc-sheets/types';
  import RcSheetsWorkspace from './RcSheetsWorkspace.svelte';

  let open = $state(false);
  let family = $state<SheetFamily>('beam');

  const solved = $derived(!!resultsStore.results3D);
  const hasPhysical = $derived.by(() => { void modelStore.model.groups; return physicalGroups().length > 0; });
  const rows = $derived.by(() => {
    void resultsStore.perCombo3D; void resultsStore.results3D; void modelStore.designData; void modelStore.model.groups;
    return solved && hasPhysical ? buildSheetRows(makeFmt(decimalFor(i18n.locale))) : null;
  });
  const torsion = $derived.by(() => { void modelStore.designData; return rcSheetsData().torsion; });
  const stat = (list: SheetRow[]) => ({ n: list.length, ok: list.filter((r) => r.status !== 'fail').length, fail: list.filter((r) => r.status === 'fail').length });

  function openAt(f: SheetFamily) { family = f; open = true; }
</script>

<div class="rcp" data-testid="rc-sheets-panel">
  <p class="rcp-intro">{t('rcSheets.desc')}</p>

  {#if !solved}
    <p class="rcp-note">{t('rcSheets.solveFirst')}</p>
  {:else if !hasPhysical}
    <p class="rcp-note">{t('rcSheets.noPhysical')}</p>
    <button type="button" class="rcs-btn" onclick={() => recognizePhysicalElements()} data-testid="rc-recognize">{t('rcSheets.recognize')}</button>
  {:else if rows}
    <p class="rcp-basis" class:warn={rows.basis !== 'combinations'}>
      {rows.basis === 'combinations' ? tp('rcSheets.basis.combinations', { n: rows.combos }) : t(`rcSheets.basis.${rows.basis}`)}
    </p>
    <ul class="rcp-fams">
      {#each SHEET_FAMILIES as f (f)}
        {@const s = stat(rows[f] as SheetRow[])}
        <li>
          <button type="button" onclick={() => openAt(f)} disabled={!s.n} data-testid={`rc-open-${f}`}>
            <span>{t(`rcSheets.family.${f}`)}</span>
            <span class="cnt">{s.n ? tp('rcSheets.counts', { n: s.n, fail: s.fail }) : '—'}</span>
          </button>
        </li>
      {/each}
    </ul>
    <label class="rcp-ctl">
      <span>{t('rcSheets.torsion')}</span>
      <select value={torsion} onchange={(e) => setTorsionMode((e.currentTarget as HTMLSelectElement).value as TorsionMode)}>
        <option value="equilibrium">{t('rcSheets.torsion.equilibrium')}</option>
        <option value="compatibility">{t('rcSheets.torsion.compatibility')}</option>
      </select>
    </label>
    <div class="rcp-actions">
      <button type="button" class="rcs-btn primary" onclick={() => openAt(family)} data-testid="rc-open">{t('rcSheets.open')}</button>
      <button type="button" class="rcs-btn" onclick={() => downloadRcSheets(rows, t)}>{t('rcSheets.export')}</button>
    </div>
    <p class="rcp-note">{t('rcSheets.scopeNote')}</p>
  {/if}
</div>

{#if open}
  <RcSheetsWorkspace bind:family onclose={() => (open = false)} />
{/if}

<style>
  .rcp { display: flex; flex-direction: column; gap: 8px; padding: 8px 10px; }
  .rcp-intro { margin: 0; font-size: 0.76rem; line-height: 1.45; color: var(--st-text-2); }
  .rcp-note { margin: 0; font-size: 0.7rem; line-height: 1.45; color: var(--st-text-3); }
  .rcp-basis { margin: 0; font-size: 0.72rem; color: var(--st-text-2); }
  .rcp-basis.warn { color: var(--st-warn); }
  .rcp-fams { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .rcp-fams button { width: 100%; display: flex; justify-content: space-between; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 5px 8px; font-size: 0.76rem; cursor: pointer; }
  .rcp-fams button:disabled { opacity: 0.55; cursor: default; }
  .cnt { color: var(--st-text-3); font-size: 0.7rem; }
  .rcp-ctl { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 0.72rem; color: var(--st-text-2); }
  .rcp-ctl select { font-size: 0.72rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 4px; }
  .rcp-actions { display: flex; gap: 6px; }
  .rcs-btn { font-size: 0.74rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 4px 10px; cursor: pointer; }
  .rcs-btn.primary { background: var(--st-accent, var(--st-surface-3)); color: var(--st-on-accent, var(--st-text)); }
</style>
