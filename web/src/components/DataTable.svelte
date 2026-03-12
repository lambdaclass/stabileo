<script lang="ts">
  import { modelStore, resultsStore } from '../lib/store';
  import { t } from '../lib/i18n';
  import NodesTable from './tables/NodesTable.svelte';
  import ElementsTable from './tables/ElementsTable.svelte';
  import SupportsTable from './tables/SupportsTable.svelte';
  import LoadsTable from './tables/LoadsTable.svelte';
  import MaterialsTable from './tables/MaterialsTable.svelte';
  import SectionsTable from './tables/SectionsTable.svelte';
  import CombosTable from './tables/CombosTable.svelte';
  import ResultsTable from './tables/ResultsTable.svelte';

  type TabId = 'nodes' | 'elements' | 'supports' | 'loads' | 'materials' | 'sections' | 'combos' | 'results';
  let activeTab = $state<TabId>('nodes');

  function handleKeydown(e: KeyboardEvent) {
    e.stopPropagation();
  }
</script>

<div class="data-table" onkeydown={handleKeydown} role="region">
  <div class="tabs">
    <button class:active={activeTab === 'nodes'} onclick={() => activeTab = 'nodes'}>
      {t('data.nodes')} ({modelStore.nodes.size})
    </button>
    <button class:active={activeTab === 'elements'} onclick={() => activeTab = 'elements'}>
      {t('data.elements')} ({modelStore.elements.size})
    </button>
    <button class:active={activeTab === 'supports'} onclick={() => activeTab = 'supports'}>
      {t('data.supports')} ({modelStore.supports.size})
    </button>
    <button class:active={activeTab === 'loads'} onclick={() => activeTab = 'loads'}>
      {t('data.loads')} ({modelStore.loads.length})
    </button>
    <button class:active={activeTab === 'materials'} onclick={() => activeTab = 'materials'}>
      {t('data.materials')} ({modelStore.materials.size})
    </button>
    <button class:active={activeTab === 'sections'} onclick={() => activeTab = 'sections'}>
      {t('data.sections')} ({modelStore.sections.size})
    </button>
    <button class:active={activeTab === 'combos'} onclick={() => activeTab = 'combos'}>
      {t('data.combinations')}
    </button>
    {#if resultsStore.results || resultsStore.results3D}
      <button class="results-tab" class:active={activeTab === 'results'} onclick={() => activeTab = 'results'}>
        {t('data.results')}
      </button>
    {/if}
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
    {:else if activeTab === 'combos'}
      <CombosTable />
    {:else if activeTab === 'results' && (resultsStore.results || resultsStore.results3D)}
      <ResultsTable />
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
    border-bottom: 1px solid #0f3460;
    background: #1a1a2e;
    flex-shrink: 0;
  }

  .tabs button {
    padding: 0.35rem 0.5rem;
    border: none;
    background: transparent;
    color: #888;
    cursor: pointer;
    font-size: 0.7rem;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
  }

  .tabs button:hover {
    color: #eee;
  }

  .tabs button.active {
    color: #4ecdc4;
    border-bottom-color: #4ecdc4;
  }

  .results-tab {
    color: #e9c46a !important;
  }
  .results-tab.active {
    color: #e9c46a !important;
    border-bottom-color: #e9c46a !important;
  }

  .table-wrapper {
    flex: 1;
    overflow: auto;
  }
</style>
