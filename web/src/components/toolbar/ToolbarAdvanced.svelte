<script lang="ts">
  import { uiStore, modelStore, resultsStore, dsmStepsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { solvePDelta, solveBuckling, solveModal, solvePlastic, solvePDelta3D as wasmPDelta3D, solveModal3D as wasmModal3D, solveBuckling3D as wasmBuckling3D, initSolver, isWasmReady } from '../../lib/engine/wasm-solver';
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
    window.addEventListener('stabileo-open-advanced', openAdvanced);
    return () => {
      window.removeEventListener('stabileo-open-advanced', openAdvanced);
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
    // NOTE: 'spectral' help is retained for when Basic regains spectral
    // analysis with a user-defined spectrum; the action itself is removed.
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
    'despiece': {
      labelKey: 'advHelp.despiece.label',
      textKey: 'advHelp.despiece.text',
    },
    'whatif': {
      labelKey: 'advHelp.whatif.label',
      textKey: 'advHelp.whatif.text',
    },
  };

  /**
   * What a failed analysis actually said.
   *
   * Every handler here used to catch with `e.message` and a generic fallback,
   * which assumes the thrown value is an Error. The WASM solvers throw raw
   * strings — wasm-bindgen hands a JsValue straight to `throw` — so `.message`
   * is undefined and all of them collapsed to their generic fallback. In 3D
   * that turned a specific solver complaint into the word "Buckling error",
   * which tells the user nothing about the model they have to fix.
   */
  /**
   * One advanced analysis at a time, and the panel belongs to it.
   *
   * Thirteen buttons stayed on screen while an analysis ran, so a Kinematic
   * report or a What-if slider stack opened UNDER a list taller than itself and
   * the panel was mostly menu. Worse, the list let two run at once: Section
   * Analysis arms a picking mode rather than producing a result, so it stayed
   * armed while you started something else, and the only way to stop it was to
   * pick a different tool in the ribbon — a control in a different part of the
   * window from the one that started it.
   *
   * So the list is a menu, not a dashboard. Choosing an entry replaces it with
   * that analysis's own controls under a heading that names it and a ✕ that
   * ends it. Nothing is nested that does not belong to the running analysis:
   * the train selector appears when Moving Load is running, not before.
   *
   * The three analyses that exist in both modes read and clear the store slot
   * for the mode they are IN. `isActive` was already mode-aware; `close` was
   * not, so in 3D the ✕ on P-Δ, Pcr or Dynamic cleared the 2D slot, the 3D one
   * stayed set, the header came straight back and there was no way out of the
   * analysis at all.
   *
   * `isActive` is read from the stores rather than from a local flag, so the
   * panel reflects what is actually running — including analyses started from
   * a toast action or restored with a saved model — and closing goes through
   * each analysis's own teardown.
   */
  type Adv = { key: string; labelKey: string; isActive: () => boolean; close: () => void };

  const ADV: Adv[] = [
    { key: 'kinematic', labelKey: 'advanced.kinematicAnalysis',
      isActive: () => uiStore.showKinematicPanel,
      close: () => { uiStore.showKinematicPanel = false; } },
    { key: 'despiece', labelKey: 'advanced.despiece',
      isActive: () => resultsStore.diagramType === 'despiece',
      close: () => { resultsStore.diagramType = 'none'; uiStore.despieceInspect = null; } },
    { key: 'stress', labelKey: 'advanced.sectionAnalysis',
      isActive: () => uiStore.currentTool === 'select' && uiStore.selectMode === 'stress',
      close: () => { uiStore.selectMode = 'elements'; resultsStore.stressQuery = null; } },
    { key: 'pdelta', labelKey: 'advanced.pdelta',
      isActive: () => !!(is3D ? resultsStore.pdeltaResult3D : resultsStore.pdeltaResult),
      close: () => (is3D ? resultsStore.clearPDelta3D() : resultsStore.clearPDelta()) },
    { key: 'buckling', labelKey: 'advanced.buckling',
      isActive: () => !!(is3D ? resultsStore.bucklingResult3D : resultsStore.bucklingResult),
      close: () => (is3D ? resultsStore.clearBuckling3D() : resultsStore.clearBuckling()) },
    { key: 'modal', labelKey: 'advanced.dynamic',
      isActive: () => !!(is3D ? resultsStore.modalResult3D : resultsStore.modalResult),
      close: () => (is3D ? resultsStore.clearModal3D() : resultsStore.clearModal()) },
    { key: 'plastic', labelKey: 'advanced.plasticCollapse',
      isActive: () => !!resultsStore.plasticResult,
      close: () => resultsStore.clearPlastic() },
    { key: 'envelope', labelKey: 'advanced.envelope',
      isActive: () => resultsStore.activeView === 'envelope',
      close: () => { resultsStore.activeView = 'base'; } },
    { key: 'trainLoad', labelKey: 'advanced.trainLoad',
      isActive: () => !!resultsStore.movingLoadEnvelope || showTrainPanel,
      close: () => { resultsStore.clearMovingLoad(); showTrainPanel = false; selectedTrainIndex = ''; } },
    { key: 'influenceLine', labelKey: 'advanced.influenceLine',
      isActive: () => uiStore.currentTool === 'influenceLine',
      close: () => { uiStore.currentTool = 'select'; resultsStore.setInfluenceLine(null); } },
    { key: 'whatif', labelKey: 'advanced.whatIf',
      isActive: () => uiStore.showWhatIf,
      close: () => { uiStore.showWhatIf = false; } },
    { key: 'dsm', labelKey: 'advanced.stepByStep',
      isActive: () => dsmStepsStore.isOpen,
      close: () => dsmStepsStore.close() },
  ];

  const active = $derived(ADV.find(a => a.isActive()) ?? null);

  /** A block is drawn when nothing is running, or when it IS what is running. */
  function shown(key: string): boolean {
    if (!flat) return true;
    return active === null || active.key === key;
  }

  function errText(e: unknown, fallbackKey: string): string {
    if (typeof e === 'string' && e.trim()) return e;
    const msg = (e as { message?: unknown } | null)?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    return t(fallbackKey);
  }

  function toggleAdvHelp(key: string, e: MouseEvent) {
    e.stopPropagation();
    advHelpKey = advHelpKey === key ? null : key;
  }

  /** Guard for advanced analyses that don't yet expand sliding-joint
   *  constraints (P-Δ, buckling, modal, spectral, plastic, moving load,
   *  influence lines, what-if, step-by-step DSM). Sliders are only wired into
   *  the linear-static / combinations / free-body paths; running an unwired
   *  analysis would treat slider ends as rigid → silently too stiff. Returns
   *  true (and toasts) when the run must be blocked. */
  function blockedBySlidingJoints(): boolean {
    if (modelStore.hasSlidingJoints()) {
      uiStore.toast(t('advanced.slidingUnsupported'), 'error');
      return true;
    }
    if (modelStore.hasJoint3D()) {
      uiStore.toast(t('advanced.jointsUnsupported'), 'error');
      return true;
    }
    return false;
  }

  async function ensureWasmReady(context: string): Promise<boolean> {
    if (isWasmReady()) return true;
    try {
      console.warn(`[${context}] WASM solver not ready, initializing now...`);
      await initSolver();
      return true;
    } catch (e: any) {
      console.error(`[${context}] WASM initialization failed:`, e);
      uiStore.toast(e?.message || 'WASM solver initialization failed.', 'error');
      return false;
    }
  }

  function handlePDelta() {
    if (blockedBySlidingJoints()) return;
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
      uiStore.toast(errText(e, 'toast.pdeltaError'), 'error');
    }
  }

  function handleModal() {
    if (blockedBySlidingJoints()) return;
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
      uiStore.toast(errText(e, 'toast.modalError'), 'error');
    }
  }


  function handleBuckling() {
    if (blockedBySlidingJoints()) return;
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
      uiStore.toast(errText(e, 'toast.bucklingError'), 'error');
    }
  }

  function handlePlastic() {
    if (blockedBySlidingJoints()) return;
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
      const result = solvePlastic({ solver: input, sections, materials });
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setPlasticResult(result);
      const msg = result.isMechanism
        ? t('toast.plasticMechanism').replace('{lambda}', result.collapseFactor.toFixed(2)).replace('{hinges}', String(result.hinges.length)).replace('{limit}', String(result.redundancy + 1)).replace('{ms}', dt.toFixed(0))
        : t('toast.plasticNoCollapse').replace('{hinges}', String(result.hinges.length)).replace('{lambda}', result.collapseFactor.toFixed(2)).replace('{redundancy}', String(result.redundancy)).replace('{ms}', dt.toFixed(0));
      uiStore.toast(msg, result.isMechanism ? 'info' : 'success');
    } catch (e: any) {
      uiStore.toast(errText(e, 'toast.plasticError'), 'error');
    }
  }

  async function handleMovingLoad(trainIndex: number) {
    if (blockedBySlidingJoints()) return;
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
        uiStore.toast(errText(e, 'toast.movingLoadError'), 'error');
      }
    } finally {
      resultsStore.finishMovingLoad();
    }
  }


  const is3D = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');
  const isPro = $derived(uiStore.analysisMode === 'pro');

  async function handlePDelta3D() {
    if (blockedBySlidingJoints()) return;
    if (!await ensureWasmReady('handlePDelta3D')) return;
    const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', { expandMemberOffsets: false });
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    try {
      const t0 = performance.now();
      let result: any;
      result = wasmPDelta3D(input);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setPDeltaResult3D(result);
      const msg = result.converged
        ? t('toast.pdeltaConverged').replace('{iterations}', String(result.iterations)).replace('{b2}', result.b2Factor.toFixed(2)).replace('{ms}', dt.toFixed(0))
        : result.isStable ? t('toast.pdeltaNotConverged').replace('{iterations}', String(result.iterations)) : t('toast.pdeltaUnstable');
      uiStore.toast(msg, result.converged ? 'success' : 'error');
    } catch (e: any) {
      uiStore.toast(errText(e, 'toast.pdeltaError'), 'error');
    }
  }

  async function handleModal3D() {
    if (blockedBySlidingJoints()) return;
    if (!await ensureWasmReady('handleModal3D')) return;
    const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', { expandMemberOffsets: false });
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    const densities = new Map<number, number>();
    for (const [id, mat] of modelStore.materials) {
      densities.set(id, mat.rho * 1000 / 9.81);
    }
    try {
      const t0 = performance.now();
      let result: any;
      result = wasmModal3D(input, densities);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setModalResult3D(result);
      const cumMassInfo = ` | \u03a3Meff: X=${(result.cumulativeMassRatioX * 100).toFixed(0)}%, Y=${(result.cumulativeMassRatioY * 100).toFixed(0)}%, Z=${(result.cumulativeMassRatioZ * 100).toFixed(0)}%`;
      uiStore.toast(t('toast.modalSuccess').replace('{modes}', String(result.modes.length)).replace('{cumMass}', cumMassInfo).replace('{rayleigh}', '').replace('{ms}', dt.toFixed(0)), 'success');
    } catch (e: any) {
      uiStore.toast(errText(e, 'toast.modalError'), 'error');
    }
  }

  async function handleBuckling3D() {
    if (blockedBySlidingJoints()) return;
    if (!await ensureWasmReady('handleBuckling3D')) return;
    const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', { expandMemberOffsets: false });
    if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
    try {
      const t0 = performance.now();
      let result: any;
      result = wasmBuckling3D(input);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setBucklingResult3D(result);
      const factor = result.modes[0]?.loadFactor;
      const nComp = result.elementData.length;
      uiStore.toast(t('toast.bucklingSuccess').replace('{factor}', factor?.toFixed(2) ?? '\u2014').replace('{nComp}', String(nComp)).replace('{ms}', dt.toFixed(0)), 'success');
    } catch (e: any) {
      uiStore.toast(errText(e, 'toast.bucklingError'), 'error');
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
    const result = modelStore.solveCombinations(uiStore.includeSelfWeight, uiStore.drawPlane2D);
    if (typeof result === 'string') {
      uiStore.toast(result, 'error');
    } else if (result) {
      resultsStore.setCombinationResults(result.perCase, result.perCombo, result.envelope);
      const nCombos = result.perCombo.size;
      const nCases = result.perCase.size;
      uiStore.toast(t('toast.combinationsSuccess').replace('{n}', String(nCombos)).replace('{cases}', String(nCases)), 'success');
    }
  }

  /**
   * `flat` — everything open, no accordions.
   *
   * These sections collapse because they used to be stacked in one narrow left
   * column where five of them competed for the same vertical space. In the
   * ribbon layout only ONE of them is ever mounted, in a panel that already
   * names it and that the user can widen, so a disclosure triangle just hides
   * what they explicitly asked to see.
   */
  let { flat = false }: { flat?: boolean } = $props();
</script>

<div class="toolbar-section" class:flat data-tour="advanced-section">
  {#if !flat}<button class="section-toggle" onclick={() => showAdvanced = !showAdvanced}>
    {showAdvanced ? '▾' : '▸'} {t('advanced.title')}
  </button>
  {/if}
  {#if flat || showAdvanced}
  {#snippet helpPanel(key: string)}
    {#if advHelpKey === key && ADV_HELP[key]}
      <div class="adv-help-panel" style="grid-column: span 2">
        <strong>{t(ADV_HELP[key].labelKey)}</strong>
        <p>{t(ADV_HELP[key].textKey)}</p>
      </div>
    {/if}
  {/snippet}
  {#if flat && active}
    <!--
      The running analysis names itself and carries its own ✕. Section Analysis
      in particular had no off switch here at all — you had to go up to the
      ribbon and pick another tool, which is not where you turned it on.
    -->
    <div class="adv-running" data-testid="adv-running" data-adv={active.key}>
      <span class="adv-running-name">{t(active.labelKey)}</span>
      <button
        class="adv-running-close"
        onclick={() => active?.close()}
        title={t('ribbon.close')}
        aria-label={t('ribbon.close')}
        data-testid="adv-close"
      >&times;</button>
    </div>
  {/if}

  <div class="advanced-grid">
    {#if shown('kinematic')}
    <!--
      2D only, and it says so instead of disappearing. In 3D these four rows
      used to be removed outright, so the panel silently changed length between
      modes and a user who had used the feature in 2D was left looking for it.
      Disabled-with-a-reason is what the ribbon does for the same situation.
    -->
      {#if !flat || active?.key !== 'kinematic'}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1" disabled={is3D} title={is3D ? t('advanced.only2d') : undefined}
        class:active={uiStore.showKinematicPanel}
        data-testid="adv-kinematic"
        onclick={() => uiStore.showKinematicPanel = !uiStore.showKinematicPanel}>
        {t('advanced.kinematicAnalysis')}
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('kinematic', e)} class:active={advHelpKey === 'kinematic'}>?</button>
    </div>
    {@render helpPanel('kinematic')}
      {/if}
    {/if}
    {#if shown('despiece')}
    <!-- Despiece / member free-body view (Basic 2D + 3D, solver-free overlay) -->
      {#if !flat || active?.key !== 'despiece'}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1"
        class:active={resultsStore.diagramType === 'despiece'}
        onclick={() => {
          const hasRes = is3D ? resultsStore.results3D : resultsStore.results;
          if (!hasRes) { uiStore.toast(t('advanced.calculateFirst'), 'error'); return; }
          resultsStore.diagramType = resultsStore.diagramType === 'despiece' ? 'none' : 'despiece';
        }}>
        {t('advanced.despiece')}
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('despiece', e)} class:active={advHelpKey === 'despiece'}>?</button>
    </div>
    {@render helpPanel('despiece')}
      {/if}
    {#if resultsStore.diagramType === 'despiece'}
      <div class="adv-btn-wrap" style="grid-column: span 2; flex-direction: column; align-items: stretch; gap: 4px;">
        <div style="display:flex; gap:4px; align-items:center;">
          <span style="font-size:0.7rem; color:var(--st-text-2);">{t('despiece.vectors')}</span>
          <button class="adv-btn" style="flex:1" class:active={uiStore.despieceVectorMode === 'all'} onclick={() => uiStore.despieceVectorMode = 'all'}>{t('despiece.vAll')}</button>
          <button class="adv-btn" style="flex:1" class:active={uiStore.despieceVectorMode === 'members'} onclick={() => uiStore.despieceVectorMode = 'members'}>{t('despiece.vMembers')}</button>
          <button class="adv-btn" style="flex:1" class:active={uiStore.despieceVectorMode === 'nodes'} onclick={() => uiStore.despieceVectorMode = 'nodes'}>{t('despiece.vNodes')}</button>
        </div>
        <div style="display:flex; gap:4px; align-items:center;">
          <span style="font-size:0.7rem; color:var(--st-text-2);">{t('despiece.basis')}</span>
          <button class="adv-btn" style="flex:1" class:active={uiStore.despieceBasis === 'local'} onclick={() => uiStore.despieceBasis = 'local'} title={t('despiece.basisLocalHint')}>{t('despiece.basisLocal')}</button>
          <button class="adv-btn" style="flex:1" class:active={uiStore.despieceBasis === 'global'} onclick={() => uiStore.despieceBasis = 'global'} title={t('despiece.basisGlobalHint')}>{t('despiece.basisGlobal')}</button>
        </div>
        <label style="display:flex; align-items:center; gap:6px; font-size:0.7rem; color:var(--st-text-2);">
          <span style="min-width:70px;">{t('despiece.vectorSize')}</span>
          <input type="range" min="0.5" max="2" step="0.1" bind:value={uiStore.despieceVectorSize} style="flex:1;" />
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:0.7rem; color:var(--st-text-2);">
          <span style="min-width:70px;">{t('despiece.labelSize')}</span>
          <input type="range" min="0.6" max="2" step="0.1" bind:value={uiStore.despieceLabelSize} style="flex:1;" />
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:0.72rem; color:var(--st-text-2); cursor:pointer;">
          <input type="checkbox" bind:checked={resultsStore.showReactions} />
          {t('despiece.reactions')}
        </label>
        <div style="display:flex; gap:4px; align-items:center;">
          <span style="font-size:0.7rem; color:var(--st-text-2);">{t('despiece.loads')}</span>
          <button class="adv-btn" style="flex:1" class:active={uiStore.despieceLoadMode === 'off'} onclick={() => uiStore.despieceLoadMode = 'off'}>{t('despiece.loadsOff')}</button>
          <button class="adv-btn" style="flex:1" class:active={uiStore.despieceLoadMode === 'resultant'} onclick={() => uiStore.despieceLoadMode = 'resultant'}>{t('despiece.loadsResultant')}</button>
          <button class="adv-btn" style="flex:1" class:active={uiStore.despieceLoadMode === 'all'} onclick={() => uiStore.despieceLoadMode = 'all'}>{t('despiece.loadsAll')}</button>
        </div>
        <label style="display:flex; align-items:center; gap:6px; font-size:0.72rem; color:var(--st-text-2); cursor:pointer;">
          <input type="checkbox" bind:checked={uiStore.despieceCombineVectors} />
          {t('despiece.combinedVectors')}
        </label>
      </div>
    {/if}
    {/if}
    {#if shown('stress')}
      {#if !flat || active?.key !== 'stress'}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1"
        class:active={uiStore.currentTool === 'select' && uiStore.selectMode === 'stress'}
        data-testid="adv-stress"
        onclick={() => {
          // A toggle, like every other analysis here. It used to be one-way:
          // it armed a picking mode and the only way back out was to pick a
          // different tool in the ribbon — not where you turned it on.
          if (uiStore.currentTool === 'select' && uiStore.selectMode === 'stress') {
            uiStore.selectMode = 'elements';
            resultsStore.stressQuery = null;
            return;
          }
          if (!resultsStore.results && !resultsStore.results3D) { uiStore.toast(t('advanced.calculateFirst'), 'error'); return; }
          uiStore.currentTool = 'select';
          uiStore.selectMode = 'stress';
        }}>
        {t('advanced.sectionAnalysis')}
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('stress', e)} class:active={advHelpKey === 'stress'}>?</button>
    </div>
    {@render helpPanel('stress')}
      {/if}
    {/if}
    {#if shown('pdelta')}
    <!-- P-Delta & Buckling: available in both 2D and 3D -->
      {#if !flat || active?.key !== 'pdelta'}
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
              const r = modelStore.solve(uiStore.includeSelfWeight, uiStore.drawPlane2D);
              if (r && typeof r !== 'string') resultsStore.setResults(r);
            } else { handlePDelta(); }
          }
        }}>{t('advanced.pdelta')}</button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('pdelta', e)} class:active={advHelpKey === 'pdelta'}>?</button>
    </div>
      {/if}
    {/if}
    {#if shown('buckling')}
      {#if !flat || active?.key !== 'buckling'}
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
      {/if}
    {@render helpPanel('pdelta')}
    {@render helpPanel('buckling')}
    {/if}
    {#if shown('modal')}
    <!-- Modal & Spectral: available in both 2D and 3D -->
      {#if !flat || active?.key !== 'modal'}
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
      {/if}
    <!--
      Spectral analysis is intentionally absent from Basic.

      This button used to run `cirsoc103Spectrum(4, 'II')` — CIRSOC 103,
      seismic Zone 4, Soil II — with no way to see or change either parameter,
      and the success toast reported only a base shear. A student anywhere
      other than that one zone and soil class got a confident, unlabelled,
      wrong number.

      Basic will get spectral analysis back when it can offer a generic,
      user-defined spectrum; national-code presets stay in PRO, where zone and
      soil are already selectable (ProAdvancedTab). The solver entrypoints
      (`solveSpectral`, `solveSpectral3D`) and the `resultsStore` spectral
      slots are deliberately left intact for that work.
    -->
    {@render helpPanel('modal')}
    {/if}
    {#if shown('plastic')}
    <!-- 2D only; disabled with a reason rather than hidden — see Kinematic above. -->
      {#if !flat || active?.key !== 'plastic'}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1" disabled={is3D} title={is3D ? t('advanced.only2d') : undefined} class:active={!!resultsStore.plasticResult}
        onclick={() => {
          if (resultsStore.plasticResult) {
            resultsStore.clearPlastic();
            const r = modelStore.solve(uiStore.includeSelfWeight, uiStore.drawPlane2D);
            if (r && typeof r !== 'string') resultsStore.setResults(r);
          } else { handlePlastic(); }
        }}>{t('advanced.plasticCollapse')}</button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('plastic', e)} class:active={advHelpKey === 'plastic'}>?</button>
    </div>
    {@render helpPanel('plastic')}
      {/if}
    {/if}
    {#if shown('envelope')}
      {#if !flat || active?.key !== 'envelope'}
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
      {/if}
    {/if}
    {#if shown('trainLoad')}
    <!-- 2D only; disabled with a reason rather than hidden — see Kinematic above. -->
      {#if !flat || active?.key !== 'trainLoad'}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1" disabled={is3D} title={is3D ? t('advanced.only2d') : undefined} class:active={!!resultsStore.movingLoadEnvelope}
        onclick={() => {
          if (resultsStore.movingLoadEnvelope) {
            resultsStore.clearMovingLoad();
            const r = modelStore.solve(uiStore.includeSelfWeight, uiStore.drawPlane2D);
            if (r && typeof r !== 'string') resultsStore.setResults(r);
            showTrainPanel = false;
          } else { showTrainPanel = !showTrainPanel; }
        }}>
        {flat ? '' : showTrainPanel ? '▾ ' : '▸ '}{t('advanced.trainLoad')}
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('trainLoad', e)} class:active={advHelpKey === 'trainLoad'}>?</button>
    </div>
    {@render helpPanel('trainLoad')}
      {/if}
    <!--
      The train selector is part of running Moving Load, so it appears when
      Moving Load is running. In the menu it sat permanently under the button —
      in 3D, under a greyed-out one, offering to configure a run that cannot
      start.
    -->
    {#if (flat && !is3D && active?.key === 'trainLoad') || (!flat && showTrainPanel)}
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
            <select class="adv-select" bind:value={selectedTrainIndex} onchange={() => { if (selectedTrainIndex !== '') { handleMovingLoad(Number(selectedTrainIndex)); } }}>
              <option value="">{t('advanced.selectTrain')}</option>
              {#each getPredefinedTrains() as train, i}
                <option value={String(i)}>{train.name}</option>
              {/each}
            </select>
          </div>
        {/if}
      </div>
    {/if}
    {/if}
    {#if shown('influenceLine')}
    <!-- 2D only; disabled with a reason rather than hidden — see Kinematic above. -->
      {#if !flat || active?.key !== 'influenceLine'}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1" disabled={is3D} title={is3D ? t('advanced.only2d') : undefined}
        class:active={uiStore.currentTool === 'influenceLine'}
        onclick={() => {
          if (uiStore.currentTool === 'influenceLine') {
            uiStore.currentTool = 'select';
            return;
          }
          if (blockedBySlidingJoints()) return;
          if (!resultsStore.results && !resultsStore.results3D) {
            uiStore.toast(t('advanced.calculateFirstF5'), 'error');
            return;
          }
          uiStore.currentTool = 'influenceLine';
        }}>
        {t('advanced.influenceLine')}
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('influenceLine', e)} class:active={advHelpKey === 'influenceLine'}>?</button>
    </div>
    {@render helpPanel('influenceLine')}
      {/if}
    {/if}
    {#if shown('whatif')}
      {#if !flat || active?.key !== 'whatif'}
    <div class="adv-btn-wrap" style="grid-column: span 2">
        <button class="adv-btn" style="flex:1"
          class:active={uiStore.showWhatIf}
          onclick={() => {
            if (!uiStore.showWhatIf && blockedBySlidingJoints()) return;
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
      {/if}
    {/if}
    {#if shown('dsm')}
      {#if !flat || active?.key !== 'dsm'}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1" class:active={dsmStepsStore.isOpen}
        onclick={() => {
          if (dsmStepsStore.isOpen) {
            dsmStepsStore.close();
            setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 100);
            return;
          }
          if (blockedBySlidingJoints()) return;
          if (uiStore.analysisMode === '3d') {
            const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', { expandMemberOffsets: false });
            if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
            try {
              const data = solveDetailed3D(input);
              dsmStepsStore.setStepData(data);
              dsmStepsStore.open();
              if (uiStore.isMobile) uiStore.rightDrawerOpen = true;
              else uiStore.rightSidebarOpen = true;
              setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 100);
            } catch (e: any) {
              uiStore.toast(errText(e, 'toast.detailedSolver3dError'), 'error');
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
              setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 100);
            } catch (e: any) {
              uiStore.toast(errText(e, 'toast.detailedSolverError'), 'error');
            }
          }
        }}>
        {t('advanced.stepByStep')}
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('dsm', e)} class:active={advHelpKey === 'dsm'}>?</button>
    </div>
    {@render helpPanel('dsm')}
      {/if}
    {/if}
  </div>
  {@const pdR = is3D ? resultsStore.pdeltaResult3D : resultsStore.pdeltaResult}
  {@const moR = is3D ? resultsStore.modalResult3D : resultsStore.modalResult}
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
    border: 1px solid var(--st-hair);
    border-radius: 4px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.2s;
  }

  .section-toggle:hover {
    background: var(--st-bg);
    color: var(--st-text);
    border-color: var(--st-hair-strong);
  }

  .advanced-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
  }

  /*
     One column in the right panel.
     ─────────────────────────────
     The two-column grid was built for the old left sidebar, where the section
     was a short accordion and pairing P-Δ with Pcr saved vertical space. In the
     right panel it produced a ragged list: most analyses carry
     `grid-column: span 2` inline and take a full row, four do not, and each row
     also ends in a round help button — so the panel showed full-width rows,
     half-width rows and help buttons landing at three different x positions.

     Flex, not a one-column grid: `grid-column: span 2` is set inline on most of
     these rows, and in a single-column grid a span of 2 does not clamp — it
     creates an implicit second column, which is how the ragged layout survived
     the first attempt at this. `display: flex` makes those inline declarations
     inert without touching sixty of them, and every child stretches to the
     panel width on its own. Thirteen analyses read better as a list anyway.
  */
  .adv-running {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0 0.45rem;
    margin-bottom: 0.5rem;
    border-bottom: 1px solid var(--st-hair);
  }

  .adv-running-name {
    font-family: var(--st-mono);
    font-size: 0.68rem;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--st-accent);
  }

  .adv-running-close {
    background: none;
    border: none;
    color: var(--st-text-2);
    font-size: 1.15rem;
    line-height: 1;
    padding: 0 0.3rem;
    cursor: pointer;
    border-radius: var(--st-radius);
  }

  .adv-running-close:hover { background: var(--st-surface-3); color: var(--st-text); }

  .flat .advanced-grid {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  /* Sub-controls belong to the analysis above them, and should look it. */
  .flat .envelope-sub-panel,
  .flat .il-sub-panel {
    margin-left: 0.6rem;
    padding-left: 0.6rem;
    border-left: 2px solid var(--st-hair);
  }

  .adv-btn-wrap {
    display: flex;
    align-items: stretch;
    gap: 4px;
  }

  /*
     A command, styled like the rest of the application's commands. These were
     cyan on a raised block, which is the palette for a computed value, so a
     column of thirteen buttons read as a column of results.
  */
  .adv-btn {
    padding: 0.4rem 0.55rem;
    min-height: 30px;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    background: none;
    color: var(--st-text-2);
    font-family: var(--st-sans);
    font-size: 0.76rem;
    cursor: pointer;
    text-align: left;
    flex: 1;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .adv-btn:hover {
    background: var(--st-surface-3);
    color: white;
  }

  .adv-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .adv-btn.active {
    background: var(--st-surface-3);
    color: var(--st-value);
    border-color: var(--st-interactive);
  }

  .adv-btn:hover:not(:disabled) {
    background: var(--st-surface-3);
    color: var(--st-text);
    border-color: var(--st-hair-strong);
  }

  .adv-help-btn {
    width: 20px;
    min-width: 20px;
    padding: 0;
    border: 1px solid var(--st-hair-strong);
    border-radius: 50%;
    background: var(--st-surface-2);
    color: var(--st-text-3);
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
    background: var(--st-accent);
    color: var(--st-text-on-accent);
    border-color: var(--st-interactive);
  }

  .adv-help-panel {
    padding: 6px 8px;
    background: rgba(127, 212, 204, 0.08);
    border: 1px solid rgba(127, 212, 204, 0.3);
    border-radius: 6px;
    font-size: 0.7rem;
    line-height: 1.4;
    color: var(--st-text);
  }

  .adv-help-panel strong {
    color: var(--st-value);
    font-size: 0.72rem;
  }

  .adv-help-panel p {
    margin: 4px 0 0;
    color: var(--st-text-2);
  }

  .envelope-sub-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 12px;
    border-left: 2px solid var(--st-interactive);
    margin-top: 4px;
  }

  .moving-load-progress {
    padding: 0.2rem 0;
  }
  .progress-bar-container {
    width: 100%;
    height: 6px;
    background: var(--st-surface-3);
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    background: var(--st-accent);
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
    color: var(--st-value);
  }
  .cancel-btn {
    padding: 0.15rem 0.5rem;
    border: 1px solid var(--st-accent);
    border-radius: 3px;
    background: transparent;
    color: var(--st-accent);
    font-size: 0.68rem;
    cursor: pointer;
  }
  .cancel-btn:hover {
    background: var(--st-accent);
    color: white;
  }

  .adv-select {
    flex: 1;
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    background: var(--st-surface-2);
    color: var(--st-value);
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .adv-select:hover {
    background: var(--st-surface-3);
    color: white;
  }

  .small-btn {
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font-size: 0.7rem;
    cursor: pointer;
  }

  .small-btn:hover:not(:disabled) {
    background: var(--st-surface-3);
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
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font-size: 0.72rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .adv-result-btn:hover {
    background: var(--st-surface-3);
    color: white;
  }

  .adv-result-btn.active {
    background: var(--st-accent);
    border-color: var(--st-danger);
    color: white;
  }

  .adv-result-label {
    font-size: 0.72rem;
    color: var(--st-value);
    min-width: 2rem;
    text-align: center;
  }

  .adv-result-info {
    font-size: 0.68rem;
    color: var(--st-text-3);
    padding: 0 0 0 0.25rem;
  }

  /*
     The run's summary — "B₂ = 1.000 | 1 iter | stable" — reads as a caption on
     the analysis above it, so it gets the monospace and the indent that every
     other subordinate line in this panel gets. Loose at the foot of the list it
     looked like a stray line of debug output.
  */
  .flat .adv-result-info {
    font-family: var(--st-mono);
    font-size: 0.66rem;
    letter-spacing: 0.02em;
    margin-left: 0.6rem;
    padding: 0.1rem 0 0.1rem 0.6rem;
    border-left: 2px solid var(--st-hair);
  }
</style>
