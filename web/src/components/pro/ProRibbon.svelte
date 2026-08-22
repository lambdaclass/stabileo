<script lang="ts">
  import { t } from '../../lib/i18n';
  /*
   * Through the barrel, like every other PRO component.
   *
   * Importing `../../lib/store/ui.svelte` directly gave this component its OWN
   * module instance of the store: clicks updated a `uiStore` nobody else read,
   * so the ribbon's own highlight followed the click and the panel never did.
   * One module specifier, one store.
   */
  import { uiStore, modelStore, resultsStore, historyStore, verificationStore } from '../../lib/store';
  import { saveProject } from '../../lib/store/file';
  import Icon from '../ribbon/Icon.svelte';
  import { TWO_D_INTERNAL_FORCE_LABELS as F2D } from '../../lib/geometry/coordinate-system';

  /**
   * PRO's command bar: a two-level ribbon.
   *
   * ── Why tabs here, when Basic refuses them ────────────────────────────
   *
   * Basic's ribbon is one permanent row on purpose: its work is a loop —
   * draw, solve, look — crossed many times a minute, and a tab is the wrong
   * control for something you traverse constantly.
   *
   * PRO is not a loop, it is a pipeline. Modelling the geometry and detailing
   * the reinforcement are activities separated by hours, not seconds. That is
   * the same shape Fusion uses tabs for — Solid and Sheet Metal are not two
   * steps of one gesture, they are two trades. So tabs are right here and
   * wrong there; the two modes are different applications.
   *
   * ── What it replaced ──────────────────────────────────────────────────
   *
   * A single row where four dropdown menus held thirteen destinations and the
   * real commands — Solve, Report, Examples, DXF — were pushed to the far
   * right. Navigation had taken the row that belongs to commands, and no view
   * ever showed the whole structure: you could not see the thirteen
   * destinations together, only whichever menu was open.
   *
   * Now the destinations are buttons under their stage, visible without
   * opening anything, and the commands are back in the row.
   *
   * ── The left column ───────────────────────────────────────────────────
   *
   * Everything left of the rule survives a tab change: the document commands
   * in their 2×2 block, and above them Select and Pan, which are the two
   * controls used at every stage. That is what the rule divides — not
   * decoration, but "this does not belong to any tab".
   */

  type Props = {
    /** Opens the example gallery, anchored to its button. */
    onExamples: (btn: HTMLButtonElement) => void;
    onSolve: () => void;
    onReport: () => void;
    canSolve: boolean;
    canReport: boolean;
    isSolving: boolean;
    /** Model checks that must be cleared before solving. */
    errorCount: number;
    /** Which right-panel view is open, so Project can light up. */
    proPanel: string | null;
    onOpenProject: () => void;
  };
  let {
    onExamples, onSolve, onReport,
    canSolve, canReport, isSolving, errorCount,
    proPanel, onOpenProject,
  }: Props = $props();

  /*
   * Remembered, like the right panel's width: whether you work with the
   * commands showing is a preference, not a per-session accident.
   */
  const RIBBON_KEY = 'stabileo-pro-ribbon-open';
  let ribbonOpen = $state(((): boolean => {
    try { return localStorage.getItem(RIBBON_KEY) !== '0'; } catch { return true; }
  })());
  $effect(() => {
    try { localStorage.setItem(RIBBON_KEY, ribbonOpen ? '1' : '0'); } catch { /* private mode */ }
  });

  const mod = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl';

  let exampleBtn: HTMLButtonElement | undefined = $state();
  let openMenu = $state<string | null>(null);

  /* ── Stages ───────────────────────────────────────────────────────────
   *
   * Four, not five. Examples and DXF are document commands and live in the
   * block on the left with Project and Save; Report is the deliverable of an
   * analysis, not a file operation, so it sits in ANALYSE beside Solve. With
   * those placed, a DOCUMENT tab had nothing left to hold.
   */
  type Cmd = {
    id: string;
    labelKey: string;
    icon?: string;
    /** A literal symbol, for N / My / Vz — these are not translated. */
    label?: string;
    /** Turns the icon, for a force about a perpendicular axis. */
    rotate?: number;
    /** Destination: which panel view this opens. */
    tab?: string;
    /** Sets the diagram drawn on the model. */
    diagram?: string;
    action?: () => void;
    enabled?: () => boolean;
    /** Shown only when the group is expanded. */
    overflow?: boolean;
  };
  type Group = { id: string; labelKey: string; cmds: Cmd[] };
  type Stage = { id: string; labelKey: string; home: string; groups: Group[] };

  const solved = $derived(resultsStore.results3D != null || resultsStore.results != null);

  /*
   * Axial stays lit whichever way it is drawn: `axialColor` is the same
   * quantity presented differently, and that choice lives in the panel.
   */
  const shownDiagram = $derived(
    resultsStore.diagramType === 'axialColor' ? 'axial' : resultsStore.diagramType,
  );

  const STAGES: Stage[] = $derived([
    {
      id: 'model',
      labelKey: 'proRibbon.stageModel',
      home: 'nodes',
      groups: [
        {
          id: 'geometry',
          labelKey: 'ribbon.groupDraw',
          cmds: [
            { id: 'nodes', labelKey: 'pro.tabNodes', icon: 'node', tab: 'nodes' },
            { id: 'elements', labelKey: 'pro.tabElements', icon: 'element', tab: 'elements' },
            { id: 'shells', labelKey: 'pro.tabShells', icon: 'shell', tab: 'shells' },
          ],
        },
        {
          id: 'properties',
          labelKey: 'proRibbon.groupProperties',
          cmds: [
            { id: 'materials', labelKey: 'pro.tabMaterials', icon: 'material', tab: 'materials' },
            { id: 'sections', labelKey: 'pro.tabSections', icon: 'section', tab: 'sections' },
          ],
        },
      ],
    },
    {
      id: 'conditions',
      labelKey: 'ribbon.groupConditions',
      home: 'supports',
      groups: [
        {
          id: 'restraints',
          labelKey: 'proRibbon.groupRestraints',
          cmds: [
            { id: 'supports', labelKey: 'pro.tabSupports', icon: 'support', tab: 'supports' },
            { id: 'constraints', labelKey: 'pro.tabConstraints', icon: 'constraint', tab: 'constraints' },
          ],
        },
        {
          id: 'loads',
          labelKey: 'proRibbon.groupLoads',
          cmds: [
            { id: 'loads', labelKey: 'pro.tabLoads', icon: 'load', tab: 'loads' },
          ],
        },
      ],
    },
    {
      id: 'analyse',
      labelKey: 'ribbon.tabAnalyse',
      home: 'results',
      groups: [
        {
          id: 'run',
          labelKey: 'proRibbon.groupRun',
          cmds: [
            { id: 'solve', labelKey: 'pro.solve', icon: 'solve', action: onSolve, enabled: () => canSolve },
            { id: 'advanced', labelKey: 'ribbon.advanced', icon: 'advanced', tab: 'advanced' },
          ],
        },
        /*
         * The diagrams belong in the ribbon, as they do in Basic.
         *
         * They were a <select> inside the Results panel — eleven entries in a
         * dropdown, for the control an engineer touches more than any other
         * after solving. Basic reaches them in one click from the row that is
         * always on screen, and there is no reason PRO should be slower at the
         * same job. Same order and same symbols as Basic (N, My, Vz, Mz, Vy,
         * T), because a user who moves between modes should not have to
         * relearn where the moment diagram is.
         */
        {
          id: 'diagrams',
          labelKey: 'ribbon.tabResults',
          cmds: [
            { id: 'none', labelKey: 'ribbon.noDiagram', icon: 'none', diagram: 'none', enabled: () => solved },
            { id: 'deformed', labelKey: 'ribbon.deformed', icon: 'deformed', diagram: 'deformed', enabled: () => solved },
            { id: 'axial', label: F2D.axial, labelKey: 'ribbon.nameAxial', icon: 'axial', diagram: 'axial', enabled: () => solved },
            { id: 'momentY', label: 'My', labelKey: 'ribbon.nameMomentY', icon: 'moment', diagram: 'momentY', enabled: () => solved },
            { id: 'shearZ', label: 'Vz', labelKey: 'ribbon.nameShearZ', icon: 'shear', diagram: 'shearZ', enabled: () => solved },
            { id: 'momentZ', label: 'Mz', labelKey: 'ribbon.nameMomentZ', icon: 'moment', rotate: 90, diagram: 'momentZ', enabled: () => solved },
            { id: 'shearY', label: 'Vy', labelKey: 'ribbon.nameShearY', icon: 'shear', rotate: 90, diagram: 'shearY', enabled: () => solved },
            { id: 'torsion', label: 'T', labelKey: 'ribbon.nameTorsion', icon: 'torsion', diagram: 'torsion', enabled: () => solved },
          ],
        },
        /*
         * Not quantities: whole-model colourings. A colour map paints every
         * member by a variable you choose, and the verification map paints them
         * by their code-check outcome — neither is "a diagram of X", so they do
         * not belong in the row of six that are.
         */
        {
          id: 'maps',
          labelKey: 'proRibbon.groupMaps',
          cmds: [
            { id: 'colorMap', labelKey: 'pro.diagColorMap', icon: 'view2d', diagram: 'colorMap', enabled: () => solved },
            { id: 'verification', labelKey: 'pro.diagVerification', icon: 'support', diagram: 'verification', enabled: () => solved },
          ],
        },
        {
          id: 'inspect',
          labelKey: 'proRibbon.groupInspect',
          cmds: [
            { id: 'results', labelKey: 'ribbon.results', icon: 'data', tab: 'results', enabled: () => solved },
            { id: 'diagnostics', labelKey: 'pro.tabDiagnostics', icon: 'advanced', tab: 'diagnostics' },
          ],
        },
        {
          id: 'output',
          labelKey: 'proRibbon.groupOutput',
          cmds: [
            { id: 'report', labelKey: 'pro.reportBtn', icon: 'project', action: onReport, enabled: () => canReport },
          ],
        },
      ],
    },
    {
      id: 'design',
      labelKey: 'proRibbon.stageDesign',
      home: 'design',
      groups: [
        {
          id: 'rc',
          labelKey: 'proRibbon.groupDesign',
          cmds: [
            { id: 'design', labelKey: 'pro.tabDesign', icon: 'settings', tab: 'design' },
            { id: 'connections', labelKey: 'pro.tabConnections', icon: 'element', tab: 'connections' },
          ],
        },
      ],
    },
  ]);

  /** Which stage owns the panel view currently open. */
  const TAB_STAGE: Record<string, string> = {
    // Project is reached from its own button, not from a tab, so it belongs to
    // no stage — the tab row simply keeps showing the stage you came from.
    project: '',
    nodes: 'model', elements: 'model', shells: 'model', materials: 'model', sections: 'model',
    supports: 'conditions', constraints: 'conditions', loads: 'conditions',
    advanced: 'analyse', results: 'analyse', diagnostics: 'analyse',
    design: 'design', connections: 'design',
  };

  /*
   * The visible tab follows the panel, not a separate selection.
   *
   * Two sources of truth for "where am I" is how a ribbon comes to show one
   * stage while the panel shows another — and the panel can be moved from
   * elsewhere (a toast action, an error banner's "go fix it" arrow).
   *
   * Project maps to no stage ('' above), and falling back to STAGES[0] showed
   * MODEL's commands with no tab lit — the ribbon claimed you were somewhere
   * you had never been. So the last real stage is remembered, and with Project
   * open the row keeps showing the stage you actually came from.
   */
  let lastStage = $state('model');
  const mappedStage = $derived(TAB_STAGE[uiStore.proActiveTab] ?? 'model');
  $effect(() => { if (mappedStage) lastStage = mappedStage; });
  const activeStage = $derived(mappedStage || lastStage);
  const stage = $derived(STAGES.find(s => s.id === activeStage) ?? STAGES[0]);

  function openStage(s: Stage) {
    // Landing on a stage lands on its first destination, so the panel always
    // agrees with the tab.
    if (TAB_STAGE[uiStore.proActiveTab] !== s.id) uiStore.proActiveTab = s.home;
    uiStore.proPanelVisible = true;
    openMenu = null;
  }

  function run(c: Cmd) {
    if (c.enabled && !c.enabled()) return;
    if (c.diagram) resultsStore.diagramType = c.diagram as never;
    // A command that names a destination must SHOW it: the panel can be closed
    // (it hides, it never unmounts), and a click that changes a hidden panel
    // reads as a click that did nothing.
    if (c.tab) {
      uiStore.proActiveTab = c.tab;
      uiStore.proPanelVisible = true;
    }
    c.action?.();
    openMenu = null;
  }

  /* ── Stage badges ─────────────────────────────────────────────────────
   *
   * PRO already knows all of this; it was just scattered across the tab that
   * produced it, so telling where you were in the pipeline meant visiting the
   * stages one at a time.
   *
   * Only states that can be read honestly are shown. DESIGN reads
   * `verificationStore.summary`, which the code check fills with pass / warn /
   * fail counts — the same numbers the design table prints, so the badge and
   * the table can never disagree.
   */
  type Badge = { tone: 'ok' | 'warn' | 'danger'; text: string } | null;

  const badges = $derived.by((): Record<string, Badge> => ({
    model: modelStore.nodes.size === 0
      ? null
      : errorCount > 0
        ? { tone: 'danger', text: String(errorCount) }
        : { tone: 'ok', text: '' },
    conditions: modelStore.model.loads.length > 0 ? { tone: 'ok', text: '' } : null,
    analyse: solved ? { tone: 'ok', text: '' } : null,
    /*
     * Failing outranks warning outranks clean: the badge reports the worst
     * thing in the stage, because that is what decides whether you can stop.
     */
    design: (() => {
      const sum = verificationStore.summary;
      if (!sum || sum.totalMembers === 0) return null;
      if (sum.fail > 0) return { tone: 'danger' as const, text: String(sum.fail) };
      if (sum.warn > 0) return { tone: 'warn' as const, text: String(sum.warn) };
      return { tone: 'ok' as const, text: '' };
    })(),
  }));
