<script lang="ts">
  import { t, tp, tpn } from '../../../lib/i18n';
  import { modelStore, resultsStore } from '../../../lib/store';
  import { downloadRcSheets, meshWallsForSheets, rcSheetsData, sheetsHavePhysical, wallsToMeshForSheets, type SheetRow } from '../../../lib/store/rc-sheets.svelte';
  import { uiStore } from '../../../lib/store/ui.svelte';
  import { runGlobalSolve } from '../../../lib/engine/live-calc';
  import { designSheets, followSheetEdits, sheetSize, sheetsRun, sheetsStale } from '../../../lib/store/rc-sheets-view.svelte';
  import RcSheetsProgress from './RcSheetsProgress.svelte';
  import RcCoversNotice from './RcCoversNotice.svelte';
  import { SHEET_TABS, TAB_FAMILIES, type SheetTab } from '../../../lib/rc-sheets/types';
  import RcLeftOut from './RcLeftOut.svelte';
  import RcExportLog from './RcExportLog.svelte';
  import RcSheetsWorkspace from './RcSheetsWorkspace.svelte';
  import RcRebar3d from './RcRebar3d.svelte';
  import RcCodePicker from './RcCodePicker.svelte';
  import { SHEET_CODES } from '../../../lib/rc-sheets/types';
  import { sheetCode } from '../../../lib/store/rc-sheets.svelte';
  import { rulesFor } from '../../../lib/rc-sheets/codes';
  import { shownFootings } from '../../../lib/rc-sheets/footing-layouts';
  import ProDesignDataPanel from '../ProDesignDataPanel.svelte';
  import Icon from '../../ribbon/Icon.svelte';

  let open = $state(false);
  const code = $derived.by(() => { void modelStore.designData; return sheetCode(); });
  let tab = $state<SheetTab>('beam');

  const solved = $derived(!!resultsStore.results3D);
  const hasPhysical = $derived.by(() => { void modelStore.model.groups; return sheetsHavePhysical(); });
  followSheetEdits();
  const rows = $derived(solved && hasPhysical ? sheetsRun.rows : null);
  const stale = $derived(sheetsStale());
  const seismicOn = $derived.by(() => { void modelStore.designData; return rcSheetsData().seismic === true && rulesFor(code).seismic; });
  const stat = (list: SheetRow[]) => ({ n: list.length, ok: list.filter((r) => r.status !== 'fail').length, fail: list.filter((r) => r.status === 'fail').length });

  function openAt(k: SheetTab) { tab = k; open = true; }
  let solving = $state(false);
  const wallsToMesh = $derived.by(() => { void modelStore.modelVersion; void modelStore.model.groups; return wallsToMeshForSheets().length; });
  async function meshWalls() {
    meshWallsForSheets();
    solving = true;
    try { await runGlobalSolve(); }
    catch (err) { uiStore.toast(err instanceof Error ? err.message : String(err), 'error'); }
    finally { solving = false; }
  }
</script>

