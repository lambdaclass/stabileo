<script lang="ts">
  import { uiStore, modelStore, resultsStore, dsmStepsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { solvePDelta, solveBuckling, solveModal, solveSpectral, solveMovingLoads3D as wasmMovingLoads3D, solvePDelta3D as wasmPDelta3D, solveModal3D as wasmModal3D, solveBuckling3D as wasmBuckling3D, solveSpectral3D as wasmSpectral3D } from '../../lib/engine/wasm-solver';
  import { solvePlastic as solvePlasticJS } from '../../lib/engine/plastic';
  import { solvePDelta3D as jsPDelta3D } from '../../lib/engine/pdelta-3d';
  import { solveModal3D as jsModal3D } from '../../lib/engine/modal-3d';
  import { solveBuckling3D as jsBuckling3D } from '../../lib/engine/buckling-3d';
  import { solveSpectral3D as jsSpectral3D } from '../../lib/engine/spectral-3d';
  import { cirsoc103Spectrum } from '../../lib/engine/spectral';
  import { getPredefinedTrains, solveMovingLoadsAsync } from '../../lib/engine/moving-loads';
  import { solveDetailed } from '../../lib/engine/solver-detailed';
  import { solveDetailed3D } from '../../lib/engine/solver-detailed-3d';

  let showAdvanced = $state(false);
  let showTrainPanel = $state(false);
  let selectedTrainIndex = $state<string>('');
  let advHelpKey = $state<string | null>(null);

  // Listen for tour event to auto-open advanced section
  $effect(() => {
    const openAdvanced = () => { showAdvanced = true; };
    window.addEventListener('dedaliano-open-advanced', openAdvanced);
    return () => {
      window.removeEventListener('dedaliano-open-advanced', openAdvanced);
    };
  });

  const ADV_HELP: Record<string, { labelKey: string; textKey: string }> = {
    'pdelta': {
      labelKey: 'advHelp.pdelta.label',
      textKey: 'advHelp.pdelta.text',
    },
    'buckling': {
      labelKey: 'advHelp.buckling.label',
      textKey: 'advHelp.buckling.text',
    },
    'modal': {
      labelKey: 'advHelp.modal.label',
      textKey: 'advHelp.modal.text',
    },
    'spectral': {
      labelKey: 'advHelp.spectral.label',
      textKey: 'advHelp.spectral.text',
    },
    'plastic': {
      labelKey: 'advHelp.plastic.label',
      textKey: 'advHelp.plastic.text',
    },
    'dsm': {
      labelKey: 'advHelp.dsm.label',
      textKey: 'advHelp.dsm.text',
    },
    'envelope': {
      labelKey: 'advHelp.envelope.label',
      textKey: 'advHelp.envelope.text',
    },
    'trainLoad': {
      labelKey: 'advHelp.trainLoad.label',
      textKey: 'advHelp.trainLoad.text',
    },
    'influenceLine': {
      labelKey: 'advHelp.influenceLine.label',
      textKey: 'advHelp.influenceLine.text',
    },
    'kinematic': {
      labelKey: 'advHelp.kinematic.label',
      textKey: 'advHelp.kinematic.text',
    },
    'stress': {
      labelKey: 'advHelp.stress.label',
      textKey: 'advHelp.stress.text',
    },
    'whatif': {
      labelKey: 'advHelp.whatif.label',
      textKey: 'advHelp.whatif.text',
    },
  };

  function toggleAdvHelp(key: string, e: MouseEvent) {
    e.stopPropagation();
    advHelpKey = advHelpKey === key ? null : key;
  }

  function handlePDelta() {
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    try {
      const t0 = performance.now();
      const result = solvePDelta(input);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setPDeltaResult(result);
      const msg = result.converged
        ? t('toast.pdeltaConverged').replace('{iterations}', String(result.iterations)).replace('{b2}', result.b2Factor.toFixed(2)).replace('{ms}', dt.toFixed(0))
        : result.isStable ? t('toast.pdeltaNotConverged').replace('{iterations}', String(result.iterations)) : t('toast.pdeltaUnstable');
      uiStore.toast(msg, result.converged ? 'success' : 'error');
    } catch (e: any) {
      uiStore.toast(e.message || t('toast.pdeltaError'), 'error');
    }
  }

  function handleModal() {
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    // Build densities map from model materials (rho in kN/m\u00b3 \u2192 need kg/m\u00b3)
    // rho is stored as kN/m\u00b3 in the model. 1 kN/m\u00b3 \u2248 101.97 kg/m\u00b3...
    // Actually the model stores rho as kN/m\u00b3 (e.g. 78.5 for steel)
    // The mass matrix module expects kg/m\u00b3 and converts internally
    // 78.5 kN/m\u00b3 = 7850 kg/m\u00b3 \u2192 multiply by 1000/9.81 \u2248 101.97
    // But wait \u2014 rho in the model is weight density (kN/m\u00b3),
    // mass density = weight density / g = rho / 9.81 \u2192 in kg/m\u00b3 = rho * 1000/9.81
    const densities = new Map<number, number>();
    for (const [id, mat] of modelStore.materials) {
      // mat.rho is weight density in kN/m\u00b3; convert to mass density in kg/m\u00b3
      densities.set(id, mat.rho * 1000 / 9.81);
    }
    try {
      const t0 = performance.now();
      const result = solveModal(input, densities);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setModalResult(result);
      const rayleighInfo = result.rayleigh ? ` | Rayleigh: a\u2080=${result.rayleigh.a0.toFixed(3)}, a\u2081=${result.rayleigh.a1.toFixed(5)}` : '';
      const cumMassInfo = ` | \u03a3Meff: X=${(result.cumulativeMassRatioX * 100).toFixed(0)}%, Y=${(result.cumulativeMassRatioY * 100).toFixed(0)}%`;
      uiStore.toast(t('toast.modalSuccess').replace('{modes}', String(result.modes.length)).replace('{cumMass}', cumMassInfo).replace('{rayleigh}', rayleighInfo).replace('{ms}', dt.toFixed(0)), 'success');
    } catch (e: any) {
      uiStore.toast(e.message || t('toast.modalError'), 'error');
    }
  }

  function handleSpectral() {
    if (!resultsStore.modalResult) {
      uiStore.toast(t('advanced.runDynamicFirst'), 'error');
      return;
    }
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }

    // Build densities (same as modal)
    const densities = new Map<number, number>();
    for (const [id, mat] of modelStore.materials) {
      densities.set(id, mat.rho * 1000 / 9.81);
    }

    try {
      const spectrum = cirsoc103Spectrum(4, 'II'); // Default: Zone 4, Soil II
      const t0 = performance.now();
      const resultX = solveSpectral({
        solver: input,
        modes: resultsStore.modalResult.modes,
        densities,
        direction: 'X',
        spectrum,
        rule: 'CQC',
      });
      const dt = performance.now() - t0;
      if (typeof resultX === 'string') { uiStore.toast(resultX, 'error'); return; }
      // Store spectral result in results store
      resultsStore.setSpectralResult(resultX);
      uiStore.toast(t('toast.spectralSuccess').replace('{vBase}', resultX.baseShear.toFixed(1)).replace('{ms}', dt.toFixed(0)), 'success');
    } catch (e: any) {
      uiStore.toast(e.message || t('toast.spectralError'), 'error');
    }
  }

  function handleBuckling() {
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    try {
      const t0 = performance.now();
      const result = solveBuckling(input);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setBucklingResult(result);
      const factor = result.modes[0]?.loadFactor;
      const nComp = result.elementData.length;
      uiStore.toast(t('toast.bucklingSuccess').replace('{factor}', factor?.toFixed(2) ?? '—').replace('{nComp}', String(nComp)).replace('{ms}', dt.toFixed(0)), 'success');
    } catch (e: any) {
      uiStore.toast(e.message || t('toast.bucklingError'), 'error');
    }
  }

  function handlePlastic() {
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    const sections = new Map<number, { a: number; iz: number; materialId: number; b?: number; h?: number }>();
    for (const [id, sec] of modelStore.sections) {
      const elem = [...modelStore.elements.values()].find(e => e.sectionId === id);
      sections.set(id, { a: sec.a, iz: sec.iy ?? sec.iz, materialId: elem?.materialId ?? 1, b: sec.b, h: sec.h });
    }
    const materials = new Map<number, { fy?: number }>();
    for (const [id, mat] of modelStore.materials) {
      materials.set(id, { fy: mat.fy });
    }
    try {
      const t0 = performance.now();
      const result = solvePlasticJS(input, sections, materials);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setPlasticResult(result);
      const msg = result.isMechanism
        ? t('toast.plasticMechanism').replace('{lambda}', result.collapseFactor.toFixed(2)).replace('{hinges}', String(result.hinges.length)).replace('{limit}', String(result.redundancy + 1)).replace('{ms}', dt.toFixed(0))
        : t('toast.plasticNoCollapse').replace('{hinges}', String(result.hinges.length)).replace('{lambda}', result.collapseFactor.toFixed(2)).replace('{redundancy}', String(result.redundancy)).replace('{ms}', dt.toFixed(0));
      uiStore.toast(msg, result.isMechanism ? 'info' : 'success');
    } catch (e: any) {
      uiStore.toast(e.message || t('toast.plasticError'), 'error');
    }
  }

  async function handleMovingLoad(trainIndex: number) {
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    const train = getPredefinedTrains()[trainIndex];
    if (!train) return;

    const abortController = resultsStore.startMovingLoadAnalysis();

    try {
      const t0 = performance.now();
      const result = await solveMovingLoadsAsync(
        input,
        { train, step: 0.25 },
        (p) => resultsStore.updateMovingLoadProgress(p.current, p.total),
        abortController.signal,
      );
      const dt = performance.now() - t0;

      if (abortController.signal.aborted) return;

      if (typeof result === 'string') {
        uiStore.toast(result, 'error');
        return;
      }
      resultsStore.setMovingLoadEnvelope(result);
      uiStore.toast(t('toast.movingLoadSuccess').replace('{positions}', String(result.positions.length)).replace('{ms}', dt.toFixed(0)), 'success');
    } catch (e: any) {
      if (!abortController.signal.aborted) {
        uiStore.toast(e.message || t('toast.movingLoadError'), 'error');
      }
    } finally {
      resultsStore.finishMovingLoad();
    }
  }

  async function handleMovingLoad3D(trainIndex: number) {
    const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    const train = getPredefinedTrains()[trainIndex];
    if (!train) return;

    const abortController = resultsStore.startMovingLoadAnalysis();

    try {
      const t0 = performance.now();
      const result = wasmMovingLoads3D({ solver: input, train });
      const dt = performance.now() - t0;

      if (abortController.signal.aborted) return;

      if (typeof result === 'string') {
        uiStore.toast(result, 'error');
        return;
      }
      resultsStore.setMovingLoadEnvelope(result);
      uiStore.toast(t('toast.movingLoadSuccess').replace('{positions}', String(result.positions.length)).replace('{ms}', dt.toFixed(0)), 'success');
    } catch (e: any) {
      if (!abortController.signal.aborted) {
        uiStore.toast(e.message || t('toast.movingLoadError'), 'error');
      }
    } finally {
      resultsStore.finishMovingLoad();
    }
  }

  const is3D = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');
  const isPro = $derived(uiStore.analysisMode === 'pro');

  function handlePDelta3D() {
    const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    try {
      const t0 = performance.now();
      let result: any;
      try { result = wasmPDelta3D(input); } catch { result = jsPDelta3D(input); }
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setPDeltaResult3D(result);
      const msg = result.converged
        ? t('toast.pdeltaConverged').replace('{iterations}', String(result.iterations)).replace('{b2}', result.b2Factor.toFixed(2)).replace('{ms}', dt.toFixed(0))
        : result.isStable ? t('toast.pdeltaNotConverged').replace('{iterations}', String(result.iterations)) : t('toast.pdeltaUnstable');
      uiStore.toast(msg, result.converged ? 'success' : 'error');
    } catch (e: any) {
      uiStore.toast(e.message || t('toast.pdeltaError'), 'error');
    }
  }

  function handleModal3D() {
    const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    const densities = new Map<number, number>();
    for (const [id, mat] of modelStore.materials) {
      densities.set(id, mat.rho * 1000 / 9.81);
    }
    try {
      const t0 = performance.now();
      let result: any;
      try { result = wasmModal3D(input, densities); } catch { result = jsModal3D(input, densities); }
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setModalResult3D(result);
      const cumMassInfo = ` | \u03a3Meff: X=${(result.cumulativeMassRatioX * 100).toFixed(0)}%, Y=${(result.cumulativeMassRatioY * 100).toFixed(0)}%, Z=${(result.cumulativeMassRatioZ * 100).toFixed(0)}%`;
      uiStore.toast(t('toast.modalSuccess').replace('{modes}', String(result.modes.length)).replace('{cumMass}', cumMassInfo).replace('{rayleigh}', '').replace('{ms}', dt.toFixed(0)), 'success');
    } catch (e: any) {
      uiStore.toast(e.message || t('toast.modalError'), 'error');
    }
  }

  function handleBuckling3D() {
    const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    try {
      const t0 = performance.now();
      let result: any;
      try { result = wasmBuckling3D(input); } catch { result = jsBuckling3D(input); }
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setBucklingResult3D(result);
      const factor = result.modes[0]?.loadFactor;
      const nComp = result.elementData.length;
      uiStore.toast(t('toast.bucklingSuccess').replace('{factor}', factor?.toFixed(2) ?? '\u2014').replace('{nComp}', String(nComp)).replace('{ms}', dt.toFixed(0)), 'success');
    } catch (e: any) {
      uiStore.toast(e.message || t('toast.bucklingError'), 'error');
    }
  }

  function handleSpectral3D() {
    if (!resultsStore.modalResult3D) {
      uiStore.toast(t('advanced.runDynamicFirst'), 'error');
      return;
    }
    const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    const densities = new Map<number, number>();
    for (const [id, mat] of modelStore.materials) {
      densities.set(id, mat.rho * 1000 / 9.81);
    }
    try {
      const spectrum = cirsoc103Spectrum(4, 'II');
      const t0 = performance.now();
      let result: any;
      try {
        result = wasmSpectral3D({
          solver: input, densities, spectrum, directions: ['X', 'Y'],
          combination: 'CQC',
        });
      } catch {
        // JS fallback: single-direction analysis (X is primary seismic direction)
        result = jsSpectral3D(input, resultsStore.modalResult3D!, densities, {
          direction: 'X', spectrum, rule: 'CQC',
        });
      }
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      const dt = performance.now() - t0;
      resultsStore.setSpectralResult3D(result);
      uiStore.toast(t('toast.spectralSuccess').replace('{vBase}', result.baseShear.toFixed(1)).replace('{ms}', dt.toFixed(0)), 'success');
    } catch (e: any) {
      uiStore.toast(e.message || t('toast.spectralError'), 'error');
    }
  }

  function handleSolveCombinations() {
    if (is3D) {
      const result = modelStore.solveCombinations3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', isPro);
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
</script>

<div class="toolbar-section" data-tour="advanced-section">
  <button class="section-toggle" onclick={() => showAdvanced = !showAdvanced}>
    {showAdvanced ? '▾' : '▸'} {t('advanced.title')}
  </button>
  {#if showAdvanced}
  {#snippet helpPanel(key: string)}
    {#if advHelpKey === key && ADV_HELP[key]}
      <div class="adv-help-panel" style="grid-column: span 2">
        <strong>{t(ADV_HELP[key].labelKey)}</strong>
        <p>{t(ADV_HELP[key].textKey)}</p>
      </div>
    {/if}
  {/snippet}
  <div class="advanced-grid">
    {#if !is3D}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1"
        class:active={uiStore.showKinematicPanel}
        onclick={() => uiStore.showKinematicPanel = !uiStore.showKinematicPanel}>
        {t('advanced.kinematicAnalysis')}
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('kinematic', e)} class:active={advHelpKey === 'kinematic'}>?</button>
    </div>
    {@render helpPanel('kinematic')}
    {/if}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1"
        class:active={uiStore.currentTool === 'select' && uiStore.selectMode === 'stress'}
        onclick={() => {
          if (!resultsStore.results && !resultsStore.results3D) { uiStore.toast(t('advanced.calculateFirst'), 'error'); return; }
          uiStore.currentTool = 'select';
          uiStore.selectMode = 'stress';
        }}>
        {t('advanced.sectionAnalysis')}
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('stress', e)} class:active={advHelpKey === 'stress'}>?</button>
    </div>
    {@render helpPanel('stress')}
    <!-- P-Delta & Buckling: available in both 2D and 3D -->
    <div class="adv-btn-wrap">
      <button class="adv-btn" class:active={is3D ? !!resultsStore.pdeltaResult3D : !!resultsStore.pdeltaResult}
        onclick={() => {
          if (is3D) {
            if (resultsStore.pdeltaResult3D) {
              resultsStore.clearPDelta3D();
              const r = modelStore.solve3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', isPro);
              if (r && typeof r !== 'string') resultsStore.setResults3D(r);
            } else { handlePDelta3D(); }
          } else {
            if (resultsStore.pdeltaResult) {
              resultsStore.clearPDelta();
              const r = modelStore.solve(uiStore.includeSelfWeight);
              if (r && typeof r !== 'string') resultsStore.setResults(r);
            } else { handlePDelta(); }
          }
        }}>{t('advanced.pdelta')}</button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('pdelta', e)} class:active={advHelpKey === 'pdelta'}>?</button>
    </div>
    <div class="adv-btn-wrap">
      <button class="adv-btn" class:active={is3D ? !!resultsStore.bucklingResult3D : !!resultsStore.bucklingResult}
        onclick={() => {
          if (is3D) {
            if (resultsStore.bucklingResult3D) { resultsStore.clearBuckling3D(); }
            else { handleBuckling3D(); }
          } else {
            if (resultsStore.bucklingResult) { resultsStore.clearBuckling(); }
            else { handleBuckling(); }
          }
        }}>{t('advanced.buckling')}</button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('buckling', e)} class:active={advHelpKey === 'buckling'}>?</button>
    </div>
    {@render helpPanel('pdelta')}
    {@render helpPanel('buckling')}
    <!-- Modal & Spectral: available in both 2D and 3D -->
    <div class="adv-btn-wrap">
      <button class="adv-btn" class:active={is3D ? !!resultsStore.modalResult3D : !!resultsStore.modalResult}
        onclick={() => {
          if (is3D) {
            if (resultsStore.modalResult3D) { resultsStore.clearModal3D(); }
            else { handleModal3D(); }
          } else {
            if (resultsStore.modalResult) { resultsStore.clearModal(); }
            else { handleModal(); }
          }
        }}>{t('advanced.dynamic')}</button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('modal', e)} class:active={advHelpKey === 'modal'}>?</button>
    </div>
    <div class="adv-btn-wrap">
      <button class="adv-btn" class:active={is3D ? !!resultsStore.spectralResult3D : !!resultsStore.spectralResult}
        onclick={() => {
          if (is3D) {
            if (resultsStore.spectralResult3D) { resultsStore.clearSpectral3D(); }
            else { handleSpectral3D(); }
          } else {
            if (resultsStore.spectralResult) { resultsStore.clearSpectral(); }
            else { handleSpectral(); }
          }
        }}>{t('advanced.spectral')}</button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('spectral', e)} class:active={advHelpKey === 'spectral'}>?</button>
    </div>
    {@render helpPanel('modal')}
    {@render helpPanel('spectral')}
    <!-- Plastic, Envelope, Moving Loads, Influence Lines: 2D only -->
    {#if !is3D}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1" class:active={!!resultsStore.plasticResult}
        onclick={() => {
          if (resultsStore.plasticResult) {
            resultsStore.clearPlastic();
            const r = modelStore.solve(uiStore.includeSelfWeight);
            if (r && typeof r !== 'string') resultsStore.setResults(r);
          } else { handlePlastic(); }
        }}>{t('advanced.plasticCollapse')}</button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('plastic', e)} class:active={advHelpKey === 'plastic'}>?</button>
    </div>
    {@render helpPanel('plastic')}
    {/if}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1"
        class:active={resultsStore.activeView === 'envelope'}
        onclick={() => {
          if (resultsStore.activeView === 'envelope') {
            resultsStore.activeView = 'single';
            return;
          }
          if (modelStore.model.combinations.length === 0) {
            uiStore.toast(t('advanced.defineCombosFirst'), 'error');
            return;
          }
          if (is3D ? !resultsStore.fullEnvelope3D : !resultsStore.fullEnvelope) {
            handleSolveCombinations();
          }
          if (is3D ? resultsStore.fullEnvelope3D : resultsStore.fullEnvelope) {
            resultsStore.activeView = 'envelope';
            if (resultsStore.diagramType === 'none' || resultsStore.diagramType === 'deformed') resultsStore.diagramType = is3D ? 'momentZ' : 'moment';
          }
        }}>
        {t('advanced.envelope')}
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('envelope', e)} class:active={advHelpKey === 'envelope'}>?</button>
    </div>
    {@render helpPanel('envelope')}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1" class:active={!!resultsStore.movingLoadEnvelope}
        onclick={() => {
          if (resultsStore.movingLoadEnvelope) {
            resultsStore.clearMovingLoad();
            if (is3D) {
              const r = modelStore.solve3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', isPro);
              if (r && typeof r !== 'string') resultsStore.setResults3D(r);
            } else {
              const r = modelStore.solve(uiStore.includeSelfWeight);
              if (r && typeof r !== 'string') resultsStore.setResults(r);
            }
            showTrainPanel = false;
          } else { showTrainPanel = !showTrainPanel; }
        }}>
        {showTrainPanel ? '▾' : '▸'} {t('advanced.trainLoad')}
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('trainLoad', e)} class:active={advHelpKey === 'trainLoad'}>?</button>
    </div>
    {@render helpPanel('trainLoad')}
    {#if showTrainPanel}
      <div class="envelope-sub-panel" style="grid-column: span 2">
        {#if resultsStore.movingLoadRunning}
          <div class="moving-load-progress">
            <div class="progress-bar-container">
              <div class="progress-bar-fill" style="width: {resultsStore.movingLoadProgress ? (resultsStore.movingLoadProgress.current / Math.max(resultsStore.movingLoadProgress.total, 1) * 100) : 0}%"></div>
            </div>
            <div class="progress-info">
              <span class="progress-text">
                {resultsStore.movingLoadProgress?.current ?? 0}/{resultsStore.movingLoadProgress?.total ?? '?'} {t('advanced.positions')}
              </span>
              <button class="cancel-btn" onclick={() => resultsStore.cancelMovingLoad()}>
                {t('advanced.cancelBtn')}
              </button>
            </div>
          </div>
        {:else}
          <div class="adv-btn-wrap">
            <select class="adv-select" bind:value={selectedTrainIndex} onchange={() => { if (selectedTrainIndex !== '') { is3D ? handleMovingLoad3D(Number(selectedTrainIndex)) : handleMovingLoad(Number(selectedTrainIndex)); } }}>
              <option value="">{t('advanced.selectTrain')}</option>
              {#each getPredefinedTrains() as train, i}
                <option value={String(i)}>{train.name}</option>
              {/each}
            </select>
          </div>
        {/if}
      </div>
    {/if}
    {#if !is3D}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1"
        class:active={uiStore.currentTool === 'influenceLine'}
        onclick={() => {
          if (uiStore.currentTool === 'influenceLine') {
            uiStore.currentTool = 'select';
            return;
          }
          if (!resultsStore.results && !resultsStore.results3D) {
            uiStore.toast(t('advanced.calculateFirstF5'), 'error');
            return;
          }
          uiStore.currentTool = 'influenceLine';
        }}>
        ⌇ {t('advanced.influenceLine')}
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('influenceLine', e)} class:active={advHelpKey === 'influenceLine'}>?</button>
    </div>
    {@render helpPanel('influenceLine')}
    {/if}
    <div class="adv-btn-wrap" style="grid-column: span 2">
        <button class="adv-btn" style="flex:1"
          class:active={uiStore.showWhatIf}
          onclick={() => {
            if (!resultsStore.results && !resultsStore.results3D) {
              uiStore.toast(t('advanced.calculateFirstF5'), 'error');
              return;
            }
            uiStore.showWhatIf = !uiStore.showWhatIf;
          }}
        >
          {uiStore.showWhatIf ? '\u2715 ' + t('advanced.closeExplorer') : t('advanced.whatIf')}
        </button>
        <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('whatif', e)} class:active={advHelpKey === 'whatif'}>?</button>
      </div>
      {@render helpPanel('whatif')}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1" class:active={dsmStepsStore.isOpen}
        onclick={() => {
          if (dsmStepsStore.isOpen) {
            dsmStepsStore.close();
            setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 100);
            return;
          }
          if (uiStore.analysisMode === '3d') {
            const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
            if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
            try {
              const data = solveDetailed3D(input);
              dsmStepsStore.setStepData(data);
              dsmStepsStore.open();
              if (uiStore.isMobile) uiStore.rightDrawerOpen = true;
              else uiStore.rightSidebarOpen = true;
              setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 100);
            } catch (e: any) {
              uiStore.toast(e.message || t('toast.detailedSolver3dError'), 'error');
            }
          } else {
            const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
            if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
            try {
              const data = solveDetailed(input);
              dsmStepsStore.setStepData(data);
              dsmStepsStore.open();
              if (uiStore.isMobile) uiStore.rightDrawerOpen = true;
              else uiStore.rightSidebarOpen = true;
              setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 100);
            } catch (e: any) {
              uiStore.toast(e.message || t('toast.detailedSolverError'), 'error');
            }
          }
        }}>
        {t('advanced.stepByStep')}
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('dsm', e)} class:active={advHelpKey === 'dsm'}>?</button>
    </div>
    {@render helpPanel('dsm')}
  </div>
  {@const pdR = is3D ? resultsStore.pdeltaResult3D : resultsStore.pdeltaResult}
  {@const moR = is3D ? resultsStore.modalResult3D : resultsStore.modalResult}
  {@const spR = is3D ? resultsStore.spectralResult3D : resultsStore.spectralResult}
  {@const buR = is3D ? resultsStore.bucklingResult3D : resultsStore.bucklingResult}
  {#if pdR}
    <div class="adv-result-info" style="font-size:10px">
      P-Δ: B₂ = {pdR.b2Factor.toFixed(3)} |
      {pdR.converged ? `${pdR.iterations} iter` : 'no conv.'} |
      {pdR.isStable ? t('advanced.stable') : t('advanced.unstable')}
    </div>
  {/if}
  {#if moR}
    <div class="adv-result-row">
      <button class="adv-result-btn" class:active={resultsStore.diagramType === 'modeShape'} onclick={() => resultsStore.diagramType = 'modeShape'}>{t('advanced.dynamic')}</button>
      <button class="small-btn" onclick={() => { if (resultsStore.activeModeIndex > 0) resultsStore.activeModeIndex--; }} disabled={resultsStore.activeModeIndex === 0}>&#9664;</button>
      <span class="adv-result-label">{resultsStore.activeModeIndex + 1}/{moR.modes.length}</span>
      <button class="small-btn" onclick={() => { if (moR && resultsStore.activeModeIndex < moR.modes.length - 1) resultsStore.activeModeIndex++; }} disabled={!moR || resultsStore.activeModeIndex >= moR.modes.length - 1}>&#9654;</button>
    </div>
    {#if moR.modes[resultsStore.activeModeIndex]}
      {@const mode = moR.modes[resultsStore.activeModeIndex]}
      <div class="adv-result-info">
        f = {mode.frequency.toFixed(2)} Hz |
        T = {mode.period.toFixed(3)} s
      </div>
      <div class="adv-result-info" style="font-size:10px; opacity:0.8">
        Meff: X={( mode.massRatioX * 100).toFixed(1)}% Y={( mode.massRatioY * 100).toFixed(1)}% |
        Σ: X={( moR.cumulativeMassRatioX * 100).toFixed(1)}% Y={( moR.cumulativeMassRatioY * 100).toFixed(1)}%
      </div>
    {/if}
  {/if}
  {#if spR}
    <div class="adv-result-info" style="font-size:10px">
      {t('advanced.spectralLabel')} ({spR.rule}):
      V<sub>base</sub> = {spR.baseShear.toFixed(1)} kN
    </div>
    <div class="adv-result-info" style="font-size:9px; opacity:0.8">
      {#each spR.perMode.slice(0, 3) as pm}
        T<sub>{pm.mode}</sub>={pm.period.toFixed(3)}s Sa={pm.sa.toFixed(2)}g{' | '}
      {/each}
      {#if spR.perMode.length > 3}…{/if}
    </div>
  {/if}
  {#if buR}
    <div class="adv-result-row">
      <button class="adv-result-btn" class:active={resultsStore.diagramType === 'bucklingMode'} onclick={() => resultsStore.diagramType = 'bucklingMode'}>{t('advanced.bucklingLabel')}</button>
      <button class="small-btn" onclick={() => { if (resultsStore.activeBucklingMode > 0) resultsStore.activeBucklingMode--; }} disabled={resultsStore.activeBucklingMode === 0}>&#9664;</button>
      <span class="adv-result-label">{resultsStore.activeBucklingMode + 1}/{buR.modes.length}</span>
      <button class="small-btn" onclick={() => { if (buR && resultsStore.activeBucklingMode < buR.modes.length - 1) resultsStore.activeBucklingMode++; }} disabled={!buR || resultsStore.activeBucklingMode >= buR.modes.length - 1}>&#9654;</button>
    </div>
    <div class="adv-result-info">
      &lambda;_cr = {buR.modes[resultsStore.activeBucklingMode]?.loadFactor.toFixed(3) ?? '—'}
    </div>
    {#if buR.elementData.length > 0}
      <div class="adv-result-info" style="font-size:10px; opacity:0.8">
        Keff: {buR.elementData.slice(0, 3).map((ed: any) => `E${ed.elementId}=${ed.kEffective.toFixed(2)}`).join(', ')}{buR.elementData.length > 3 ? '...' : ''}
      </div>
    {/if}
  {/if}
  {#if resultsStore.plasticResult}
    <div class="adv-result-row">
      <button class="adv-result-btn" class:active={resultsStore.diagramType === 'plasticHinges'} onclick={() => resultsStore.diagramType = 'plasticHinges'}>{t('advanced.plasticLabel')}</button>
      <button class="small-btn" onclick={() => { if (resultsStore.plasticStep > 0) resultsStore.plasticStep--; }} disabled={resultsStore.plasticStep === 0}>&#9664;</button>
      <span class="adv-result-label">{resultsStore.plasticStep + 1}/{resultsStore.plasticResult.steps.length}</span>
      <button class="small-btn" onclick={() => { if (resultsStore.plasticResult && resultsStore.plasticStep < resultsStore.plasticResult.steps.length - 1) resultsStore.plasticStep++; }} disabled={!resultsStore.plasticResult || resultsStore.plasticStep >= resultsStore.plasticResult.steps.length - 1}>&#9654;</button>
    </div>
    <div class="adv-result-info">
      &lambda; = {resultsStore.plasticResult.steps[resultsStore.plasticStep]?.loadFactor.toFixed(3) ?? '—'} |
      {resultsStore.plasticResult.isMechanism ? t('advanced.mechanism') : t('advanced.noCollapse')} |
      GH = {resultsStore.plasticResult.redundancy}
    </div>
  {/if}
  {#if resultsStore.movingLoadEnvelope}
    <div class="adv-result-row">
      <button class="adv-result-btn" class:active={!resultsStore.movingLoadShowEnvelope} onclick={() => { resultsStore.movingLoadShowEnvelope = false; resultsStore.diagramType = 'moment'; }}>{t('advanced.movingLoad')}</button>
      <button class="small-btn" onclick={() => { if (resultsStore.activeMovingLoadPosition > 0) { resultsStore.activeMovingLoadPosition--; resultsStore.movingLoadShowEnvelope = false; } }} disabled={resultsStore.activeMovingLoadPosition === 0}>&#9664;</button>
      <span class="adv-result-label">{resultsStore.activeMovingLoadPosition + 1}/{resultsStore.movingLoadEnvelope.positions.length}</span>
      <button class="small-btn" onclick={() => { if (resultsStore.movingLoadEnvelope && resultsStore.activeMovingLoadPosition < resultsStore.movingLoadEnvelope.positions.length - 1) { resultsStore.activeMovingLoadPosition++; resultsStore.movingLoadShowEnvelope = false; } }} disabled={!resultsStore.movingLoadEnvelope || resultsStore.activeMovingLoadPosition >= resultsStore.movingLoadEnvelope.positions.length - 1}>&#9654;</button>
    </div>
    <div class="adv-result-info">
      {t('advanced.position')}: {resultsStore.movingLoadEnvelope.positions[resultsStore.activeMovingLoadPosition]?.refPosition.toFixed(2) ?? '—'} m
    </div>
    {#if resultsStore.movingLoadEnvelope.fullEnvelope}
      <button class="adv-result-btn small" class:active={resultsStore.movingLoadShowEnvelope}
        onclick={() => {
          resultsStore.movingLoadShowEnvelope = !resultsStore.movingLoadShowEnvelope;
          if (resultsStore.movingLoadShowEnvelope) {
            // Show envelope of all positions -- switch to moment diagram
            const dt = resultsStore.diagramType;
            if (dt !== 'moment' && dt !== 'shear' && dt !== 'axial') {
              resultsStore.diagramType = 'moment';
            }
          }
        }}>
        {resultsStore.movingLoadShowEnvelope ? '▾' : '▸'} {t('advanced.viewEnvelope')}
      </button>
    {/if}
  {/if}
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

  .advanced-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
  }

  .adv-btn-wrap {
    display: flex;
    align-items: stretch;
    gap: 4px;
  }

  .adv-btn {
    padding: 0.3rem 0.4rem;
    min-height: 28px;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    background: #0f3460;
    color: #4ecdc4;
    font-size: 0.72rem;
    cursor: pointer;
    text-align: center;
    flex: 1;
    transition: all 0.2s;
  }

  .adv-btn:hover {
    background: #1a4a7a;
    color: white;
  }

  .adv-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .adv-btn.active {
    background: #1a4a7a;
    color: #4ecdc4;
    border-color: #4ecdc4;
  }

  .adv-help-btn {
    width: 20px;
    min-width: 20px;
    padding: 0;
    border: 1px solid #1a4a7a;
    border-radius: 50%;
    background: #0f3460;
    color: #888;
    font-size: 0.65rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .adv-help-btn:hover,
  .adv-help-btn.active {
    background: #4ecdc4;
    color: #0a1628;
    border-color: #4ecdc4;
  }

  .adv-help-panel {
    padding: 6px 8px;
    background: rgba(78, 205, 196, 0.08);
    border: 1px solid rgba(78, 205, 196, 0.3);
    border-radius: 6px;
    font-size: 0.7rem;
    line-height: 1.4;
    color: #ccc;
  }

  .adv-help-panel strong {
    color: #4ecdc4;
    font-size: 0.72rem;
  }

  .adv-help-panel p {
    margin: 4px 0 0;
    color: #aaa;
  }

  .envelope-sub-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 12px;
    border-left: 2px solid #4ecdc4;
    margin-top: 4px;
  }

  .moving-load-progress {
    padding: 0.2rem 0;
  }
  .progress-bar-container {
    width: 100%;
    height: 6px;
    background: #333;
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    background: #4ecdc4;
    border-radius: 3px;
    transition: width 0.15s ease-out;
  }
  .progress-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.2rem;
  }
  .progress-text {
    font-size: 0.68rem;
    color: #4ecdc4;
  }
  .cancel-btn {
    padding: 0.15rem 0.5rem;
    border: 1px solid #e94560;
    border-radius: 3px;
    background: transparent;
    color: #e94560;
    font-size: 0.68rem;
    cursor: pointer;
  }
  .cancel-btn:hover {
    background: #e94560;
    color: white;
  }

  .adv-select {
    flex: 1;
    padding: 0.3rem 0.4rem;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    background: #0f3460;
    color: #4ecdc4;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .adv-select:hover {
    background: #1a4a7a;
    color: white;
  }

  .small-btn {
    padding: 0.1rem 0.4rem;
    border: 1px solid #555;
    border-radius: 3px;
    background: #2a2a2a;
    color: #ccc;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .small-btn:hover:not(:disabled) {
    background: #3a3a3a;
    color: white;
  }

  .small-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .adv-result-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  .adv-result-btn {
    padding: 0.2rem 0.5rem;
    border: 1px solid #555;
    border-radius: 4px;
    background: #2a2a2a;
    color: #ccc;
    font-size: 0.72rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .adv-result-btn:hover {
    background: #3a3a3a;
    color: white;
  }

  .adv-result-btn.active {
    background: #e94560;
    border-color: #ff6b6b;
    color: white;
  }

  .adv-result-label {
    font-size: 0.72rem;
    color: #4ecdc4;
    min-width: 2rem;
    text-align: center;
  }

  .adv-result-info {
    font-size: 0.68rem;
    color: #888;
    padding: 0 0 0 0.25rem;
  }
</style>
