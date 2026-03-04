<script lang="ts">
  import { uiStore, resultsStore, modelStore } from '../lib/store';
  import ToolSelectOptions from './floating-tools/ToolSelectOptions.svelte';
  import ToolNodeOptions from './floating-tools/ToolNodeOptions.svelte';
  import ToolElementOptions from './floating-tools/ToolElementOptions.svelte';
  import ToolSupportOptions from './floating-tools/ToolSupportOptions.svelte';
  import ToolLoadOptions from './floating-tools/ToolLoadOptions.svelte';
  import SelectedEntityPanel from './floating-tools/SelectedEntityPanel.svelte';

  // If the active load case is deleted, reset to the first available case
  $effect(() => {
    if (!modelStore.loadCases.find(lc => lc.id === uiStore.activeLoadCaseId)) {
      uiStore.activeLoadCaseId = modelStore.loadCases[0]?.id ?? 1;
    }
  });

  const tools = [
    { id: 'pan', icon: '✋', label: 'Mover', key: 'H' },
    { id: 'select', icon: '↖', label: 'Seleccionar', key: 'V' },
    { id: 'node', icon: '●', label: 'Nodo', key: 'N' },
    { id: 'element', icon: '—', label: 'Elemento', key: 'E' },
    { id: 'support', icon: '▽', label: 'Apoyo', key: 'S' },
    { id: 'load', icon: '↓', label: 'Carga', key: 'L' },
  ] as const;

  // Check if current tool has options
  const hasOptions = $derived(
    uiStore.currentTool === 'select' ||
    uiStore.currentTool === 'node' ||
    uiStore.currentTool === 'element' ||
    uiStore.currentTool === 'support' ||
    uiStore.currentTool === 'load' ||
    uiStore.currentTool === 'influenceLine'
  );

  // Derive whether there's a selected entity for row counting
  const hasSelectedEntity = $derived(
    uiStore.selectedLoads.size > 0 || uiStore.selectedSupports.size > 0
  );

  // Track how many rows the floating tools bar occupies (for viewport overlay offset)
  $effect(() => {
    if (!uiStore.showFloatingTools) {
      uiStore.floatingToolsRows = 0;
      return;
    }
    let rows = 1; // ft-main always
    if (hasOptions) rows++;
    if (hasSelectedEntity) rows++;
    uiStore.floatingToolsRows = rows;
  });
</script>

