<script lang="ts">
  import { t, tp } from '../../../lib/i18n';
  import { modelStore, resultsStore } from '../../../lib/store';
  import { downloadRcSheets, meshWallsForSheets, setColumnEndZones, rcSheetsData, setRcOption, setTorsionMode, wallsToMeshForSheets, type SheetRow } from '../../../lib/store/rc-sheets.svelte';
  import { physicalGroups } from '../../../lib/store/physical';
  import { uiStore } from '../../../lib/store/ui.svelte';
  import { plateSurfaceOf } from '../../../lib/model/physical/plate';
  import { runGlobalSolve } from '../../../lib/engine/live-calc';
  import { designSheets, followSheetEdits, sheetSize, sheetsRun, sheetsStale } from '../../../lib/store/rc-sheets-view.svelte';
  import RcSheetsProgress from './RcSheetsProgress.svelte';
  import { SHEET_FAMILIES, type SheetFamily, type TorsionMode } from '../../../lib/rc-sheets/types';
  import RcSheetsWorkspace from './RcSheetsWorkspace.svelte';
  import RcCodePicker from './RcCodePicker.svelte';
  import { SHEET_CODES } from '../../../lib/rc-sheets/types';
  import { sheetCode } from '../../../lib/store/rc-sheets.svelte';
  import { rulesFor } from '../../../lib/rc-sheets/codes';
  import { designData } from '../../../lib/store/design-data';

  let open = $state(false);
  const code = $derived.by(() => { void modelStore.designData; return sheetCode(); });
  let family = $state<SheetFamily>('beam');

  const solved = $derived(!!resultsStore.results3D);
  const hasPhysical = $derived.by(() => { void modelStore.model.groups; return modelStore.elements.size === 0 ? physicalGroups().length > 0 : physicalGroups().some((g) => !plateSurfaceOf(g)); });
  followSheetEdits();
  const rows = $derived(solved && hasPhysical ? sheetsRun.rows : null);
  const stale = $derived(sheetsStale());
  const torsion = $derived.by(() => { void modelStore.designData; return rcSheetsData().torsion; });
  const options = $derived.by(() => { void modelStore.designData; const d = rcSheetsData(); return { faces: d.faces === true, flange: d.flange === true, seismic: d.seismic === true, bentBars: d.bentBars === true, slabBentBars: d.slabBentBars === true, endZones: designData().columnEndZones === true }; });
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
  <p class="rcp-intro">{tp('rcSheets.desc', { code: SHEET_CODES[code].name })}</p>

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
      <p class="rcp-basis warn">{tp('rcSheets.wallsToMesh', { n: wallsToMesh })}</p>
      <button type="button" class="rcs-btn" onclick={meshWalls} disabled={solving} data-testid="rc-mesh-walls">{t('rcSheets.meshWalls')}</button>
    {/if}
    <div data-testid="rc-panel-code"><RcCodePicker /></div>
    <p class="rcp-note">{t('rcSheets.designHint')}</p>
    <button type="button" class="rcs-btn primary" onclick={designSheets} disabled={solving} data-testid="rc-design">{t('rcSheets.design')}</button>
  {:else}
    {#if wallsToMesh > 0}
      <p class="rcp-basis warn">{tp('rcSheets.wallsToMesh', { n: wallsToMesh })}</p>
      <button type="button" class="rcs-btn" onclick={meshWalls} disabled={solving} data-testid="rc-mesh-walls">{t('rcSheets.meshWalls')}</button>
    {/if}
    {#if stale}
      <p class="rcp-basis warn" data-testid="rc-stale">{t('rcSheets.stale')}</p>
      <button type="button" class="rcs-btn primary" onclick={designSheets} data-testid="rc-redesign">{t('rcSheets.redesign')}</button>
    {/if}
    <div data-testid="rc-panel-code"><RcCodePicker /></div>
    <p class="rcp-note">{t('rcSheets.codeHint')}</p>
    <p class="rcp-basis" class:warn={rows.basis !== 'combinations'}>
      {rows.basis === 'combinations' ? tp('rcSheets.basis.combinations', { n: rows.combos }) : t(`rcSheets.basis.${rows.basis}`)}
    </p>
    <ul class="rcp-fams">
      {#each SHEET_FAMILIES as f (f)}
        {@const s = stat(f === 'beam' ? rows.line.map((l) => ({ status: l.status === 'fail' || rows.beam.some((r) => r.demand.line?.group === l.group && r.status === 'fail') ? 'fail' : 'ok' })) as never : rows[f] as SheetRow[])}
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
    <label class="rcp-chk"><input type="checkbox" checked={options.faces} onchange={(e) => setRcOption('faces', (e.currentTarget as HTMLInputElement).checked)} data-testid="rc-opt-faces" /> <span>{t('rcSheets.opt.faces')}</span></label>
    <label class="rcp-chk"><input type="checkbox" checked={options.flange} onchange={(e) => setRcOption('flange', (e.currentTarget as HTMLInputElement).checked)} data-testid="rc-opt-flange" /> <span>{t('rcSheets.opt.flange')}</span></label>
    <label class="rcp-chk"><input type="checkbox" checked={options.bentBars} onchange={(e) => setRcOption('bentBars', (e.currentTarget as HTMLInputElement).checked)} data-testid="rc-opt-bent-bars" /> <span>{t('rcSheets.opt.bentBars')}</span></label>
    <label class="rcp-chk"><input type="checkbox" checked={options.slabBentBars} onchange={(e) => setRcOption('slabBentBars', (e.currentTarget as HTMLInputElement).checked)} data-testid="rc-opt-slab-bent-bars" /> <span>{t('rcSheets.opt.slabBentBars')}</span></label>
    <label class="rcp-chk"><input type="checkbox" checked={options.endZones} onchange={(e) => setColumnEndZones((e.currentTarget as HTMLInputElement).checked)} data-testid="rc-opt-end-zones" /> <span>{t('rcSheets.opt.endZones')}</span></label>
    {#if rulesFor(code).seismic}<label class="rcp-chk"><input type="checkbox" checked={options.seismic} onchange={(e) => setRcOption('seismic', (e.currentTarget as HTMLInputElement).checked)} data-testid="rc-opt-seismic" /> <span>{t('rcSheets.opt.seismic')}</span></label>{/if}
    <div class="rcp-actions">
      <button type="button" class="rcs-btn primary" onclick={() => openAt(family)} data-testid="rc-open">{t('rcSheets.open')}</button>
      <button type="button" class="rcs-btn" onclick={() => downloadRcSheets(rows, t)}>{t('rcSheets.export')}</button>
    </div>
    <p class="rcp-note" data-testid="rc-scope-note">{t('rcSheets.scopeNote')}</p>
    {#if options.seismic && rulesFor(code).seismic}<p class="rcp-note">{t('rcSheets.scopeNoteSeismic')}</p>{/if}
  {/if}
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
  .rcp-ctl { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 0.72rem; color: var(--st-text-2); }
  .rcp-ctl select { font-size: 0.72rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 4px; }
  .rcp-actions { display: flex; gap: 6px; }
  .rcp-chk { display: flex; align-items: flex-start; gap: 6px; font-size: 0.72rem; color: var(--st-text-2); line-height: 1.35; }
  .rcs-btn { font-size: 0.74rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 4px 10px; cursor: pointer; }
  .rcs-btn.primary { background: var(--st-accent, var(--st-surface-3)); color: var(--st-on-accent, var(--st-text)); }
</style>
