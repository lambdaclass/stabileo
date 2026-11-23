<script lang="ts" module>
  import DespieceOptions from '../DespieceOptions.svelte';
  import { tick, untrack } from 'svelte';
  import { trackUsage } from '../../lib/telemetry/usage';
  import { uiStore, modelStore, resultsStore, dsmStepsStore, fmStepsStore } from '../../lib/store';

  const threeD = (): boolean => uiStore.is3DWorkspace;

  /*
   * A 2D ↔ 3D switch closes what the dimension left behind.
   * ─────────────────────────────────────────────────────────
   * Kinematic analysis, the influence line, the moving load and the plastic
   * collapse exist only in 2D, and P-Δ, Pcr and Dynamic keep one result per
   * dimension: after a switch none of them is running in the new workspace,
   * yet the kinematic panel stayed open under a header naming it, and a 2D
   * mode shape stayed the diagram of a 3D view that had no mode to draw, which
   * hid the model's loads. Watched at module level rather than in the
   * component, because the switch is made from the ribbon whether or not this
   * panel is on screen.
   */
  $effect.root(() => {
    let was3D: boolean | null = null;
    $effect(() => {
      const now3D = threeD();
      untrack(() => {
        if (was3D !== null && was3D !== now3D) {
          if (now3D) {
            uiStore.showKinematicPanel = false;
            if (uiStore.currentTool === 'influenceLine') uiStore.currentTool = 'select';
          }
          resultsStore.leaveDimension(now3D);
        }
        was3D = now3D;
      });
    });
  });

  /*
   * The selection a function found, put back when it closes. Taken at the
   * click that opens it — before the function's own picks (Section Analysis
   * selects the member it reads) — and only while nothing is running.
   */
  type HeldSelection = { nodes: Set<number>; elements: Set<number>; shells: Set<string>; loads: Set<number>; supports: Set<number>; manual: boolean };
  let heldSelection: HeldSelection | null = null;
  function holdSelection(): void {
    heldSelection = {
      nodes: new Set(uiStore.selectedNodes), elements: new Set(uiStore.selectedElements),
      shells: new Set(uiStore.selectedShells), loads: new Set(uiStore.selectedLoads),
      supports: new Set(uiStore.selectedSupports), manual: uiStore.elementSelectionManual,
    };
  }
  function releaseSelection(): void {
    const h = heldSelection;
    heldSelection = null;
    if (!h) return;
    uiStore.setSelection(h.nodes, h.elements, h.manual, h.shells);
    uiStore.selectedLoads = h.loads;
    uiStore.selectedSupports = h.supports;
  }
</script>

