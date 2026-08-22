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
</script>

<div class="data-table" onkeydown={handleKeydown} role="region">
  <div class="tabs">
    <button class:active={activeTab === 'nodes'} onclick={() => pickTab('nodes')}>
      {t('data.nodes')} ({modelStore.nodes.size})
    </button>
    <button class:active={activeTab === 'elements'} onclick={() => pickTab('elements')}>
      {t('data.elements')} ({modelStore.elements.size})
    </button>
    <button class:active={activeTab === 'supports'} onclick={() => pickTab('supports')}>
      {t('data.supports')} ({modelStore.supports.size})
    </button>
    <button class:active={activeTab === 'loads'} onclick={() => pickTab('loads')}>
      {t('data.loads')} ({modelStore.loads.length})
    </button>
    <button class:active={activeTab === 'materials'} onclick={() => pickTab('materials')}>
      {t('data.materials')} ({modelStore.materials.size})
    </button>
    <button class:active={activeTab === 'sections'} onclick={() => pickTab('sections')}>
      {t('data.sections')} ({modelStore.sections.size})
    </button>
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
  }

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
     six equal targets across the full width, in a fixed 3×2 grid that never
     reflows, never scrolls sideways, and never hides one behind an overflow.
     Fixed matters — a control that moves depending on how many loads exist is
     one the reader has to find again every time.

     Pinned to the top of the panel's scroll, so scrolling a long table never
     takes the way out of it off screen.
     ─────────────────────────────────────────────────────────────────── */
  @media (max-width: 767px) {
    .tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      padding: 4px 4px 6px;
      border-bottom: 1px solid var(--st-hair);
      position: sticky;
      top: 0;
      z-index: 2;
      /* Opaque: the table scrolls underneath it. */
      background: var(--st-surface);
    }

    .tabs button {
      min-height: 44px;
      padding: 0.3rem 0.2rem;
      font-size: 0.72rem;
      line-height: 1.2;
      white-space: normal;
      border: 1px solid var(--st-hair);
      border-radius: var(--st-radius);
      background: var(--st-surface-2);
      color: var(--st-text-2);
      /* The underline was the tab affordance; these are buttons now. */
      border-bottom-width: 1px;
    }

    .tabs button.active {
      color: var(--st-text);
      background: var(--st-selected-bg);
      border-color: var(--st-accent);
      border-bottom-color: var(--st-accent);
      font-weight: 600;
    }
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
