<script lang="ts">
  import { editorActivity } from '../../../lib/utils/editor-activity';
  const editorActive = editorActivity();
  /**
   * The Design stage: one workspace. The rail on the left lists its places, the canvas shows the
   * one in hand (the design data, the steel profiles and connections, the other code, the pieces,
   * the drawings, the specialties and the project's surfaces) and the piece sheet on the right
   * shows the member selected.
   *
   * On a desktop the desk is mounted inside the PRO body row (`App.svelte`) with `docked`, and its
   * parts take the cells of that row's grid around the model viewer, which stays where it is: the
   * rail on the left, the viewer in the centre with the canvas under it, the piece sheet on the
   * right. The viewer is never remounted, so a pick in it is a pick in design (`deskUi.selected`
   * reads the model selection). On a phone the desk is a full-screen sheet, in one column.
   */
  import { resultsStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import { deskUi, deskLayout } from '../../../lib/store/design-desk-ui.svelte';
  import SheetsPanel from '../design/SheetsPanel.svelte';
  import { currentDocument, documentProjectName } from '../../../lib/store/current-document';
  import ProDesignCompleteness from '../design/ProDesignCompleteness.svelte';
  import ProSteelWorkflowTab from '../ProSteelWorkflowTab.svelte';
  import ProConnectionsTab from '../ProConnectionsTab.svelte';
  import { untrack } from 'svelte';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import { runSteelCheck } from '../../../lib/store/steel-check';
  import SteelTakeoff from './steel/SteelTakeoff.svelte';
  import DeskRail from './DeskRail.svelte';
  import DeskInspector from './DeskInspector.svelte';
  import DeskDesignData from './DeskDesignData.svelte';
  import DeskOtherCodes from './DeskOtherCodes.svelte';
  import JointDeskView from './joint/JointDeskView.svelte';
  import MaterialsEditor from './materials/MaterialsEditor.svelte';
  import SeismicEditor from './seismic/SeismicEditor.svelte';
  import StairsEditor from './stairs/StairsEditor.svelte';
  import ElementsEditor from './elements/ElementsEditor.svelte';
  import FireEditor from './fire/FireEditor.svelte';
  import CollabEditor from './collab/CollabEditor.svelte';
  import ArchEditor from './arch/ArchEditor.svelte';
  import SiteEditor from './site/SiteEditor.svelte';
  import { materialCheckState, runMaterialChecks } from '../../../lib/store/material-check.svelte';
  import { leaveDesign } from '../../../lib/pro/design-navigation';

  /** Mounted in the PRO body row beside the viewer (desktop), or as a full-screen sheet (phone). */
  let { docked = false }: { docked?: boolean } = $props();

  const solved = $derived(!!resultsStore.results3D);

  /** Drag the canvas's top edge, when docked: the viewer above takes what the canvas leaves. */
  function startSplit(e: PointerEvent) {
    const y0 = e.clientY, h0 = deskLayout.canvasH;
    const max = window.innerHeight - 220;
    const move = (ev: PointerEvent) => { deskLayout.canvasH = Math.min(max, h0 - (ev.clientY - y0)); };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      deskLayout.remember();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  /* Results are not saved with the project: once there is an analysis, the desk checks the steel and the other materials again on its own. */
  $effect(() => {
    if (!deskUi.open || !solved) return;
    untrack(() => {
      if (verificationStore.steelMap.size === 0) runSteelCheck();
      if (materialCheckState.results.size === 0) runMaterialChecks();
    });
  });

  /* Closing design gives focus back to what opened it (the Design stage), rather than leaving it on the page body. */
  let opener: HTMLElement | null = null;
  $effect(() => {
    if (deskUi.open) { opener = document.activeElement instanceof HTMLElement ? document.activeElement : null; return; }
    const o = opener; opener = null;
    if (o && o.isConnected) queueMicrotask(() => o.focus());
  });

  /*
   * Escape closes the topmost surface only: anything modal above design, a field being typed in,
   * or the content of a place takes the Escape for itself, read in the capture phase before its
   * own handler runs; from the rail, Escape leaves design.
   */
  let surfaceAtKeydown = false;
  $effect(() => {
    const note = (e: KeyboardEvent): void => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      surfaceAtKeydown = !!document.querySelector('[aria-modal="true"]:not([data-testid="design-desk"])')
        || !!t?.closest('input, textarea, select, [role="dialog"], [role="menu"], .dd-canvas, .dd-sheet');
    };
    window.addEventListener('keydown', note, true);
    return () => window.removeEventListener('keydown', note, true);
  });
  function onKey(e: KeyboardEvent) {
    if (!editorActive()) return; if (deskUi.open && e.key === 'Escape' && !surfaceAtKeydown && !e.defaultPrevented) leaveDesign(); }
</script>

<svelte:window onkeydown={onKey} />

{#if deskUi.open}
  <div class="dd st-pro-surface" class:docked role={docked ? 'region' : 'dialog'} aria-modal={docked ? undefined : 'true'} aria-label={t('desk.title')} data-testid="design-desk">
    {#if !docked}
      <header class="dd-head">
        <button class="dd-close" onclick={leaveDesign} aria-label={t('desk.close')} data-testid="desk-close">✕</button>
      </header>
    {/if}

    <aside class="dd-rail">
      <DeskRail />
    </aside>

    <main class="dd-canvas" data-testid="desk-canvas" data-place={deskUi.tab}>
      {#if docked}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="dd-split" role="separator" aria-orientation="horizontal" aria-label={t('desk.split')} onpointerdown={startSplit} data-testid="desk-split"></div>
      {/if}
      <div class="dd-canvas-body">
        {#if deskUi.tab === 'designData'}<DeskDesignData />
        {:else if deskUi.tab === 'connections'}<div class="dd-classic"><ProConnectionsTab /></div>
        {:else if deskUi.tab === 'codes'}<DeskOtherCodes />
        {:else if deskUi.tab === 'joint'}<JointDeskView />
        {:else if deskUi.tab === 'materials'}<MaterialsEditor />
        {:else if deskUi.tab === 'seismic'}<SeismicEditor />
        {:else if deskUi.tab === 'stairs'}<StairsEditor />
        {:else if deskUi.tab === 'elements'}<ElementsEditor />
        {:else if deskUi.tab === 'fire'}<FireEditor />
        {:else if deskUi.tab === 'collab'}<CollabEditor />
        {:else if deskUi.tab === 'arch'}<ArchEditor />
        {:else if deskUi.tab === 'site'}<SiteEditor />
        {:else if deskUi.tab === 'sheets'}<div class="dd-docs"><SheetsPanel resolve={() => currentDocument().doc} projectName={documentProjectName()} autoBuild /></div>
        {:else}<div class="dd-classic"><ProDesignCompleteness /><ProSteelWorkflowTab /><SteelTakeoff /></div>{/if}
      </div>
    </main>
    <div class="dd-sheet"><DeskInspector /></div>
  </div>
{/if}

<style>
  /*
   * As a sheet (phone): the whole window, in one column: the close, the places in a row, the
   * canvas, and the piece sheet under it. Docked (desktop): the box disappears
   * (`display: contents`) and its parts take the cells the PRO body row names for them around the
   * viewer (`App.svelte`, `.desk-docked`).
   */
  .dd { position: fixed; inset: 0; z-index: 900; background: var(--st-bg, var(--st-surface)); color: var(--st-text);
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'head head head' 'rail canvas sheet'; }
  .dd.docked { display: contents; }
  .dd-head { grid-area: head; display: flex; justify-content: flex-end; padding: 4px 8px; border-bottom: 1px solid var(--st-hair); background: var(--st-surface); }
  .dd-close { background: none; border: none; color: var(--st-text-2); font-size: 1rem; cursor: pointer; }
  .dd-rail { grid-area: rail; display: flex; flex-direction: column; min-height: 0; overflow: hidden; border-right: 1px solid var(--st-hair); background: var(--st-surface); color: var(--st-text); }
  .dd-canvas { grid-area: canvas; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--st-bg, var(--st-surface)); color: var(--st-text); }
  .dd.docked .dd-canvas { border-top: 1px solid var(--st-hair-strong); }
  .dd-canvas-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; scroll-padding: 24px; }
  .dd-split { flex: none; height: 6px; cursor: row-resize; background: var(--st-surface-2, var(--st-surface)); border-bottom: 1px solid var(--st-hair); }
  .dd-split:hover { background: var(--st-surface-3); }
  .dd-sheet { grid-area: sheet; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--st-surface); color: var(--st-text); }
  .dd-sheet > :global(.di) { flex: 1; min-height: 0; }
  .dd-docs { padding: 10px; }
  .dd-classic { max-width: 64rem; min-width: 0; }
  @media (max-height: 600px) {
    .dd-rail { overflow: auto; }
  }
  @media (max-width: 767px) {
    .dd { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr) auto;
      grid-template-areas: 'head' 'rail' 'canvas' 'sheet'; }
    .dd-rail { border-right: none; border-bottom: 1px solid var(--st-hair); }
    .dd-sheet { max-height: 38vh; border-top: 1px solid var(--st-hair-strong); }
    .dd-sheet > :global(.di) { overflow: auto; }
  }
</style>
