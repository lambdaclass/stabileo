<script lang="ts">
  import { uiStore, resultsStore, modelStore } from '../../lib/store';
  import { unitLabel } from '../../lib/utils/units';

  let showConfig = $state(false);
  let showGridSub = $state(false);
  let showStructureSub = $state(false);
  let showResultsSub = $state(false);

  const us = $derived(uiStore.unitSystem);
  const ul = (q: import('../../lib/utils/units').Quantity) => unitLabel(q, us);

  // Listen for tour events to auto-open/close config section
  $effect(() => {
    const openConfig = () => { showConfig = true; };
    const closeConfig = () => { showConfig = false; };
    window.addEventListener('dedaliano-open-config', openConfig);
    window.addEventListener('dedaliano-close-config', closeConfig);
    return () => {
      window.removeEventListener('dedaliano-open-config', openConfig);
      window.removeEventListener('dedaliano-close-config', closeConfig);
    };
  });
</script>

<div class="toolbar-section" data-tour="config-section">
  <button class="section-toggle" onclick={() => showConfig = !showConfig}>
    {showConfig ? '▾' : '▸'} Configuración
  </button>
  {#if showConfig}
  <div class="config-children">
    <button class="sub-toggle" onclick={() => showGridSub = !showGridSub}>
      {showGridSub ? '▾' : '▸'} Grilla
    </button>
    {#if showGridSub}
      {@const is3D = uiStore.analysisMode === '3d'}
      {@const gridVisible = is3D ? uiStore.showGrid3D : uiStore.showGrid}
      <div class="sub-content">
        <label class="checkbox-item">
          <input type="checkbox" checked={is3D ? uiStore.showAxes3D : uiStore.showAxes}
            onchange={(e) => { if (is3D) uiStore.showAxes3D = e.currentTarget.checked; else uiStore.showAxes = e.currentTarget.checked; }} />
          <span>Mostrar ejes</span>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" checked={gridVisible}
            onchange={(e) => { if (is3D) uiStore.showGrid3D = e.currentTarget.checked; else uiStore.showGrid = e.currentTarget.checked; }} />
          <span>Mostrar grilla</span>
        </label>
        <div style="opacity: {gridVisible ? 1 : 0.4}; pointer-events: {gridVisible ? 'auto' : 'none'}; display: flex; flex-direction: column; gap: 0.35rem;">
          <label class="checkbox-item">
            <input type="checkbox" checked={is3D ? uiStore.snapToGrid3D : uiStore.snapToGrid}
              onchange={(e) => { if (is3D) uiStore.snapToGrid3D = e.currentTarget.checked; else uiStore.snapToGrid = e.currentTarget.checked; }} />
            <span>Snap grilla nodos</span>
          </label>
          <div class="input-group">
            <label>{is3D ? 'Grilla xz (m)' : `Grilla (${ul('length')})`}:</label>
            <input
              type="number"
              value={is3D ? uiStore.gridSize3D : uiStore.gridSize}
              oninput={(e) => { const v = parseFloat(e.currentTarget.value); if (!isNaN(v) && v > 0) { if (is3D) uiStore.gridSize3D = v; else uiStore.gridSize = v; } }}
              min="0.1"
              step="0.1"
            />
          </div>
        </div>
      </div>
    {/if}

    <button class="sub-toggle" onclick={() => showStructureSub = !showStructureSub}>
      {showStructureSub ? '▾' : '▸'} Modelo
    </button>
    {#if showStructureSub}
      {@const is3Dm = uiStore.analysisMode === '3d'}
      <div class="sub-content">
        <label class="checkbox-item">
          <input type="checkbox" checked={is3Dm ? uiStore.showNodeLabels3D : uiStore.showNodeLabels}
            onchange={(e) => { if (is3Dm) uiStore.showNodeLabels3D = e.currentTarget.checked; else uiStore.showNodeLabels = e.currentTarget.checked; }} />
          <span>IDs de nodos</span>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" checked={is3Dm ? uiStore.showElementLabels3D : uiStore.showElementLabels}
            onchange={(e) => { if (is3Dm) uiStore.showElementLabels3D = e.currentTarget.checked; else uiStore.showElementLabels = e.currentTarget.checked; }} />
          <span>IDs de elementos</span>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" checked={is3Dm ? uiStore.showLengths3D : uiStore.showLengths}
            onchange={(e) => { if (is3Dm) uiStore.showLengths3D = e.currentTarget.checked; else uiStore.showLengths = e.currentTarget.checked; }} />
          <span>Longitudes</span>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" checked={is3Dm ? uiStore.showLoads3D : uiStore.showLoads}
            onchange={(e) => { if (is3Dm) uiStore.showLoads3D = e.currentTarget.checked; else uiStore.showLoads = e.currentTarget.checked; }} />
          <span>Mostrar cargas</span>
        </label>
        <div class="input-group">
          <label>Unidades:</label>
          <select bind:value={uiStore.unitSystem}>
            <option value="SI">SI (kN, m)</option>
            <option value="Imperial">Imperial (kip, ft)</option>
          </select>
        </div>
        {#if is3Dm}
          <div class="input-group">
            <select bind:value={uiStore.momentStyle3D}>
              <option value="double-arrow">Momentos: flechas doble punta</option>
              <option value="curved">Momentos: flechas curvas</option>
            </select>
          </div>
          <div class="input-group">
            <select bind:value={uiStore.renderMode3D}>
              <option value="wireframe">Modelo de barras simples</option>
              <option value="solid">Modelo de barras gruesas</option>
              <option value="sections">Modelo con secciones</option>
            </select>
          </div>
        {:else}
          <div class="input-group">
            <label>Color:</label>
            <select bind:value={uiStore.elementColorMode}>
              <option value="uniform">Uniforme</option>
              <option value="byMaterial">Por Material</option>
              <option value="bySection">Por Sección</option>
            </select>
          </div>
        {/if}
      </div>
    {/if}

    <button class="sub-toggle" onclick={() => showResultsSub = !showResultsSub}>
      {showResultsSub ? '▾' : '▸'} Resultados
    </button>
    {#if showResultsSub}
      <div class="sub-content">
        <label class="checkbox-item">
          <input type="checkbox" bind:checked={resultsStore.showDiagramValues} />
          <span>Mostrar valores</span>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" bind:checked={resultsStore.showReactions} />
          <span>Mostrar reacciones</span>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" bind:checked={uiStore.hideLoadsWithDiagram} />
          <span>Ocultar cargas con diagrama</span>
        </label>
        <label class="checkbox-item">
          <input type="checkbox" bind:checked={uiStore.showPrimarySelector} />
          <span>Mostrar selector principal</span>
        </label>
        <label class="checkbox-item" class:checkbox-disabled={!uiStore.showPrimarySelector}>
          <input type="checkbox" bind:checked={uiStore.showSecondarySelector}
                 disabled={!uiStore.showPrimarySelector} />
          <span>Mostrar selector secundario</span>
        </label>
      </div>
    {/if}

    <button class="config-action-btn live-calc-btn" class:live-calc-active={uiStore.liveCalc}
      onclick={() => uiStore.liveCalc = !uiStore.liveCalc}
      title="Recalcula automáticamente al editar la estructura">
      Cálculo en tiempo real — {uiStore.liveCalc ? 'Activado' : 'Desactivado'}
    </button>
  </div>
  {/if}
</div>

<style>
  .toolbar-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-toggle {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: none;
    border: 1px solid #333;
    border-radius: 4px;
    color: #aaa;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.2s;
  }

  .section-toggle:hover {
    background: #1a1a2e;
    color: #ccc;
    border-color: #555;
  }

  /* Configuración sub-sections */
  .config-children {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-left: 0.2rem;
    padding-right: 0.2rem;
  }

  .sub-toggle {
    width: 100%;
    padding: 0.25rem 0.4rem;
    background: none;
    border: 1px solid #2a2a3e;
    border-radius: 3px;
    color: #999;
    cursor: pointer;
    font-size: 0.68rem;
    font-weight: 500;
    text-align: left;
    letter-spacing: 0.03em;
    transition: all 0.2s;
  }
  .sub-toggle:hover {
    background: #1a1a2e;
    color: #ccc;
    border-color: #444;
  }

  .sub-content {
    padding: 0.4rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    border: 1px solid #2a2a3e;
    border-radius: 4px;
    margin-top: 0.15rem;
    overflow: hidden;
  }

  .sub-content select {
    font-size: 0.68rem;
    padding: 0.2rem 0.3rem;
  }
  .sub-content .input-group label {
    font-size: 0.65rem;
  }

  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .checkbox-item.checkbox-disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .input-group input {
    width: 70px;
    padding: 0.25rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    cursor: pointer;
  }

  .input-group select {
    flex: 1;
    min-width: 100px;
    padding: 0.25rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    cursor: pointer;
  }

  input[type="radio"],
  input[type="checkbox"] {
    accent-color: #e94560;
  }

  .config-action-btn {
    width: 100%;
    padding: 0.25rem 0.4rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #4ecdc4;
    cursor: pointer;
    font-size: 0.68rem;
    transition: all 0.2s;
  }
  .config-action-btn:hover {
    background: #1a4a7a;
    color: white;
  }
  .live-calc-btn {
    color: #888;
    background: #12192e;
    border-color: #333;
  }
  .live-calc-btn:hover {
    background: #1a1a2e;
    color: #ccc;
  }
  .live-calc-active {
    color: #4ecdc4;
    background: #0f3460;
    border-color: #4ecdc4;
  }
  .live-calc-active:hover {
    background: #1a4a7a;
    color: white;
  }
</style>