<div class="rcp" data-testid="rc-sheets-panel">
  <div class="rcp-code" data-testid="rc-panel-code"><RcCodePicker /></div>
  <p class="rcp-intro" data-testid="rc-code-desc">{tp('rcSheets.desc', { code: SHEET_CODES[code].name })}</p>
  <RcCoversNotice />
  <RcExportLog compact />

  {#if !solved}
    <p class="rcp-note">{t('rcSheets.solveFirst')}</p>
  {:else if !hasPhysical}
    <p class="rcp-note">{t('rcSheets.noPhysical')}</p>
  {:else if sheetsRun.progress}
    {@const z = sheetSize()}
    <p class="rcp-basis" role="status" data-testid="rc-building">{tp('rcSheets.building', { combos: z.combos, members: z.members, shells: z.shells })}</p>
    <RcSheetsProgress progress={sheetsRun.progress} />
  {:else if !rows}
    {#if wallsToMesh > 0}
      <p class="rcp-basis warn">{tpn('rcSheets.wallsToMesh', wallsToMesh)}</p>
      <button type="button" class="rcs-btn" onclick={meshWalls} disabled={solving} data-testid="rc-mesh-walls">{t('rcSheets.meshWalls')}</button>
    {/if}
    <button type="button" class="rcs-btn primary" onclick={designSheets} disabled={solving} data-testid="rc-design">{t('rcSheets.design')}</button>
  {:else}
    {#if wallsToMesh > 0}
      <p class="rcp-basis warn">{tpn('rcSheets.wallsToMesh', wallsToMesh)}</p>
      <button type="button" class="rcs-btn" onclick={meshWalls} disabled={solving} data-testid="rc-mesh-walls">{t('rcSheets.meshWalls')}</button>
    {/if}
    {#if stale}
      <p class="rcp-basis warn" data-testid="rc-stale">{t('rcSheets.stale')}</p>
      <button type="button" class="rcs-btn primary" onclick={designSheets} data-testid="rc-redesign">{t('rcSheets.redesign')}</button>
    {/if}
    <p class="rcp-basis" class:warn={rows.basis !== 'combinations'}>
      {rows.basis === 'combinations' ? tpn('rcSheets.basis.combinations', rows.combos) : t(`rcSheets.basis.${rows.basis}`)}
    </p>
    <RcLeftOut left={rows.left ?? []} />
    <ul class="rcp-fams">
      {#each SHEET_TABS as k (k)}
        {@const s = stat(k === 'beam' ? rows.line.map((l) => ({ status: l.status === 'fail' || rows.beam.some((r) => r.demand.line?.group === l.group && r.status === 'fail') ? 'fail' : 'ok' })) as never : TAB_FAMILIES[k].flatMap((f) => (f === 'footing' ? shownFootings(rows) : rows[f]) as SheetRow[]))}
        <li>
          <button type="button" onclick={() => openAt(k)} disabled={!s.n} data-testid={`rc-open-${k}`}>
            <span>{t(`rcSheets.tab.${k}`)}</span>
            <span class="cnt">{s.n ? `${tpn('rcSheets.countMembers', s.n)} · ${tpn('rcSheets.countFailing', s.fail)}` : '—'}</span>
          </button>
        </li>
      {/each}
    </ul>
    <div class="rcp-actions">
      <button type="button" class="rcs-btn primary" onclick={() => openAt(tab)} data-testid="rc-open">{t('rcSheets.open')}</button>
      <button type="button" class="rcs-btn" onclick={() => downloadRcSheets(rows, t)} disabled={stale} title={stale ? t('rcSheets.exportStale') : undefined} data-testid="rc-export-workbook">{t('rcSheets.export')}</button>
    </div>
    <RcRebar3d {rows} />
    {#if seismicOn}<p class="rcp-note">{t('rcSheets.scopeNoteSeismic')}</p>{/if}
  {/if}
  <details class="rcp-more" data-testid="rc-design-data">
    <summary class="rcp-dd-btn" title={t('rcSheets.ddEdit')} data-testid="rc-dd-edit"><Icon name="settings" size={14} /><span>{t('designData.title')}</span><span class="rcp-dd-caret" aria-hidden="true">›</span></summary>
    <ProDesignDataPanel />
  </details>
</div>

{#if open}
  <RcSheetsWorkspace bind:tab onclose={() => (open = false)} />
{/if}

<style>
  .rcp { display: flex; flex-direction: column; gap: 8px; padding: 8px 10px; }
  .rcp-intro { margin: 0; font-size: 0.76rem; line-height: 1.45; color: var(--st-text-2); }
  .rcp-note { margin: 0; font-size: 0.7rem; line-height: 1.45; color: var(--st-text-3); }
  .rcp-code { margin: 0; display: flex; justify-content: space-between; font-size: 0.76rem; color: var(--st-text-2); }
  .rcp-code strong { color: var(--st-text); }
  .rcp-basis { margin: 0; font-size: 0.72rem; color: var(--st-text-2); }
  .rcp-basis.warn { color: var(--st-warn); }
  .rcp-fams { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .rcp-fams button { width: 100%; display: flex; justify-content: space-between; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 5px 8px; font-size: 0.76rem; cursor: pointer; }
  .rcp-fams button:disabled { opacity: 0.55; cursor: default; }
  .cnt { color: var(--st-text-3); font-size: 0.7rem; }
  .rcp-actions { display: flex; gap: 6px; }
  .rcp-more { border-top: 1px solid var(--st-hair); padding-top: 8px; }
  .rcp-dd-btn { list-style: none; display: flex; align-items: center; gap: 7px; padding: 6px 10px; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); background: var(--st-surface-2); color: var(--st-text); font-size: 0.76rem; font-weight: 500; cursor: pointer; }
  .rcp-dd-btn::-webkit-details-marker { display: none; }
  .rcp-dd-btn:hover { border-color: var(--st-accent); }
  .rcp-dd-btn:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 2px; }
  .rcp-dd-caret { margin-left: auto; color: var(--st-text-3); transition: transform 0.15s; }
  .rcp-more[open] > .rcp-dd-btn { border-color: var(--st-accent); }
  .rcp-more[open] .rcp-dd-caret { transform: rotate(90deg); }
  .rcs-btn { font-size: 0.74rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 4px 10px; cursor: pointer; }
  .rcs-btn.primary { background: var(--st-accent, var(--st-surface-3)); color: var(--st-on-accent, var(--st-text)); }
</style>
