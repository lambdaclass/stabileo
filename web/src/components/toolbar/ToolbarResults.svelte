<script lang="ts">
  import { uiStore, resultsStore, modelStore, historyStore } from '../../lib/store';
  import { unitLabel } from '../../lib/utils/units';
  import { solveDetailed } from '../../lib/engine/solver-detailed';
  import { solveDetailed3D } from '../../lib/engine/solver-detailed-3d';
  import { t } from '../../lib/i18n';

  // ─── Educational Tooltips (subset used by Results) ─────────────
  const HELP_TEXTS: Record<string, { title: string; desc: string }> = {
    'solve':          { title: 'tooltip.solve.title', desc: 'tooltip.solve.desc' },
    'diag-none':      { title: 'tooltip.diagNone.title', desc: 'tooltip.diagNone.desc' },
    'diag-deformed':  { title: 'tooltip.diagDeformed.title', desc: 'tooltip.diagDeformed.desc' },
    'diag-moment':    { title: 'tooltip.diagMoment.title', desc: 'tooltip.diagMoment.desc' },
    'diag-shear':     { title: 'tooltip.diagShear.title', desc: 'tooltip.diagShear.desc' },
    'diag-axial':     { title: 'tooltip.diagAxial.title', desc: 'tooltip.diagAxial.desc' },
    'diag-axialColor':{ title: 'tooltip.diagAxialColor.title', desc: 'tooltip.diagAxialColor.desc' },
    'diag-colorMap':  { title: 'tooltip.diagColorMap.title', desc: 'tooltip.diagColorMap.desc' },
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
        el.innerHTML = `<strong>${t(info.title)}</strong><br/><span>${t(info.desc)}</span>`;
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
        uiStore.toast(t('results.numericError'), 'error');
        return;
      }
      resultsStore.setResults(results);
      // Show classification in success toast
      const kin = modelStore.kinematicResult;
      let classText = '';
      if (kin) {
        if (kin.classification === 'isostatic') classText = t('toast.isostatic');
        else if (kin.classification === 'hyperstatic') classText = t('toast.hyperstatic').replace('{degree}', String(kin.degree));
      }
      // Auto-solve combinations if they exist
      let comboText = '';
      if (modelStore.model.combinations.length > 0) {
        const comboResult = modelStore.solveCombinations(uiStore.includeSelfWeight);
        if (comboResult && typeof comboResult !== 'string') {
          resultsStore.setCombinationResults(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
          comboText = t('toast.plusCombinations').replace('{n}', String(comboResult.perCombo.size));
        }
      }
      uiStore.toast(`${t('results.calcSuccess')}${classText} — ${results.elementForces.length} ${t('results.bars')}, ${results.reactions.length} ${t('results.reactions')}${comboText}`, 'success');
    } else {
      uiStore.toast(t('results.emptyModelError'), 'error');
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
        uiStore.toast(t('results.numericError3d'), 'error');
        return;
      }
      resultsStore.setResults3D(results);
      // Auto-solve 3D combinations if they exist
      let comboText = '';
      if (modelStore.model.combinations.length > 0) {
        const comboResult = modelStore.solveCombinations3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
        if (comboResult && typeof comboResult !== 'string') {
          resultsStore.setCombinationResults3D(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
          comboText = t('toast.plusCombinations').replace('{n}', String(comboResult.perCombo.size));
        }
      }
      uiStore.toast(
        `${t('results.analysis3dSuccess')} — ${results.elementForces.length} ${t('results.bars')}, ${results.reactions.length} ${t('results.reactions')}${comboText}`,
        'success',
      );
    } else {
      uiStore.toast(t('results.emptyModelError'), 'error');
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
        uiStore.toast(t('toast.combinations3dSuccess').replace('{n}', String(nCombos)).replace('{cases}', String(nCases)), 'success');
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
      uiStore.toast(t('toast.combinationsSuccess').replace('{n}', String(nCombos)).replace('{cases}', String(nCases)), 'success');
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
  <h3>{t('results.solve')}</h3>
  <button class="solve-btn" data-tour="calcular-btn" class:ready={modelReady} onclick={handleSolve} use:tooltip={'solve'} title={uiStore.analysisMode === '3d' ? t('results.analysis3dTooltip') : ''}>
    {uiStore.analysisMode === '3d' ? t('results.solve3d') : t('results.solve')}
  </button>
</div>

<div class="toolbar-section" data-tour="results-section">
  <button class="section-toggle" onclick={() => showResultsPanel = !showResultsPanel}>
    {showResultsPanel ? '▾' : '▸'} {t('results.results')}
  </button>
  {#if showResultsPanel}
    {#if resultsStore.results || resultsStore.results3D || resultsStore.influenceLine}
      <div class="diagram-grid">
        <button class="diagram-btn" class:active={resultsStore.diagramType === 'none'} onclick={() => resultsStore.diagramType = 'none'} title={t('results.noDiagramTooltip')} use:tooltip={'diag-none'}>{t('results.none')}</button>
        <button class="diagram-btn" class:active={resultsStore.diagramType === 'deformed'} onclick={() => resultsStore.diagramType = 'deformed'} title={t('results.deformedTooltip')} use:tooltip={'diag-deformed'}>{t('results.deformed')}</button>
        {#if uiStore.analysisMode !== '3d'}
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'moment'} onclick={() => resultsStore.diagramType = 'moment'} title={t('results.momentTooltip')} use:tooltip={'diag-moment'}>{t('results.moment')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'shear'} onclick={() => resultsStore.diagramType = 'shear'} title={t('results.shearTooltip')} use:tooltip={'diag-shear'}>{t('results.shear')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'axial'} onclick={() => resultsStore.diagramType = 'axial'} title={t('results.axialTooltip')} use:tooltip={'diag-axial'}>{t('results.axial')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'axialColor'} onclick={() => resultsStore.diagramType = 'axialColor'} title={t('results.axialColorTooltip')} use:tooltip={'diag-axialColor'}>{t('results.axialColors')}</button>
        {:else}
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'shearZ'} onclick={() => resultsStore.diagramType = 'shearZ'} title={t('results.shearZTooltip')}>{t('results.shearZ')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'momentY'} onclick={() => resultsStore.diagramType = 'momentY'} title={t('results.momentYTooltip')}>{t('results.momentY')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'shearY'} onclick={() => resultsStore.diagramType = 'shearY'} title={t('results.shearYTooltip')}>{t('results.shearY')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'momentZ'} onclick={() => resultsStore.diagramType = 'momentZ'} title={t('results.momentZTooltip')}>{t('results.momentZ')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'axial'} onclick={() => resultsStore.diagramType = 'axial'} title={t('results.axialNTooltip')}>{t('results.axial')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'torsion'} onclick={() => resultsStore.diagramType = 'torsion'} title={t('results.torsionTooltip')}>{t('results.torsion')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'axialColor'} onclick={() => resultsStore.diagramType = 'axialColor'} title={t('results.axialColor3dTooltip')}>{t('results.axialColors')}</button>
          <button class="diagram-btn" class:active={resultsStore.diagramType === 'colorMap'} onclick={() => resultsStore.diagramType = 'colorMap'} title={t('results.colorMapTooltip')}>{t('results.colorMap')}</button>
        {/if}
      </div>
      {#if resultsStore.diagramType === 'deformed'}
        <div class="input-group">
          <label>{t('results.diagramScale')}:</label>
          <button class="scale-step-btn" onclick={() => resultsStore.deformedScale = Math.max(1, resultsStore.deformedScale - (resultsStore.deformedScale <= 10 ? 1 : resultsStore.deformedScale <= 100 ? 5 : 50))} title={t('results.decreaseScale')}>◀</button>
          <input type="range" min="1" max="1000" step="1" bind:value={resultsStore.deformedScale} style="width: 80px" />
          <button class="scale-step-btn" onclick={() => resultsStore.deformedScale = Math.min(1000, resultsStore.deformedScale + (resultsStore.deformedScale < 10 ? 1 : resultsStore.deformedScale < 100 ? 5 : 50))} title={t('results.increaseScale')}>▶</button>
          <span style="font-size: 0.7rem; color: #888">{resultsStore.deformedScale}x</span>
        </div>
      {:else if resultsStore.diagramType !== 'none' && resultsStore.diagramType !== 'colorMap' && resultsStore.diagramType !== 'axialColor'}
        <div class="input-group">
          <label>{t('results.diagramScale')}:</label>
          <button class="scale-step-btn" onclick={() => resultsStore.diagramScale = Math.max(0.1, +(resultsStore.diagramScale - 0.1).toFixed(1))} title={t('results.decreaseScale')}>◀</button>
          <input type="range" min="0.1" max="5" step="0.1" bind:value={resultsStore.diagramScale} style="width: 80px" />
          <button class="scale-step-btn" onclick={() => resultsStore.diagramScale = Math.min(5, +(resultsStore.diagramScale + 0.1).toFixed(1))} title={t('results.increaseScale')}>▶</button>
          <span style="font-size: 0.7rem; color: #888">{resultsStore.diagramScale.toFixed(1)}x</span>
        </div>
      {/if}
      {#if resultsStore.diagramType === 'deformed'}
        <label class="checkbox-item">
          <input type="checkbox" bind:checked={resultsStore.animateDeformed} />
          <span>{t('results.animate')}</span>
        </label>
        {#if resultsStore.animateDeformed}
          <div class="input-group">
            <label>{t('results.speed')}:</label>
            <input type="range" min="0.25" max="3" step="0.25" bind:value={resultsStore.animSpeed} style="width: 80px" />
            <span style="font-size: 0.7rem; color: #888">{resultsStore.animSpeed.toFixed(2)}x</span>
          </div>
        {/if}
      {/if}
      {#if resultsStore.diagramType === 'influenceLine' && resultsStore.influenceLine}
        <label class="checkbox-item">
          <input type="checkbox" bind:checked={resultsStore.ilAnimating} />
          <span>{t('results.animateLoad')}</span>
        </label>
        {#if resultsStore.ilAnimating}
          <div class="input-group">
            <label>{t('results.speed')}:</label>
            <input type="range" min="0.25" max="3" step="0.25" bind:value={resultsStore.ilAnimSpeed} style="width: 80px" />
            <span style="font-size: 0.7rem; color: #888">{resultsStore.ilAnimSpeed.toFixed(2)}x</span>
          </div>
        {/if}
      {/if}
      {#if resultsStore.diagramType === 'colorMap'}
        <div class="input-group">
          <label>{t('results.variable')}:</label>
          <select bind:value={resultsStore.colorMapKind}>
            <option value="moment">{t('results.moment')}</option>
            <option value="shear">{t('results.shear')}</option>
            <option value="axial">{t('results.axial')}</option>
            <option value="stressRatio">{t('results.resistance')}</option>
          </select>
        </div>
      {/if}
      {#if resultsStore.hasCombinations && (resultsStore.diagramType === 'moment' || resultsStore.diagramType === 'shear' || resultsStore.diagramType === 'axial' || resultsStore.diagramType === 'momentY' || resultsStore.diagramType === 'momentZ' || resultsStore.diagramType === 'shearY' || resultsStore.diagramType === 'shearZ' || resultsStore.diagramType === 'torsion')}
        {@const is3D = uiStore.analysisMode === '3d'}
        {@const caseKeys = is3D ? [...resultsStore.perCase3D.keys()] : [...resultsStore.perCase.keys()]}
        {@const comboKeys = is3D ? [...resultsStore.perCombo3D.keys()] : [...resultsStore.perCombo.keys()]}
        {@const hasEnvelope = is3D ? resultsStore.fullEnvelope3D !== null : resultsStore.fullEnvelope !== null}
        <button class="sub-toggle" onclick={() => showResultsViewSub = !showResultsViewSub}>
          {showResultsViewSub ? '▾' : '▸'} {t('results.changeResultsView')}
        </button>
        {#if showResultsViewSub}
          <div class="sub-content">
            {#if uiStore.showPrimarySelector}
              <div class="input-group">
                <label>{t('results.primary')}:</label>
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
                  <option value="single">{t('results.simpleLoads')}</option>
                  {#each caseKeys as caseId}
                    {@const lc = modelStore.model.loadCases.find(c => c.id === caseId)}
                    <option value={`case_${caseId}`}>{lc?.name ?? `${t('results.caseFallback')} ${caseId}`}</option>
                  {/each}
                  {#each comboKeys as comboId}
                    {@const combo = modelStore.model.combinations.find(c => c.id === comboId)}
                    <option value={`combo_${comboId}`}>{combo?.name ?? `${t('results.comboFallback')} ${comboId}`}</option>
                  {/each}
                  <option value="envelope">{t('results.envelope')}</option>
                </select>
              </div>
              {#if uiStore.showSecondarySelector}
                <div class="input-group">
                  <label>{t('results.compare')}:</label>
                  <select onchange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (val === 'none') {
                      if (is3D) resultsStore.setOverlay3D(null);
                      else resultsStore.setOverlay(null);
                    } else if (val === 'single') {
                      if (is3D) resultsStore.setOverlay3D(resultsStore.singleResults3D, t('results.simpleLoads'));
                      else resultsStore.setOverlay(resultsStore.singleResults, t('results.simpleLoads'));
                    } else if (val === 'envelope') {
                      if (is3D) resultsStore.setOverlay3D(resultsStore.fullEnvelope3D?.maxAbsResults3D ?? null, t('results.envelope'));
                      else resultsStore.setOverlay(resultsStore.fullEnvelope?.maxAbsResults ?? null, t('results.envelope'));
                    } else if (val.startsWith('case_')) {
                      const id = Number(val.replace('case_', ''));
                      const lc = modelStore.model.loadCases.find(c => c.id === id);
                      const label = lc?.name ?? `${t('results.caseFallback')} ${id}`;
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
                      const label = combo?.name ?? `${t('results.comboFallback')} ${id}`;
                      if (is3D) {
                        const r3d = resultsStore.perCombo3D.get(id);
                        if (r3d) resultsStore.setOverlay3D(r3d, label);
                      } else {
                        const r = resultsStore.perCombo.get(id);
                        if (r) resultsStore.setOverlay(r, label);
                      }
                    }
                  }}>
                    <option value="none">{t('results.noComparison')}</option>
                    <option value="single">{t('results.simpleLoads')}</option>
                    {#each caseKeys as caseId}
                      {@const lc = modelStore.model.loadCases.find(c => c.id === caseId)}
                      <option value={`case_${caseId}`}>{lc?.name ?? `${t('results.caseFallback')} ${caseId}`}</option>
                    {/each}
                    {#each comboKeys as comboId}
                      {@const combo = modelStore.model.combinations.find(c => c.id === comboId)}
                      <option value={`combo_${comboId}`}>{combo?.name ?? `${t('results.comboFallback')} ${comboId}`}</option>
                    {/each}
                    {#if hasEnvelope}
                      <option value="envelope">{t('results.envelope')}</option>
                    {/if}
                  </select>
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      {/if}

    {:else}
      <p class="no-results-msg">{t('results.noResultsMsg')}</p>
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
