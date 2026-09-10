<script lang="ts">
  /**
   * The PRO panel: which destination is open, and the three commands the ribbon delegates here.
   *
   * ── What this file is, after F5 ────────────────────────────────────
   *
   * A router and a pre-solve gate. It was 1 319 lines, over a 600-line ceiling, and three of the
   * things inside it had nothing to do with routing sixteen tabs:
   *
   *   the example catalogue      → `lib/data/pro-examples.ts`      (data, no markup)
   *   the example overlay        → `ProExampleMenu.svelte`         (fixed overlay + its styling)
   *   the report assembly        → `lib/engine/pro-report-inputs.ts` (nine readings of the model)
   *
   * plus 110 lines of CSS whose class names appear in no markup in this tree — `.pm-tool`,
   * `.pm-sel`, `.pro-actions`, `.pro-example-btn`, `.pro-solve-btn`, `.pro-report-btn` and the
   * rest of the desktop action bar, which moved to the ribbon and left its rules behind. They
   * were `css_unused_selector` warnings on every build, which is exactly how `.pro-quality-gate`
   * and `.autosave-banner` survived a release each.
   *
   * ── What did NOT move, and why ─────────────────────────────────────
   *
   * The pre-solve gate. `handleSolve` reads `checkModel` directly and refuses before running,
   * routing the user to Diagnostics — that refusal is the panel's, it is what the ribbon's
   * `canSolve` is about, and a gate that lives away from the command it gates is the riddle this
   * branch has already fixed twice.
   */
  import { t } from '../../lib/i18n';
  import ProProjectFileActions from './ProProjectFileActions.svelte';
  import { modelStore, resultsStore, uiStore, verificationStore, tabManager, historyStore } from '../../lib/store';
  import { buildProStages, PRO_TAB_STAGE, type ProCmd } from '../../lib/pro/stages';
  /*
   * The four the phone's command grid needs.
   *
   * `proStages` below builds the same context `ProRibbon` builds, and it was
   * copied without these: `openRebar3D`, `detailingAuthor`, `canOpenRebar3D`
   * and `detailingStore` were all referenced and none were imported. The phone
   * grid reads `proStages` and evaluates each command's gate, so the panel
   * threw `ReferenceError: canOpenRebar3D is not defined` the moment it
   * mounted — the whole PRO phone shell, not one button.
   *
   * Nothing caught it because the desktop ribbon builds its own context from
   * its own imports and never touches this one, and no test mounted the phone
   * panel. `e2e/pro-mobile-shell.spec.ts` is the one that does now.
   */
  import { detailingStore } from '../../lib/store/detailing.svelte';
  import { detailingAuthor } from '../../lib/store/detailing-author.svelte';
  import { canOpenRebar3D, openRebar3D } from '../../lib/store/rebar-open';
  import Icon from '../ribbon/Icon.svelte';
  import { openReport } from '../../lib/engine/pro-report';
  import type { ReportConfig, ReportData } from '../../lib/engine/pro-report';
  import { buildProReportData } from '../../lib/engine/pro-report-inputs';
  import type { ElementVerification } from '../../lib/engine/codes/argentina/cirsoc201';
  import { computeStationDemands as computeStationDemandsService, runUnifiedVerification } from '../../lib/engine/verification-service';
  import { runGlobalSolve } from '../../lib/engine/live-calc';
  import { proExampleGroups, type ProExample } from '../../lib/data/pro-examples';
  import ProExampleMenu from './ProExampleMenu.svelte';
  import ProReportDialog from './ProReportDialog.svelte';
  import ProNodesTab from './ProNodesTab.svelte';
  import ProProjectTab from './ProProjectTab.svelte';
  import ProElementsTab from './ProElementsTab.svelte';
  import ProMaterialsTab from './ProMaterialsTab.svelte';
  import ProSectionsTab from './ProSectionsTab.svelte';
  import ProSupportsTab from './ProSupportsTab.svelte';
  import ProLoadsTab from './ProLoadsTab.svelte';
  import ProResultsTab from './ProResultsTab.svelte';
  import ProRcWorkflowTab from './ProRcWorkflowTab.svelte';
  import ProShellTab from './ProShellTab.svelte';
  import ProConstraintsTab from './ProConstraintsTab.svelte';
  import ProAdvancedTab from './ProAdvancedTab.svelte';
  import ProDiagnosticsTab from './ProDiagnosticsTab.svelte';
  import ProConnectionsTab from './ProConnectionsTab.svelte';
  /*
   * The metallic tab renders the WORKFLOW, and the workflow renders `SteelPanel` as its last
   * stage — so the inventory is still there, one disclosure in, rather than replaced or duplicated.
   *
   * A ninth tab was the alternative and would have been worse: two metallic surfaces, one of them
   * a subset of the other, and a user having to know which. This is the same tab with the stages
   * around it.
   */
  import ProSteelWorkflowTab from './ProSteelWorkflowTab.svelte';
  import ProGeneratorsPanel from './generators/ProGeneratorsPanel.svelte';
  import { checkModel } from '../../lib/engine/model-diagnostics';

  type ProTab = 'project' | 'nodes' | 'elements' | 'shells' | 'materials' | 'sections' | 'supports' | 'constraints' | 'loads' | 'advanced' | 'results' | 'design' | 'steel' | 'generators' | 'connections' | 'diagnostics';

  /**
   * The destinations, grouped.
   *
   * Only the mobile `<select>` reads this — the desktop navigation is the ribbon, in
   * `App.svelte`. It stays here because the grouping IS the panel's model of itself and the
   * `<optgroup>` labels are the only place a phone user sees it.
   */
  interface TabGroup {
    label: string;
    tabs: { id: ProTab; label: string }[];
  }

  const tabGroups: TabGroup[] = $derived([
    {
      label: t('pro.groupGeometry'),
      tabs: [
        { id: 'nodes' as ProTab, label: t('pro.tabNodes') },
        { id: 'elements' as ProTab, label: t('pro.tabElements') },
        { id: 'shells' as ProTab, label: t('pro.tabShells') },
      ],
    },
    {
      label: t('pro.groupProperties'),
      tabs: [
        { id: 'materials' as ProTab, label: t('pro.tabMaterials') },
        { id: 'sections' as ProTab, label: t('pro.tabSections') },
      ],
    },
    {
      label: t('pro.groupConditions'),
      tabs: [
        { id: 'supports' as ProTab, label: t('pro.tabSupports') },
        { id: 'constraints' as ProTab, label: t('pro.tabConstraints') },
        { id: 'loads' as ProTab, label: t('pro.tabLoads') },
      ],
    },
    {
      label: t('pro.groupAnalysis'),
      tabs: [
        { id: 'advanced' as ProTab, label: t('pro.tabAdvanced') },
        { id: 'results' as ProTab, label: t('pro.tabResults') },
        { id: 'design' as ProTab, label: 'RC Design' },
        { id: 'steel' as ProTab, label: t('steel.panel.title') },
        { id: 'generators' as ProTab, label: t('generator.ui.title') },
        { id: 'connections' as ProTab, label: t('pro.tabConnections') },
        { id: 'diagnostics' as ProTab, label: t('pro.tabDiagnostics') },
      ],
    },
  ]);

  // activeTab is shared via uiStore.proActiveTab so App.svelte can render the nav strip
  const activeTab = $derived(uiStore.proActiveTab as ProTab);
  /** Verification results — derived from verificationStore (single source of truth).
   *  No longer a local $state — reads directly from the store. */
  const verificationsRef = $derived(verificationStore.concrete);
  let advancedResultsRef = $state<Record<string, any>>({});
  let tabError = $state<string | null>(null);
  let showReportDialog = $state(false);
  let solving = $state(false);
  let solveError = $state<string | null>(null);
  let showExampleMenu = $state(false);
  let exampleButtonEl = $state<HTMLButtonElement | null>(null);
  const hasModel = $derived(modelStore.nodes.size > 0 && modelStore.elements.size > 0);
  const exampleGroups = $derived(proExampleGroups(t));

  // Expose action handlers for App.svelte's top strip via bind:this
  export function solve() { handleSolve(); }
  export function report() { handleOpenReportDialog(); }
  export function examples(btnEl: HTMLButtonElement) { exampleButtonEl = btnEl; showExampleMenu = !showExampleMenu; }
  export function isSolving() { return solving; }
  export function canSolve() { return hasModel && !solving; }
  export function canReport() { return modelStore.nodes.size > 0; }
  /**
   * The model's error count, for the ribbon's stage badge.
   *
   * The banner at the top of this panel already knows it, but only this panel
   * shows the banner — so the count was invisible from any other stage. The
   * ribbon needs it to say whether MODEL is clean without the user going to
   * Diagnostics to find out.
   */
  export function errorCount() { return modelErrorCount; }

  /** Pre-solve model quality check — returns error diagnostics if any. */
  function getModelErrors(): import('../../lib/engine/types').SolverDiagnostic[] {
    return checkModel({
      nodes: modelStore.nodes,
      elements: modelStore.elements,
      materials: modelStore.materials,
      sections: modelStore.sections,
      supports: modelStore.supports,
      loads: modelStore.loads as any,
      loadCases: modelStore.model.loadCases,
      plates: modelStore.model.plates,
      quads: modelStore.model.quads,
      connectors: modelStore.model.connectors,
      constraints: modelStore.model.constraints,
    }).filter(d => d.severity === 'error');
  }

  /** Reactive count of blocking model errors (for UI state). */
  const modelErrorCount = $derived.by(() => {
    // Touch reactive deps
    void(modelStore.nodes.size + modelStore.elements.size + modelStore.supports.size + modelStore.loads.length);
    return getModelErrors().length;
  });

  async function handleSolve() {
    solveError = null;

    // ─── Pre-solve quality gate ─────────────────────────
    const errors = getModelErrors();
    if (errors.length > 0) {
      solveError = `${errors.length} ${t('pro.modelErrorsBlock')} — ${t('pro.seeDiagnostics')}`;
      uiStore.proActiveTab = 'diagnostics';
      return;
    }

    solving = true;
    try {
      await runGlobalSolve();
      if (!resultsStore.results3D) {
        solveError = t('pro.noResults');
        solving = false;
        return;
      }
      // Combinations are already solved inside runGlobalSolve for PRO mode
      uiStore.proActiveTab = 'results';
    } catch (e: any) {
      console.error('PRO solve error:', e);
      solveError = e?.message || String(e) || t('pro.unknownError');
    }
    solving = false;
  }

  /** Auto-run CIRSOC verification on current results via unified service. */
  function autoVerify(): ElementVerification[] {
    const results = resultsStore.results3D;
    if (!results) return [];
    const stationData = resultsStore.hasCombinations3D
      ? computeStationDemandsService(resultsStore.perCombo3D, modelStore.model.combinations, { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports })
      : undefined;
    return runUnifiedVerification(
      results,
      { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports },
      resultsStore.governing3D.size > 0 ? resultsStore.governing3D : null,
      stationData?.demands,
    );
  }

  async function handleOpenReportDialog() {
    // Auto-solve if no results yet
    if (!resultsStore.results3D) {
      if (modelStore.nodes.size === 0) { uiStore.toast(t('pro.solveFirst'), 'error'); return; }
      await runGlobalSolve();
    }
    if (!resultsStore.results3D) return;

    // Re-verify CIRSOC against the CURRENT model state — writes to
    // verificationStore, which updates verificationsRef (derived) automatically.
    // (Always, not just when the store is empty: a prior run may have left
    // verifications from a since-edited model, which would put stale results in
    // the report next to current model data.)
    const concrete = autoVerify();
    verificationStore.setConcrete(concrete);

    showReportDialog = true;
  }

  /**
   * Hand the assembled report to the print pipeline.
   *
   * The screenshot is taken here and not in `pro-report-inputs.ts` because it is a reading of
   * the DOM at the instant the user pressed the button — the canvas as it is on screen, not a
   * property of the model. A tainted canvas throws on `toDataURL`; the report goes out without
   * the picture rather than not going out.
   */
  function exportReport(config: ReportConfig) {
    showReportDialog = false;

    let screenshot: string | undefined;
    const canvas = document.querySelector('canvas');
    if (canvas) {
      try { screenshot = canvas.toDataURL('image/png'); } catch { /* ignore */ }
    }

    const data = buildProReportData({
      config,
      verifications: verificationsRef,
      advancedResults: Object.keys(advancedResultsRef).length > 0
        ? advancedResultsRef as ReportData['advancedResults']
        : undefined,
      screenshot,
      t,
    });
    if (!data) return;
    openReport(data);
  }

  async function loadProExample(ex: ProExample) {
    await ex.load();
    uiStore.includeSelfWeight = true;
    // Label overlays off on arrival, whatever the preset: they are unreadable on the large
    // models and unnecessary on the small ones. Grid and axes stay user-controlled.
    uiStore.showLengths3D = false;
    uiStore.showNodeLabels3D = false;
    uiStore.showElementLabels3D = false;
    tabManager.syncActiveTabName();
    resultsStore.clear();
    resultsStore.clear3D();
    showExampleMenu = false;
    setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 200);
    setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 600);
  }

  /* ── The phone's command grid ──────────────────────────────────────────
   *
   * A desktop shows PRO as a ribbon: a row of stages, and under it the groups
   * of whichever stage is open. That does not fit in 375 px — the ANALYSE stage
   * alone carries fifteen commands, and a touch row holds about nine.
   *
   * So on a phone the stage is chosen in the top bar and its commands are drawn
   * HERE, as a grid above the panel's content. The grid grows downward, which a
   * panel can afford and a row cannot: adding a sixteenth command to ANALYSE
   * makes this one cell longer and changes nothing else.
   *
   * Read from `lib/pro/stages.ts`, the same definition the desktop ribbon uses.
   */
  const proStages = $derived(buildProStages({
    solved: resultsStore.results3D != null || resultsStore.results != null,
    canSolve: hasModel && !solving,
    canReport: modelStore.nodes.size > 0,
    onSolve: handleSolve,
    onReport: handleOpenReportDialog,
    /*
     * The 3-D reinforcement workspace is opened from the panel that owns it, so
     * the phone grid's Rebar-3D command lands on the same operation the ribbon's
     * does — three ways in, one thing that happens.
     */
    onRebar3D: () => openRebar3D({
      author: detailingAuthor.resolve(t('detailing.doc.unnamedAuthor')),
      at: new Date().toISOString(),
    }),
    canRebar3D: () => canOpenRebar3D(),
    rebar3DMissingSteps: () => {
      const steps: string[] = [];
      if (resultsStore.results3D == null && resultsStore.results == null) steps.push('proRibbon.need.solve');
      if (verificationStore.providedSummary.total === 0) steps.push('proRibbon.need.design');
      if (detailingStore.assemblies.length === 0) steps.push('proRibbon.need.detailing');
      return steps;
    },
  }));

  /*
   * Which stage the grid is showing. Follows the open tab rather than being a
   * separate selection — two sources of truth for "where am I" is how a ribbon
   * comes to show one stage while the panel shows another. Project belongs to
   * no stage, so the grid keeps showing the one you came from.
   */
  let lastProStage = $state('model');
  const mappedProStage = $derived(PRO_TAB_STAGE[uiStore.proActiveTab] ?? 'model');
  $effect(() => { if (mappedProStage) lastProStage = mappedProStage; });
  const gridStage = $derived(
    proStages.find((s) => s.id === (mappedProStage || lastProStage)) ?? proStages[0],
  );
  /*
   * BY GROUP, not flattened.
   *
   * Flat, ANALYSE was fifteen buttons in five rows with nothing saying where
   * one kind of thing ended and the next began — solve sat beside "no diagram"
   * beside a colour map beside the report. The stages already carry the
   * grouping the desktop ribbon draws as ruled sections; the phone draws it as
   * headings, which is the same information in the shape a column can hold.
   */
  const gridGroups = $derived(gridStage ? gridStage.groups : []);
  const gridCmds = $derived(gridGroups.flatMap((g) => g.cmds));

  /*
   * The grid folds away once it has been used.
   *
   * ANALYSE has fifteen commands, which is five rows — 256 px of a 300 px
   * sheet. Left permanently open it would push the tab's own content below the
   * fold on the stage where that content matters most. So picking a command
   * collapses it: the errand is over, and what you asked for is what you should
   * be looking at. The header re-opens it, and it re-opens itself when the
   * stage changes, because that IS the errand starting again.
   */
  let proGridOpen = $state(true);
  $effect(() => { gridStage; proGridOpen = true; });

  /**
   * The command the panel is currently showing, if any.
   *
   * `proCmdActive` already answers this per command — it is what lights a cell —
   * so the head asks it rather than deciding again from `proActiveTab`. Two
   * answers to "where am I" is how a header comes to name one place while the
   * content shows another.
   */
  const hereCmd = $derived(gridCmds.find((c) => proCmdActive(c)));

  /*
   * Two halves of "where am I", side by side.
   * ────────────────────────────────────────
   * The stage used to be picked in the top bar and the command in a grid down
   * here, which put one half of the address in each place. Both are in the
   * panel now: the right pill chooses the stage, the left one the command
   * inside it, and each is exactly half the width so neither reads as the
   * senior of the two.
   *
   * They are driven entirely by `lib/pro/stages.ts`. A stage added there gets a
   * row in the right pill; a command gets a cell in the left one. Nothing in
   * this component enumerates either.
   */
  let stageMenuOpen = $state(false);

  /*
   * Project is an entry in the COMMAND pill, not a stage.
   * It is the document rather than a step of the work — `PRO_TAB_STAGE` maps it
   * to no stage at all — so it cannot be a fifth row on the right. It sits at
   * the head of the left pill, and choosing it greys the right one out, because
   * there is no stage to be in while you are looking at the document.
   */
  const onProject = $derived(uiStore.proActiveTab === 'project');

  function runProCmd(c: ProCmd) {
    if (c.enabled && !c.enabled()) return;
    if (c.diagram) resultsStore.diagramType = c.diagram as never;
    if (c.tab) { tabError = null; uiStore.proActiveTab = c.tab as never; }
    if (c.action) c.action();
    proGridOpen = false;
  }

  /** Lit when this command is what the panel or the model is showing. */
  function proCmdActive(c: ProCmd): boolean {
    if (c.tab) return uiStore.proActiveTab === c.tab;
    if (c.diagram) {
      const shown = resultsStore.diagramType === 'axialColor' ? 'axial' : resultsStore.diagramType;
      return shown === c.diagram;
    }
    return false;
  }

  /** What the panel calls each destination. */
  const TAB_TITLE: Record<string, string> = {
    project: 'ribbon.project', nodes: 'pro.tabNodes', elements: 'pro.tabElements',
    shells: 'pro.tabShells', materials: 'pro.tabMaterials', sections: 'pro.tabSections',
    supports: 'pro.tabSupports', constraints: 'pro.tabConstraints', loads: 'pro.tabLoads',
    advanced: 'ribbon.advanced', results: 'ribbon.results', design: 'pro.tabDesign',
    // The panel's heading follows the command that opens it. Leaving it at
    // `pro.tabConnections` would have put "Uniones metálicas" on the ribbon and "Conexiones"
    // on the panel it opens, which is two names for one place.
    connections: 'proRibbon.cmdSteelJoints', diagnostics: 'pro.tabDiagnostics',
    // Same rule for the two metallic destinations: the heading repeats the ribbon command
    // (`proRibbon.cmdSteelStructures` / `proRibbon.cmdSteelProfiles`), not the fallback
    // "Nodes" the map used to produce for both.
    steel: 'proRibbon.cmdSteelProfiles', generators: 'proRibbon.cmdSteelStructures',
  };
