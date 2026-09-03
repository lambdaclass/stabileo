<script lang="ts">
  import { uiStore, modelStore } from '../lib/store';
  import { EDIT_TOOLS } from '../lib/store/ui.svelte';
  import { t } from '../lib/i18n';
  import NodesTable from './tables/NodesTable.svelte';
  import ElementsTable from './tables/ElementsTable.svelte';
  import SupportsTable from './tables/SupportsTable.svelte';
  import LoadsTable from './tables/LoadsTable.svelte';
  import MaterialsTable from './tables/MaterialsTable.svelte';
  import SectionsTable from './tables/SectionsTable.svelte';
  import Icon from './ribbon/Icon.svelte';

  type TabId = 'nodes' | 'elements' | 'supports' | 'loads' | 'materials' | 'sections';
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
  }
  let { activeTab = $bindable('nodes') }: Props = $props();

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
  const TABS: { id: TabId; labelKey: string; icon: string; count: () => number }[] = [
    { id: 'nodes', labelKey: 'data.nodes', icon: 'node', count: () => modelStore.nodes.size },
    { id: 'elements', labelKey: 'data.elements', icon: 'element', count: () => modelStore.elements.size },
    { id: 'supports', labelKey: 'data.supports', icon: 'support', count: () => modelStore.supports.size },
    { id: 'loads', labelKey: 'data.loads', icon: 'load', count: () => modelStore.loads.length },
    { id: 'materials', labelKey: 'data.materials', icon: 'material', count: () => modelStore.materials.size },
    { id: 'sections', labelKey: 'data.sections', icon: 'section', count: () => modelStore.sections.size },
  ];
</script>

<div class="data-table" onkeydown={handleKeydown} role="region">
  <div class="tabs">
    {#each TABS as tab (tab.id)}
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

  <div class="table-wrapper">
    {#if activeTab === 'nodes'}
      <NodesTable />
    {:else if activeTab === 'elements'}
      <ElementsTable />
    {:else if activeTab === 'supports'}
      <SupportsTable />
    {:else if activeTab === 'loads'}
      <LoadsTable />
    {:else if activeTab === 'materials'}
      <MaterialsTable />
    {:else if activeTab === 'sections'}
      <SectionsTable />
    {/if}
  </div>
</div>

<style>
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
