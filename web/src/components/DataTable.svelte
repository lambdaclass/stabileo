<script lang="ts">
  import { uiStore, modelStore } from '../lib/store';
  import { EDIT_TOOLS } from '../lib/store/ui.svelte';
  import PlatesTable from './tables/PlatesTable.svelte';
  import ConstraintsTable from './tables/ConstraintsTable.svelte';
  import { t } from '../lib/i18n';
  import NodesTable from './tables/NodesTable.svelte';
  import ElementsTable from './tables/ElementsTable.svelte';
  import SupportsTable from './tables/SupportsTable.svelte';
  import LoadsTable from './tables/LoadsTable.svelte';
  import MaterialsTable from './tables/MaterialsTable.svelte';
  import SectionsTable from './tables/SectionsTable.svelte';
  import Icon from './ribbon/Icon.svelte';
  import ToolOptions from './ribbon/ToolOptions.svelte';

  /* `plates` and `constraints` exist only in PRO; see the TABS list. */
  type TabId = 'nodes' | 'elements' | 'supports' | 'loads' | 'materials' | 'sections' | 'plates' | 'constraints';
  interface Props {
    /**
     * The open tab, BOUND — the ribbon and this table are two views of one
     * selection, so it lives above both rather than in either.
     *
     * It was a one-way `initialTab`, which made the connection asymmetric:
     * pressing Elements on the ribbon moved the table, but moving the table
     * left the ribbon lighting whatever it had lit before. Two controls
     * disagreeing about what is selected is worse than one control.
     */
    activeTab?: string;
    /**
     * Show only this entity, with no tab strip.
     *
     * PRO puts this table underneath the tools for ONE entity, because its
     * ribbon has already chosen which one you are working on. A second row of
     * tabs there would be a second answer to a settled question, and the two
     * could disagree.
     */
    pinned?: TabId;
  }
  let { activeTab = $bindable('nodes'), pinned = undefined }: Props = $props();

  /* Pinned means the caller chose; the strip is what would let the reader
     choose again, so it goes with it. */
  const shown = $derived(pinned ?? activeTab);
  const phoneOptions = $derived(
    uiStore.isMobile && uiStore.appMode === 'basico' && !pinned
    && ['node', 'element', 'support', 'load'].includes(uiStore.currentTool),
  );

  /**
   * The tool each tab corresponds to.
   *
   * Picking a tab arms its tool, which is what closes the loop: the ribbon
   * lights editing commands by TOOL, so without this a tab change would move
   * the table and leave the ribbon dark. Materials and sections have no tool —
   * they are edited in the table itself — and the ribbon lights those by tab.
   */
  const TAB_TOOL: Record<string, string> = {
    nodes: 'node', elements: 'element', supports: 'support', loads: 'load',
  };

  function pickTab(tab: string) {
    activeTab = tab;
    const tool = TAB_TOOL[tab];
    /*
     * Arming the tab's tool is the BASIC-mode ribbon sync — the ribbon lights
     * editing commands by TOOL, so the tab and the ribbon only agree if the
     * tab moves the tool. Outside Basic there is no ribbon to sync with and
     * the table is reference browsing; arming a tool there is a side effect
     * nobody asked for.
     *
     * Landing on Materials must not leave the pointer holding whatever tool
     * was armed before, so that case falls back to selection.
     */
    if (tool) {
      if (uiStore.appMode === 'basico') uiStore.currentTool = tool as never;
    } else if (EDIT_TOOLS.includes(uiStore.currentTool)) uiStore.currentTool = 'select';
  }

  function handleKeydown(e: KeyboardEvent) {
    e.stopPropagation();
  }

  /**
   * The six tabs, in one list.
   *
   * They were six hand-written buttons that repeated the same four things —
   * label, count, active test, `pickTab` — with only the entity changing, which
   * is how the phone variant came to need six near-identical edits.
   *
   * `icon` is the name the RIBBON uses for the same entity, so the strip on a
   * phone shows the glyph the reader already learned on a desktop rather than a
   * second drawing of a node. See `ribbon/Icon.svelte`.
   */
  const TABS: { id: TabId; labelKey: string; icon: string; count: () => number; pro?: boolean }[] = [
    { id: 'nodes', labelKey: 'data.nodes', icon: 'node', count: () => modelStore.nodes.size },
    { id: 'elements', labelKey: 'data.elements', icon: 'element', count: () => modelStore.elements.size },
    /* The ribbon's order: draw, then properties, then conditions. */
    { id: 'materials', labelKey: 'data.materials', icon: 'material', count: () => modelStore.materials.size },
    { id: 'sections', labelKey: 'data.sections', icon: 'section', count: () => modelStore.sections.size },
    { id: 'supports', labelKey: 'data.supports', icon: 'support', count: () => modelStore.supports.size },
    { id: 'loads', labelKey: 'data.loads', icon: 'load', count: () => modelStore.loads.length },
    /*
     * Plates and constraints exist only in PRO, and are filtered out below
     * rather than declared twice. A mode that cannot contain a plate has no
     * business offering a tab for one; a mode that can must not be missing it.
     */
    { id: 'plates', labelKey: 'pro.tabShells', icon: 'shell', count: () => modelStore.plates.size + modelStore.quads.size, pro: true },
    { id: 'constraints', labelKey: 'pro.tabConstraints', icon: 'constraint', count: () => (modelStore.model.constraints ?? []).length, pro: true },
  ];

  /**
   * The tabs this mode actually has, and — when PINNED — only the one asked
   * for.
   *
   * PRO shows this table underneath the tools for one entity, because its
   * ribbon has already chosen which entity you are working on: a second row
   * of tabs there would be a second answer to a question already settled, and
   * the two could disagree.
   */
  const VISIBLE = $derived(
    pinned
      ? TABS.filter((tb) => tb.id === pinned)
      : TABS.filter((tb) => !tb.pro || uiStore.appMode === 'pro'),
  );
