<script lang="ts">
  import OutdatedNotice from '../design/OutdatedNotice.svelte';
  import { t, tp, tpn, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { modelStore, resultsStore } from '../../../lib/store';
  import { downloadRcSheets, meshWallsForSheets, rcSheetsData, sheetsHavePhysical, wallsToMeshForSheets, type SheetRow } from '../../../lib/store/rc-sheets.svelte';
  import { uiStore } from '../../../lib/store/ui.svelte';
  import { runGlobalSolve } from '../../../lib/engine/live-calc';
  import { designSheets, followSheetEdits, sheetSize, sheetsRun, sheetsStale } from '../../../lib/store/rc-sheets-view.svelte';
  import RcSheetsProgress from './RcSheetsProgress.svelte';
  import RcCoversNotice from './RcCoversNotice.svelte';
  import { SHEET_FAMILIES, type SheetFamily } from '../../../lib/rc-sheets/types';
  import { DESIGN_OPTION_FLAGS, optionRule } from '../../../lib/rc-sheets/design-options';
  import { tick } from 'svelte';
  import RcLeftOut from './RcLeftOut.svelte';
  import RcExportLog from './RcExportLog.svelte';
  import RcSheetsWorkspace from './RcSheetsWorkspace.svelte';
  import RcCodePicker from './RcCodePicker.svelte';
  import { SHEET_CODES } from '../../../lib/rc-sheets/types';
  import { sheetCode } from '../../../lib/store/rc-sheets.svelte';
  import { rulesFor } from '../../../lib/rc-sheets/codes';
  import { designData } from '../../../lib/store/design-data';
  import ProDesignDataPanel from '../ProDesignDataPanel.svelte';

  let open = $state(false);
  const code = $derived.by(() => { void modelStore.designData; return sheetCode(); });
  let family = $state<SheetFamily>('beam');

  const solved = $derived(!!resultsStore.results3D);
  const hasPhysical = $derived.by(() => { void modelStore.model.groups; return sheetsHavePhysical(); });
  followSheetEdits();
  const rows = $derived(solved && hasPhysical ? sheetsRun.rows : null);
  const stale = $derived(sheetsStale());
  const dd = $derived.by(() => { void modelStore.designData; return designData(); });
  const seismicOn = $derived.by(() => { void modelStore.designData; return rcSheetsData().seismic === true && rulesFor(code).seismic; });
  /** The design data the sheets design with, in one line: covers, the stirrup lists' floor, torsion and the options on under this code. */
  const ddLine = $derived.by(() => {
    void modelStore.designData;
    const o = rcSheetsData();
    const on = [...DESIGN_OPTION_FLAGS.filter((k) => o[k] && !optionRule(k, code).off), ...(dd.columnEndZones && !optionRule('endZones', code).off ? ['endZones'] : [])];
    return [
      tp('building.general.moreSummary', { c: Math.round(dd.covers.beam * 1000), e: t(`designData.exp.${dd.exposure.beam}`) }),
      `s ≥ ${makeFmt(decimalFor(i18n.locale))(dd.minTieSpacingMm / 10, Number.isInteger(dd.minTieSpacingMm / 10) ? 0 : 1)} cm`, t(`designData.opt.short.torsion.${o.torsion}`), ...on.map((k) => t(`designData.opt.short.${k}`)),
    ].join(' · ');
  });
  let ddOpen = $state(false);
  let ddBox = $state<HTMLDetailsElement | null>(null);
  async function editDesignData() { ddOpen = true; await tick(); ddBox?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  const stat = (list: SheetRow[]) => ({ n: list.length, ok: list.filter((r) => r.status !== 'fail').length, fail: list.filter((r) => r.status === 'fail').length });

  function openAt(f: SheetFamily) { family = f; open = true; }
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
  <OutdatedNotice audit={['rc-sheets']} />
  <p class="rcp-intro">{tp('rcSheets.desc', { code: SHEET_CODES[code].name })}</p>
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
    <div data-testid="rc-panel-code"><RcCodePicker /></div>
    <p class="rcp-note">{t('rcSheets.designHint')}</p>
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
    <div data-testid="rc-panel-code"><RcCodePicker /></div>
    <p class="rcp-note">{t('rcSheets.codeHint')}</p>
    <p class="rcp-basis" class:warn={rows.basis !== 'combinations'}>
      {rows.basis === 'combinations' ? tpn('rcSheets.basis.combinations', rows.combos) : t(`rcSheets.basis.${rows.basis}`)}
    </p>
    <RcLeftOut left={rows.left ?? []} />
    <ul class="rcp-fams">
      {#each SHEET_FAMILIES as f (f)}
        {@const s = stat(f === 'beam' ? rows.line.map((l) => ({ status: l.status === 'fail' || rows.beam.some((r) => r.demand.line?.group === l.group && r.status === 'fail') ? 'fail' : 'ok' })) as never : rows[f] as SheetRow[])}
        <li>
          <button type="button" onclick={() => openAt(f)} disabled={!s.n} data-testid={`rc-open-${f}`}>
            <span>{t(`rcSheets.family.${f}`)}</span>
            <span class="cnt">{s.n ? `${tpn('rcSheets.countMembers', s.n)} · ${tpn('rcSheets.countFailing', s.fail)}` : '—'}</span>
          </button>
        </li>
      {/each}
    </ul>
    <div class="rcp-actions">
      <button type="button" class="rcs-btn primary" onclick={() => openAt(family)} data-testid="rc-open">{t('rcSheets.open')}</button>
      <button type="button" class="rcs-btn" onclick={() => downloadRcSheets(rows, t)} disabled={stale} title={stale ? t('rcSheets.exportStale') : undefined} data-testid="rc-export-workbook">{t('rcSheets.export')}</button>
    </div>
    <p class="rcp-note" data-testid="rc-scope-note">{t('rcSheets.scopeNote')}</p>
    <p class="rcp-note" data-testid="rc-limits-note">{t('rcSheets.limits')}</p>
    {#if seismicOn}<p class="rcp-note">{t('rcSheets.scopeNoteSeismic')}</p>{/if}
  {/if}
  <p class="rcp-dd" data-testid="rc-dd-summary"><span>{t('designData.title')}: {ddLine}</span> <button type="button" class="rcp-link" onclick={editDesignData} data-testid="rc-dd-edit">{t('rcSheets.ddEdit')}</button></p>
  <details class="rcp-more" bind:open={ddOpen} bind:this={ddBox} data-testid="rc-design-data">
    <summary>{t('designData.title')}</summary>
    <ProDesignDataPanel />
  </details>
</div>

{#if open}
  <RcSheetsWorkspace bind:family onclose={() => (open = false)} />
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
  .rcp-more { border-top: 1px solid var(--st-hair); padding-top: 6px; }
  .rcp-more > summary { cursor: pointer; font-size: 0.74rem; color: var(--st-text); }
  .rcp-dd { margin: 0; font-size: 0.7rem; line-height: 1.45; color: var(--st-text-2); }
  .rcp-link { border: none; background: none; padding: 0; color: var(--st-accent, var(--st-text)); text-decoration: underline; cursor: pointer; font-size: 0.7rem; }
  .rcs-btn { font-size: 0.74rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 4px 10px; cursor: pointer; }
  .rcs-btn.primary { background: var(--st-accent, var(--st-surface-3)); color: var(--st-on-accent, var(--st-text)); }
</style>