</script>

<div class="pro-panel">
  {#if uiStore.isMobile}
    <!-- Mobile-only PRO navigation and actions (tools moved to upper toolbar in App.svelte) -->
    <div class="pro-mobile-nav">
      <!--
        No action row here at all.
        ─────────────────────────
        It held Open, Save, Examples, Solve and Report above every tab. Solve and
        Report are ANALYSE commands and are in the grid; Open, Save and Examples
        belong to the document and are in the Project tab's own sections, where
        the reader already goes to start or file a model. A header that repeats
        five buttons over the nodes table, over diagnostics, over RC design is a
        permanent cost for errands you run twice a session.
      -->
      <!--
        The stage's commands, as a grid.
        ───────────────────────────────
        This replaces a native `<select>` that listed all thirteen panel tabs in
        one flat drop-down. The select was honest and it scaled, but it hid every
        destination behind a tap and told the reader nothing about the shape of
        the application — which stage they were in, what else was in it, or that
        stages existed at all. It also could not offer the eight diagrams or the
        two colour maps, because those are not tabs, so on a phone they were
        unreachable.

        A grid says all of it at once and still grows: a sixteenth command in
        ANALYSE is one more cell, and nothing above or below has to move.
      -->
      <!--
        Two pills, half the width each: command on the left, stage on the right.
        The left one always says where you are, because it is the half that
        survives when the grid is folded.
      -->
      <div class="pm-pills">
        <button
          class="pm-pill pm-pill-cmd"
          class:open={proGridOpen}
          onclick={() => { proGridOpen = !proGridOpen; stageMenuOpen = false; }}
          aria-expanded={proGridOpen}
          data-testid="pm-grid-toggle"
        >
          <span class="pm-pill-face">
            {#if onProject}
              <span class="pm-pill-icon"><Icon name="project" size={15} /></span>
              <span class="pm-pill-text">{t('ribbon.project')}</span>
            {:else if hereCmd}
              <span class="pm-pill-icon"><Icon name={hereCmd.icon ?? 'data'} size={15} rotate={hereCmd.rotate ?? 0} /></span>
              <span class="pm-pill-text">{hereCmd.label ?? t(hereCmd.labelKey)}</span>
            {:else}
              <span class="pm-pill-text pm-pill-dim">{t('pro.tabNodes')}</span>
            {/if}
          </span>
          <span class="pm-caret" aria-hidden="true"></span>
        </button>

        <!--
          Greyed on the Project screen: the document belongs to no stage, so
          naming one would claim a place the panel is not showing.
        -->
        <button
          class="pm-pill pm-pill-stage"
          class:open={stageMenuOpen}
          disabled={onProject}
          onclick={() => { stageMenuOpen = !stageMenuOpen; proGridOpen = false; }}
          aria-expanded={stageMenuOpen}
          data-testid="pm-stage-toggle"
        >
          <span class="pm-pill-face">
            <span class="pm-pill-text">{gridStage ? t(gridStage.labelKey) : ''}</span>
          </span>
          <span class="pm-caret" aria-hidden="true"></span>
        </button>
      </div>

      <!--
        What a drag picks up, shown HERE rather than in the bar.
        ──────────────────────────────────────────────────────
        Five translated words do not fit in a 375 px toolbar in any language —
        as chips up there they wrapped the bar onto a second line. They are
        options OF the pointer, so they appear when the pointer is armed, in the
        panel, which has the width. Pressing Selección in the bar opens the
        sheet for exactly this reason.
      -->
      {#if uiStore.currentTool === 'select'}
        <div class="pm-select-modes" data-testid="pm-select-modes">
          {#each [
            { id: 'nodes', key: 'float.selectNodes' },
            { id: 'elements', key: 'float.selectElements' },
            { id: 'shells', key: 'float.selectShells' },
            { id: 'supports', key: 'float.selectSupports' },
            { id: 'loads', key: 'float.selectLoads' },
          ] as const as sm (sm.id)}
            <button
              class="pm-sel"
              class:active={uiStore.selectMode === sm.id}
              onclick={() => uiStore.selectMode = sm.id}
            >{t(sm.key)}</button>
          {/each}
        </div>
      {/if}

      {#if stageMenuOpen}
        <div class="pm-stage-list" data-testid="pm-stage-list">
          {#each proStages as st (st.id)}
            <button
              class="pm-stage-item"
              class:active={gridStage?.id === st.id}
              data-testid="pm-stage-{st.id}"
              onclick={() => { uiStore.proActiveTab = st.home; stageMenuOpen = false; }}
            >{t(st.labelKey)}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if solveError}
    <div class="pro-solve-error">{solveError}</div>
  {/if}

  <!--
    The panel says what it is showing, as Basic's does.
    ──────────────────────────────────────────────────
    It opened straight into content, so the ✕ floated with nothing beside it
    and the one thing the panel could not tell you was which of thirteen
    destinations you were looking at.

    The model-diagnostics chip is NOT here.

    It used to render on every tab, driven by `modelErrorCount > 0`, and `checkModel` returns
    three errors for an empty model — so an untouched PRO opened with a yellow "⚠ 3" over the
    right panel before the user had done anything. It now lives at the right of the Design
    command row, where the commands it blocks are, and only once it has something to say:
    `lib/store/diagnostics-warning.svelte.ts` holds the rule and the dismissal policy.

    Global visibility is not lost. The ribbon's MODEL badge still carries the count, under the
    same arming rule, so the fact is reachable from any tab without interrupting from all of
    them. `modelErrorCount` stays exported for the ribbon and for the pre-solve gate — the
    gate reads `checkModel` directly and is not affected by anything the user hides.
  -->
  <header class="pro-head">
    <!--
      Hidden on a phone: the pinned head above already reads `Modelo › Barras`,
      so this band repeated the second half of it directly underneath and cost
      a row of the 204 px the panel has. It stays on a desktop, where nothing
      else names the open tab.
    -->
    {#if !uiStore.isMobile}
      <span class="pro-head-title" data-testid="pro-panel-title">{t(TAB_TITLE[activeTab] ?? 'pro.tabNodes')}</span>
    {/if}
    <!--
      The model-diagnostics chip is NOT here any more.

      It used to render on every tab, driven by `modelErrorCount > 0`, and `checkModel` returns
      three errors for an empty model — so an untouched PRO opened with a yellow "⚠ 3" over the
      right panel before the user had done anything. It now lives at the right of the Design
      command row, where the commands it blocks are, and only once it has something to say:
      `lib/store/diagnostics-warning.svelte.ts` holds the rule and the dismissal policy.

      Global visibility is not lost. The ribbon's MODEL badge still carries the count, under the
      same arming rule, so the fact is reachable from any tab without interrupting from all of
      them. `modelErrorCount` stays exported for the ribbon and for the pre-solve gate — the
      gate reads `checkModel` directly and is not affected by anything the user hides.
    -->
  </header>

  <!-- Tab content -->
  <div class="pro-content">
    <!--
      The grid scrolls; the head above it does not.
      ────────────────────────────────────────────
      `.pro-mobile-nav` sits outside this scroller, so the head is pinned for
      free. The grid used to sit up there with it, which meant ANALYSE's five
      rows held 256 px of the panel permanently and the table below them was a
      slot. Inside the scroll it is there when you look for it and gone when you
      scroll into the numbers — which is what the fold was approximating.
    -->
    {#if uiStore.isMobile}
        {#if proGridOpen}
        <div class="pm-groups" data-stage={gridStage?.id} data-testid="pm-grid">
          <!--
          Project first, on its own, above the stage's groups. Reached from the
          same pill as everything else the panel can show, because from the
          reader's side it is one question — what am I looking at.
        -->
        <section class="pm-group">
          <h4 class="pm-group-title">{t('proProject.documentSection')}</h4>
          <div class="pm-grid">
            <button
              class="pm-cell"
              class:active={onProject}
              data-testid="pm-cmd-project"
              onclick={() => { tabError = null; uiStore.proActiveTab = 'project'; proGridOpen = false; }}
              title={t('ribbon.project')}
            >
              <span class="pm-cell-icon"><Icon name="project" size={20} /></span>
              <span class="pm-cell-label">{t('ribbon.project')}</span>
            </button>
          </div>
        </section>
        {#each gridGroups as g (g.id)}
            <section class="pm-group">
                <h4 class="pm-group-title">{t(g.labelKey)}</h4>
                <div class="pm-grid">
                  {#each g.cmds as c (c.id)}
                    {@const on = !c.enabled || c.enabled()}
                    <button
                        class="pm-cell"
                        class:active={proCmdActive(c)}
                        disabled={!on}
                        data-testid="pm-cmd-{c.id}"
                        onclick={() => runProCmd(c)}
                        title={c.label ? `${t(c.labelKey)} (${c.label})` : t(c.labelKey)}
                    >
                        <!--
                          The icon is always drawn, and the SHORT name goes under it.
                          Before, a diagram cell showed its symbol where the icon goes
                          and the full name underneath — "Momento flector respecto a
                          y" ellipsised to "Momento flector respect…" in a 116 px
                          cell, which is a truncation pretending to be a label. The
                          symbol IS the short name for those; the full one is in the
                          tooltip, exactly as the desktop ribbon does it.
                        -->
                        <span class="pm-cell-icon">
                          <Icon name={c.icon ?? 'data'} size={20} rotate={c.rotate ?? 0} />
                        </span>
                        <span class="pm-cell-label" class:symbol={!!c.label}>{c.label ?? t(c.labelKey)}</span>
                    </button>
                  {/each}
                </div>
            </section>
          {/each}
        </div>
        {/if}
    {/if}
    {#if tabError}
      <div class="pro-tab-error">
        <p>{t('pro.errorInTab').replace('{tab}', activeTab)}</p>
        <pre>{tabError}</pre>
        <button onclick={() => { tabError = null; uiStore.proActiveTab = 'nodes'; }}>{t('pro.backToNodes')}</button>
      </div>
    {:else}
      <svelte:boundary onerror={(e) => { tabError = String(e); console.error('ProPanel tab error:', e); }}>
        {#if activeTab === 'project'}
          <ProProjectTab groups={exampleGroups} onLoadExample={loadProExample} />
        {:else if activeTab === 'nodes'}
          <ProNodesTab />
        {:else if activeTab === 'elements'}
          <ProElementsTab />
        {:else if activeTab === 'shells'}
          <ProShellTab />
        {:else if activeTab === 'materials'}
          <ProMaterialsTab />
        {:else if activeTab === 'sections'}
          <ProSectionsTab />
        {:else if activeTab === 'supports'}
          <ProSupportsTab />
        {:else if activeTab === 'constraints'}
          <ProConstraintsTab />
        {:else if activeTab === 'loads'}
          <ProLoadsTab />
        {:else if activeTab === 'advanced'}
          <ProAdvancedTab bind:advancedResults={advancedResultsRef} />
        {:else if activeTab === 'results'}
          <ProResultsTab />
        {:else if activeTab === 'design'}
          <ProRcWorkflowTab />
        {:else if activeTab === 'steel'}
          <ProSteelWorkflowTab />
        {:else if activeTab === 'generators'}
          <ProGeneratorsPanel />
        {:else if activeTab === 'connections'}
          <ProConnectionsTab />
        {:else if activeTab === 'diagnostics'}
          <ProDiagnosticsTab />
        {/if}
      </svelte:boundary>
    {/if}
  </div>
</div>

<ProExampleMenu
  open={showExampleMenu}
  groups={exampleGroups}
  anchor={exampleButtonEl}
  onpick={loadProExample}
  onclose={() => showExampleMenu = false}
/>

<ProReportDialog
  open={showReportDialog}
  hasResults={!!resultsStore.results3D}
  hasVerifications={verificationsRef.length > 0}
  hasAdvanced={Object.keys(advancedResultsRef).length > 0}
  hasDrift={false}
  hasDiagnostics={resultsStore.diagnostics3D.length > 0}
  hasQuantities={verificationsRef.length > 0}
  ongenerate={exportReport}
  onclose={() => { showReportDialog = false; }}
/>

<style>
  .pro-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 2rem 0.45rem 0.7rem;
    border-bottom: 1px solid var(--st-hair);
    flex: none;
  }

  .pro-head-title {
    font-family: var(--st-mono);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  /* `.pro-head-errors` lived here. Its markup moved to the Design command row — see the note
     in the header above — and the rule went with it rather than being left behind unreachable,
     the way `.autosave-banner` was in App.svelte for a whole release. */

  /* ─── Mobile PRO navigation ─── */
  .pro-mobile-nav {
    padding: 8px 10px;
    border-bottom: 1px solid var(--st-surface-3);
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
    background: var(--st-surface);
  }
  .pm-select-modes {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }
  .pm-sel {
    padding: 4px 8px;
    font-size: 0.68rem;
    color: var(--st-text-2);
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    cursor: pointer;
  }
  .pm-sel:hover { color: var(--st-text); }
  .pm-sel.active { color: var(--st-text); background: var(--st-accent); border-color: var(--st-danger); }
  /* ── The phone's stage grid ─────────────────────────────────────────
     Three columns, because at 375 px that is a 113 px cell — wide enough for
     "Diagnósticos" at a readable size and tall enough to be a 48 px target.
     It wraps downward without limit, which is the property the row it replaced
     did not have and the reason this is a grid at all.
     ──────────────────────────────────────────────────────────────── */
  /* ── The two pills ────────────────────────────────────────────────
     Half the width each, so neither reads as the senior of the two. The left
     one carries the address and is the half that survives a fold.
     ──────────────────────────────────────────────────────────────── */
  .pm-pills {
    display: flex;
    gap: 4px;
    margin-bottom: 4px;
  }

  .pm-pill {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    min-height: 44px;
    padding: 0 8px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-family: var(--st-mono);
    font-size: 0.64rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .pm-pill.open { background: var(--st-surface-2); border-color: var(--st-hair-strong); }
  .pm-pill:disabled { opacity: 0.4; cursor: default; }

  .pm-pill-face {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow: hidden;
  }
  .pm-pill-icon { display: flex; flex: none; color: var(--st-accent); }
  .pm-pill-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pm-pill-dim { color: var(--st-text-3); }

  .pm-caret {
    flex: none;
    width: 0; height: 0;
    border-left: 3.5px solid transparent;
    border-right: 3.5px solid transparent;
    border-top: 4px solid currentColor;
    opacity: 0.7;
  }

  .pm-stage-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px 8px 8px;
  }
  .pm-stage-item {
    min-height: 44px;
    padding: 0 12px;
    text-align: left;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-family: var(--st-mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .pm-stage-item.active {
    background: var(--st-selected-bg);
    border-color: var(--st-accent);
    color: var(--st-text);
  }


  /*
     One column of groups, each a grid of three. The heading is what turns
     fifteen buttons into four things to choose between — the same job the
     vertical rules do between the desktop ribbon's groups.
  */
  .pm-groups {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
  }

  /* ── The table gets the panel's whole scroll ──────────────────────
     Each PRO tab wraps its table in `*-table-wrap`, a box with its own
     `overflow-y: auto`. On a desktop that is right: the panel is tall and the
     controls above the table should stay put while the rows move.

     On a phone it is the reason the table reads as a slot. The panel is ~300 px,
     the tab's own controls take most of it, and the table scrolls inside
     whatever is left — a scroller inside a scroller, the smaller one holding
     the thing you came to read.

     Opened up, the panel is the only scroller: the grid and the tab's controls
     scroll away, and the table's `thead` — already `position: sticky; top: 0`
     in every tab — pins to the top of `.pro-content`, which is directly under
     the head. Exactly one row of column titles, right below the address.
     ──────────────────────────────────────────────────────────────── */
  @media (max-width: 767px) {
    /*
       `*=`, not `$=`. Svelte appends its scope class, so the attribute reads
       "pro-elems-table-wrap svelte-1abc" and an ends-with match never fires —
       the rule looked right, changed nothing, and the table went on scrolling
       inside its own box.
    */
    .pro-content :global([class*='-table-wrap']) {
      flex: none;
      max-height: none;
      overflow: visible;
    }

    /*
       And the tab's own root has to let go too. Each is
       `display: flex; height: 100%`, which pins the whole tab to the panel's
       height and makes the wrap the only thing that can scroll. Height `auto`
       lets the tab be as tall as its table, and `.pro-content` — the panel's
       scroller — takes over.
    */
    .pro-content :global(> div[class^='pro-']) {
      height: auto;
      min-height: 0;
    }

    /* Above the rows it holds, and above the grid if that is still open. */
    .pro-content :global(thead) {
      z-index: 4;
      background: var(--st-surface);
    }
  }

  .pm-group-title {
    margin: 0 0 3px;
    font-family: var(--st-mono);
    font-size: 0.58rem;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  /*
     The count per row follows the screen instead of being three.
     ───────────────────────────────────────────────────────────
     `auto-fill` with a 76 px floor: four across at 375, five at 430, more on a
     tablet — and the cells stay near-square rather than stretching into
     letterboxes as the screen grows, which is what a fixed three columns did.
  */
  .pm-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 4px;
  }

  .pm-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    /* Near-square: the icon needs the height as much as the word needs width. */
    min-height: 62px;
    padding: 4px 2px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    cursor: pointer;
    overflow: hidden;
  }

  .pm-cell-icon { display: flex; color: var(--st-text); line-height: 1; }

  /* N, My, Vz are notation, so the label takes the mono face when it is one. */
  .pm-cell-label.symbol {
    font-family: var(--st-mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .pm-cell-label {
    font-size: 0.56rem;
    line-height: 1.15;
    text-align: center;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pm-cell.active {
    background: var(--st-selected-bg);
    border-color: var(--st-accent);
    color: var(--st-text);
  }
  .pm-cell.active .pm-cell-icon { color: var(--st-accent); }

  /* Greyed, never removed — the same rule the ribbon follows. */
  .pm-cell:disabled { opacity: 0.34; cursor: default; }


  .pro-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--st-surface-3);
    color: var(--st-text);
    overflow: visible;
  }

  /*
     The desktop action bar's rules lived here — `.pro-actions`, `.pro-example-wrap`,
     `.pro-example-btn`, `.pro-solve-btn`, `.pro-report-btn` — plus the mobile tool row's
     `.pm-tools-row`, `.pm-tool` and `.pm-sel`. Solve, Report and Examples became ribbon
     commands and the mobile tools moved to the upper toolbar in `App.svelte`; the markup went
     and the twenty-odd selectors stayed, styling nothing, for as long as nobody read the build
     warnings. Deleted rather than kept "in case", which is what `.pro-quality-gate` was.
  */

  .pro-solve-error {
    padding: 4px 10px;
    font-size: 0.7rem;
    color: var(--st-danger);
    background: rgba(229, 72, 42, 0.1);
    border-bottom: 1px solid var(--st-surface-3);
  }

  /* ─── Content area ─── */
  .pro-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }

  @media (max-width: 767px) {
    /*
       The panel's header goes entirely, not just its title.
       ────────────────────────────────────────────────────
       Hiding the title left the <header> in place with its padding: an empty
       ~21 px band between the pills and the table, which is the "small space
       above the column titles" — it reads as a seam because it belongs to
       neither the pills above it nor the rows below. The pills say what the
       panel is showing, so the header has nothing left to do here.
    */
    .pro-head { display: none; }

    /*
       Sticky on the CELLS, not on `thead`.
       ───────────────────────────────────
       Every PRO table is `border-collapse: collapse`, and a collapsed table
       paints its borders itself rather than letting the row own them — so a
       sticky `thead` travels while a hairline of the row beneath it does not,
       and a sliver of moving values shows along its edge. Sticking the cells
       gives each one its own painted box, and an explicit background and bottom
       border close the seam.
    */
    .pro-content :global(thead th) {
      position: sticky;
      top: 0;
      z-index: 4;
      background: var(--st-surface);
      box-shadow: inset 0 -1px 0 var(--st-hair-strong);
    }
  }

  .pro-tab-error {
    padding: 16px;
    color: var(--st-danger);
    font-size: 0.8rem;
  }
  .pro-tab-error pre {
    background: var(--st-bg);
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.7rem;
    margin: 8px 0;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .pro-tab-error button {
    padding: 6px 14px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    color: var(--st-text-2);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.72rem;
  }
</style>