{#if uiStore.showFloatingTools}
  <div class="floating-tools" data-tour="floating-tools">
    <div class="ft-main">
      {#each tools as tool}
        <button
          class="ft-btn"
          class:active={uiStore.currentTool === tool.id}
          onclick={() => uiStore.currentTool = tool.id}
          title="{tool.label} ({tool.key})"
        >
          <span class="ft-icon">{tool.icon}</span>
          <span class="ft-label">{tool.label}</span>
        </button>
      {/each}
      <button
        class="ft-close"
        onclick={() => uiStore.showFloatingTools = false}
        title="Ocultar barra (usar atajos de teclado)"
      >✕</button>
    </div>

    {#if hasOptions}
      <div class="ft-options">
        {#if uiStore.currentTool === 'select'}
          <ToolSelectOptions />
        {/if}

        {#if uiStore.currentTool === 'node'}
          <ToolNodeOptions />
        {/if}

        {#if uiStore.currentTool === 'element'}
          <ToolElementOptions />
        {/if}

        {#if uiStore.currentTool === 'support'}
          <ToolSupportOptions />
        {/if}

        {#if uiStore.currentTool === 'load'}
          <ToolLoadOptions />
        {/if}

        {#if uiStore.currentTool === 'influenceLine'}
          <span class="ft-il-group">
            <span class="ft-il-label">Reacciones:</span>
            <button class="ft-opt-btn" class:active={uiStore.ilQuantity === 'Ry'} onclick={() => uiStore.ilQuantity = 'Ry'}>Ry vertical</button>
            <button class="ft-opt-btn" class:active={uiStore.ilQuantity === 'Rx'} onclick={() => uiStore.ilQuantity = 'Rx'}>Rx horiz.</button>
            <button class="ft-opt-btn" class:active={uiStore.ilQuantity === 'Mz'} onclick={() => uiStore.ilQuantity = 'Mz'}>Mz apoyo</button>
          </span>
          <span class="ft-sep">|</span>
          <span class="ft-il-group">
            <span class="ft-il-label">Internas:</span>
            <button class="ft-opt-btn" class:active={uiStore.ilQuantity === 'M'} onclick={() => uiStore.ilQuantity = 'M'}>M momento</button>
            <button class="ft-opt-btn" class:active={uiStore.ilQuantity === 'V'} onclick={() => uiStore.ilQuantity = 'V'}>V corte</button>
          </span>
          <span class="ft-hint">Clickea un nodo (reacciones) o una barra (M/V internos)</span>
        {/if}
      </div>
    {/if}

    <SelectedEntityPanel />
  </div>
{:else}
  <button
    class="ft-reopen"
    onclick={() => uiStore.showFloatingTools = true}
    title="Mostrar herramientas"
  >↖</button>
{/if}

<style>
  .floating-tools {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    background: rgba(22, 33, 62, 0.95);
    border-bottom: 1px solid #1a4a7a;
    backdrop-filter: blur(8px);
  }

  .ft-main {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 4px 6px;
  }

  .ft-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: #999;
    cursor: pointer;
    transition: all 0.15s;
    min-width: 52px;
  }

  .ft-btn:hover {
    background: #1a4a7a;
    color: #ddd;
  }

  .ft-btn.active {
    background: #e94560;
    border-color: #ff6b6b;
    color: white;
  }

  .ft-icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .ft-label {
    font-size: 0.6rem;
    margin-top: 2px;
    white-space: nowrap;
  }

  .ft-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin-left: 2px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: #666;
    cursor: pointer;
    font-size: 0.7rem;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .ft-close:hover {
    background: #e94560;
    color: white;
  }

  /* Options row */
  .ft-options {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 3px 8px 5px;
    border-top: 1px solid rgba(26, 74, 122, 0.5);
    flex-wrap: wrap;
  }

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

  .ft-sep {
    color: #444;
    font-size: 0.8rem;
    margin: 0 2px;
  }

  .ft-il-group {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .ft-il-label {
    font-size: 0.65rem;
    color: #777;
    margin-right: 2px;
  }

  .ft-hint {
    font-size: 0.65rem;
    color: #666;
    font-style: italic;
    margin-left: 4px;
  }

  .ft-reopen {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 100;
    width: 32px;
    height: 32px;
    background: rgba(22, 33, 62, 0.9);
    border: 1px solid #1a4a7a;
    border-radius: 6px;
    color: #888;
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
    transition: all 0.15s;
  }

  .ft-reopen:hover {
    background: #1a4a7a;
    color: white;
    border-color: #4ecdc4;
  }

  /* ===== Mobile: compact icons-only toolbar ===== */
  @media (max-width: 767px) {
    .floating-tools {
      left: 4px;
      right: 4px;
      top: 4px;
    }

    .ft-btn {
      min-width: 38px;
      padding: 6px 6px;
    }

    .ft-label {
      display: none;
    }

    .ft-icon {
      font-size: 1.2rem;
    }

    .ft-close {
      display: none;
    }

    .ft-main {
      gap: 2px;
    }

    .ft-options {
      font-size: 0.65rem;
      overflow-x: auto;
      flex-wrap: nowrap;
      justify-content: flex-start;
      padding: 3px 4px;
      -webkit-overflow-scrolling: touch;
      gap: 3px;
    }

    .ft-opt-btn {
      white-space: nowrap;
      font-size: 0.6rem;
      padding: 4px 6px;
    }

    .ft-hint {
      font-size: 0.55rem;
    }

    .ft-il-group {
      font-size: 0.6rem;
      flex-wrap: nowrap;
      overflow-x: auto;
    }

    .ft-reopen {
      top: 6px;
      left: 6px;
      padding: 4px 8px;
      font-size: 0.7rem;
    }
  }
</style>