</script>

<nav class="pro-ribbon" data-testid="pro-ribbon">
  <!--
    Document commands, in the same 2×2 block Basic uses, spanning both rows.
    Two rows of two rather than a row of four: at ribbon height a single row of
    small square glyphs reads as a strip of unrelated marks.
  -->
  <div class="pr-main">
    <div class="pr-tabrow">
      <!--
        Select and Pan sit at the tab row, outside the tabs: they are the two
        controls used at every stage, so they belong to none of them.
      -->
      <!--
        Document commands and the two persistent tools share the tab row, at the
        tabs' own hierarchy. They were a 2×2 block spanning both rows, which
        gave four commands the visual weight of an entire stage and pushed the
        tabs inward; one row of icons beside the tabs says what they are — the
        things that outrank the tab you happen to be on.
      -->
      <div class="pr-tools">
        <button
          class="pr-tool"
          class:active={proPanel === 'project'}
          onclick={() => onOpenProject()}
          title={t('ribbon.project')}
          data-testid="pr-project"
        ><Icon name="project" size={16} /></button>
        <button
          class="pr-tool"
          onclick={() => saveProject()}
          title="{t('project.saveTab')} ({mod}+S)"
          data-testid="pr-save"
        ><Icon name="save" size={16} /></button>
        <button
          class="pr-tool"
          onclick={() => historyStore.undo()}
          disabled={!historyStore.canUndo}
          title="{t('toolbar.undo')} ({mod}+Z)"
        ><Icon name="undo" size={16} /></button>
        <button
          class="pr-tool"
          onclick={() => historyStore.redo()}
          disabled={!historyStore.canRedo}
          title="{t('toolbar.redo')} ({mod}+Y)"
        ><Icon name="redo" size={16} /></button>
        <span class="pr-tool-sep" aria-hidden="true"></span>
        <div class="pr-dd">
          <button
            class="pr-tool"
            class:active={uiStore.currentTool === 'select'}
            onclick={() => { uiStore.currentTool = 'select'; openMenu = openMenu === 'select' ? null : 'select'; }}
            title={t('float.select')}
            data-testid="pr-select"
          ><Icon name="select" size={16} /><span class="pr-caret">▾</span></button>
          {#if openMenu === 'select'}
            <div class="pr-menu">
              {#each [
                { id: 'nodes', key: 'float.selectNodes' },
                { id: 'elements', key: 'float.selectElements' },
                { id: 'shells', key: 'float.selectShells' },
                { id: 'supports', key: 'float.selectSupports' },
                { id: 'loads', key: 'float.selectLoads' },
              ] as const as sm}
                <button
                  class="pr-menu-item"
                  class:active={uiStore.selectMode === sm.id}
                  onclick={() => { uiStore.selectMode = sm.id as never; openMenu = null; }}
                >{t(sm.key)}</button>
              {/each}
            </div>
          {/if}
        </div>
        <button
          class="pr-tool"
          class:active={uiStore.currentTool === 'pan'}
          onclick={() => { uiStore.currentTool = 'pan'; openMenu = null; }}
          title={t('float.pan')}
          data-testid="pr-pan"
        ><Icon name="pan" size={16} /></button>
      </div>

      <div class="pr-tabs" role="tablist">
        {#each STAGES as s (s.id)}
          {@const badge = badges[s.id]}
          <button
            class="pr-tab"
            class:active={s.id === activeStage}
            role="tab"
            aria-selected={s.id === activeStage}
            onclick={() => openStage(s)}
            data-testid="pr-stage-{s.id}"
          >
            {t(s.labelKey)}
            {#if badge}
              <span class="pr-badge" data-tone={badge.tone}>{badge.text || '✓'}</span>
            {/if}
          </button>
        {/each}
      </div>

      <span class="pr-spacer"></span>

      <!--
        Collapse the ribbon, not the bar. On a laptop the model is the scarce
        resource, and an engineer who has settled into one stage does not need
        its commands on screen — but does need the tabs, to leave it. So the
        chevron folds the command row and keeps the tabs.
      -->
      <button
        class="pr-tool"
        onclick={() => (ribbonOpen = !ribbonOpen)}
        title={ribbonOpen ? t('proRibbon.collapse') : t('proRibbon.expand')}
        aria-expanded={ribbonOpen}
        data-testid="pr-toggle-ribbon"
      >{ribbonOpen ? '⌃' : '⌄'}</button>
    </div>

    {#if ribbonOpen}
    <div class="pr-groups">
      {#each stage.groups as g (g.id)}
        <section class="pr-group" data-group={g.id}>
          <div class="pr-cmds">
            {#each g.cmds.filter(c => !c.overflow || openMenu === g.id) as c (c.id)}
              {@const on = !c.enabled || c.enabled()}
              <button
                class="pr-cmd"
                class:active={(!!c.tab && uiStore.proActiveTab === c.tab)
                  || (!!c.diagram && shownDiagram === c.diagram)}
                disabled={!on}
                onclick={() => run(c)}
                title={on ? t(c.labelKey) : `${t(c.labelKey)} — ${t('ribbon.needsSolve')}`}
                data-testid="pr-cmd-{c.id}"
              >
                <span class="pr-icon"><Icon name={c.icon ?? 'data'} rotate={c.rotate ?? 0} size={20} /></span>
                <span class="pr-cmd-label" class:symbol={!!c.label}>
                  {c.label ?? (c.id === 'solve' && isSolving ? t('pro.solving') : t(c.labelKey))}
                </span>
              </button>
            {/each}
          </div>
          <p class="pr-group-label">{t(g.labelKey)}</p>
        </section>
      {/each}
    </div>
    {/if}
  </div>
</nav>

<style>
  .pro-ribbon {
    display: flex;
    align-items: stretch;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-hair);
    font-family: var(--st-sans);
    user-select: none;
    flex: none;
  }

  /* ── The column that survives a tab change ─────────────────────────── */

  .pr-tool-sep {
    width: 1px;
    height: 16px;
    margin: 0 0.25rem;
    background: var(--st-hair);
    flex: none;
  }

  .pr-quick {
    display: grid;
    grid-template-columns: 1fr 1fr;
    /*
       `auto` rows, not `1fr`: the bar is two rows tall, and equal fractions
       stretched the four cells over the whole height so the pairs drifted
       apart. The block should hug its buttons and centre as a unit.
    */
    grid-template-rows: auto auto;
    align-content: center;
    padding: 0;
    border-right: 1px solid var(--st-hair);
    flex: none;
  }

  .pr-quick-row { display: contents; }

  .pr-quick-row:first-child .pr-quick-btn { border-bottom: 1px solid var(--st-hair-strong); }
  .pr-quick-row:first-child .pr-quick-btn:first-child { border-right: 1px solid var(--st-hair-strong); }

  .pr-quick-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--st-text-2);
    padding: 0.3rem 0.55rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .pr-quick-btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .pr-quick-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .pr-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }

  /* ── Tab row ───────────────────────────────────────────────────────── */

  .pr-tabrow {
    display: flex;
    align-items: stretch;
    gap: 0.15rem;
    padding: 0 0.4rem;
    border-bottom: 1px solid var(--st-hair);
    min-height: 26px;
  }

  .pr-tools {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    padding-right: 0.4rem;
    margin-right: 0.3rem;
    border-right: 1px solid var(--st-hair);
    flex: none;
  }

  .pr-tool {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.78rem;
    padding: 0.2rem 0.4rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .pr-tool:hover { background: var(--st-surface-3); color: var(--st-text); }
  .pr-tool.active { color: var(--st-accent); border-color: var(--st-accent); }
  .pr-caret { font-size: 0.55rem; opacity: 0.7; }

  .pr-tabs { display: flex; align-items: stretch; gap: 0.1rem; min-width: 0; overflow-x: auto; scrollbar-width: none; }

  /*
     A tab, in the shell's language: no fill, and the active one marked by an
     accent rule on its own edge rather than by a coloured block. A filled tab
     would compete with the accent the ribbon uses below it for the command you
     are actually on.
  */
  .pr-tab {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--st-text-3);
    font-family: var(--st-mono);
    font-size: 0.66rem;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    padding: 0.25rem 0.7rem 0.2rem;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.12s, border-color 0.12s;
  }

  .pr-tab:hover { color: var(--st-text-2); }
  .pr-tab.active { color: var(--st-accent); border-bottom-color: var(--st-accent); }

  .pr-badge {
    font-family: var(--st-mono);
    font-size: 0.58rem;
    line-height: 1;
    padding: 0.12rem 0.25rem;
    border-radius: 2px;
    letter-spacing: 0;
  }

  .pr-badge[data-tone='ok'] { color: var(--st-ok); }
  .pr-badge[data-tone='warn'] { color: var(--st-warn); }
  .pr-badge[data-tone='danger'] { color: var(--st-danger); background: var(--st-selected-bg); }

  .pr-spacer { flex: 1; min-width: 0.5rem; }

  /* ── Ribbon row ────────────────────────────────────────────────────── */

  .pr-groups {
    display: flex;
    align-items: stretch;
    padding: 0.2rem 0.4rem 0;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .pr-group {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 0 0.5rem 0.15rem;
    border-right: 1px solid var(--st-hair);
    flex: none;
  }

  .pr-group:last-child { border-right: none; }

  .pr-cmds { display: flex; align-items: stretch; gap: 0.1rem; }

  .pr-cmd {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    min-width: 52px;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-family: var(--st-sans);
    font-size: 0.68rem;
    padding: 0.18rem 0.35rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .pr-cmd:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .pr-cmd:disabled { opacity: 0.35; cursor: not-allowed; }
  .pr-cmd.active { color: var(--st-accent); border-color: var(--st-accent); }

  .pr-icon { display: flex; }
  .pr-cmd-label { white-space: nowrap; }

  /* A symbol is a symbol: mono, so N and My read as notation, not as words. */
  .pr-cmd-label.symbol {
    font-family: var(--st-mono);
    font-size: 0.72rem;
    letter-spacing: 0.02em;
  }

  /* The group names the commands above it, as in Basic's ribbon. */
  .pr-group-label {
    margin: 0.15rem 0 0;
    text-align: center;
    font-family: var(--st-mono);
    font-size: 0.58rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  /* ── Menus ─────────────────────────────────────────────────────────── */

  .pr-dd { position: relative; display: flex; }

  .pr-menu {
    position: absolute;
    top: calc(100% + 3px);
    left: 0;
    z-index: 60;
    min-width: 150px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    padding: 0.15rem;
  }

  .pr-menu-item {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-family: var(--st-sans);
    font-size: 0.74rem;
    padding: 0.3rem 0.5rem;
    cursor: pointer;
  }

  .pr-menu-item:hover { background: var(--st-surface-3); color: var(--st-text); }
  .pr-menu-item.active { color: var(--st-accent); }

  /* Narrow: the command labels go before anything is dropped. */
  @media (max-width: 1240px) {
    .pr-cmd-label { display: none; }
    .pr-cmd { min-width: 34px; }
  }
</style>
