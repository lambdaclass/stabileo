<script lang="ts">
  import { uiStore } from '../../lib/store';

  const selectModes = [
    { id: 'nodes', label: 'Nodos' },
    { id: 'elements', label: 'Elementos' },
    { id: 'supports', label: 'Apoyos' },
    { id: 'loads', label: 'Cargas' },
    { id: 'stress', label: 'Tensiones' },
  ] as const;
</script>

{#each selectModes as sm}
  <button
    class="ft-opt-btn"
    class:active={uiStore.selectMode === sm.id}
    onclick={() => uiStore.selectMode = sm.id}
  >{sm.label}</button>
{/each}
{#if uiStore.selectMode === 'nodes'}
  <span class="ft-hint">Click en un nodo para ver articulaciones</span>
{:else if uiStore.selectMode === 'elements'}
  <span class="ft-hint">Click para seleccionar nodos/barras</span>
{:else if uiStore.selectMode === 'loads'}
  <span class="ft-hint">Click en una carga para seleccionarla</span>
{:else if uiStore.selectMode === 'supports'}
  <span class="ft-hint">Click en un apoyo para seleccionarlo</span>
{/if}

<style>
  .ft-opt-btn {
    padding: 2px 8px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #aaa;
    cursor: pointer;
    font-size: 0.7rem;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .ft-opt-btn:hover:not(:disabled) {
    background: #1a4a7a;
    color: #ddd;
  }

  .ft-opt-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    color: #555;
    background: #0a1a30;
    border-color: #1a3050;
  }

  .ft-opt-btn.active {
    background: #e94560;
    border-color: #ff6b6b;
    color: white;
  }

  .ft-hint {
    font-size: 0.65rem;
    color: #666;
    font-style: italic;
    margin-left: 4px;
  }

  @media (max-width: 767px) {
    .ft-opt-btn {
      white-space: nowrap;
      font-size: 0.6rem;
      padding: 4px 6px;
    }

    .ft-hint {
      font-size: 0.55rem;
    }
  }
</style>
