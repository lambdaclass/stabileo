<script lang="ts">
  import { uiStore, resultsStore, modelStore } from '../lib/store';
  import { t } from '../lib/i18n';

  const is3D = $derived(uiStore.analysisMode === '3d');
  const hasResults = $derived(resultsStore.results !== null || resultsStore.results3D !== null);
  const hasModel = $derived(modelStore.nodes.size > 0);

  // Diagram type helpers
  const isDiagramWithScale = $derived(
    resultsStore.diagramType !== 'none' &&
    resultsStore.diagramType !== 'deformed' &&
    resultsStore.diagramType !== 'colorMap' &&
    resultsStore.diagramType !== 'axialColor'
  );

  function handleSolve() {
    window.dispatchEvent(new Event('dedaliano-solve'));
  }

  function stepDeformedScale(delta: number) {
    const s = resultsStore.deformedScale;
    const step = s <= 10 ? 1 : s <= 100 ? 5 : 50;
    resultsStore.deformedScale = Math.max(1, Math.min(1000, s + delta * step));
  }

  function stepDiagramScale(delta: number) {
    resultsStore.diagramScale = Math.max(0.1, Math.min(5, +(resultsStore.diagramScale + delta * 0.1).toFixed(1)));
  }
</script>

<!-- Toggle button — always visible on mobile when panel is closed -->
{#if uiStore.isMobile && !uiStore.mobileResultsPanelOpen}
  <button
    class="mrp-reopen"
    style="top: {uiStore.floatingToolsTopOffset}px"
    onclick={() => uiStore.mobileResultsPanelOpen = true}
    title={t('mobile.resultsAndSolve')}
  >
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <line x1="2" y1="17" x2="22" y2="17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M2,17 Q7,5 12,17 Q17,5 22,17" stroke="#e94560" stroke-width="1.8" fill="none"/>
    </svg>
  </button>
{/if}

<!-- Floating results panel -->
{#if uiStore.isMobile && uiStore.mobileResultsPanelOpen}
  <div class="mrp-panel" style="top: {uiStore.floatingToolsTopOffset}px">
    <div class="mrp-header">
      <span class="mrp-title">{t('mobile.results')}</span>
      <button class="mrp-close" onclick={() => uiStore.mobileResultsPanelOpen = false}>&times;</button>
    </div>
    <div class="mrp-body">
      <!-- Solve button — always present -->
      <button class="mrp-solve" onclick={handleSolve} disabled={!hasModel}>
        {is3D ? t('results.solve3d') : t('results.solve')}
      </button>

      {#if hasResults}
        <!-- Diagram type grid -->
        <div class="mrp-grid">
          <button class="mrp-btn" class:active={resultsStore.diagramType === 'none'} onclick={() => resultsStore.diagramType = 'none'}>{t('results.none')}</button>
          <button class="mrp-btn" class:active={resultsStore.diagramType === 'deformed'} onclick={() => resultsStore.diagramType = 'deformed'}>{t('results.deformed')}</button>
          {#if !is3D}
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'moment'} onclick={() => resultsStore.diagramType = 'moment'}>{t('results.moment')}</button>
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'shear'} onclick={() => resultsStore.diagramType = 'shear'}>{t('results.shear')}</button>
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'axial'} onclick={() => resultsStore.diagramType = 'axial'}>{t('results.axial')}</button>
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'axialColor'} onclick={() => resultsStore.diagramType = 'axialColor'}>{t('results.axialColors')}</button>
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'colorMap'} onclick={() => resultsStore.diagramType = 'colorMap'}>{t('results.colorMap')}</button>
          {:else}
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'shearZ'} onclick={() => resultsStore.diagramType = 'shearZ'}>{t('results.shearZ')}</button>
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'momentY'} onclick={() => resultsStore.diagramType = 'momentY'}>{t('results.momentY')}</button>
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'shearY'} onclick={() => resultsStore.diagramType = 'shearY'}>{t('results.shearY')}</button>
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'momentZ'} onclick={() => resultsStore.diagramType = 'momentZ'}>{t('results.momentZ')}</button>
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'axial'} onclick={() => resultsStore.diagramType = 'axial'}>{t('results.axial')}</button>
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'torsion'} onclick={() => resultsStore.diagramType = 'torsion'}>{t('results.torsion')}</button>
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'axialColor'} onclick={() => resultsStore.diagramType = 'axialColor'}>{t('results.axialColors')}</button>
            <button class="mrp-btn" class:active={resultsStore.diagramType === 'colorMap'} onclick={() => resultsStore.diagramType = 'colorMap'}>{t('results.colorMap')}</button>
          {/if}
        </div>

        <!-- Scale controls -->
        {#if resultsStore.diagramType === 'deformed'}
          <div class="mrp-scale">
            <span class="mrp-scale-label">{t('mobile.scale')}</span>
            <button class="mrp-step" onclick={() => stepDeformedScale(-1)}>◀</button>
            <input type="range" min="1" max="1000" step="1" bind:value={resultsStore.deformedScale} />
            <button class="mrp-step" onclick={() => stepDeformedScale(1)}>▶</button>
            <span class="mrp-scale-val">{resultsStore.deformedScale}x</span>
          </div>
          <label class="mrp-check">
            <input type="checkbox" bind:checked={resultsStore.animateDeformed} />
            <span>{t('results.animate')}</span>
          </label>
          {#if resultsStore.animateDeformed}
            <div class="mrp-scale">
              <span class="mrp-scale-label">{t('results.speed')}</span>
              <input type="range" min="0.25" max="3" step="0.25" bind:value={resultsStore.animSpeed} />
              <span class="mrp-scale-val">{resultsStore.animSpeed.toFixed(2)}x</span>
            </div>
          {/if}
        {:else if isDiagramWithScale}
          <div class="mrp-scale">
            <span class="mrp-scale-label">{t('mobile.scale')}</span>
            <button class="mrp-step" onclick={() => stepDiagramScale(-1)}>◀</button>
            <input type="range" min="0.1" max="5" step="0.1" bind:value={resultsStore.diagramScale} />
            <button class="mrp-step" onclick={() => stepDiagramScale(1)}>▶</button>
            <span class="mrp-scale-val">{resultsStore.diagramScale.toFixed(1)}x</span>
          </div>
        {/if}

        <!-- Color map variable -->
        {#if resultsStore.diagramType === 'colorMap'}
          <div class="mrp-select-row">
            <span class="mrp-scale-label">{t('results.variable')}</span>
            <select bind:value={resultsStore.colorMapKind}>
              <option value="moment">{t('results.moment')}</option>
              <option value="shear">{t('results.shear')}</option>
              <option value="axial">{t('results.axial')}</option>
              <option value="stressRatio">{t('results.resistance')}</option>
            </select>
          </div>
        {/if}

        <!-- Show values toggle -->
        <label class="mrp-check">
          <input type="checkbox" bind:checked={resultsStore.showDiagramValues} />
          <span>{t('mobile.values')}</span>
        </label>
      {:else}
        <p class="mrp-hint">{t('mobile.buildAndSolve')}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Reopen button — always visible on mobile */
  .mrp-reopen {
    position: absolute;
    left: 8px;
    z-index: 90;
    width: 36px;
    height: 36px;
    background: rgba(22, 33, 62, 0.9);
    border: 1px solid #445;
    border-radius: 6px;
    color: #aabbcc;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
    transition: background 0.15s, color 0.15s;
  }

  .mrp-reopen:hover, .mrp-reopen:active {
    background: rgba(40, 60, 100, 0.95);
    color: #ddeeff;
  }

  /* Floating panel */
  .mrp-panel {
    position: absolute;
    left: 8px;
    z-index: 90;
    width: min(240px, calc(100vw - 60px));
    max-height: calc(100% - 80px);
    background: rgba(22, 33, 62, 0.96);
    border: 1px solid #1a4a7a;
    border-radius: 8px;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: mrp-slide-in 0.2s ease;
  }

  @keyframes mrp-slide-in {
    from { opacity: 0; transform: translateX(-20px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .mrp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid #1a4a7a;
    flex-shrink: 0;
  }

  .mrp-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: #aabbcc;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .mrp-close {
    background: none;
    border: none;
    color: #888;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
  }

  .mrp-close:hover, .mrp-close:active {
    color: #e94560;
  }

  .mrp-body {
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Solve button inside panel */
  .mrp-solve {
    width: 100%;
    padding: 8px;
    background: #e94560;
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .mrp-solve:active {
    background: #d63851;
  }

  .mrp-solve:disabled {
    background: #555;
    color: #888;
    cursor: not-allowed;
  }

  /* Diagram button grid */
  .mrp-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
  }

  .mrp-btn {
    padding: 6px 4px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #aaa;
    cursor: pointer;
    font-size: 0.68rem;
    text-align: center;
    transition: all 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mrp-btn:active {
    transform: scale(0.95);
  }

  .mrp-btn.active {
    background: #e94560;
    border-color: #ff6b6b;
    color: white;
  }

  /* Scale row */
  .mrp-scale {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .mrp-scale-label {
    font-size: 0.65rem;
    color: #888;
    flex-shrink: 0;
    min-width: 40px;
  }

  .mrp-scale input[type="range"] {
    flex: 1;
    min-width: 0;
    height: 4px;
    accent-color: #e94560;
  }

  .mrp-step {
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #aaa;
    width: 22px;
    height: 22px;
    font-size: 0.6rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .mrp-step:active {
    background: #1a4a7a;
    color: white;
  }

  .mrp-scale-val {
    font-size: 0.6rem;
    color: #888;
    min-width: 28px;
    text-align: right;
    flex-shrink: 0;
  }

  /* Checkbox */
  .mrp-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.7rem;
    color: #aaa;
    cursor: pointer;
    padding: 2px 0;
  }

  .mrp-check input {
    accent-color: #e94560;
  }

  /* Select row */
  .mrp-select-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .mrp-select-row select {
    flex: 1;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #ccc;
    font-size: 0.7rem;
    padding: 4px 6px;
  }

  /* Hint text when no results */
  .mrp-hint {
    font-size: 0.7rem;
    color: #667;
    margin: 4px 0;
    text-align: center;
    font-style: italic;
  }
</style>
