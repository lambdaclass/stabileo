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
   * plus 110 lines of CSS styling nothing, which were `css_unused_selector` warnings on every
   * build — exactly how `.pro-quality-gate` and `.autosave-banner` survived a release each.
   *
   * ── And a fourth, which the merge with main forced ─────────────────
   *
   * Merging main brought the PRO phone shell inline into this file and took it back to 1 102
   * lines. The three extractions above had survived; the ceiling had not. So the shell went
   * out too:
   *
   *   the shell's state          → `lib/pro/phone-shell.svelte.ts`  (built once)
   *   the pinned pill row        → `ProPhoneNav.svelte`
   *   the command grid           → `ProPhoneGrid.svelte`
   *
   * Two components and not one because the pills render OUTSIDE `.pro-content` to stay pinned
   * and the grid INSIDE it to scroll away — both positions are load-bearing. One state module
   * and not two builders because the pills decide what the grid shows, and because a second
   * copy of the stage context is the shape that already threw on mount.
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
  import { createPhoneShell } from '../../lib/pro/phone-shell.svelte';
  import ProPhoneNav from './ProPhoneNav.svelte';
  import ProPhoneGrid from './ProPhoneGrid.svelte';

  type ProTab = 'project' | 'nodes' | 'elements' | 'shells' | 'materials' | 'sections' | 'supports' | 'constraints' | 'loads' | 'advanced' | 'results' | 'design' | 'steel' | 'generators' | 'connections' | 'diagnostics';


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
  /*
   * The phone shell, built ONCE and handed to both halves.
   *
   * The pills render outside `.pro-content` and the grid inside it, so they cannot be one
   * element — and the pills decide what the grid shows, so the state cannot live in either.
   * `lib/pro/phone-shell.svelte.ts` holds it, and explains why neither component builds the
   * stage context for itself: the copy that already shipped threw on mount.
   *
   * `handleSolve` is passed rather than `runGlobalSolve` because the pre-solve gate is this
   * panel's own refusal and stays here.
   */
  const shell = createPhoneShell({
    hasModel: () => hasModel,
    solving: () => solving,
    onSolve: handleSolve,
    onReport: handleOpenReportDialog,
    clearTabError: () => { tabError = null; },
  });

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
    <ProPhoneNav {shell} />
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
      <ProPhoneGrid {shell} />
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
     `.pm-tools-row` and `.pm-tool`. Solve, Report and Examples became ribbon
     commands and the mobile tools moved to the upper toolbar in `App.svelte`; the markup went
     and the twenty-odd selectors stayed, styling nothing, for as long as nobody read the build
     warnings. Deleted rather than kept "in case", which is what `.pro-quality-gate` was.

     `.pm-sel` was on that list and is NOT any more. Merging main in brought the phone panel's
     select-mode row with it — `.pm-select-modes` at the top of this file's markup uses
     `.pm-sel` on every button — so the rule below styles something again. Removed from the
     list rather than left in it: a note that says a live selector is dead is worse than no
     note, because the next person to read the build warnings will trust it.
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
</style>