<script lang="ts">
  import { errorText } from '../../lib/utils/error-text';
  import { whatIf } from '../../lib/store/whatif.svelte';
  import { explainedSteps } from '../../lib/store/explained-steps.svelte';
  import { openExplainedCatalog } from '../../lib/actions/step-wizards';
  import { loadCourse } from '../../lib/course/load-course';
  import CirsocFlexPanel from '../CirsocFlexPanel.svelte';
  import { t } from '../../lib/i18n';
  import { localizeEngineText } from '../../lib/i18n/engine-text';
  import { DOF_LABEL_KEY } from '../../lib/engine/kinematic-2d';
  import { ratiosText, shownDof } from '../../lib/axes/user-names';
  import { withBasicMass } from '../../lib/engine/dynamics/basic-mass';
  import { variableRefusal2D, imposedRefusal } from '../../lib/engine/solver-service';
  import { formatPDeltaFactor } from '../../lib/engine/pdelta-result';
  import BucklingCertificate from '../advanced/BucklingCertificate.svelte';
  import PDeltaCertificate from '../advanced/PDeltaCertificate.svelte';
  import FiniteSpectrumWarning from '../advanced/FiniteSpectrumWarning.svelte';
  import { finiteSpectrumWarning, eigenRefusalText } from '../../lib/engine/finite-spectrum-warning';
  import ModalCertificate from '../advanced/ModalCertificate.svelte';
  import DynamicsCourse from '../advanced/dynamics/DynamicsCourse.svelte';
  import SecondOrderOptions from '../advanced/SecondOrderOptions.svelte';
  import PDeltaSummary from '../advanced/PDeltaSummary.svelte';
  import BucklingDetails from '../advanced/BucklingDetails.svelte';
  import { pdeltaBasic2D, bucklingBasic2D, withFirstModeB2, rerunSecondOrder } from '../../lib/actions/second-order';
  import { solveModal, solveModal3D as wasmModal3D, solveBuckling3D as wasmBuckling3D, initSolver, isWasmReady } from '../../lib/engine/wasm-solver';
  import { bucklingFailureToast } from '../../lib/engine/buckling-failure';
  import { solvePDelta3D as wasmPDelta3D } from '../../lib/engine/wasm-solver';
  import { amplification } from '../../lib/engine/pdelta-amplification';
  import { getPredefinedTrains, solveMovingLoadsAsync } from '../../lib/engine/moving-loads';
  import type { SectionMp } from '../../lib/engine/plastic-moments';
  import { runPlasticCollapse, PlasticWithheld } from '../../lib/actions/plastic';
  import PlasticResultPanel from '../advanced/PlasticResultPanel.svelte';
  import { collapseVerdict } from '../advanced/plastic/user-compare';
  import InfluencePanel from '../advanced/InfluencePanel.svelte';
  import LoadStatesPanel from '../advanced/LoadStatesPanel.svelte';
  import { mohrPanel, openMohr, closeMohr } from '../../lib/mohr/panel.svelte';
  import { advFunction } from '../../lib/advanced/catalog';
  import { advancedList } from '../../lib/advanced/panel-state.svelte';
  import AdvancedLauncher from '../advanced/AdvancedLauncher.svelte';
  import AdvFunctionHead from '../advanced/AdvFunctionHead.svelte';
  import SelfCheckBanner from '../advanced/SelfCheckBanner.svelte';

  let showTrainPanel = $state(false);
  let selectedTrainIndex = $state<string>('');
  /**
   * CIRSOC Flex unfolds under its own button, like the kinematic report.
   *
   * It is the odd one out in this list: every other entry runs an analysis
   * ON the model, and this one never looks at it. It sits here anyway, and
   * last, because this is where a reader goes with the question it answers —
   * and a ribbon command cost the canvas ten pixels for the privilege.
   */
  let showFlex = $state(false);
  let showLoadStates = $state(false);

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
  type Adv = { key: string; isActive: () => boolean; close: () => void };

  const ADV: Adv[] = [
    /*
     * The calculator is one of these too, and leaving it out of the list was
     * what made it behave unlike all of them: nothing else could make it the
     * running analysis, so it never got the header that names what you are in
     * or the ✕ that leaves it, and `shown()` was never asked about it — so it
     * stayed on screen next to whatever else you opened, which is not a thing
     * any other entry can do.
     *
     * FIRST, because `active` is the first entry that answers yes and the
     * calculator's own "take the loads from the model" arms the stress
     * pointer — which is `stress`'s isActive. Listed after it, the calculator
     * stopped being the running analysis the moment it asked for a member,
     * and unmounted itself mid-pick. What the reader opened outranks the
     * pointer mode that opening it turned on.
     */
    { key: 'cirsocFlex',
      isActive: () => showFlex,
      close: () => { showFlex = false; } },
    /*
     * The four 2D-only entries are running only in 2D: in 3D their buttons are
     * disabled, so a header naming one of them would name something the reader
     * cannot reach, let alone close.
     */
    { key: 'kinematic',
      isActive: () => !is3D && uiStore.showKinematicPanel,
      close: () => { uiStore.showKinematicPanel = false; } },
    { key: 'despiece',
      isActive: () => resultsStore.diagramType === 'despiece',
      close: () => { resultsStore.releaseView(is3D); uiStore.despieceInspect = null; } },
    { key: 'stress',
      isActive: () => uiStore.currentTool === 'select' && uiStore.selectMode === 'stress',
      close: () => { uiStore.selectMode = 'elements'; resultsStore.stressQuery = null; } },
    ...(__PUBLIC_FEATURES__.tools ? [{ key: 'mohr',
      isActive: () => mohrPanel.open,
      close: () => closeMohr() }] : []),
    { key: 'pdelta',
      isActive: () => !!(is3D ? resultsStore.pdeltaResult3D : resultsStore.pdeltaResult),
      close: () => (is3D ? resultsStore.clearPDelta3D() : resultsStore.clearPDelta()) },
    { key: 'buckling',
      isActive: () => !!(is3D ? resultsStore.bucklingResult3D : resultsStore.bucklingResult),
      close: () => (is3D ? resultsStore.clearBuckling3D() : resultsStore.clearBuckling()) },
    { key: 'modal',
      isActive: () => !!(is3D ? resultsStore.modalResult3D : resultsStore.modalResult),
      close: () => (is3D ? resultsStore.clearModal3D() : resultsStore.clearModal()) },
    { key: 'plastic',
      isActive: () => !is3D && (!!resultsStore.plasticResult || !!plasticWithheld),
      close: () => { resultsStore.clearPlastic(); plasticWithheld = null; } },
    { key: 'trainLoad',
      isActive: () => !is3D && (!!resultsStore.movingLoadEnvelope || showTrainPanel),
      close: () => { resultsStore.clearMovingLoad(); showTrainPanel = false; selectedTrainIndex = ''; } },
    { key: 'influenceLine',
      isActive: () => !is3D && uiStore.currentTool === 'influenceLine',
      close: () => { uiStore.currentTool = 'select'; resultsStore.clearInfluenceLine(); } },
    { key: 'loadStates',
      isActive: () => showLoadStates,
      close: () => { showLoadStates = false; } },
    { key: 'whatif',
      isActive: () => uiStore.showWhatIf,
      close: () => { void whatIf.close(); } },
    /* One entry for every explained method: the catalog, a method's document, or one of the two wizards. */
    { key: 'steps',
      isActive: () => dsmStepsStore.isOpen || fmStepsStore.isOpen || explainedSteps.isOpen,
      close: () => { dsmStepsStore.close(); fmStepsStore.close(); explainedSteps.close(); } },
  ];





  const active = $derived(ADV.find(a => a.isActive()) ?? null);
  let section = $state<HTMLElement | null>(null);
  $effect(() => {
    const key = active?.key;
    if (!key) return;
    untrack(() => trackUsage('advanced.open', { analysis: key }));
    void tick().then(() => section?.scrollIntoView({ block: 'start' }));
  });

  /**
   * Close one function, as "← Back" and the list's own toggle-off both do: its
   * teardown puts the results and the diagram back (the store keeps what the
   * function replaced), and the selection it found comes back here.
   */
  function closeEntry(key: string): void {
    ADV.find((a) => a.key === key)?.close();
    releaseSelection();
  }

  /** A click in the list while nothing runs may open a function: keep the selection it finds. */
  function noteOpening(): void {
    if (active === null) holdSelection();
  }

  /* The train selector is this component's own state: a switch to 3D, where the entry is disabled, closes it. */
  $effect(() => {
    if (is3D) untrack(() => { showTrainPanel = false; selectedTrainIndex = ''; });
  });

  /**
   * A buckling analysis of a model in which no bar is compressed has nothing to
   * find. The engine says so by throwing; that is an answer, not a failure.
   */
  function bucklingFailure(e: unknown): void {
    const { text, kind } = bucklingFailureToast(e, t);
    uiStore.toast(text, kind);
  }

  function errText(e: unknown, fallbackKey: string): string {
    return localizeEngineText(errorText(e, t(fallbackKey)));
  }

  /**
   * A P-Δ that is the linear solve (nothing deforms the model, or nothing is
   * free) says so, instead of the engine's "did not converge, unstable".
   */
  /**
   * A P-Δ run is drawn only when it found an equilibrium. Unstable (by the
   * engine's word or by the displacements, `amplification`) or not converged,
   * the engine's results are the first-order ones: the panel reports the run
   * and nothing is drawn as its result.
   */
  function publishPDelta(result: any, threeD: boolean, dt: number): void {
    const asSpace = threeD ? result : {
      ...result,
      results: { ...result.results, displacements: (result.results?.displacements ?? []).map((d: any) => ({ ...d, uy: 0 })) },
      linearResults: result.linearResults ? { ...result.linearResults, displacements: result.linearResults.displacements.map((d: any) => ({ ...d, uy: 0 })) } : undefined,
    };
    const stable = result.isStable !== false && amplification(asSpace).stable;
    const noEquilibrium = !stable || !result.converged;
    if (!noEquilibrium) {
      if (threeD) resultsStore.setPDeltaResult3D(result); else resultsStore.setPDeltaResult(result);
      pdeltaToast(result, dt);
      return;
    }
    const reported = stable ? result : { ...result, isStable: false, b2Factor: Infinity };
    resultsStore.setPDeltaWithoutEquilibrium(reported, threeD);
    pdeltaToast(reported, dt, true);
  }

  function pdeltaToast(result: any, dt: number, notDrawn = false): void {
    if (result.notice === 'noLoads' || result.notice === 'noFreeDofs') {
      uiStore.toast(t(result.notice === 'noLoads' ? 'toast.pdeltaLinearNoLoads' : 'toast.pdeltaLinearNoFreeDofs'), 'info');
      return;
    }
    const unknown = result.isStable === null;
    const base = result.isStable === false ? t('toast.pdeltaUnstable') : result.converged
      ? t('toast.pdeltaConverged').replace('{iterations}', String(result.iterations)).replace('{b2}', formatPDeltaFactor(result.b2Factor, 2)).replace('{ms}', dt.toFixed(0))
      : t('toast.pdeltaNotConverged').replace('{iterations}', String(result.iterations));
    const msg = unknown && result.converged ? `${base}. ${t('toast.pdeltaStabilityUnknown')}` : base;
    uiStore.toast(notDrawn ? `${msg}. ${t('toast.pdeltaNotDrawn')}` : msg, result.converged && result.isStable === true ? 'success' : unknown && result.converged ? 'info' : 'error');
  }

  /* The plane engine names its vertical `uy` and its rotation `rz`; the app says Z and Y. */
  const DOF_2D: Record<string, string> = { ux: 'ux', uy: 'uz', uz: 'uz', rz: 'ry', ry: 'ry' };

  /**
   * Modes the boundary discarded because their eigenvalue is zero (wasm-solver.ts,
   * `withoutNullModes`): the structure moves there without deforming. Said after the
   * result, with the node and direction of the first one.
   */
  function nullModesToast(result: any, plane: boolean): void {
    const d = result?.discardedModes as Array<{ nodeId: number; dof: string }> | undefined;
    if (!d?.length) return;
    const dof = plane ? (DOF_2D[d[0].dof] ?? d[0].dof) : d[0].dof;
    const where = `${t('kin.nodeLC')} ${d[0].nodeId}${DOF_LABEL_KEY[shownDof(dof)] ? `, ${t(DOF_LABEL_KEY[shownDof(dof)])}` : ''}`;
    uiStore.toast(t('advanced.nullModesDiscarded').replace('{n}', String(d.length)).replace('{where}', where), 'info');
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
    // The plane analyses do not model a member of variable section; 3D cuts it into pieces.
    const variable = threeD() ? null : variableRefusal2D(modelStore.model);
    if (variable) {
      uiStore.toast(variable, 'error');
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
      uiStore.toast(e?.message || t('toast.solverInitFailed'), 'error');
      return false;
    }
  }

  function handlePDelta() {
    if (blockedBySlidingJoints()) return;
    try {
      const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
      if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
      const t0 = performance.now();
      const result = pdeltaBasic2D(input);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      publishPDelta(result, false, dt);
    } catch (e: any) {
      uiStore.toast(errText(e, 'toast.pdeltaError'), 'error');
    }
  }

  function handleModal() {
    if (blockedBySlidingJoints()) return;
    try {
      const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
      if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
      const t0 = performance.now();
      const physical = withBasicMass(input, modelStore.model, 'iy');
      const result = solveModal(physical.input, physical.densities);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(eigenRefusalText(result, t), 'error'); return; }
      resultsStore.setModalResult(result);
      const rayleighInfo = result.rayleigh ? ` | Rayleigh: a\u2080=${result.rayleigh.a0.toFixed(3)}, a\u2081=${result.rayleigh.a1.toFixed(5)}` : '';
      const cumMassInfo = ` | \u03a3Meff: ${ratiosText([result.cumulativeMassRatioX, 0, result.cumulativeMassRatioY], false, 0, ', ')}`;
      uiStore.toast([finiteSpectrumWarning(result, t), t('toast.modalSuccess').replace('{modes}', String(result.modes.length)).replace('{cumMass}', cumMassInfo).replace('{rayleigh}', rayleighInfo).replace('{ms}', dt.toFixed(0))].filter(Boolean).join(' '), result.finiteSpectrumDiagnostic ? 'info' : 'success');
      nullModesToast(result, true);
    } catch (e: any) {
      uiStore.toast(eigenRefusalText(errText(e, 'toast.modalError'), t), 'error');
    }
  }


  function handleBuckling() {
    if (blockedBySlidingJoints()) return;
    try {
      const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
      if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
      const t0 = performance.now();
      const result = bucklingBasic2D(input);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(eigenRefusalText(result, t), 'error'); return; }
      resultsStore.setBucklingResult(result);
      const factor = result.modes[0]?.loadFactor;
      const nComp = result.elementData.length;
      uiStore.toast(t('toast.bucklingSuccess').replace('{factor}', factor?.toFixed(2) ?? '—').replace('{nComp}', String(nComp)).replace('{ms}', dt.toFixed(0)), 'success');
      nullModesToast(result, true);
    } catch (e: any) {
      bucklingFailure(e);
    }
  }

  /** The Mp each section went in with, shown under the result. */
  let plasticMps = $state<SectionMp[]>([]);
  let plasticWithheld = $state<PlasticWithheld | null>(null);
  /* A note the reader has read and closed stays closed until the analysis runs again. */
  let withheldDismissed = $state(false);
  $effect(() => { void plasticWithheld; withheldDismissed = false; });
  /** The panel speaks for itself: a tracker reference is for the team, not a place to send the reader. */
  const withoutIssueRef = (text: string) => text.replace(/\s*\(#\d+\)\s*$/, '');

  function handlePlastic() {
    if (blockedBySlidingJoints()) return;
    plasticWithheld = null;
    try {
      const t0 = performance.now();
      /* The step-by-step collapse analysis (lib/engine/plastic-collapse.ts). */
      const run = runPlasticCollapse();
      if (!run) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
      const dt = performance.now() - t0;
      plasticMps = run.mps;
      resultsStore.setPlasticResult(run.result);
      const r = run.result;
      const verdict = collapseVerdict(r);
      if (verdict === 'unresolved') uiStore.toast(t('course.plastic.unresolved'), 'error');
      else uiStore.toast(verdict === 'collapse'
        ? t('toast.plasticCollapse').replace('{lambda}', r.collapseFactor.toFixed(3)).replace('{hinges}', String(r.hinges.length)).replace('{ms}', dt.toFixed(0))
        : t('plastic.noCollapse'), verdict === 'collapse' ? 'info' : 'success');
    } catch (e: any) {
      if (e instanceof PlasticWithheld) plasticWithheld = e;
      uiStore.toast(errText(e, 'toast.plasticError'), 'error');
    }
  }

  async function handleMovingLoad(trainIndex: number) {
    if (blockedBySlidingJoints()) return;
    // The train alone: the sweep drops the model's loads and settlements (`trainBase`).
    const train = getPredefinedTrains()[trainIndex];
    if (!train) return;

    const abortController = resultsStore.startMovingLoadAnalysis();

    try {
      const input = modelStore.buildSolverInput(false);
      if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
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


  const is3D = $derived(uiStore.is3DWorkspace);

  async function handlePDelta3D() {
    if (blockedBySlidingJoints()) return;
    if (!await ensureWasmReady('handlePDelta3D')) return;
    // A case's imposed displacement on a direction no support holds is refused by node, as Solve does.
    const refused = imposedRefusal(modelStore.model);
    if (refused) { uiStore.toast(refused, 'error'); return; }
    // Every load, the cases' imposed displacements with them, as the linear "All loads" solve.
    try {
      const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', { basic: uiStore.analysisMode !== 'pro', expandMemberOffsets: false, caseDisplacements: true });
      if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
      const t0 = performance.now();
      let result: any;
      result = wasmPDelta3D(input);
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      result = withFirstModeB2(input, result);
      const dt = performance.now() - t0;
      publishPDelta(result, true, dt);
    } catch (e: any) {
      uiStore.toast(errText(e, 'toast.pdeltaError'), 'error');
    }
  }

  async function handleModal3D() {
    if (blockedBySlidingJoints()) return;
    if (!await ensureWasmReady('handleModal3D')) return;
    try {
      const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', { basic: uiStore.analysisMode !== 'pro', expandMemberOffsets: false });
      if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
      const t0 = performance.now();
      let result: any;
      const physical = withBasicMass(input, modelStore.model, 'izz');
      result = wasmModal3D(physical.input, physical.densities);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(eigenRefusalText(result, t), 'error'); return; }
      resultsStore.setModalResult3D(result);
      const cumMassInfo = ` | \u03a3Meff: ${ratiosText([result.cumulativeMassRatioX, result.cumulativeMassRatioY, result.cumulativeMassRatioZ], true, 0, ', ')}`;
      uiStore.toast([finiteSpectrumWarning(result, t), t('toast.modalSuccess').replace('{modes}', String(result.modes.length)).replace('{cumMass}', cumMassInfo).replace('{rayleigh}', '').replace('{ms}', dt.toFixed(0))].filter(Boolean).join(' '), result.finiteSpectrumDiagnostic ? 'info' : 'success');
      nullModesToast(result, false);
    } catch (e: any) {
      uiStore.toast(eigenRefusalText(errText(e, 'toast.modalError'), t), 'error');
    }
  }

  async function handleBuckling3D() {
    if (blockedBySlidingJoints()) return;
    if (!await ensureWasmReady('handleBuckling3D')) return;
    try {
      const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', { basic: uiStore.analysisMode !== 'pro', expandMemberOffsets: false });
      if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return; }
      const t0 = performance.now();
      let result: any;
      result = wasmBuckling3D(input);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(eigenRefusalText(result, t), 'error'); return; }
      resultsStore.setBucklingResult3D(result);
      const factor = result.modes[0]?.loadFactor;
      const nComp = result.elementData.length;
      uiStore.toast(t('toast.bucklingSuccess').replace('{factor}', factor?.toFixed(2) ?? '\u2014').replace('{nComp}', String(nComp)).replace('{ms}', dt.toFixed(0)), 'success');
      nullModesToast(result, false);
    } catch (e: any) {
      bucklingFailure(e);
    }
  }



  let {}: { flat?: boolean } = $props();
  let courseReady = $state(false);
  $effect(() => {
    if (!courseReady) loadCourse().then(() => { courseReady = true; }, () => { courseReady = true; });
  });

  const activeFn = $derived(active ? advFunction(active.key) ?? null : null);
  const pdR = $derived(is3D ? resultsStore.pdeltaResult3D : resultsStore.pdeltaResult);
  const moR = $derived(is3D ? resultsStore.modalResult3D : resultsStore.modalResult);
  const buR = $derived(is3D ? resultsStore.bucklingResult3D : resultsStore.bucklingResult);

  $effect(() => {
    const id = advancedList.pending;
    if (!id || !courseReady) return;
    untrack(() => { advancedList.pending = null; openFunction(id); });
  });

  /** Start a function from the list; a step-by-step topic opens the catalog at its group. */
  function openFunction(id: string): void {
    const fn = advFunction(id);
    if (fn?.requires.plane && is3D) { uiStore.toast(t('advanced.only2d'), 'error'); return; }
    if (fn) advancedList.reveal(fn.group);
    noteOpening();
    switch (id) {
      case 'kinematic': uiStore.showKinematicPanel = true; return;
      case 'despiece':
        if (!(is3D ? resultsStore.results3D : resultsStore.results)) { uiStore.toast(t('advanced.calculateFirst'), 'error'); return; }
        resultsStore.holdView();
        resultsStore.diagramType = 'despiece';
        return;
      case 'stress':
        if (!resultsStore.results && !resultsStore.results3D) { uiStore.toast(t('advanced.calculateFirst'), 'error'); return; }
        uiStore.currentTool = 'select';
        uiStore.selectMode = 'stress';
        return;
      case 'mohr': openMohr({ kind: is3D ? 'space' : 'plane' }); return;
      case 'pdelta': if (is3D) void handlePDelta3D(); else handlePDelta(); return;
      case 'buckling': if (is3D) void handleBuckling3D(); else handleBuckling(); return;
      case 'modal': if (is3D) void handleModal3D(); else handleModal(); return;
      case 'plastic': handlePlastic(); return;
      case 'influenceLine':
        if (blockedBySlidingJoints()) return;
        uiStore.currentTool = 'influenceLine';
        return;
      case 'trainLoad': showTrainPanel = true; return;
      case 'loadStates': showLoadStates = true; return;
      case 'whatif': whatIf.open(); return;
      case 'cirsocFlex': showFlex = true; return;
      case 'steps': openExplainedCatalog(); return;
    }
    const topic = advFunction(id)?.stepsGroup;
    if (topic) openExplainedCatalog(topic);
  }
</script>

<div class="toolbar-section flat" data-tour="advanced-section" bind:this={section} onclickcapture={noteOpening}>
  {#if courseReady}
    {#if active && activeFn}
      <AdvFunctionHead fn={activeFn} onBack={() => { if (active) closeEntry(active.key); }} />
      {#if active.key === 'despiece'}<DespieceOptions />{/if}
      {#if (active.key === 'pdelta' || active.key === 'buckling') && !is3D}
        <SecondOrderOptions onchange={() => rerunSecondOrder(handlePDelta, handleBuckling)} />
      {/if}
      {#if active.key === 'influenceLine'}<InfluencePanel />{/if}
      {#if active.key === 'trainLoad' && !is3D}
        <div class="envelope-sub-panel">
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
            <select class="adv-select" bind:value={selectedTrainIndex} aria-label={t('advanced.selectTrain')} data-testid="adv-train-select"
              onchange={() => { if (selectedTrainIndex !== '') { handleMovingLoad(Number(selectedTrainIndex)); } }}>
              <option value="">{t('advanced.selectTrain')}</option>
              {#each getPredefinedTrains() as train, i}
                <option value={String(i)}>{train.name}</option>
              {/each}
            </select>
          {/if}
        </div>
      {/if}
      {#if active.key === 'loadStates'}
        <LoadStatesPanel onInfluence={() => { showLoadStates = false; if (!is3D && !blockedBySlidingJoints()) uiStore.currentTool = 'influenceLine'; }} />
      {/if}
      {#if active.key === 'cirsocFlex'}<div class="adv-flex-body"><CirsocFlexPanel /></div>{/if}
    {:else}
      <AdvancedLauncher onOpen={openFunction} />
    {/if}
  {/if}
  {#each (is3D ? resultsStore.knownIssues3D : resultsStore.knownIssues).messages as message}<p class="adv-known" role="alert">{message}</p>{/each}
  {#if pdR}
    <PDeltaSummary result={pdR} />
    <PDeltaCertificate result={pdR} />
  {/if}
  {#if moR}
    <SelfCheckBanner results={[moR]} />
    <FiniteSpectrumWarning result={moR} />
    <div class="adv-result-row">
      <button class="adv-result-btn" class:active={resultsStore.diagramType === 'modeShape'} onclick={() => resultsStore.diagramType = 'modeShape'}>{t('advanced.dynamic')}</button>
      <button class="small-btn" onclick={() => { if (resultsStore.activeModeIndex > 0) resultsStore.activeModeIndex--; }} disabled={resultsStore.activeModeIndex === 0}>&#9664;</button>
      <span class="adv-result-label">{resultsStore.activeModeIndex + 1}/{moR.modes.length}</span>
      <button class="small-btn" onclick={() => { if (moR && resultsStore.activeModeIndex < moR.modes.length - 1) resultsStore.activeModeIndex++; }} disabled={!moR || resultsStore.activeModeIndex >= moR.modes.length - 1}>&#9654;</button>
    </div>
    <ModalCertificate result={moR} mode={resultsStore.activeModeIndex} checks={false} />
    {#if moR.modes[resultsStore.activeModeIndex]}
      {@const mode = moR.modes[resultsStore.activeModeIndex]}
      <div class="adv-result-info">
        f = {mode.frequency.toFixed(2)} Hz |
        T = {mode.period.toFixed(3)} s
      </div>
      <div class="adv-result-info" style="opacity:0.8">
        {#if is3D}
          {@const m3 = mode as { massRatioZ?: number }}
          {@const r3 = moR as { cumulativeMassRatioZ?: number }}
          M<sub>eff</sub>: {ratiosText([mode.massRatioX, mode.massRatioY, m3.massRatioZ ?? 0], true, 1, ' ')} |
          Σ: {ratiosText([moR.cumulativeMassRatioX, moR.cumulativeMassRatioY, r3.cumulativeMassRatioZ ?? 0], true, 1, ' ')}
        {:else}
          M<sub>eff</sub>: {ratiosText([mode.massRatioX, 0, mode.massRatioY], false, 1, ' ')} |
          Σ: {ratiosText([moR.cumulativeMassRatioX, 0, moR.cumulativeMassRatioY], false, 1, ' ')}
        {/if}
      </div>
      <DynamicsCourse result={moR} mode={resultsStore.activeModeIndex} {is3D} onRerun={() => (is3D ? handleModal3D() : handleModal())} />
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
      λ<sub>cr</sub> = {buR.modes[resultsStore.activeBucklingMode]?.loadFactor.toFixed(3) ?? '—'}
    </div>
    <BucklingCertificate certificate={buR.certificate} />
    <BucklingDetails result={buR} />
  {/if}
  {#if plasticWithheld && !is3D && !withheldDismissed}
    <div class="adv-withheld" role="note" data-testid="plastic-withheld">
      <p>{withoutIssueRef(plasticWithheld.message)}</p>
      <button type="button" class="adv-note-close" onclick={() => (withheldDismissed = true)} title={t('ribbon.close')} aria-label={t('ribbon.close')}
        data-testid="plastic-withheld-close">×</button>
    </div>
  {/if}
  <PlasticResultPanel mps={plasticMps} />
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
</div>

<style>
  .toolbar-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .adv-withheld {
    position: relative;
    margin: 6px 0;
    padding: 8px 34px 8px 10px;
    border: 1px solid var(--st-danger);
    border-radius: 6px;
    font-size: 0.8rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .adv-withheld p { margin: 0 0 6px; }
  .adv-known { margin: 0; padding: 6px 8px; border-left: 2px solid var(--st-amber, var(--st-accent)); font-size: 0.74rem; line-height: 1.4; color: var(--st-text-2); overflow-wrap: anywhere; }
  .adv-withheld p:last-of-type { margin: 0; }
  .adv-note-close {
    position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; background: none; border: none; border-radius: 4px;
    color: var(--st-text-2); font-size: 1rem; line-height: 1; cursor: pointer;
  }
  .adv-note-close:hover { background: var(--st-surface-3); color: var(--st-text); }
  @media (max-width: 767px), (pointer: coarse) { .adv-note-close { width: 44px; height: 44px; top: 0; right: 0; } .adv-withheld { padding-right: 48px; } }


  .adv-flex-body {
    margin: 0.3rem 0 0.2rem;
    padding: 0.5rem 0.6rem;
    border-left: 2px solid var(--st-hair-strong);
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

  /* Reachable from the result panels mounted inside this section (components/advanced/). */
  :where(.toolbar-section) :global(.small-btn) {
    min-width: 44px;
    min-height: 44px;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font-size: 12px;
    cursor: pointer;
  }

  :where(.toolbar-section) :global(.small-btn:hover:not(:disabled)) {
    background: var(--st-surface-3);
    color: white;
  }

  :where(.toolbar-section) :global(.small-btn:disabled) {
    opacity: 0.4;
    cursor: default;
  }

  :where(.toolbar-section) :global(.adv-result-row) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  :where(.toolbar-section) :global(.adv-result-btn) {
    min-width: 44px;
    min-height: 44px;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font-size: 12px;
    cursor: pointer;
    flex-shrink: 0;
  }

  :where(.toolbar-section) :global(.adv-result-btn:hover) {
    background: var(--st-surface-3);
    color: white;
  }

  :where(.toolbar-section) :global(.adv-result-btn.active) {
    background: var(--st-accent);
    border-color: var(--st-danger);
    color: white;
  }

  :where(.toolbar-section) :global(.adv-result-label) {
    font-size: 12px;
    color: var(--st-value);
    min-width: 2rem;
    text-align: center;
  }

  :where(.toolbar-section) :global(.adv-result-info) {
    overflow-wrap: anywhere;
    font-size: 12px;
    color: var(--st-text-3);
    padding: 0 0 0 0.25rem;
  }

  /*
     The run's summary — "B₂ = 1.000 | 1 iter | stable" — reads as a caption on
     the analysis above it, so it gets the monospace and the indent that every
     other subordinate line in this panel gets. Loose at the foot of the list it
     looked like a stray line of debug output.
  */
  .flat :global(.adv-result-info) {
    font-family: var(--st-mono);
    font-size: 12px;
    letter-spacing: 0.02em;
    margin-left: 0.6rem;
    padding: 0.1rem 0 0.1rem 0.6rem;
    border-left: 2px solid var(--st-hair);
  }
</style>