</script>

<div class="data-table" onkeydown={handleKeydown} role="region">
  {#if !pinned}
  <div class="tabs">
    {#each VISIBLE as tab (tab.id)}
      <button
        class:active={activeTab === tab.id}
        onclick={() => pickTab(tab.id)}
        data-testid="dt-tab-{tab.id}"
        title="{t(tab.labelKey)} ({tab.count()})"
      >
        <!--
          Phone only, and CSS-hidden above 768 px rather than gated in script.
          The strip has to be one row of six there, and at ~58 px a word does
          not fit but the ribbon's own glyph for the same entity does — so the
          reader recognises it from the desktop instead of learning a second
          vocabulary. The label stays in the DOM for the wider layout and for
          anything reading the button by name.
        -->
        <span class="dt-tab-icon" aria-hidden="true"><Icon name={tab.icon} size={20} /></span>
        <span class="dt-tab-label">{t(tab.labelKey)}</span>
        <span class="dt-tab-count">{tab.count()}</span>
      </button>
    {/each}
    <!--
      Results are NOT a tab here.
      
      This panel is the model: geometry, conditions, properties — the things you
      build. Results are what the model produced, and they belong beside the
      controls that choose which result to look at, which live in the results
      toolbar. Having them here also let the ribbon show a construction tool and
      a diagram lit at once, claiming you were editing and reading at the same
      time.
    -->
  </div>
  {/if}

  <!--
    A phone's tool options: under the tool buttons that arm them, above the
    table they fill. On a desktop they are the options bar under the ribbon.
  -->
  {#if phoneOptions}
    <div class="dt-tool-options" data-testid="dt-tool-options"><ToolOptions /></div>
  {/if}

  <div class="table-wrapper">
    {#if shown === 'nodes'}
      <NodesTable />
    {:else if shown === 'elements'}
      <ElementsTable />
    {:else if shown === 'supports'}
      <SupportsTable />
    {:else if shown === 'loads'}
      <LoadsTable />
    {:else if shown === 'materials'}
      <MaterialsTable />
    {:else if shown === 'sections'}
      <SectionsTable />
    {:else if shown === 'plates'}
      <PlatesTable />
    {:else if shown === 'constraints'}
      <ConstraintsTable />
    {/if}
  </div>
</div>

<style>
  /*
   * ── The phone's tool options: a taller row, built for a thumb ─────
   * Only rendered on a phone (phoneOptions), so nothing here reaches the
   * desktop options bar. The tool's main choice (create / joints, rigid /
   * pinned, the support types, the load types) gets a row of its own with
   * equal, wide buttons; what that choice opens — the joint kinds, the
   * directions, the values — keeps its compact size underneath, so the two
   * levels read as two levels. The tool's name and the separators give way:
   * the highlighted tool button above already names it, and rows replace
   * the separators. Self weight is left to the checkbox just below.
   */
  .dt-tool-options {
    display: flex;
    align-items: center;
    column-gap: 0.4rem;
    row-gap: 0.55rem;
    flex-wrap: wrap;
    padding: 0.7rem 0.7rem 0.75rem;
    border-bottom: 1px solid var(--st-hair);
    font-size: 0.82rem;
    color: var(--st-text-2);
    flex: none;
  }
  .dt-tool-options :global(.tb-tool-name),
  .dt-tool-options :global(.tb-sep),
  .dt-tool-options :global(.ft-sep),
  .dt-tool-options :global(.ft-selfweight-toggle) { display: none; }
  /* Below the tool buttons above in weight: shorter than their 44 px. */
  .dt-tool-options :global(.ft-primary) {
    order: -2;
    flex: 1 1 0;
    min-width: 0;
    min-height: 34px;
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.25rem 0.4rem;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .dt-tool-options :global(.ft-ic) { display: inline-block; width: 16px; height: 16px; }
  /* The phone draws its own glyphs; the desktop's text symbols give way. */
  .dt-tool-options :global(.ft-sup-ic) { display: none; }
  .dt-tool-options :global(.ft-break) {
    display: block;
    order: -1;
    flex-basis: 100%;
    height: 0;
  }
  .dt-tool-options :global(.ft-row) {
    display: block;
    flex-basis: 100%;
    height: 0;
  }
  .dt-tool-options :global(.ft-sup-btn.ft-primary) { font-size: 0.76rem; gap: 0.25rem; }
  /* Rigid / pinned are radio labels: shown as the same wide buttons. */
  .dt-tool-options :global(.ft-opt-radio.ft-primary) {
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
  }
  .dt-tool-options :global(.ft-opt-radio.ft-primary input) { display: none; }
  .dt-tool-options :global(.ft-opt-radio.ft-primary:has(input:checked)) {
    border-color: var(--st-accent);
    color: var(--st-accent);
  }
  /* 3D supports: the six restraints as six equal toggles, under the presets. */
  .dt-tool-options :global(.ft-dof) {
    flex: 1 1 0;
    min-width: 0;
    min-height: 26px;
    padding: 0.1rem 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    font-family: var(--st-mono);
    font-size: 0.76rem;
    color: var(--st-text-2);
  }
  .dt-tool-options :global(.ft-dof input) { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
  .dt-tool-options :global(.ft-dof:has(input:checked)) {
    border-color: var(--st-accent);
    color: var(--st-accent);
    background: color-mix(in srgb, var(--st-accent) 12%, var(--st-surface-2));
  }
  .dt-tool-options :global(.ft-hint) {
    flex-basis: 100%;
    font-size: 0.74rem;
    color: var(--st-text-3);
  }

  .data-table {
    height: 100%;
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    border-bottom: 1px solid var(--st-hair);
    background: var(--st-bg);
    flex-shrink: 0;
  }

  .tabs button {
    padding: 0.35rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.7rem;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  /* The glyph is the phone's affordance; a desktop tab is a word. */
  .dt-tab-icon { display: none; }

  /* Parentheses in CSS, so the phone can drop them without touching the markup. */
  .dt-tab-count::before { content: '('; }
  .dt-tab-count::after { content: ')'; }

  .tabs button:hover {
    color: var(--st-text);
  }

  /*
     Accent, matching the sub-tabs inside Results and every other active control
     in the shell. Turquoise on a blue underline was two colours for one state,
     and turquoise is what this palette uses for a computed VALUE — which is
     what fills the cells directly below these tabs.
  */
  .tabs button.active {
    color: var(--st-accent);
    border-bottom-color: var(--st-accent);
  }

  /* ── The phone: the tab strip IS the modelling toolbar ─────────────────
     Below 768 px the ribbon's Modelado command opens this panel rather than a
     menu of six buttons, because these six tabs already ARE those buttons —
     `pickTab` above arms each tab's tool, which is the whole of what the menu
     items did. Duplicating them cost a tap and a second thing to keep in sync.

     So they stop looking like tabs and start looking like what they now are:
     six equal targets on ONE row across the full width, each carrying the same
     glyph the ribbon uses for that entity on a desktop.

     One row and not two. At 375 px six buttons come to about 58 px each, which
     is under the 44 px square but wider than it is tall — and a row that wraps
     to two puts three entities on a second line whose position depends on how
     many fit, so the strip would be a different shape on a different handset.
     One row is the same shape everywhere.

     Fixed widths matter for the same reason: a control that moves because the
     model gained a load is one the reader has to find again every time.

     Pinned to the top of the panel's scroll, so scrolling a long table never
     takes the way out of it off screen.
     ─────────────────────────────────────────────────────────────────── */
  @media (max-width: 767px) {
    .tabs {
      display: flex;
      gap: 3px;
      padding: 4px 4px 6px;
      border-bottom: 1px solid var(--st-hair);
      position: sticky;
      top: 0;
      z-index: 2;
      /* Opaque: the table scrolls underneath it. */
      background: var(--st-surface);
    }

    .tabs button {
      /* Six equal shares of whatever the screen is, and no more. */
      flex: 1 1 0;
      min-width: 0;
      position: relative;
      min-height: 44px;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      padding: 3px 1px;
      border: 1px solid var(--st-hair);
      border-radius: var(--st-radius);
      background: var(--st-surface-2);
      color: var(--st-text-2);
      /* The underline was the tab affordance; these are buttons now. */
      border-bottom-width: 1px;
    }

    .dt-tab-icon { display: flex; }

    .dt-tab-label {
      font-size: 0.5rem;
      line-height: 1.1;
      letter-spacing: -0.01em;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /*
       The count becomes a corner badge. Inline it would compete with the name
       for a 58 px line and lose — and it is the kind of number you glance at
       rather than read, which is what a corner is for.
    */
    .dt-tab-count {
      position: absolute;
      top: 1px;
      right: 3px;
      font-family: var(--st-mono);
      font-size: 0.5rem;
      line-height: 1;
      color: var(--st-text-3);
    }
    .dt-tab-count::before,
    .dt-tab-count::after { content: none; }

    .tabs button.active {
      color: var(--st-text);
      background: var(--st-selected-bg);
      border-color: var(--st-accent);
      border-bottom-color: var(--st-accent);
    }

    .tabs button.active .dt-tab-icon { color: var(--st-accent); }
    .tabs button.active .dt-tab-count { color: var(--st-text-2); }
  }

  .tabs button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tabs button:disabled:hover { color: var(--st-text-3); }

  .table-wrapper {
    flex: 1;
    overflow: auto;
  }
</style>
