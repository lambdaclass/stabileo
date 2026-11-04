<script lang="ts">
  import { editorActivity } from '../../../lib/utils/editor-activity';
  const editorActive = editorActivity();
  /**
   * The Design stage: one workspace and one «Size…» for the whole structure. The bar at the top
   * (the four steps of design, their state and the actions of the step in hand), the rail on the
   * left (the places of the step, then the navigator: levels, filters, the members, the way
   * through the failing ones), the canvas (the level's plan by status, the piece editors, the
   * member list, the steel profiles and connections, the other code, the centres of mass and
   * rigidity, the final report, the geometry check, the detailing and the documents) and the
   * piece sheet on the right (the member, its decision and its checks).
   *
   * ── Docked: the body of the Design stage ───────────────────────────
   *
   * On a desktop the desk is not a sheet over the whole window. It is mounted inside the PRO
   * body row (`App.svelte`) with `docked`, and its parts take the cells of that row's grid around
   * the model viewer, which stays where it is in the page: the rail on the left, the viewer in the
   * centre with the canvas under it, the piece sheet on the right. The viewer is never remounted,
   * so its camera is the model's camera on the way in and on the way out, and a pick in it is a
   * pick in design (`deskUi.selected` reads the model selection). On a phone there is no room for
   * the viewer beside it and the desk is a full-screen sheet, in one column.
   *
   * ── No classic view ─────────────────────────────────────────────────
   *
   * The screens the stage used to open beside the viewer (the concrete workflow with its member
   * table and its detailing, the steel profiles, the steel connections, the design data, the
   * check under other codes) are places of the desk now, the same components in the canvas. So
   * there is no «Classic view» to fall back to and nothing in design leaves the stage.
   */
  import { modelStore, resultsStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import { designRunStore } from '../../../lib/store/design-run.svelte';
  import { deskSlabColumnJoint, finalReport, modelLevelCentres, type DeskReport } from '../../../lib/store/design-desk';
  import { deskUi, deskLayout, type DeskTab } from '../../../lib/store/design-desk-ui.svelte';
  import { rebarWorkspace } from '../../../lib/store/rebar-workspace.svelte';
  import { jointChecks } from '../../../lib/store/joint-checks';
  import SheetsPanel from '../design/SheetsPanel.svelte';
  import ListingsPanel from '../design/ListingsPanel.svelte';
  import { currentDocument, documentProjectName } from '../../../lib/store/current-document';
  import DocumentsSection from '../design/DocumentsSection.svelte';
  import ProDesignCompleteness from '../design/ProDesignCompleteness.svelte';
  import ProSteelWorkflowTab from '../ProSteelWorkflowTab.svelte';
  import ProConnectionsTab from '../ProConnectionsTab.svelte';
  import { deskRows } from './desk-rows';
  import { untrack } from 'svelte';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import { runSteelCheck } from '../../../lib/store/steel-check';
  import DeskProcessBar from './DeskProcessBar.svelte';
  import DeskRail from './DeskRail.svelte';
  import DeskRunDialog from './DeskRunDialog.svelte';
  import DeskNavigator from './DeskNavigator.svelte';
  import DeskPlan from './DeskPlan.svelte';
  import DeskInspector from './DeskInspector.svelte';
  import DeskLevels from './DeskLevels.svelte';
  import DeskReportView from './DeskReportView.svelte';
  import DeskGeometry from './DeskGeometry.svelte';
  import DeskDesignData from './DeskDesignData.svelte';
  import DeskList from './DeskList.svelte';
  import DeskDetailing from './DeskDetailing.svelte';
  import DeskOtherCodes from './DeskOtherCodes.svelte';
  import FrameEditor from './frame/FrameEditor.svelte';
  import ColumnEditor from './column/ColumnEditor.svelte';
  import WallEditor from './wall/WallEditor.svelte';
  import SlabEditor from './slab/SlabEditor.svelte';
  import JoistEditor from './joist/JoistEditor.svelte';
  import FootingEditor from './footing/FootingEditor.svelte';
  import SeismicEditor from './seismic/SeismicEditor.svelte';
  import JointDeskView from './joint/JointDeskView.svelte';
  import MaterialsEditor from './materials/MaterialsEditor.svelte';
  import SpecialFloorsEditor from './special/SpecialFloorsEditor.svelte';
  import StairsEditor from './stairs/StairsEditor.svelte';
  import PostTensionEditor from './pt/PostTensionEditor.svelte';
  import ElementsEditor from './elements/ElementsEditor.svelte';
  import FireEditor from './fire/FireEditor.svelte';
  import BudgetEditor from './budget/BudgetEditor.svelte';
  import CollabEditor from './collab/CollabEditor.svelte';
  import ArchEditor from './arch/ArchEditor.svelte';
  import SiteEditor from './site/SiteEditor.svelte';
  import { materialCheckState, runMaterialChecks } from '../../../lib/store/material-check.svelte';
  import { isDesignEmpty, leaveDesign } from '../../../lib/pro/design-navigation';
  import DeskPrepare from './DeskPrepare.svelte';

  /** Mounted in the PRO body row beside the viewer (desktop), or as a full-screen sheet (phone). */
  let { docked = false }: { docked?: boolean } = $props();

  const rows = $derived.by(() => { void modelStore.elements; void modelStore.designDecisions; void designRunStore.running; void verificationStore.outOfDate; return deskOpen() ? deskRows() : []; });
  const deskOpen = () => deskUi.open;
  const centres = $derived(deskUi.open && (deskUi.tab === 'levels' || deskUi.tab === 'plan') ? modelLevelCentres() : []);
  const levels = $derived(deskUi.open && deskUi.tab === 'report' ? finalReport() : []);
  const solved = $derived(!!resultsStore.results3D);
  /** The editor for a member: a beam's frame, a column's stack. */
  const pieceTabOf = (id: number | null): DeskTab | null => {
    const k = id !== null ? verificationStore.contextFor(id)?.elementType : undefined;
    return k === 'beam' ? 'frame' : k === 'column' ? 'column' : null;
  };
  // In the piece view, selecting a beam or a column opens its editor: the tool follows the selection.
  $effect(() => {
    const id = deskUi.selected;
    untrack(() => {
      if (deskUi.tab !== 'frame' && deskUi.tab !== 'column') return;
      const k = pieceTabOf(id);
      if (k && k !== deskUi.tab) deskUi.tab = k;
    });
  });
  /** Everything the report lists: what fails, what could not be checked, what is out of date, and the joints. */
  const pendingCount = $derived.by(() => {
    if (!deskUi.open) return 0;
    void verificationStore.contexts; void designRunStore.running;
    const lv = finalReport();
    const members = lv.reduce((n, l) => n + l.failing.length + l.unchecked.length + l.stale.length, 0);
    const joints = jointChecks().filter((j) => j.check.status === 'FAIL' || j.check.status === 'UNSUPPORTED').length;
    return members + joints;
  });
  /*
   * Nothing to design yet: the plan offers the two ways in instead of an empty drawing, and the
   * levels too while the model has no member at all. The member list keeps its own empty states,
   * which say what it waits on (a solve, the demands, a model).
   */
  const empty = $derived(deskUi.open && isDesignEmpty(rows.length));
  const routes = $derived(deskUi.tab === 'prepare'
    || (empty && (deskUi.tab === 'plan' || (modelStore.elements.size === 0 && deskUi.tab === 'levels'))));
  /*
   * The place on screen, for the bar and the rail. The ways in stand for an empty plan as its
   * empty state, so the Size step and its places stay where the person put them.
   */
  const place = $derived<DeskTab>(deskUi.tab);

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
  /** Whether a floor's slab is joined to its columns at one node (`analysis-validity.ts`). */
  const joint = $derived(deskSlabColumnJoint());

  /*
   * Messages kept as a key and its parameters, translated where they are shown: a text built
   * when the design ran stayed in that language after the app's changed.
   */
  let error = $state<{ key: string; params: Record<string, string | number> } | null>(null);
  /** After a run: its report, unless it was asked from the member list, which shows each family's result itself. */
  function ran(report: DeskReport, e: typeof error, fromList: boolean) {
    deskUi.report = report;
    error = e;
    if (!fromList) deskUi.tab = 'report';
  }
  /*
   * A project opened with its bars: once there is an analysis, the desk checks them again on its
   * own, the concrete through its demands and the steel through CIRSOC 301. Results are not saved
   * with the project; decisions are, and this is where they are read back.
   */
  $effect(() => {
    if (!deskUi.open || !solved) return;
    untrack(() => {
      const hasBars = [...modelStore.elements.values()].some((e) => e.reinforcement);
      if (hasBars && verificationStore.contexts.size === 0 && !designRunStore.running) designRunStore.computeDemands();
      if (verificationStore.steelMap.size === 0) runSteelCheck();
      if (materialCheckState.results.size === 0) runMaterialChecks();
    });
  });

  /*
   * Closing design gives focus back to what opened it (the Design stage), as the 3-D rebar
   * workspace does, rather than leaving it on the page body.
   */
  let opener: HTMLElement | null = null;
  $effect(() => {
    if (deskUi.open) { opener = document.activeElement instanceof HTMLElement ? document.activeElement : null; return; }
    const o = opener; opener = null;
    if (o && o.isConnected) queueMicrotask(() => o.focus());
  });

  /*
   * Escape closes the topmost surface only. The 3-D workspace opened from the desk sits above it,
   * and its own Escape handler closes it — read in the capture phase, before that handler runs,
   * so the same key does not then find no workspace and leave design as well. The «Size…» dialog
   * closes itself first, for the same reason.
   */
  let surfaceAtKeydown = false;
  $effect(() => {
    const note = (e: KeyboardEvent): void => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      // Anything modal above design (the 3-D view, «Size…», an enlarged sheet, a dialog), a field
      // being typed in, or the content of a place (a list clears its selection on Escape) takes
      // the Escape for itself; from the bars and the rail, Escape leaves design.
      surfaceAtKeydown = rebarWorkspace.open || !!deskUi.ask
        || !!document.querySelector('[aria-modal="true"]:not([data-testid="design-desk"])')
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
    <DeskProcessBar {rows} {docked} {error} {joint} {place} />

    <aside class="dd-rail">
      <DeskRail {pendingCount} {empty} {place} />
      <DeskNavigator {rows} />
    </aside>

    <main class="dd-canvas" data-testid="desk-canvas" data-place={place}>
      {#if docked}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="dd-split" role="separator" aria-orientation="horizontal" aria-label={t('desk.split')} onpointerdown={startSplit} data-testid="desk-split"></div>
      {/if}
      <div class="dd-canvas-body">
        {#if routes}<DeskPrepare {empty} />
        {:else if deskUi.tab === 'designData'}<DeskDesignData />
        {:else if deskUi.tab === 'plan'}<DeskPlan {rows} {centres} />
        {:else if deskUi.tab === 'list'}<DeskList />
        {:else if deskUi.tab === 'steel'}<div class="dd-classic"><ProDesignCompleteness /><ProSteelWorkflowTab /></div>
        {:else if deskUi.tab === 'connections'}<div class="dd-classic"><ProConnectionsTab /></div>
        {:else if deskUi.tab === 'codes'}<DeskOtherCodes />
        {:else if deskUi.tab === 'detailing'}<DeskDetailing />
        {:else if deskUi.tab === 'column'}<ColumnEditor memberId={deskUi.selected} />
        {:else if deskUi.tab === 'wall'}<WallEditor />
        {:else if deskUi.tab === 'slab'}<SlabEditor />
        {:else if deskUi.tab === 'joist'}<JoistEditor />
        {:else if deskUi.tab === 'footing'}<FootingEditor />
        {:else if deskUi.tab === 'seismic'}<SeismicEditor />
        {:else if deskUi.tab === 'joint'}<JointDeskView />
        {:else if deskUi.tab === 'materials'}<MaterialsEditor />
        {:else if deskUi.tab === 'special'}<SpecialFloorsEditor />
        {:else if deskUi.tab === 'stairs'}<StairsEditor />
        {:else if deskUi.tab === 'pt'}<PostTensionEditor />
        {:else if deskUi.tab === 'elements'}<ElementsEditor />
        {:else if deskUi.tab === 'fire'}<FireEditor />
        {:else if deskUi.tab === 'budget'}<BudgetEditor />
        {:else if deskUi.tab === 'collab'}<CollabEditor />
        {:else if deskUi.tab === 'arch'}<ArchEditor />
        {:else if deskUi.tab === 'site'}<SiteEditor />
        {:else if deskUi.tab === 'frame'}{#if deskUi.selected !== null}<FrameEditor memberId={deskUi.selected} />{:else}<p class="dd-hint">{t('frameEd.pick')}</p>{/if}
        {:else if deskUi.tab === 'levels'}<DeskLevels {centres} />
        {:else if deskUi.tab === 'report'}<DeskReportView {levels} />
        {:else if deskUi.tab === 'documents'}<div class="dd-docs"><DocumentsSection recheck={false} /></div>
        {:else if deskUi.tab === 'sheets'}<div class="dd-docs"><SheetsPanel resolve={() => currentDocument().doc} projectName={documentProjectName()} autoBuild /></div>
        {:else if deskUi.tab === 'listings'}<div class="dd-docs"><ListingsPanel resolve={() => currentDocument().doc} /></div>
        {:else}<DeskGeometry />{/if}
      </div>
    </main>
    <div class="dd-sheet"><DeskInspector {rows} /></div>

    <DeskRunDialog onDone={ran} />
  </div>
{/if}

<style>
  /*
   * As a sheet (phone): the whole window, in one column: the steps, the places in a row, the
   * canvas, and the piece sheet under it. Docked (desktop): the box disappears
   * (`display: contents`) and its parts take the cells the PRO body row names for them around the
   * viewer (`App.svelte`, `.desk-docked`).
   */
  .dd { position: fixed; inset: 0; z-index: 900; background: var(--st-bg, var(--st-surface)); color: var(--st-text);
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'head head head' 'rail canvas sheet'; }
  .dd.docked { display: contents; }
  .dd-rail { grid-area: rail; display: flex; flex-direction: column; min-height: 0; overflow: hidden; border-right: 1px solid var(--st-hair); background: var(--st-surface); color: var(--st-text); }
  .dd-rail > :global(.dn) { flex: 1; min-height: 0; border-right: none; border-top: 1px solid var(--st-hair); }
  .dd-canvas { grid-area: canvas; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--st-bg, var(--st-surface)); color: var(--st-text); }
  .dd.docked .dd-canvas { border-top: 1px solid var(--st-hair-strong); }
  /* What is scrolled into view lands clear of the edges, not flush under the viewer's border. */
  .dd-canvas-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; scroll-padding: 24px; }
  .dd-split { flex: none; height: 6px; cursor: row-resize; background: var(--st-surface-2, var(--st-surface)); border-bottom: 1px solid var(--st-hair); }
  .dd-split:hover { background: var(--st-surface-3); }
  .dd-sheet { grid-area: sheet; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--st-surface); color: var(--st-text); }
  .dd-sheet > :global(.di) { flex: 1; min-height: 0; }
  .dd-hint { padding: 12px; font-size: 0.74rem; color: var(--st-text-3); }
  .dd-docs { padding: 10px; }
  /* A panel that was a column of its own beside the viewer: a readable measure in the wide canvas. */
  .dd-classic { max-width: 64rem; min-width: 0; }
  /*
   * A short window (≤ 600 px): the places go in two columns (`DeskRail`) and the member list keeps
   * the rest, never less than a few rows; below that the rail scrolls as one column.
   */
  @media (max-height: 600px) {
    .dd-rail { overflow: auto; }
    .dd-rail > :global(.dn) { min-height: 9rem; }
  }
  /* A phone: one column. The piece sheet follows the canvas and scrolls on its own. */
  @media (max-width: 767px) {
    .dd { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr) auto;
      grid-template-areas: 'head' 'rail' 'canvas' 'sheet'; }
    .dd-rail { border-right: none; border-bottom: 1px solid var(--st-hair); }
    .dd-sheet { max-height: 38vh; border-top: 1px solid var(--st-hair-strong); }
    .dd-sheet > :global(.di) { overflow: auto; }
  }
</style>
