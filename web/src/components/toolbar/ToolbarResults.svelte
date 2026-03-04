<script lang="ts">
  import { uiStore, resultsStore, modelStore, historyStore } from '../../lib/store';
  import { unitLabel } from '../../lib/utils/units';
  import { solveDetailed } from '../../lib/engine/solver-detailed';
  import { solveDetailed3D } from '../../lib/engine/solver-detailed-3d';

  // ─── Educational Tooltips (subset used by Results) ─────────────
  const HELP_TEXTS: Record<string, { title: string; desc: string }> = {
    'solve':          { title: 'Calcular', desc: 'Resuelve la estructura por el Método de la Rigidez Directa (DSM). Necesitás nodos, barras, apoyos y cargas.' },
    'diag-none':      { title: 'Sin Diagrama', desc: 'Oculta todos los diagramas de resultados. Solo se ve la estructura.' },
    'diag-deformed':  { title: 'Deformada', desc: 'Muestra la forma deformada amplificada. Útil para verificar que el comportamiento es razonable.' },
    'diag-moment':    { title: 'Momento Flector (M)', desc: 'Diagrama del momento que genera flexión en cada barra. Se dibuja del lado traccionado por convención.' },
    'diag-shear':     { title: 'Corte (V)', desc: 'Diagrama de la fuerza de corte a lo largo de cada barra. Cambios bruscos indican cargas puntuales.' },
    'diag-axial':     { title: 'Axil (N)', desc: 'Diagrama de la fuerza axial. Positivo = tracción (la barra se estira), negativo = compresión.' },
    'diag-axialColor':{ title: 'Color Axil (N±)', desc: 'Colorea las barras según axil: rojo = tracción, azul = compresión. Grosor proporcional a la magnitud.' },
    'diag-colorMap':  { title: 'Mapa de Color', desc: 'Colorea las barras según el esfuerzo elegido (momento, corte, axil o ratio σ/fy) usando una escala de colores.' },
  };

  function tooltip(node: HTMLElement, key: string) {
    let el: HTMLDivElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function show() {
      if (!uiStore.showTooltips) return;
      const info = HELP_TEXTS[key];
      if (!info) return;
      timer = setTimeout(() => {
        el = document.createElement('div');
        el.className = 'edu-tooltip';
        el.innerHTML = `<strong>${info.title}</strong><br/><span>${info.desc}</span>`;
        document.body.appendChild(el);
        // Position to the right of the element
        const rect = node.getBoundingClientRect();
        el.style.top = `${rect.top + window.scrollY}px`;
        el.style.left = `${rect.right + 8}px`;
        // If going off screen right, put on left
        requestAnimationFrame(() => {
          if (!el) return;
          const tr = el.getBoundingClientRect();
          if (tr.right > window.innerWidth - 10) {
            el.style.left = `${rect.left - tr.width - 8}px`;
          }
          if (tr.bottom > window.innerHeight - 10) {
            el.style.top = `${window.innerHeight - tr.height - 10}px`;
          }
        });
      }, 600);
    }

    function hide() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (el) { el.remove(); el = null; }
    }

    node.addEventListener('mouseenter', show);
    node.addEventListener('mouseleave', hide);

    return {
      destroy() {
        hide();
        node.removeEventListener('mouseenter', show);
        node.removeEventListener('mouseleave', hide);
      }
    };
  }

  // ─── Derived ───────────────────────────────────────────────────
  const us = $derived(uiStore.unitSystem);
  const ul = (q: import('../../lib/utils/units').Quantity) => unitLabel(q, us);

  // Pulse the Solve button when model is ready but not yet solved
  const modelReady = $derived(
    modelStore.nodes.size > 0 &&
    modelStore.elements.size > 0 &&
    modelStore.supports.size > 0 &&
    modelStore.model.loads.length > 0 &&
    !resultsStore.results
  );

  // ─── State ─────────────────────────────────────────────────────
  let showResultsPanel = $state(true);
  let showResultsViewSub = $state(false);

  // ─── Handlers ──────────────────────────────────────────────────
  function handleSolve() {
    if (uiStore.analysisMode === '3d') {
      handleSolve3D();
      return;
    }
    const results = modelStore.solve(uiStore.includeSelfWeight);
    if (typeof results === 'string') {
      uiStore.toast(results, 'error');
    } else if (results) {
      // Validate results aren't degenerate
      const hasNaN = results.displacements.some(d => !isFinite(d.ux) || !isFinite(d.uy) || !isFinite(d.rz));
      if (hasNaN) {
        uiStore.toast('Error numérico: la estructura puede ser inestable (mecanismo)', 'error');
        return;
      }
      resultsStore.setResults(results);
      // Show classification in success toast
      const kin = modelStore.kinematicResult;
      let classText = '';
      if (kin) {
        if (kin.classification === 'isostatic') classText = ' — Isostática';
        else if (kin.classification === 'hyperstatic') classText = ` — Hiperestática (grado ${kin.degree})`;
      }
      // Auto-solve combinations if they exist
      let comboText = '';
      if (modelStore.model.combinations.length > 0) {
        const comboResult = modelStore.solveCombinations(uiStore.includeSelfWeight);
        if (comboResult && typeof comboResult !== 'string') {
          resultsStore.setCombinationResults(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
          comboText = ` + ${comboResult.perCombo.size} combinaciones`;
        }
      }
      uiStore.toast(`Cálculo exitoso${classText} — ${results.elementForces.length} barras, ${results.reactions.length} reacciones${comboText}`, 'success');
    } else {
      uiStore.toast('Modelo vacío o error inesperado', 'error');
    }
    // Auto-close drawer on mobile after solve, show floating results panel
    if (uiStore.isMobile) {
      uiStore.leftDrawerOpen = false;
      uiStore.mobileResultsPanelOpen = true;
    }
  }

  function handleSolve3D() {
    const results = modelStore.solve3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
    if (typeof results === 'string') {
      uiStore.toast(results, 'error');
    } else if (results) {
      // Validate results aren't degenerate
      const hasNaN = results.displacements.some(
        (d: { ux: number; uy: number; uz: number }) => !isFinite(d.ux) || !isFinite(d.uy) || !isFinite(d.uz)
      );
      if (hasNaN) {
        uiStore.toast('Error numérico 3D: la estructura puede ser inestable (mecanismo)', 'error');
        return;
      }
      resultsStore.setResults3D(results);
      // Auto-solve 3D combinations if they exist
      let comboText = '';
      if (modelStore.model.combinations.length > 0) {
        const comboResult = modelStore.solveCombinations3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
        if (comboResult && typeof comboResult !== 'string') {
          resultsStore.setCombinationResults3D(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
          comboText = ` + ${comboResult.perCombo.size} combinaciones`;
        }
      }
      uiStore.toast(
        `Análisis 3D exitoso — ${results.elementForces.length} barras, ${results.reactions.length} reacciones${comboText}`,
        'success',
      );
    } else {
      uiStore.toast('Modelo vacío o error inesperado', 'error');
    }
    if (uiStore.isMobile) {
      uiStore.leftDrawerOpen = false;
      uiStore.mobileResultsPanelOpen = true;
    }
  }

  function handleSolveCombinations() {
    if (uiStore.analysisMode === '3d') {
      const result = modelStore.solveCombinations3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
      if (typeof result === 'string') {
        uiStore.toast(result, 'error');
      } else if (result) {
        resultsStore.setCombinationResults3D(result.perCase, result.perCombo, result.envelope);
        const nCombos = result.perCombo.size;
        const nCases = result.perCase.size;
        uiStore.toast(`${nCombos} combinaciones 3D calculadas (${nCases} casos de carga).`, 'success');
      }
      return;
    }
    const result = modelStore.solveCombinations(uiStore.includeSelfWeight);
    if (typeof result === 'string') {
      uiStore.toast(result, 'error');
    } else if (result) {
      resultsStore.setCombinationResults(result.perCase, result.perCombo, result.envelope);
      const nCombos = result.perCombo.size;
      const nCases = result.perCase.size;
      uiStore.toast(`${nCombos} combinaciones calculadas (${nCases} casos de carga). Usá "Principal" en diagramas M/V/N para ver Envolvente o combos individuales.`, 'success');
    }
  }

  function zoomToFit() {
    if (modelStore.nodes.size === 0) return;
    const canvas = document.querySelector('.viewport-container canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    uiStore.zoomToFit(modelStore.nodes.values(), canvas.width, canvas.height);
  }
</script>

<div class="toolbar-section">
  <h3>Calcular</h3>
  <button class="solve-btn" data-tour="calcular-btn" class:ready={modelReady} onclick={handleSolve} use:tooltip={'solve'} title={uiStore.analysisMode === '3d' ? 'Análisis 3D (6 DOF/nodo)' : ''}>
    {uiStore.analysisMode === '3d' ? 'Calcular 3D' : 'Calcular'}
  </button>
</div>

<div class="toolbar-section" data-tour="results-section">
  <button class="section-toggle" onclick={() => showResultsPanel = !showResultsPanel}>
    {showResultsPanel ? '▾' : '▸'} Resultados
  </button>
  {#if showResultsPanel}
    {#if resultsStore.results || resultsStore.results3D || resultsStore.influenceLine}
      <div class="diagram-grid">
        <button class="diagram-btn" class:active={resultsStore.diagramType === 'none'} onclick={() => resultsStore.diagramType = 'none'} title="Sin diagrama (0)" use:tooltip={'diag-none'}>Ninguno</button>
        <button class="diagram-btn" class:active={resultsStore.diagramType === 'deformed'} onclick={() => resultsStore.diagramType = 'deformed'} title="Deformada amplificada (4)" use:tooltip={'diag-deformed'}>Deformada</button>
        {#if uiStore.analysisMode !== '3d'}
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'moment'} onclick={() => resultsStore.diagramType = 'moment'} title="Diagrama de momento flector (1)" use:tooltip={'diag-moment'}>Momento</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'shear'} onclick={() => resultsStore.diagramType = 'shear'} title="Diagrama de corte (2)" use:tooltip={'diag-shear'}>Corte</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'axial'} onclick={() => resultsStore.diagramType = 'axial'} title="Diagrama de fuerza axil (3)" use:tooltip={'diag-axial'}>Axil</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'axialColor'} onclick={() => resultsStore.diagramType = 'axialColor'} title="Color por axil: rojo=tracción, azul=compresión (7)" use:tooltip={'diag-axialColor'}>Axil colores</button>
        {:else}
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'shearZ'} onclick={() => resultsStore.diagramType = 'shearZ'} title="Corte en Z (Vz)">Corte Z</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'momentY'} onclick={() => resultsStore.diagramType = 'momentY'} title="Momento eje débil (My)">Momento Y</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'shearY'} onclick={() => resultsStore.diagramType = 'shearY'} title="Corte en Y (Vy)">Corte Y</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'momentZ'} onclick={() => resultsStore.diagramType = 'momentZ'} title="Momento eje fuerte (Mz)">Momento Z</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'axial'} onclick={() => resultsStore.diagramType = 'axial'} title="Fuerza axil (N)">Axil</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'torsion'} onclick={() => resultsStore.diagramType = 'torsion'} title="Momento torsor (Mx)">Torsor</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'axialColor'} onclick={() => resultsStore.diagramType = 'axialColor'} title="Color por axil: rojo=tracción, azul=compresión">Axil colores</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'colorMap'} onclick={() => resultsStore.diagramType = 'colorMap'} title="Mapa de color por esfuerzo">Color map</button>
        {/if}
      </div>
      {#if resultsStore.diagramType === 'deformed'}
        <div class="input-group">
          <label>Escala diagrama:</label>
          <button class="scale-step-btn" onclick={() => resultsStore.deformedScale = Math.max(1, resultsStore.deformedScale - (resultsStore.deformedScale <= 10 ? 1 : resultsStore.deformedScale <= 100 ? 5 : 50))} title="Reducir escala">◀</button>
          <input type="range" min="1" max="1000" step="1" bind:value={resultsStore.deformedScale} style="width: 80px" />
          <button class="scale-step-btn" onclick={() => resultsStore.deformedScale = Math.min(1000, resultsStore.deformedScale + (resultsStore.deformedScale < 10 ? 1 : resultsStore.deformedScale < 100 ? 5 : 50))} title="Aumentar escala">▶</button>
          <span style="font-size: 0.7rem; color: #888">{resultsStore.deformedScale}x</span>
        </div>
      {:else if resultsStore.diagramType !== 'none' && resultsStore.diagramType !== 'colorMap' && resultsStore.diagramType !== 'axialColor'}
        <div class="input-group">
          <label>Escala diagrama:</label>
          <button class="scale-step-btn" onclick={() => resultsStore.diagramScale = Math.max(0.1, +(resultsStore.diagramScale - 0.1).toFixed(1))} title="Reducir escala">◀</button>
          <input type="range" min="0.1" max="5" step="0.1" bind:value={resultsStore.diagramScale} style="width: 80px" />
          <button class="scale-step-btn" onclick={() => resultsStore.diagramScale = Math.min(5, +(resultsStore.diagramScale + 0.1).toFixed(1))} title="Aumentar escala">▶</button>
          <span style="font-size: 0.7rem; color: #888">{resultsStore.diagramScale.toFixed(1)}x</span>
        </div>
      {/if}
      {#if resultsStore.diagramType === 'deformed'}
        <label class="checkbox-item">
          <input type="checkbox" bind:checked={resultsStore.animateDeformed} />
          <span>Animar</span>
        </label>
        {#if resultsStore.animateDeformed}
          <div class="input-group">
            <label>Velocidad:</label>
            <input type="range" min="0.25" max="3" step="0.25" bind:value={resultsStore.animSpeed} style="width: 80px" />
            <span style="font-size: 0.7rem; color: #888">{resultsStore.animSpeed.toFixed(2)}x</span>
          </div>
        {/if}
      {/if}
      {#if resultsStore.diagramType === 'influenceLine' && resultsStore.influenceLine}
        <label class="checkbox-item">
          <input type="checkbox" bind:checked={resultsStore.ilAnimating} />
          <span>Animar carga</span>
        </label>
        {#if resultsStore.ilAnimating}
          <div class="input-group">
            <label>Velocidad:</label>
            <input type="range" min="0.25" max="3" step="0.25" bind:value={resultsStore.ilAnimSpeed} style="width: 80px" />
            <span style="font-size: 0.7rem; color: #888">{resultsStore.ilAnimSpeed.toFixed(2)}x</span>
          </div>
        {/if}
      {/if}
      {#if resultsStore.diagramType === 'colorMap'}
        <div class="input-group">
          <label>Variable:</label>
          <select bind:value={resultsStore.colorMapKind}>
            <option value="moment">Momento</option>
            <option value="shear">Corte</option>
            <option value="axial">Axil</option>
            <option value="stressRatio">Resistencia (σ/fy)</option>
          </select>
        </div>
      {/if}
      {#if resultsStore.hasCombinations && (resultsStore.diagramType === 'moment' || resultsStore.diagramType === 'shear' || resultsStore.diagramType === 'axial' || resultsStore.diagramType === 'momentY' || resultsStore.diagramType === 'momentZ' || resultsStore.diagramType === 'shearY' || resultsStore.diagramType === 'shearZ' || resultsStore.diagramType === 'torsion')}
        {@const is3D = uiStore.analysisMode === '3d'}
        {@const caseKeys = is3D ? [...resultsStore.perCase3D.keys()] : [...resultsStore.perCase.keys()]}
        {@const comboKeys = is3D ? [...resultsStore.perCombo3D.keys()] : [...resultsStore.perCombo.keys()]}
        {@const hasEnvelope = is3D ? resultsStore.fullEnvelope3D !== null : resultsStore.fullEnvelope !== null}
        <button class="sub-toggle" onclick={() => showResultsViewSub = !showResultsViewSub}>
          {showResultsViewSub ? '▾' : '▸'} Cambiar resultados a visualizar
        </button>
        {#if showResultsViewSub}
          <div class="sub-content">
            {#if uiStore.showPrimarySelector}
              <div class="input-group">
                <label>Principal:</label>
                <select value={resultsStore.activeView === 'envelope' ? 'envelope'
                             : resultsStore.activeCaseId !== null ? `case_${resultsStore.activeCaseId}`
                             : resultsStore.activeView === 'combo' ? `combo_${resultsStore.activeComboId ?? ''}`
                             : 'single'}
                  onchange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    const clearOverlay = () => { if (is3D) resultsStore.setOverlay3D(null); else resultsStore.setOverlay(null); };
                    if (val === 'single') {
                      resultsStore.activeCaseId = null;
                      resultsStore.activeView = 'single';
                      clearOverlay();
                    } else if (val === 'envelope') {
                      resultsStore.activeCaseId = null;
                      resultsStore.activeView = 'envelope';
                      clearOverlay();
                    } else if (val.startsWith('case_')) {
                      resultsStore.activeCaseId = Number(val.replace('case_', ''));
                      clearOverlay();
                    } else if (val.startsWith('combo_')) {
                      resultsStore.activeCaseId = null;
                      resultsStore.activeView = 'combo';
                      resultsStore.activeComboId = Number(val.replace('combo_', ''));
                    }
                  }}>
                  <option value="single">Cargas simples</option>
                  {#each caseKeys as caseId}
                    {@const lc = modelStore.model.loadCases.find(c => c.id === caseId)}
                    <option value={`case_${caseId}`}>{lc?.name ?? `Caso ${caseId}`}</option>
                  {/each}
                  {#each comboKeys as comboId}
                    {@const combo = modelStore.model.combinations.find(c => c.id === comboId)}
                    <option value={`combo_${comboId}`}>{combo?.name ?? `Combinación ${comboId}`}</option>
                  {/each}
                  <option value="envelope">Envolvente (+/−)</option>
                </select>
              </div>
              {#if uiStore.showSecondarySelector}
                <div class="input-group">
                  <label>Comparar:</label>
                  <select onchange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (val === 'none') {
                      if (is3D) resultsStore.setOverlay3D(null);
                      else resultsStore.setOverlay(null);
                    } else if (val === 'single') {
                      if (is3D) resultsStore.setOverlay3D(resultsStore.singleResults3D, 'Cargas simples');
                      else resultsStore.setOverlay(resultsStore.singleResults, 'Cargas simples');
                    } else if (val === 'envelope') {
                      if (is3D) resultsStore.setOverlay3D(resultsStore.fullEnvelope3D?.maxAbsResults3D ?? null, 'Envolvente');
                      else resultsStore.setOverlay(resultsStore.fullEnvelope?.maxAbsResults ?? null, 'Envolvente');
                    } else if (val.startsWith('case_')) {
                      const id = Number(val.replace('case_', ''));
                      const lc = modelStore.model.loadCases.find(c => c.id === id);
                      const label = lc?.name ?? `Caso ${id}`;
                      if (is3D) {
                        const r3d = resultsStore.perCase3D.get(id);
                        if (r3d) resultsStore.setOverlay3D(r3d, label);
                      } else {
                        const r = resultsStore.perCase.get(id);
                        if (r) resultsStore.setOverlay(r, label);
                      }
                    } else if (val.startsWith('combo_')) {
                      const id = Number(val.replace('combo_', ''));
                      const combo = modelStore.model.combinations.find(c => c.id === id);
                      const label = combo?.name ?? `Combinación ${id}`;
                      if (is3D) {
                        const r3d = resultsStore.perCombo3D.get(id);
                        if (r3d) resultsStore.setOverlay3D(r3d, label);
                      } else {
                        const r = resultsStore.perCombo.get(id);
                        if (r) resultsStore.setOverlay(r, label);
                      }
                    }
                  }}>
                    <option value="none">Sin comparación</option>
                    <option value="single">Cargas simples</option>
                    {#each caseKeys as caseId}
                      {@const lc = modelStore.model.loadCases.find(c => c.id === caseId)}
                      <option value={`case_${caseId}`}>{lc?.name ?? `Caso ${caseId}`}</option>
                    {/each}
                    {#each comboKeys as comboId}
                      {@const combo = modelStore.model.combinations.find(c => c.id === comboId)}
                      <option value={`combo_${comboId}`}>{combo?.name ?? `Combinación ${comboId}`}</option>
                    {/each}
                    {#if hasEnvelope}
                      <option value="envelope">Envolvente (+/−)</option>
                    {/if}
                  </select>
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      {/if}

    {:else}
      <p class="no-results-msg">Calculá la estructura para ver diagramas, deformada, reacciones y más.</p>
    {/if}
  {/if}
</div>

<style>
  .toolbar-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .toolbar-section h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #888;
    letter-spacing: 0.05em;
  }

  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
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
  }

  .input-group input[type="range"] {
    -webkit-appearance: auto;
    appearance: auto;
    accent-color: #e94560;
    background: transparent;
    border: none;
  }

  .input-group select {
    padding: 0.25rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
  }

  .diagram-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.2rem;
  }

  .diagram-btn {
    padding: 0.3rem 0.25rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #ccc;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
    transition: all 0.2s;
  }

  .diagram-btn:hover {
    background: #1a4a7a;
    color: white;
  }

  .diagram-btn.active {
    background: #e94560;
    border-color: #ff6b6b;
    color: white;
  }

  .no-results-msg {
    font-size: 0.72rem;
    color: #888;
    font-style: italic;
    padding: 0.4rem 0.2rem;
    margin: 0;
    line-height: 1.4;
  }

  .scale-step-btn {
    padding: 1px 4px;
    border: 1px solid #333;
    border-radius: 3px;
    background: transparent;
    color: #888;
    font-size: 0.55rem;
    cursor: pointer;
    line-height: 1;
    transition: all 0.12s;
  }
  .scale-step-btn:hover {
    background: #333;
    color: #4ecdc4;
    border-color: #4ecdc4;
  }

  .solve-btn {
    width: 100%;
    padding: 0.5rem 0.5rem;
    background: #e94560;
    border: 1px solid #ff6b6b;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
    transition: all 0.2s;
  }

  .solve-btn:hover:not(:disabled) {
    background: #ff6b6b;
  }

  .solve-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .solve-btn.ready {
    animation: gentle-pulse 3s ease-in-out infinite;
  }

  @keyframes gentle-pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(233, 69, 96, 0);
    }
    50% {
      box-shadow: 0 0 8px 2px rgba(233, 69, 96, 0.4);
    }
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
</style>
