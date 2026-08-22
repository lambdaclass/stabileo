<script lang="ts">
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import {
    isSolverReady,
    solvePDelta3D as wasmPDelta3D,
    solveModal3D as wasmModal3D,
    solveBuckling3D as wasmBuckling3D,
    solveSpectral3D as wasmSpectral3D,
    solveTimeHistory3D,
    solvePlastic3D,
    solveCorotational3D,
    solveFiberNonlinear3D,
    solveWinkler3D,
    solveSSI3D,
    solveContact3D,
    solveStaged3D,
    solveCreepShrinkage3D,
    solveHarmonic3D,
    solveWithImperfections3D,
    computeInfluenceLine3D,
    solveMultiCase3D,
    analyzeSection,
    solveConstrained3D,
  } from '../../lib/engine/wasm-solver';
  import { buildSolverInput3D } from '../../lib/engine/solver-service';
  // Every solver below is a WASM export that throws a bare string, which has no
  // `.message`. Reading it with `e.message` reported "Error" for every engine
  // refusal and discarded the sentence the solver wrote.
  import { errorText } from '../../lib/utils/error-text';
  import { cirsoc103Spectrum } from '../../lib/engine/result-types';
  import type { DesignSpectrum } from '../../lib/engine/result-types';
  import { applyRigidDiaphragm, detectFloorLevels } from '../../lib/engine/rigid-diaphragm';
  // Wind loads moved to ProAutoLoadsDialog
  // enforceConstraints3D removed — WASM solvers handle quads/constraints natively

  // Expose advanced results to parent via bindable props
  interface AdvancedResults3D {
    pdelta?: { converged: boolean; iterations: number; b2Factor?: number };
    modal?: { modes: Array<{ frequency: number; period: number; participationX?: number; participationY?: number; participationZ?: number }>; totalMass?: number };
    buckling?: { factors: number[] };
    spectral?: { baseShearX?: number; baseShearY?: number; baseShearZ?: number };
  }
  let { advancedResults = $bindable({}) }: { advancedResults: AdvancedResults3D } = $props();

  let solving = $state(false);
  let solveError = $state<string | null>(null);

  let modalElapsed = $state<number | null>(null);
  let bucklingElapsed = $state<number | null>(null);
  let pdeltaElapsed = $state<number | null>(null);
  let harmonicElapsed = $state<number | null>(null);

  const hasModel = $derived(modelStore.nodes.size > 0 && modelStore.elements.size > 0);
  const wasmAvailable = $derived(isSolverReady());
  const elementIds = $derived([...modelStore.elements.keys()]);
  const nodeIds = $derived([...modelStore.nodes.keys()]);

  function fmtNum(n: number): string {
    if (n === 0) return '0';
    if (Math.abs(n) < 0.001) return n.toExponential(2);
    if (Math.abs(n) < 1) return n.toFixed(4);
    return n.toFixed(2);
  }

  // ─── Shared helpers ────────────────────────────────────────────


  /*
   * Not here: arc-length, displacement control, cable and model reduction.
   *
   * All four deserialise a 2D `SolverInput` in the engine, so a PRO model —
   * which is spatial — collapses on the way in (that is where cable's
   * "element has zero length" came from). They were listed here and failed on
   * every model this workspace can produce. Their wrappers and wire contracts
   * are still covered by engine/__tests__/advanced-wire-contracts.test.ts for
   * whoever surfaces them in a 2D workspace.
   */

  /** A free node worth reading a response at: the highest unsupported one,
   *  which on a building is the roof. */
  function defaultFreeNode(): number | null {
    let best: { id: number; z: number } | null = null;
    for (const [id, n] of modelStore.nodes) {
      if (modelStore.supports.has(id)) continue;
      const z = (n as { z?: number }).z ?? 0;
      if (!best || z > best.z) best = { id, z };
    }
    return best?.id ?? nodeIds[0] ?? null;
  }

  let useDiaphragm = $state(false);

  function buildInput() {
    // These analyses build with expandMemberOffsets:false, which ALSO skips
    // sliding-joint / 3D-joint expansion (joints share the offset gate), so a
    // jointed model would silently solve as rigid (too stiff). Refuse with a
    // clear message instead — mirrors the ToolbarAdvanced guard, which this PRO
    // panel previously lacked.
    if (modelStore.hasSlidingJoints()) throw new Error(t('advanced.slidingUnsupported'));
    if (modelStore.hasJoint3D()) throw new Error(t('advanced.jointsUnsupported'));
    const input = buildSolverInput3D(
      { nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
        loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
        quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints,
        connectors: modelStore.connectors },
      uiStore.includeSelfWeight,
      false,
      // Advanced analyses run on the centerline: their wire payloads (modal/
      // spectral) don't carry constraints, so expanded offset-helper nodes
      // would float free — singular K instead of eccentricity effects. The
      // linear + combination solves DO expand offsets.
      { expandMemberOffsets: false },
    );
    if (!input) throw new Error(t('advanced.emptyModel'));
    return input;
  }

  function getMaterialDensities(input?: any): Map<number, number> {
    // mat.rho is weight density in kN/m³; convert to mass density in kg/m³
    const densities = new Map<number, number>();
    for (const [id, mat] of modelStore.materials) {
      densities.set(id, ((mat as any).rho ?? 0) * 1000 / 9.81);
    }
    // Also include any materials from the enforced input (penalty materials)
    // that aren't in the store — use small density to avoid zero-mass DOFs
    if (input?.materials) {
      for (const [id] of input.materials) {
        if (!densities.has(id)) {
          densities.set(id, 1.0); // 1 kg/m³ — negligible but non-zero
        }
      }
    }
    return densities;
  }

  function maybeApplyDiaphragm(input: any) {
    if (!useDiaphragm) return input;
    const levels = detectFloorLevels(input.nodes);
    if (!levels || levels.length === 0) return input;
    return applyRigidDiaphragm(input, { levels });
  }

  // ─── 1. P-Delta ─────────────────────────────────────────────────

  let pdeltaResult = $state<any | null>(null);

  function handlePDelta() {
    solveError = null;
    solving = true;
    pdeltaElapsed = null;
    try {
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      let res: any;
      const t0 = performance.now();
      res = wasmPDelta3D(input);
      const elapsed = performance.now() - t0;
      if (typeof res === 'string') { solveError = `P-Delta: ${res}`; solving = false; return; }
      pdeltaElapsed = elapsed;
      pdeltaResult = res;
      if (res.results) {
        resultsStore.setPDeltaResult3D(res);
      }
      advancedResults = { ...advancedResults, pdelta: { converged: res.converged, iterations: res.iterations, b2Factor: res.b2Factor } };
    } catch (e: any) {
      solveError = `P-Delta: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 2. Modal ───────────────────────────────────────────────────

  let modalResult = $state<any | null>(null);
  let numModes = $state(6);

  const modalCumX = $derived.by(() => {
    if (!modalResult?.modes) return [];
    let sum = 0;
    return modalResult.modes.map((m: any) => { sum += Math.abs(m.participationX ?? m.partX ?? 0); return sum; });
  });
  const modalCumY = $derived.by(() => {
    if (!modalResult?.modes) return [];
    let sum = 0;
    return modalResult.modes.map((m: any) => { sum += Math.abs(m.participationY ?? m.partY ?? 0); return sum; });
  });

  function handleModal() {
    solveError = null;
    solving = true;
    modalElapsed = null;
    try {
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      const densities = getMaterialDensities(input);
      let res: any;
      const t0 = performance.now();
      res = wasmModal3D(input, densities, numModes);
      const elapsed = performance.now() - t0;
      if (typeof res === 'string') { solveError = `Modal: ${res}`; solving = false; return; }
      modalElapsed = elapsed;
      modalResult = res;
      if (res.modes || res.frequencies) {
        const modes = (res.modes ?? res.frequencies ?? []).map((m: any, i: number) => ({
          frequency: m.frequency ?? m.freq ?? (res.frequencies?.[i] ?? 0),
          period: m.period ?? (m.frequency ? 1 / m.frequency : 0),
          participationX: m.participationX ?? m.partX,
          participationY: m.participationY ?? m.partY,
          participationZ: m.participationZ ?? m.partZ,
        }));
        advancedResults = { ...advancedResults, modal: { modes, totalMass: res.totalMass } };
      }
    } catch (e: any) {
      solveError = `Modal: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 3. Spectral ───────────────────────────────────────────────

  let spectralResult = $state<any | null>(null);
  let spectralCombination = $state<'CQC' | 'SRSS'>('CQC');
  let seismicZone = $state<1 | 2 | 3 | 4>(3);
  let soilType = $state<'I' | 'II' | 'III'>('II');

  function handleSpectral() {
    solveError = null;
    solving = true;
    try {
      if (!modalResult) {
        solveError = t('pro.requiresModal');
        solving = false;
        return;
      }
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      const densities = getMaterialDensities(input);
      const spectrum: DesignSpectrum = cirsoc103Spectrum(seismicZone, soilType);
      let res: any;
      res = wasmSpectral3D({
          solver: input,
          densities,
          spectrum,
          directions: ['X', 'Y', 'Z'],
          combination: spectralCombination,
          numModes,
        });
      if (typeof res === 'string') { solveError = `Espectral: ${res}`; solving = false; return; }
      spectralResult = res;
      advancedResults = { ...advancedResults, spectral: { baseShearX: res.baseShearX ?? res.baseShear, baseShearY: res.baseShearY, baseShearZ: res.baseShearZ } };
    } catch (e: any) {
      solveError = `Espectral: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 4. Buckling ───────────────────────────────────────────────

  let bucklingResult = $state<any | null>(null);
  let numBucklingModes = $state(4);

  function handleBuckling() {
    solveError = null;
    solving = true;
    bucklingElapsed = null;
    try {
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      let res: any;
      const t0 = performance.now();
      res = wasmBuckling3D(input, numBucklingModes);
      const elapsed = performance.now() - t0;
      if (typeof res === 'string') { solveError = `Buckling: ${res}`; solving = false; return; }
      bucklingElapsed = elapsed;
      bucklingResult = res;
      const factors = res.factors ?? res.eigenvalues ?? (res.modes?.map((m: any) => m.loadFactor ?? m.factor ?? m.eigenvalue) ?? []);
      advancedResults = { ...advancedResults, buckling: { factors } };
    } catch (e: any) {
      solveError = `Buckling: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 5. Time History ──────────────────────────────────────────

  let thDt = $state(0.01);
  let thNSteps = $state(200);
  let thDir = $state<'X' | 'Y' | 'Z'>('X');
  let thDamping = $state(0.05);
  let thMethod = $state<'newmark' | 'hht'>('newmark');
  let thAccelText = $state('');
  let thResult = $state<any | null>(null);
  /* Starts on the generated sine: with the text box empty and this off, the
     only thing the button could do was refuse to run. */
  let thUseSine = $state(true);
  let thSineAmp = $state(0.3);
  let thSineFreq = $state(2.0);

  function generateSineAccel(): number[] {
    const vals: number[] = [];
    for (let i = 0; i < thNSteps; i++) {
      vals.push(thSineAmp * Math.sin(2 * Math.PI * thSineFreq * i * thDt));
    }
    return vals;
  }

  function parseAccelInput(): number[] {
    if (thUseSine) return generateSineAccel();
    return thAccelText.split(/[,\s]+/).filter(s => s.length > 0).map(Number).filter(n => !isNaN(n));
  }

  function handleTimeHistory() {
    solveError = null;
    solving = true;
    try {
      const groundAccel = parseAccelInput();
      if (groundAccel.length === 0) {
        solveError = t('pro.needAccelData');
        solving = false;
        return;
      }
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      const densities: Record<string, number> = {};
      for (const [id, mat] of modelStore.materials) {
        densities[String(id)] = (mat as any).rho ?? 0;
      }
      const beta = 0.25;
      const gamma = 0.5;
      const res = solveTimeHistory3D({
        solver: input,
        densities,
        timeStep: thDt,
        nSteps: thNSteps,
        method: thMethod,
        beta,
        gamma,
        dampingXi: thDamping,
        // `TimeHistoryInput3D` takes one acceleration series per global
        // axis. The old payload sent the 2D pair { groundAccel,
        // groundDirection }, which hit no field at all — so the run went
        // ahead with ZERO ground motion and the static loads as the only
        // excitation.
        groundAccelX: thDir === 'X' ? groundAccel : undefined,
        groundAccelY: thDir === 'Y' ? groundAccel : undefined,
        groundAccelZ: thDir === 'Z' ? groundAccel : undefined,
      });
      thResult = res;
    } catch (e: any) {
      solveError = `Time History: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 6b. Harmonic Response ───────────────────────────────────

  let harmFMin = $state(0.1);
  let harmFMax = $state(50);
  let harmNPoints = $state(200);
  let harmDamping = $state(0.05);
  let harmDir = $state<'X' | 'Y' | 'Z'>('X');
  let harmNodeId = $state<number | null>(null);
  let harmResult = $state<any | null>(null);

  function handleHarmonic() {
    solveError = null;
    solving = true;
    harmonicElapsed = null;
    try {
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      // Mass density in kg/m³, exactly as modal does it — `rho` is a WEIGHT
      // density in kN/m³, and feeding it straight in made every frequency
      // wrong by a factor of g/1000.
      const densities: Record<string, number> = {};
      for (const [id, d] of getMaterialDensities(input)) densities[String(id)] = d;
      // The engine sweeps an explicit frequency list and reports one node's
      // response; it has no fMin/fMax/nPoints of its own.
      const span = harmNPoints > 1 ? (harmFMax - harmFMin) / (harmNPoints - 1) : 0;
      const frequencies = Array.from({ length: Math.max(1, harmNPoints) }, (_, i) => harmFMin + i * span);
      const responseNodeId = harmNodeId ?? defaultFreeNode();
      if (responseNodeId == null) throw new Error(t('advanced.emptyModel'));
      const t0 = performance.now();
      const res = solveHarmonic3D({
        solver: input,
        densities,
        frequencies,
        dampingRatio: harmDamping,
        responseNodeId,
        responseDof: harmDir.toLowerCase(),
      });
      const elapsed = performance.now() - t0;
      harmonicElapsed = elapsed;
      harmResult = res;
    } catch (e: any) {
      solveError = `Harmónico: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 7. Nonlinear ─────────────────────────────────────────────

  let nlType = $state<'pushover' | 'corotational' | 'fiber'>('pushover');
  let nlMaxHinges = $state(20);
  let nlMaxIter = $state(50);
  let nlTol = $state(1e-6);
  let nlIncrements = $state(10);
  let nlFiberIntPts = $state(5);
  let nlResult = $state<any | null>(null);
  // Displacements never sit at the top level: the incremental solvers
  // (corotational, fiber) nest them under `.results`, and pushover nests
  // them under each step's `.results` — so read the last step's.
  const nlDisplacements = $derived(
    nlResult?.results?.displacements
      ?? nlResult?.steps?.[nlResult.steps.length - 1]?.results?.displacements
      ?? []
  );

  function handleNonlinear() {
    solveError = null;
    solving = true;
    try {
      let input = buildInput();
      input = maybeApplyDiaphragm(input);

      if (nlType === 'pushover') {
        const sections: Record<string, any> = {};
        for (const [id, sec] of modelStore.sections) {
          sections[String(id)] = {
            a: (sec as any).area ?? (sec as any).a ?? 0,
            iy: (sec as any).iy ?? (sec as any).Iy ?? 0,
            iz: (sec as any).iz ?? (sec as any).Iz ?? 0,
            materialId: (sec as any).materialId ?? 0,
            b: (sec as any).b ?? (sec as any).width ?? 0,
            h: (sec as any).h ?? (sec as any).height ?? 0,
          };
        }
        const materials: Record<string, any> = {};
        for (const [id, mat] of modelStore.materials) {
          materials[String(id)] = { fy: (mat as any).fy ?? 250 };
        }
        nlResult = solvePlastic3D({
          solver: input,
          sections,
          materials,
          maxHinges: nlMaxHinges,
        });
      } else if (nlType === 'corotational') {
        nlResult = solveCorotational3D(input, nlMaxIter, nlTol, nlIncrements);
      } else {
        const fiberSections: Record<string, any> = {};
        for (const [id, sec] of modelStore.sections) {
          fiberSections[String(id)] = {
            a: (sec as any).area ?? (sec as any).a ?? 0,
            iy: (sec as any).iy ?? (sec as any).Iy ?? 0,
            iz: (sec as any).iz ?? (sec as any).Iz ?? 0,
            materialId: (sec as any).materialId ?? 0,
            b: (sec as any).b ?? (sec as any).width ?? 0,
            h: (sec as any).h ?? (sec as any).height ?? 0,
          };
        }
        nlResult = solveFiberNonlinear3D({
          solver: input,
          fiberSections,
          nIntegrationPoints: nlFiberIntPts,
          maxIter: nlMaxIter,
          tolerance: nlTol,
          nIncrements: nlIncrements,
        });
      }
    } catch (e: any) {
      solveError = `No lineal: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 7d. Imperfections ─────────────────────────────────────

  /**
   * What the engine actually applies is a notional load derived from an
   * out-of-plumbness RATIO (1/200 in EC3 and AISC), not a "global/local" mode
   * with an amplitude — those two fields went across the wire and were never
   * read, and the analysis failed on the missing `imperfections` block.
   */
  let imperfRatio = $state(0.005);
  let imperfDir = $state<'X' | 'Y'>('X');
  let imperfResult = $state<any | null>(null);

  function handleImperfections() {
    solveError = null;
    solving = true;
    try {
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      imperfResult = solveWithImperfections3D({
        solver: input,
        imperfections: {
          // Gravity axis 2 = Z, which is vertical in this app's 3D models.
          notionalLoads: [{ ratio: imperfRatio, direction: imperfDir === 'X' ? 0 : 1, gravityAxis: 2 }],
        },
      });
    } catch (e: any) {
      solveError = `Imperfecciones: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 8. Winkler Foundation ─────────────────────────────────────

  let winklerElementId = $state<number | null>(null);
  let winklerKy = $state(1000);
  let winklerKz = $state(0);
  let winklerSprings = $state<{ elementId: number; ky: number; kz: number }[]>([]);
  let winklerResult = $state<any | null>(null);

  function addWinklerSpring() {
    if (winklerElementId == null) return;
    winklerSprings = [...winklerSprings, { elementId: winklerElementId, ky: winklerKy, kz: winklerKz }];
  }

  function removeWinklerSpring(idx: number) {
    winklerSprings = winklerSprings.filter((_, i) => i !== idx);
  }

  function handleWinkler() {
    solveError = null;
    solving = true;
    try {
      const input = buildInput();
      const res = solveWinkler3D({
        solver: input,
        foundationSprings: winklerSprings.map(s => ({
          elementId: s.elementId,
          ...(s.ky ? { ky: s.ky } : {}),
          ...(s.kz ? { kz: s.kz } : {}),
        })),
      });
      // The Winkler export returns AnalysisResults3D directly — reading
      // `res.results` meant the solve never reached the viewport.
      winklerResult = res;
      if (res.displacements) resultsStore.setResults3D(res);
    } catch (e: any) {
      solveError = `Winkler: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 9. SSI ────────────────────────────────────────────────────

  let ssiNodeId = $state<number | null>(null);
  let ssiDirection = $state<'Y' | 'Z'>('Y');
  let ssiCurveType = $state<'softClay' | 'sand' | 'stiffClay'>('softClay');
  let ssiEps50 = $state(0.01);
  let ssiSu = $state(50);
  let ssiGamma = $state(18);
  let ssiDiameter = $state(0.6);
  let ssiDepth = $state(5);
  let ssiPhi = $state(30);
  let ssiTribLength = $state(1);
  let ssiMaxIter = $state(50);
  let ssiTolerance = $state(1e-4);
  let ssiSprings = $state<any[]>([]);
  let ssiResult = $state<any | null>(null);

  /**
   * The p-y curve as the engine tags it. `SoilCurve` is an externally tagged
   * enum with snake_case fields — "py_soft_clay" with `gamma_eff` and
   * `eps_50`, not "softClay" with `gamma`, which is why every SSI run stopped
   * at the deserialiser. Direction is an axis INDEX (0=X, 1=Y, 2=Z), not a
   * letter.
   */
  const AXIS_INDEX: Record<string, number> = { X: 0, Y: 1, Z: 2 };

  function ssiCurvePayload(): Record<string, unknown> {
    const common = { gamma_eff: ssiGamma, d: ssiDiameter, depth: ssiDepth };
    if (ssiCurveType === 'sand') return { type: 'py_sand', phi: ssiPhi, ...common };
    return {
      type: ssiCurveType === 'stiffClay' ? 'py_stiff_clay' : 'py_soft_clay',
      su: ssiSu, eps_50: ssiEps50, ...common,
    };
  }

  function addSsiSpring() {
    if (ssiNodeId == null) return;
    ssiSprings = [...ssiSprings, {
      nodeId: ssiNodeId,
      direction: AXIS_INDEX[ssiDirection] ?? 1,
      curve: ssiCurvePayload(),
      tributaryLength: ssiTribLength,
    }];
  }

  function removeSsiSpring(idx: number) {
    ssiSprings = ssiSprings.filter((_, i) => i !== idx);
  }

  function handleSSI() {
    solveError = null;
    solving = true;
    try {
      const input = buildInput();
      const res = solveSSI3D({
        solver: input,
        soilSprings: ssiSprings,
        maxIter: ssiMaxIter,
        tolerance: ssiTolerance,
      });
      ssiResult = res;
      if (res.results) resultsStore.setResults3D(res.results);
    } catch (e: any) {
      solveError = `SSI: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 10. Contact / Gap ─────────────────────────────────────────

  let contactBehaviors = $state<Map<number, 'normal' | 'tensionOnly' | 'compressionOnly'>>(new Map());
  let contactElementId = $state<number | null>(null);
  let contactBehavior = $state<'normal' | 'tensionOnly' | 'compressionOnly'>('tensionOnly');
  let contactResult = $state<any | null>(null);

  function setContactBehavior() {
    if (contactElementId == null) return;
    const next = new Map(contactBehaviors);
    next.set(contactElementId, contactBehavior);
    contactBehaviors = next;
  }

  function removeContactBehavior(eid: number) {
    const next = new Map(contactBehaviors);
    next.delete(eid);
    contactBehaviors = next;
  }

  const contactEntries = $derived([...contactBehaviors.entries()]);
  // The result's per-element status list is `elementStatus` (with
  // `status: 'active' | 'inactive'`); the old read looked for a
  // `deactivated` field that has never existed, so it never reported.
  const contactDeactivatedCount = $derived(
    ((contactResult?.elementStatus ?? []) as { status: string }[])
      .filter(s => s.status === 'inactive').length
  );

  function handleContact() {
    solveError = null;
    solving = true;
    try {
      const input = buildInput();
      // `ContactInput3D.element_behaviors` is a map keyed on the element id
      // holding the exact snake_case strings the engine matches; the old
      // `{ contactElements: [...] }` payload hit no field, so serde dropped
      // it and the "contact" solve ran as a plain linear one.
      const elementBehaviors: Record<string, string> = {};
      for (const [elementId, behavior] of contactBehaviors) {
        elementBehaviors[String(elementId)] =
          behavior === 'tensionOnly' ? 'tension_only'
          : behavior === 'compressionOnly' ? 'compression_only'
          : 'normal';
      }
      const res = solveContact3D({ solver: input, elementBehaviors });
      contactResult = res;
      if (res.results) resultsStore.setResults3D(res.results);
    } catch (e: any) {
      solveError = `Contacto: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 11. Staged Construction ───────────────────────────────────

  let stages = $state<{ name: string; elementsAdded: number[]; elementsRemoved: number[]; loadIndices: number[] }[]>([]);
  let stagedResult = $state<any | null>(null);

  function addStage() {
    stages = [...stages, {
      name: t('pro.stageN').replace('{n}', String(stages.length + 1)),
      // A stage that adds nothing builds nothing, so the first one starts with
      // the whole model and later stages are cut back from it by hand.
      elementsAdded: stages.length === 0 ? [...elementIds] : [],
      elementsRemoved: [], loadIndices: [],
    }];
  }

  function removeStage(idx: number) {
    stages = stages.filter((_, i) => i !== idx);
  }

  function handleStaged() {
    solveError = null;
    solving = true;
    try {
      const input = buildInput();
      const res = solveStaged3D({
        solver: input,
        // `StagedInput3D` names these `name` / `elementsAdded` /
        // `elementsRemoved`; the old payload sent neither the name (required)
        // nor the right field names, so no stage ever built anything.
        stages: stages.map(s => ({
          name: s.name,
          elementsAdded: s.elementsAdded,
          elementsRemoved: s.elementsRemoved,
          loadIndices: s.loadIndices,
        })),
      });
      stagedResult = res;
      if (res.results) resultsStore.setResults3D(res.results);
    } catch (e: any) {
      solveError = `Etapas: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 12. Creep & Shrinkage ─────────────────────────────────────

  let creepFc = $state(30);
  let creepRH = $state(60);
  let creepH0 = $state(200);
  let creepAge = $state(28);
  let creepCementClass = $state<'R' | 'N' | 'S'>('N');
  let creepTimeSteps = $state<{ time: number }[]>([{ time: 365 }]);
  let creepResult = $state<any | null>(null);

  function addCreepStep() {
    const lastTime = creepTimeSteps.length > 0 ? creepTimeSteps[creepTimeSteps.length - 1].time : 0;
    creepTimeSteps = [...creepTimeSteps, { time: lastTime + 365 }];
  }

  function removeCreepStep(idx: number) {
    creepTimeSteps = creepTimeSteps.filter((_, i) => i !== idx);
  }

  function handleCreep() {
    solveError = null;
    solving = true;
    try {
      const input = buildInput();
      // EC2 creep parameters are per MATERIAL, and the steps are keyed on
      // `tDays`. The old payload sent one `concrete` block and a `time` field,
      // neither of which the engine knows.
      const creepParams: Record<string, unknown> = {};
      for (const [id] of modelStore.materials) {
        creepParams[String(id)] = {
          fc: creepFc, rh: creepRH, h0: creepH0,
          t0: creepAge, cementClass: creepCementClass,
        };
      }
      creepResult = solveCreepShrinkage3D({
        solver: input,
        creepParams,
        timeSteps: creepTimeSteps.map(s => ({ tDays: s.time })),
      });
    } catch (e: any) {
      solveError = `Fluencia: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 14. Influence Lines 3D ──────────────────────────────────

  let ilElementId = $state<number | null>(null);
  let ilNodeId = $state<number | null>(null);
  let ilResponse = $state<'moment' | 'shear' | 'axial' | 'reaction'>('moment');
  let ilPosition = $state(0.5);
  let ilResult = $state<any | null>(null);

  /**
   * The engine asks for a QUANTITY by its 3D name and a target that depends on
   * it: an element plus a position along it for internal forces, a node for a
   * reaction. `elementId` + `responseType` meant nothing to it, and the run
   * stopped on the missing `quantity`. Names follow the 2D-plane convention
   * used everywhere else here: bending is My, shear is Vz.
   */
  const IL_QUANTITY = { moment: 'My_diag', shear: 'Vz', axial: 'N', reaction: 'Fz' } as const;

  function handleInfluenceLine3D() {
    solveError = null;
    solving = true;
    try {
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      ilResult = computeInfluenceLine3D({
        solver: input,
        quantity: IL_QUANTITY[ilResponse],
        ...(ilResponse === 'reaction'
          ? { targetNodeId: ilNodeId ?? undefined }
          : { targetElementId: ilElementId ?? undefined, targetPosition: ilPosition }),
        gravityDirection: 'z',
      });
    } catch (e: any) {
      solveError = `Influence Line 3D: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 16. Multi-Case Solver ──────────────────────────────────

  let multiCaseResult = $state<any | null>(null);

  /**
   * One load vector per case, built the same way the combination solve builds
   * them: the model with only that case's loads. The engine wants the LOADS,
   * not case ids — `caseIds` was a field it never had, so multi-case failed on
   * a missing `loadCases` every time.
   */
  function loadsForCase(caseId: number): unknown[] {
    const input = buildSolverInput3D(
      { nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
        loads: modelStore.loads.filter(l => ((l as any).data?.caseId ?? 1) === caseId),
        materials: modelStore.materials, sections: modelStore.sections,
        quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints,
        connectors: modelStore.connectors },
      uiStore.includeSelfWeight,
      false,
      { expandMemberOffsets: false },
    );
    return (input?.loads as unknown[]) ?? [];
  }

  function handleMultiCase() {
    solveError = null;
    solving = true;
    try {
      const cases = modelStore.model.loadCases;
      if (cases.length < 2) {
        solveError = t('pro.needMultipleCases');
        solving = false;
        return;
      }
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      const byId = new Map(cases.map(c => [c.id, c.name]));
      multiCaseResult = solveMultiCase3D({
        solver: input,
        loadCases: cases.map(c => ({ name: c.name, loads: loadsForCase(c.id) })),
        combinations: modelStore.combinations.map(cb => ({
          name: cb.name,
          factors: Object.fromEntries(
            cb.factors
              .filter(f => byId.has(f.caseId))
              .map(f => [byId.get(f.caseId) as string, f.factor]),
          ),
        })),
      });
    } catch (e: any) {
      solveError = `Multi-Case: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  // ─── 17. Section Analyzer ──────────────────────────────────

  let secShape = $state<'rect' | 'circle' | 'I' | 'L' | 'T' | 'polygon'>('rect');
  let secB = $state(0.3);     // m
  let secH = $state(0.5);     // m
  let secR = $state(0.15);    // m (circle)
  let secTw = $state(0.01);   // m (web thickness for I/T)
  let secTf = $state(0.015);  // m (flange thickness for I/T)
  let secBf = $state(0.2);    // m (flange width for I/T)
  let secPolyText = $state(''); // "x1,y1; x2,y2; ..."
  let secResult = $state<any | null>(null);

  /**
   * The section analyser is a polygon integrator: it takes `polygons`, each a
   * list of [y, z] vertices, and knows nothing about named shapes. The old
   * payload sent `{shape:'rect', b, h}` and failed on the missing `polygons`,
   * so the shape is meshed into its outline here instead.
   */
  function sectionOutline(): Array<[number, number]> {
    const half = (v: number) => v / 2;
    switch (secShape) {
      case 'rect':
        return [[-half(secB), -half(secH)], [half(secB), -half(secH)], [half(secB), half(secH)], [-half(secB), half(secH)]];
      case 'circle': {
        const n = 48;
        return Array.from({ length: n }, (_, i) => {
          const a = (2 * Math.PI * i) / n;
          return [secR * Math.cos(a), secR * Math.sin(a)] as [number, number];
        });
      }
      case 'I': {
        const b = half(secBf), h = half(secH), tw = half(secTw), tf = secTf;
        return [
          [-b, -h], [b, -h], [b, -h + tf], [tw, -h + tf],
          [tw, h - tf], [b, h - tf], [b, h], [-b, h],
          [-b, h - tf], [-tw, h - tf], [-tw, -h + tf], [-b, -h + tf],
        ];
      }
      case 'T': {
        const b = half(secBf), h = half(secH), tw = half(secTw), tf = secTf;
        return [[-tw, -h], [tw, -h], [tw, h - tf], [b, h - tf], [b, h], [-b, h], [-b, h - tf], [-tw, h - tf]];
      }
      case 'L': {
        // Legs measured from the heel, then centred on the bounding box.
        const b = secB, h = secH, tw = secTw, tf = secTf;
        const pts: Array<[number, number]> = [[0, 0], [b, 0], [b, tf], [tw, tf], [tw, h], [0, h]];
        return pts.map(([y, z]) => [y - b / 2, z - h / 2] as [number, number]);
      }
      default:
        return [];
    }
  }

  function handleSectionAnalysis() {
    solveError = null;
    try {
      let vertices: Array<[number, number]>;
      if (secShape === 'polygon') {
        vertices = secPolyText.split(';').map(p => {
          const [y, z] = p.trim().split(',').map(Number);
          return [y, z] as [number, number];
        }).filter(([y, z]) => !isNaN(y) && !isNaN(z));
        if (vertices.length < 3) { solveError = t('pro.needPolygonPts'); return; }
      } else {
        vertices = sectionOutline();
      }
      secResult = analyzeSection({ polygons: [{ vertices }] });
    } catch (e: any) {
      solveError = `Section: ${errorText(e, 'Error')}`;
    }
  }

  // ─── 18. Constrained Solver ────────────────────────────────

  let constraintPairs = $state('');  // "master,slave; master,slave; ..."
  let constrainedResult = $state<any | null>(null);

  function handleConstrained() {
    solveError = null;
    solving = true;
    try {
      // A constraint is a tagged union in the engine, and the only pair-shaped
      // member of it is a rigid link. `{nodeA, nodeB}` plus a `method` the
      // engine has no field for parsed as nothing at all.
      const constraints = constraintPairs.split(';').map(p => {
        const [a, b] = p.trim().split(',').map(Number);
        return { type: 'rigidLink', masterNode: a, slaveNode: b, dofs: [] as number[] };
      }).filter(c => !isNaN(c.masterNode) && !isNaN(c.slaveNode));
      if (constraints.length === 0) {
        solveError = t('pro.needConstraintPairs');
        solving = false;
        return;
      }
      // PRO is a 3D workspace — `analysisMode` reads 'pro' here, never '3d',
      // so branching on it sent every PRO model down the 2D path.
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      // Like Winkler, this export returns AnalysisResults3D itself.
      const res = solveConstrained3D({ solver: input, constraints });
      constrainedResult = res;
      if (res.displacements) resultsStore.setResults3D(res);
    } catch (e: any) {
      solveError = `Constrained: ${errorText(e, 'Error')}`;
    }
    solving = false;
  }

  /*
   * Which advanced analysis owns the panel. Null is a real state: the strip
   * alone, so the seventeen are browsable without any of their forms open.
   */
  let advView = $state<string | null>(null);

  const ADV_VIEWS = $derived([
        { id: 'timehistory', label: 'Time History' },
        { id: 'harmonic', label: t('pro.harmonicTitle') },
        { id: 'nolineal', label: 'No lineal' },
        { id: 'imperfections', label: t('pro.imperfectionsTitle') },
        { id: 't', label: t('pro.winklerFoundation') },
        { id: 'ssi', label: t('pro.ssiTitle') },
        { id: 't8', label: t('pro.contactGap') },
        { id: 't9', label: t('pro.stagedConstruction') },
        { id: 't10', label: t('pro.creepShrinkage') },
        { id: 'influenceline3d', label: t('pro.influenceLine3dTitle') },
        { id: 'multicase', label: t('pro.multiCaseTitle') },
        { id: 'sectionanalyzer', label: t('pro.sectionAnalyzerTitle') },
        { id: 'constrained', label: t('pro.constrainedTitle') },
  ]);
</script>

<div class="adv-tab">
  <!-- Global options -->
  <div class="adv-header">
    <label class="adv-check">
      <input type="checkbox" bind:checked={useDiaphragm} />
      {t('pro.rigidDiaphragm')}
    </label>
    {#if !wasmAvailable}
      <span class="adv-wasm-warn">{t('pro.wasmNotReady')}</span>
    {/if}
  </div>

  <div class="adv-wip-banner">
    {t('pro.advancedWip')}
  </div>

  {#if solveError}
    <div class="adv-error">{solveError}</div>
  {/if}

  <div class="adv-scroll">

    <!-- ── 1. P-Delta ── -->
    <div class="adv-group">
      <div class="adv-row">
        <button class="adv-run-btn" onclick={handlePDelta} disabled={!hasModel || solving}>P-Delta</button>
        <span class="adv-desc">{t('pro.pdeltaDesc')}</span>
      </div>
      {#if pdeltaResult}
        <div class="adv-inline">
          {pdeltaResult.converged ? t('pro.converged') : t('pro.notConverged')} — {pdeltaResult.iterations} iter.
          {#if pdeltaResult.b2Factor != null} — B2 = {fmtNum(pdeltaResult.b2Factor)}{/if}
          {#if pdeltaElapsed != null} — {pdeltaElapsed >= 1000 ? (pdeltaElapsed / 1000).toFixed(2) + ' s' : pdeltaElapsed.toFixed(0) + ' ms'}{/if}
        </div>
      {/if}
    </div>

    <!-- ── 2. Modal ── -->
    <div class="adv-group">
      <div class="adv-row">
        <button class="adv-run-btn" onclick={handleModal} disabled={!hasModel || solving}>Modal</button>
        <label class="adv-label">
          Modos:
          <input type="number" class="adv-num" bind:value={numModes} min={1} max={50} />
        </label>
      </div>
      {#if modalResult}
        <div class="adv-inline">
          {#if modalResult.totalMass != null}Masa: {fmtNum(modalResult.totalMass)} kg — {/if}
          {modalResult.modes?.length ?? 0} modos{#if modalElapsed != null} — {modalElapsed >= 1000 ? (modalElapsed / 1000).toFixed(2) + ' s' : modalElapsed.toFixed(0) + ' ms'}{#if wasmAvailable} (WASM){/if}{/if}
        </div>
        <div class="adv-table-scroll">
          <table class="adv-table">
            <thead><tr><th>Modo</th><th>f (Hz)</th><th>T (s)</th><th>Part. X</th><th>Part. Y</th><th>Part. Z</th><th>Cum. X</th><th>Cum. Y</th></tr></thead>
            <tbody>
              {#each modalResult.modes as mode, i}
                <tr>
                  <td class="col-id">{i + 1}</td>
                  <td class="col-num">{fmtNum(mode.frequency)}</td>
                  <td class="col-num">{fmtNum(mode.period)}</td>
                  <td class="col-num">{fmtNum(mode.participationX ?? 0)}</td>
                  <td class="col-num">{fmtNum(mode.participationY ?? 0)}</td>
                  <td class="col-num">{fmtNum(mode.participationZ ?? 0)}</td>
                  <td class="col-num" class:cum-warn={modalCumX[i] < 0.9} class:cum-ok={modalCumX[i] >= 0.9}>{(modalCumX[i] * 100).toFixed(1)}%</td>
                  <td class="col-num" class:cum-warn={modalCumY[i] < 0.9} class:cum-ok={modalCumY[i] >= 0.9}>{(modalCumY[i] * 100).toFixed(1)}%</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- ── 3. Spectral ── -->
    <div class="adv-group">
      <div class="adv-row">
        <button class="adv-run-btn" onclick={handleSpectral} disabled={!hasModel || solving || !modalResult}>Espectral</button>
        <label class="adv-label">
          <select class="adv-sel" bind:value={spectralCombination}>
            <option value="CQC">CQC</option>
            <option value="SRSS">SRSS</option>
          </select>
        </label>
        <label class="adv-label">
          Zona:
          <select class="adv-sel" bind:value={seismicZone}>
            <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
          </select>
        </label>
        <label class="adv-label">
          Suelo:
          <select class="adv-sel" bind:value={soilType}>
            <option value="I">I</option><option value="II">II</option><option value="III">III</option>
          </select>
        </label>
      </div>
      {#if !modalResult}
        <div class="adv-hint">{t('pro.requiresModal')}</div>
      {/if}
      {#if spectralResult}
        <div class="adv-inline">
          Vb: X={fmtNum(spectralResult.baseShearX ?? spectralResult.baseShear?.x ?? spectralResult.baseShear ?? 0)}, Y={fmtNum(spectralResult.baseShearY ?? spectralResult.baseShear?.y ?? 0)} kN
        </div>
        {#if spectralResult.perMode || spectralResult.perModeX}
          <div class="adv-table-scroll">
            <table class="adv-table">
              <thead><tr><th>Modo</th><th>T (s)</th><th>Sa (g)</th><th>Vb (kN)</th></tr></thead>
              <tbody>
                {#each (spectralResult.perMode ?? spectralResult.perModeX ?? []) as pm, i}
                  <tr>
                    <td class="col-id">{i + 1}</td>
                    <td class="col-num">{fmtNum(pm.period ?? 0)}</td>
                    <td class="col-num">{fmtNum((pm.sa ?? pm.Sa ?? 0) / 9.81)}</td>
                    <td class="col-num">{fmtNum(pm.shear ?? pm.Vb ?? 0)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      {/if}
    </div>

    <!-- ── 4. Buckling ── -->
    <div class="adv-group">
      <div class="adv-row">
        <button class="adv-run-btn" onclick={handleBuckling} disabled={!hasModel || solving}>Pandeo</button>
        <label class="adv-label">
          Modos:
          <input type="number" class="adv-num" bind:value={numBucklingModes} min={1} max={20} />
        </label>
      </div>
      {#if bucklingResult}
        {#if bucklingElapsed != null}
          <div class="adv-inline">{bucklingElapsed >= 1000 ? (bucklingElapsed / 1000).toFixed(2) + ' s' : bucklingElapsed.toFixed(0) + ' ms'}{#if wasmAvailable} (WASM){/if}</div>
        {/if}
        <div class="adv-table-scroll">
          <table class="adv-table">
            <thead><tr><th>Modo</th><th>&#x03BB;cr</th></tr></thead>
            <tbody>
              {#each bucklingResult.modes as mode, i}
                <tr>
                  <td class="col-id">{i + 1}</td>
                  <td class="col-num">{fmtNum(mode.loadFactor)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- ── 5. Time History ── -->
      <!--
        One analysis at a time, chosen from a strip.
        ───────────────────────────────────────────
        Seventeen collapsibles in one column — time history, harmonic,
        non-linear, arc length, displacement control, imperfections, Winkler,
        SSI, contact, staged construction, creep, cables, 3D influence lines,
        model reduction, multi-case, the section analyser and constrained
        modes. Each carries a form and most carry a results table, so finding
        one meant scrolling a list of seventeen titles, and opening two put
        their forms far enough apart that neither could be compared with the
        other anyway.

        Same treatment as the Results and Loads panels, and the same reasoning
        as Basic's Advanced: these are not seventeen things to configure at
        once, they are seventeen answers to "which analysis am I setting up".
      -->
      <div class="adv-picker">
        {#each ADV_VIEWS as v (v.id)}
          <button
            class="adv-chip"
            class:on={advView === v.id}
            onclick={() => (advView = advView === v.id ? null : v.id)}
            data-testid="adv-chip-{v.id}"
          >{v.label}</button>
        {/each}
      </div>

      {#if advView === 'timehistory'}
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">dt (s): <input type="number" class="adv-num" bind:value={thDt} min={0.001} max={1} step={0.001} /></label>
          <label class="adv-label">Pasos: <input type="number" class="adv-num adv-num-wide" bind:value={thNSteps} min={1} max={10000} /></label>
          <label class="adv-label">Dir: <select class="adv-sel" bind:value={thDir}><option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option></select></label>
          <label class="adv-label">&#x03BE;: <input type="number" class="adv-num" bind:value={thDamping} min={0} max={1} step={0.01} /></label>
          <label class="adv-label">Método: <select class="adv-sel" bind:value={thMethod}><option value="newmark">Newmark</option><option value="hht">HHT-&#x03B1;</option></select></label>
        </div>
        <label class="adv-check">
          <input type="checkbox" bind:checked={thUseSine} />
          {t('pro.testSine')}
        </label>
        {#if thUseSine}
          <div class="adv-form">
            <label class="adv-label">Amp (g): <input type="number" class="adv-num" bind:value={thSineAmp} min={0.01} step={0.05} /></label>
            <label class="adv-label">Freq (Hz): <input type="number" class="adv-num" bind:value={thSineFreq} min={0.1} step={0.1} /></label>
          </div>
        {:else}
          <div class="adv-accel-area">
            <label class="adv-label">{t('pro.accelInput')}:</label>
            <textarea class="adv-textarea" bind:value={thAccelText} rows="2" placeholder="0.1, 0.25, 0.4, 0.3, -0.1, ..."></textarea>
          </div>
        {/if}
        <button class="adv-run-btn" onclick={handleTimeHistory} disabled={!hasModel || solving || !wasmAvailable}>{t('pro.run')}</button>
      </div>
      {#if thResult}
        <div class="adv-inline">
          <!-- The engine returns peak ENVELOPES, one per node and per support,
               plus the step count — not a single peak triple. -->
          {#if thResult.peakDisplacements?.length}
            δmax={fmtNum(Math.max(...thResult.peakDisplacements.map((d: any) => Math.hypot(d.ux ?? 0, d.uy ?? 0, d.uz ?? 0))))} m
          {/if}
          {#if thResult.peakReactions?.length}
            — Vb_max={fmtNum(Math.max(...thResult.peakReactions.map((r: any) => Math.hypot(r.rx ?? 0, r.ry ?? 0))))} kN
          {/if}
          {#if thResult.nSteps != null} — {thResult.nSteps} {t('pro.steps')} ({thResult.method}){/if}
        </div>
      {/if}
      {/if}

    <!-- ── 6b. Harmonic Response ── -->
      {#if advView === 'harmonic'}
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">f min (Hz): <input type="number" class="adv-num" bind:value={harmFMin} min={0.01} max={100} step={0.1} /></label>
          <label class="adv-label">f max (Hz): <input type="number" class="adv-num" bind:value={harmFMax} min={0.1} max={500} step={1} /></label>
          <label class="adv-label">Puntos: <input type="number" class="adv-num" bind:value={harmNPoints} min={10} max={2000} step={10} /></label>
          <label class="adv-label">&#x03BE;: <input type="number" class="adv-num" bind:value={harmDamping} min={0} max={1} step={0.01} /></label>
          <label class="adv-label">Dir: <select class="adv-sel" bind:value={harmDir}><option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option></select></label>
          <!-- The sweep is read at ONE node: without it the engine has nothing to report. -->
          <label class="adv-label">{t('pro.responseNode')}:
            <select class="adv-sel" bind:value={harmNodeId}>
              <option value={null}>{t('pro.autoTopNode')}</option>
              {#each nodeIds as nid}<option value={nid}>{nid}</option>{/each}
            </select>
          </label>
        </div>
        <button class="adv-run-btn" onclick={handleHarmonic} disabled={!hasModel || solving || !wasmAvailable}>{solving ? t('pro.solving') : t('pro.runHarmonic')}</button>
      </div>
      {#if harmResult}
        <div class="adv-inline">
          {#if harmResult.peakAmplitude != null}{t('pro.peakAmplitude')}: {fmtNum(harmResult.peakAmplitude)} m{/if}
          {#if harmResult.peakFrequency != null} — f_res={fmtNum(harmResult.peakFrequency)} Hz{/if}
          {#if harmonicElapsed != null} — {harmonicElapsed >= 1000 ? (harmonicElapsed / 1000).toFixed(2) + ' s' : harmonicElapsed.toFixed(0) + ' ms'} (WASM){/if}
        </div>
        {#if harmResult.responsePoints?.length}
          <details>
            <summary class="adv-steps-toggle">{t('pro.frfCurve')}</summary>
            <div class="adv-frf-table">
              <table class="adv-table">
                <thead><tr><th>f (Hz)</th><th>|H| (m/kN)</th></tr></thead>
                <tbody>
                  {#each harmResult.responsePoints.filter((_: any, i: number) => i % Math.max(1, Math.floor(harmResult.responsePoints.length / 20)) === 0) as pt}
                    <tr><td class="col-num">{fmtNum(pt.frequency)}</td><td class="col-num">{pt.amplitude.toExponential(3)}</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>
        {/if}
      {/if}
      {/if}

    <!-- ── 7. Nonlinear ── -->
      {#if advView === 'nolineal'}
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">Tipo: <select class="adv-sel" bind:value={nlType}><option value="pushover">Pushover</option><option value="corotational">Corotacional</option><option value="fiber">Fibra</option></select></label>
          {#if nlType === 'pushover'}
            <label class="adv-label">{t('pro.maxHinges')}: <input type="number" class="adv-num adv-num-wide" bind:value={nlMaxHinges} min={1} max={200} /></label>
          {:else}
            <label class="adv-label">Max iter: <input type="number" class="adv-num" bind:value={nlMaxIter} min={1} max={500} /></label>
            <label class="adv-label">Tol: <input type="number" class="adv-num adv-num-wide" bind:value={nlTol} min={1e-12} max={1} step={1e-6} /></label>
            <label class="adv-label">Incr: <input type="number" class="adv-num" bind:value={nlIncrements} min={1} max={200} /></label>
          {/if}
          {#if nlType === 'fiber'}
            <label class="adv-label">Pts int: <input type="number" class="adv-num" bind:value={nlFiberIntPts} min={2} max={20} /></label>
          {/if}
        </div>
        <button class="adv-run-btn" onclick={handleNonlinear} disabled={!hasModel || solving || !wasmAvailable}>{t('pro.run')}</button>
      </div>
      {#if nlResult}
        <!--
          Each of the three runs returns a different result type, and the panel
          read fields none of them has (`loadFactor`, `numHinges`), so a
          successful pushover displayed a blank line. Pushover reports its
          collapse factor and its hinges; the incremental solvers report the
          path they walked. `converged` only exists on the incremental
          results (CorotationalResult3D / FiberNonlinearResult3D) — pushover's
          PlasticResult3D has no such notion, so the guard hides it there.
        -->
        <div class="adv-inline">
          {#if nlResult.collapseFactor != null}λ_c={fmtNum(nlResult.collapseFactor)}{/if}
          {#if nlResult.hinges != null} — {nlResult.hinges.length} {t('pro.hinges')}{/if}
          {#if nlResult.isMechanism != null} — {nlResult.isMechanism ? t('pro.mechanism') : t('pro.stable')}{/if}
          {#if nlResult.converged != null} — {nlResult.converged ? t('pro.converged') : t('pro.notConverged')}{/if}
          {#if nlResult.steps != null} — {nlResult.steps.length} {t('pro.steps')}{/if}
          {#if nlDisplacements.length}
            — δmax={fmtNum(Math.max(...nlDisplacements.map((d: any) => Math.hypot(d.ux ?? 0, d.uy ?? 0, d.uz ?? 0))))} m
          {/if}
        </div>
      {/if}
      {/if}

    <!-- ── 7d. Imperfections ── -->
      {#if advView === 'imperfections'}
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">{t('pro.imperfRatio')}: <input type="number" class="adv-num adv-num-wide" bind:value={imperfRatio} min={0.0001} max={0.1} step={0.0005} /></label>
          <label class="adv-label">Dir: <select class="adv-sel" bind:value={imperfDir}><option value="X">X</option><option value="Y">Y</option></select></label>
        </div>
        <button class="adv-run-btn" onclick={handleImperfections} disabled={!hasModel || solving || !wasmAvailable}>{solving ? t('pro.solving') : t('pro.runImperfections')}</button>
      </div>
      {#if imperfResult}
        <div class="adv-inline">
          <!-- The engine returns the solved model, not a summary of the
               imperfection: report the drift it actually produced. -->
          {#if imperfResult.displacements?.length}
            δmax={fmtNum(Math.max(...imperfResult.displacements.map((d: any) => Math.hypot(d.ux ?? 0, d.uy ?? 0, d.uz ?? 0))))} m
            — {imperfResult.displacements.length} {t('pro.nodes')}
          {/if}
        </div>
      {/if}
      {/if}

    <!-- ─── Divider: Modelado especial ─── -->
    <div class="adv-divider">Modelado especial</div>

    <!-- ── 8. Winkler Foundation ── -->
      {#if advView === 't'}
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">{t('pro.element')}:
            <select class="adv-sel" bind:value={winklerElementId}>
              <option value={null}>--</option>
              {#each elementIds as eid}<option value={eid}>{eid}</option>{/each}
            </select>
          </label>
          <label class="adv-label">ky (kN/m/m): <input type="number" class="adv-num" bind:value={winklerKy} min={0} step={100} /></label>
          <label class="adv-label">kz: <input type="number" class="adv-num" bind:value={winklerKz} min={0} step={100} /></label>
          <button class="adv-btn-sm" onclick={addWinklerSpring} disabled={winklerElementId == null}>+</button>
        </div>
        {#if winklerSprings.length > 0}
          <table class="adv-table">
            <thead><tr><th>Elem</th><th>ky</th><th>kz</th><th></th></tr></thead>
            <tbody>
              {#each winklerSprings as s, i}
                <tr>
                  <td class="col-id">{s.elementId}</td>
                  <td class="col-num">{fmtNum(s.ky)}</td>
                  <td class="col-num">{fmtNum(s.kz)}</td>
                  <td><button class="adv-rm" onclick={() => removeWinklerSpring(i)}>x</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
        <button class="adv-run-btn" onclick={handleWinkler} disabled={!hasModel || solving || !wasmAvailable || winklerSprings.length === 0}>{solving ? t('pro.solving') : t('pro.solveWinkler')}</button>
      </div>
      {#if winklerResult}
        <div class="adv-result-title">{t('pro.resultWinkler')}</div>
        <!-- Winkler is a linear solve on a modified stiffness: it returns the
             results themselves, with no iteration count to report. The panel
             claimed "Convergence: No — Iterations: ?" on every successful run. -->
        <div class="adv-inline">
          {#if winklerResult.displacements?.length}
            <span>{t('pro.maxDisp')}: {fmtNum(Math.max(...winklerResult.displacements.map((d: any) => Math.hypot(d.ux ?? 0, d.uy ?? 0, d.uz ?? 0))))} m</span>
            — <span>{winklerResult.reactions?.length ?? 0} {t('results.reactions')}</span>
          {/if}
        </div>
      {/if}
      {/if}

    <!-- ── 9. SSI ── -->
      {#if advView === 'ssi'}
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">{t('pro.ssiNode')}:
            <select class="adv-sel" bind:value={ssiNodeId}>
              <option value={null}>--</option>
              {#each nodeIds as nid}<option value={nid}>{nid}</option>{/each}
            </select>
          </label>
          <label class="adv-label">Dir: <select class="adv-sel" bind:value={ssiDirection}><option value="Y">Y</option><option value="Z">Z</option></select></label>
          <label class="adv-label">{t('pro.ssiCurve')}:
            <select class="adv-sel" bind:value={ssiCurveType}>
              <option value="softClay">{t('pro.softClay')}</option>
              <option value="stiffClay">{t('pro.stiffClay')}</option>
              <option value="sand">{t('pro.sand')}</option>
            </select>
          </label>
        </div>
        {#if ssiCurveType === 'softClay' || ssiCurveType === 'stiffClay'}
          <div class="adv-form">
            <label class="adv-label">su (kPa): <input type="number" class="adv-num" bind:value={ssiSu} min={0} step={5} /></label>
            <label class="adv-label">&#947; (kN/m3): <input type="number" class="adv-num" bind:value={ssiGamma} min={0} step={1} /></label>
            <label class="adv-label">d (m): <input type="number" class="adv-num" bind:value={ssiDiameter} min={0.1} step={0.1} /></label>
            <label class="adv-label">{t('pro.depth')}: <input type="number" class="adv-num" bind:value={ssiDepth} min={0} step={0.5} /></label>
            <!-- Matlock/Reese both key the curve on ε50; it has no default in
                 the engine, so the run needs it. -->
            <label class="adv-label">&#949;50: <input type="number" class="adv-num" bind:value={ssiEps50} min={0.001} max={0.05} step={0.001} /></label>
          </div>
        {:else if ssiCurveType === 'sand'}
          <div class="adv-form">
            <label class="adv-label">&#966; (deg): <input type="number" class="adv-num" bind:value={ssiPhi} min={0} max={50} step={1} /></label>
            <label class="adv-label">&#947; (kN/m3): <input type="number" class="adv-num" bind:value={ssiGamma} min={0} step={1} /></label>
            <label class="adv-label">d (m): <input type="number" class="adv-num" bind:value={ssiDiameter} min={0.1} step={0.1} /></label>
            <label class="adv-label">{t('pro.depth')}: <input type="number" class="adv-num" bind:value={ssiDepth} min={0} step={0.5} /></label>
          </div>
        {/if}
        <div class="adv-form">
          <label class="adv-label">{t('pro.tribLength')}: <input type="number" class="adv-num" bind:value={ssiTribLength} min={0.1} step={0.5} /></label>
          <button class="adv-btn-sm" onclick={addSsiSpring} disabled={ssiNodeId == null}>{t('pro.addSpring')}</button>
        </div>
        {#if ssiSprings.length > 0}
          <table class="adv-table">
            <thead><tr><th>Nodo</th><th>Dir</th><th>Curva</th><th>L</th><th></th></tr></thead>
            <tbody>
              {#each ssiSprings as s, i}
                <tr>
                  <td class="col-id">{s.nodeId}</td>
                  <td class="col-num">{s.direction}</td>
                  <td class="col-num">{s.curve.type}</td>
                  <td class="col-num">{fmtNum(s.tributaryLength)}</td>
                  <td><button class="adv-rm" onclick={() => removeSsiSpring(i)}>x</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
        <div class="adv-form">
          <label class="adv-label">{t('pro.maxIter')}: <input type="number" class="adv-num" bind:value={ssiMaxIter} min={1} max={500} /></label>
          <label class="adv-label">{t('pro.tolerance')}: <input type="number" class="adv-num" bind:value={ssiTolerance} min={1e-8} step={1e-5} /></label>
        </div>
        <button class="adv-run-btn" onclick={handleSSI} disabled={!hasModel || solving || !wasmAvailable || ssiSprings.length === 0}>{solving ? t('pro.solving') : t('pro.solveSsi')}</button>
      </div>
      {#if ssiResult}
        <div class="adv-result-title">{t('pro.resultSsi')}</div>
        <div class="adv-inline">
          <span>{t('pro.convergence')}: {ssiResult.converged ? t('pro.yes') : t('pro.no')}</span> — <span>{t('pro.iterations')}: {ssiResult.iterations ?? '?'}</span>
          <!-- `SSIResult3D` has no maxDisplacement of its own; the
               displacements nest under `.results`. -->
          {#if ssiResult.results?.displacements?.length} — <span>{t('pro.maxDisp')}: {fmtNum(Math.max(...ssiResult.results.displacements.map((d: any) => Math.hypot(d.ux ?? 0, d.uy ?? 0, d.uz ?? 0))))} m</span>{/if}
        </div>
      {/if}
      {/if}

    <!-- ── 10. Contact / Gap ── -->
      {#if advView === 't8'}
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">{t('pro.element')}:
            <select class="adv-sel" bind:value={contactElementId}>
              <option value={null}>--</option>
              {#each elementIds as eid}<option value={eid}>{eid}</option>{/each}
            </select>
          </label>
          <label class="adv-label">{t('pro.behavior')}:
            <select class="adv-sel" bind:value={contactBehavior}>
              <option value="normal">{t('pro.normal')}</option>
              <option value="tensionOnly">{t('pro.tensionOnly')}</option>
              <option value="compressionOnly">{t('pro.compressionOnly')}</option>
            </select>
          </label>
          <button class="adv-btn-sm" onclick={setContactBehavior} disabled={contactElementId == null}>+</button>
        </div>
        {#if contactEntries.length > 0}
          <table class="adv-table">
            <thead><tr><th>Elem</th><th>{t('pro.behavior')}</th><th></th></tr></thead>
            <tbody>
              {#each contactEntries as [eid, beh]}
                <tr>
                  <td class="col-id">{eid}</td>
                  <td class="col-num">{beh === 'tensionOnly' ? t('pro.tensionOnly') : beh === 'compressionOnly' ? t('pro.compressionOnly') : t('pro.normal')}</td>
                  <td><button class="adv-rm" onclick={() => removeContactBehavior(eid)}>x</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
        <button class="adv-run-btn" onclick={handleContact} disabled={!hasModel || solving || !wasmAvailable || contactEntries.length === 0}>{solving ? t('pro.solving') : t('pro.solveContact')}</button>
      </div>
      {#if contactResult}
        <div class="adv-result-title">{t('pro.resultContact')}</div>
        <div class="adv-inline">
          <span>{t('pro.convergence')}: {contactResult.converged ? t('pro.yes') : t('pro.no')}</span> — <span>{t('pro.iterations')}: {contactResult.iterations ?? '?'}</span>
          {#if contactDeactivatedCount > 0} — <span>{t('pro.deactivatedElems')}: {contactDeactivatedCount}</span>{/if}
        </div>
      {/if}
      {/if}

    <!-- ── 11. Staged Construction ── -->
      {#if advView === 't9'}
      <div class="adv-panel">
        <button class="adv-btn-sm" onclick={addStage}>{t('pro.addStage')}</button>
        {#each stages as stage, i}
          <div class="adv-stage-card">
            <div class="adv-stage-header">
              <input type="text" class="adv-stage-name" bind:value={stage.name} />
              <button class="adv-rm" onclick={() => removeStage(i)}>x</button>
            </div>
            <div class="adv-form">
              <label class="adv-label">{t('pro.addElemIds')} <input type="text" class="adv-text" value={stage.elementsAdded.join(',')} oninput={(e) => { stage.elementsAdded = (e.target as HTMLInputElement).value.split(',').map(Number).filter(n => !isNaN(n) && n > 0); stages = [...stages]; }} /></label>
            </div>
            <div class="adv-form">
              <label class="adv-label">{t('pro.removeElemIds')} <input type="text" class="adv-text" value={stage.elementsRemoved.join(',')} oninput={(e) => { stage.elementsRemoved = (e.target as HTMLInputElement).value.split(',').map(Number).filter(n => !isNaN(n) && n > 0); stages = [...stages]; }} /></label>
            </div>
            <div class="adv-form">
              <label class="adv-label">{t('pro.loadIndices')}: <input type="text" class="adv-text" value={stage.loadIndices.join(',')} oninput={(e) => { stage.loadIndices = (e.target as HTMLInputElement).value.split(',').map(Number).filter(n => !isNaN(n) && n >= 0); stages = [...stages]; }} /></label>
            </div>
          </div>
        {/each}
        <button class="adv-run-btn" onclick={handleStaged} disabled={!hasModel || solving || !wasmAvailable || stages.length === 0}>{solving ? t('pro.solving') : t('pro.solveStaged')}</button>
      </div>
      {#if stagedResult}
        <div class="adv-result-title">{t('pro.resultStaged')}</div>
        <div class="adv-inline">
          {#if stagedResult.stages}
            <!-- `StageResult3D` is { stageName, stageIndex, results } — it has
                 no `converged`, so every stage used to render a bare
                 "solved". The per-stage peaks live under `.results`. -->
            {#each stagedResult.stages as sr, i}
              <div>{t('pro.stageN').replace('{n}', String(i + 1))}: {sr.stageName}{#if sr.results?.displacements?.length} — δmax={fmtNum(Math.max(...sr.results.displacements.map((d: any) => Math.hypot(d.ux ?? 0, d.uy ?? 0, d.uz ?? 0))))} m{/if}</div>
            {/each}
          {/if}
          <!-- The finished model's peaks live under `finalResults`; there is
               no `totalDisplacement`. -->
          {#if stagedResult.finalResults?.displacements?.length} <span>{t('pro.totalMaxDisp')}: {fmtNum(Math.max(...stagedResult.finalResults.displacements.map((d: any) => Math.hypot(d.ux ?? 0, d.uy ?? 0, d.uz ?? 0))))} m</span>{/if}
        </div>
      {/if}
      {/if}

    <!-- ── 12. Creep & Shrinkage ── -->
      {#if advView === 't10'}
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">f'c (MPa): <input type="number" class="adv-num" bind:value={creepFc} min={10} max={100} step={5} /></label>
          <label class="adv-label">HR (%): <input type="number" class="adv-num" bind:value={creepRH} min={20} max={100} step={5} /></label>
          <label class="adv-label">h0 (mm): <input type="number" class="adv-num" bind:value={creepH0} min={50} max={2000} step={10} /></label>
        </div>
        <div class="adv-form">
          <label class="adv-label">{t('pro.loadingAge')}: <input type="number" class="adv-num" bind:value={creepAge} min={1} max={10000} /></label>
          <label class="adv-label">{t('pro.cementClass')}: <select class="adv-sel" bind:value={creepCementClass}><option value="R">{t('pro.cementR')}</option><option value="N">{t('pro.cementN')}</option><option value="S">{t('pro.cementS')}</option></select></label>
        </div>
        <div class="adv-sub-title">{t('pro.timeSteps')}</div>
        {#each creepTimeSteps as step, i}
          <div class="adv-form">
            <label class="adv-label">{t('pro.timeDays')}: <input type="number" class="adv-num" bind:value={step.time} min={1} /></label>
            <button class="adv-rm" onclick={() => removeCreepStep(i)}>x</button>
          </div>
        {/each}
        <button class="adv-btn-sm" onclick={addCreepStep}>{t('pro.addStep')}</button>
        <button class="adv-run-btn" onclick={handleCreep} disabled={!hasModel || solving || !wasmAvailable || creepTimeSteps.length === 0}>{solving ? t('pro.calculating') : t('pro.calcCreep')}</button>
      </div>
      {#if creepResult}
        <div class="adv-result-title">{t('pro.resultCreep')}</div>
        <!-- Creep is reported PER STEP; there is no single φ on the result. -->
        {#if creepResult.steps?.length}
          {@const last = creepResult.steps[creepResult.steps.length - 1]}
          <div class="adv-inline">
            t={fmtNum(last.tDays)} d — {t('pro.creepCoeff')}: {fmtNum(last.creepCoefficient)}
            — {t('pro.shrinkageStrain')}: {last.shrinkageStrain.toExponential(2)}
            {#if last.displacements?.length}
              — {t('pro.finalMaxDisp')}: {fmtNum(Math.max(...last.displacements.map((d: any) => Math.hypot(d.ux ?? 0, d.uy ?? 0, d.uz ?? 0))))} m
            {/if}
          </div>
        {/if}
      {/if}
      {/if}

    <!-- ─── Divider: Herramientas avanzadas ─── -->
    <div class="adv-divider">{t('pro.advancedTools')}</div>

    <!-- ── 14. Influence Lines 3D ── -->
      {#if advView === 'influenceline3d'}
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">{t('pro.response')}:
            <select class="adv-sel" bind:value={ilResponse}>
              <option value="moment">My</option>
              <option value="shear">Vz</option>
              <option value="axial">N</option>
              <option value="reaction">Rz</option>
            </select>
          </label>
          <!-- Internal forces are read at a point ON a member; a reaction is
               read AT a support. Different target, different picker. -->
          {#if ilResponse === 'reaction'}
            <label class="adv-label">{t('pro.nodeLabel')}:
              <select class="adv-sel" bind:value={ilNodeId}>
                <option value={null}>--</option>
                {#each nodeIds as nid}<option value={nid}>{nid}</option>{/each}
              </select>
            </label>
          {:else}
            <label class="adv-label">{t('pro.element')}:
              <select class="adv-sel" bind:value={ilElementId}>
                <option value={null}>--</option>
                {#each elementIds as eid}<option value={eid}>{eid}</option>{/each}
              </select>
            </label>
            <label class="adv-label">x/L: <input type="number" class="adv-num" bind:value={ilPosition} min={0} max={1} step={0.05} /></label>
          {/if}
        </div>
        <button
          class="adv-run-btn"
          onclick={handleInfluenceLine3D}
          disabled={!hasModel || solving || !wasmAvailable || (ilResponse === 'reaction' ? ilNodeId == null : ilElementId == null)}
        >{solving ? t('pro.solving') : t('pro.computeIL')}</button>
      </div>
      {#if ilResult?.points?.length}
        <div class="adv-inline">
          {t('pro.maxPos')}: {fmtNum(Math.max(...ilResult.points.map((p: any) => p.value)))}
          — {t('pro.maxNeg')}: {fmtNum(Math.min(...ilResult.points.map((p: any) => p.value)))}
          — {ilResult.points.length} pts
        </div>
        <details>
          <summary class="adv-steps-toggle">{t('pro.ilOrdinates')}</summary>
          <div class="adv-frf-table">
            <table class="adv-table">
              <thead><tr><th>{t('pro.element')}</th><th>x/L</th><th>{t('pro.ilValue')}</th></tr></thead>
              <tbody>
                {#each ilResult.points.filter((_: any, i: number) => i % Math.max(1, Math.floor(ilResult.points.length / 25)) === 0) as pt}
                  <tr><td class="col-id">{pt.elementId}</td><td class="col-num">{pt.t.toFixed(2)}</td><td class="col-num">{fmtNum(pt.value)}</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        </details>
      {/if}
      {/if}

    <!-- ── 16. Multi-Case Solver ── -->
      {#if advView === 'multicase'}
      <div class="adv-panel">
        <p class="adv-hint">{t('pro.multiCaseHint')}</p>
        <button class="adv-run-btn" onclick={handleMultiCase} disabled={!hasModel || solving || !wasmAvailable}>{solving ? t('pro.solving') : t('pro.solveMultiCase')}</button>
      </div>
      {#if multiCaseResult}
        <div class="adv-inline">
          {#if multiCaseResult.caseResults != null}{multiCaseResult.caseResults.length} {t('pro.casesResolved')}{/if}
          {#if multiCaseResult.combinationResults != null} — {multiCaseResult.combinationResults.length} {t('pro.combos')}{/if}
        </div>
      {/if}
      {/if}

    <!-- ── 17. Section Analyzer ── -->
      {#if advView === 'sectionanalyzer'}
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">{t('pro.shape')}:
            <select class="adv-sel" bind:value={secShape}>
              <option value="rect">{t('pro.shapeRect')}</option>
              <option value="circle">{t('pro.shapeCircle')}</option>
              <option value="I">I / H</option>
              <option value="L">L</option>
              <option value="T">T</option>
              <option value="polygon">{t('pro.shapePolygon')}</option>
            </select>
          </label>
        </div>
        {#if secShape === 'rect'}
          <div class="adv-form">
            <label class="adv-label">b (m): <input type="number" class="adv-num" bind:value={secB} min={0.01} step={0.01} /></label>
            <label class="adv-label">h (m): <input type="number" class="adv-num" bind:value={secH} min={0.01} step={0.01} /></label>
          </div>
        {:else if secShape === 'circle'}
          <div class="adv-form">
            <label class="adv-label">r (m): <input type="number" class="adv-num" bind:value={secR} min={0.01} step={0.01} /></label>
          </div>
        {:else if secShape === 'I' || secShape === 'T'}
          <div class="adv-form">
            <label class="adv-label">h (m): <input type="number" class="adv-num" bind:value={secH} min={0.01} step={0.01} /></label>
            <label class="adv-label">bf (m): <input type="number" class="adv-num" bind:value={secBf} min={0.01} step={0.01} /></label>
            <label class="adv-label">tw (m): <input type="number" class="adv-num" bind:value={secTw} min={0.001} step={0.001} /></label>
            <label class="adv-label">tf (m): <input type="number" class="adv-num" bind:value={secTf} min={0.001} step={0.001} /></label>
          </div>
        {:else if secShape === 'L'}
          <div class="adv-form">
            <label class="adv-label">h (m): <input type="number" class="adv-num" bind:value={secH} min={0.01} step={0.01} /></label>
            <label class="adv-label">b (m): <input type="number" class="adv-num" bind:value={secB} min={0.01} step={0.01} /></label>
            <label class="adv-label">tw (m): <input type="number" class="adv-num" bind:value={secTw} min={0.001} step={0.001} /></label>
            <label class="adv-label">tf (m): <input type="number" class="adv-num" bind:value={secTf} min={0.001} step={0.001} /></label>
          </div>
        {:else if secShape === 'polygon'}
          <div class="adv-form">
            <label class="adv-label">{t('pro.polygonVertices')}:</label>
          </div>
          <textarea class="adv-textarea" bind:value={secPolyText} rows="2" placeholder="0,0; 0.3,0; 0.3,0.5; 0,0.5"></textarea>
        {/if}
        <button class="adv-run-btn" onclick={handleSectionAnalysis} disabled={!wasmAvailable}>{t('pro.analyzeSection')}</button>
      </div>
      {#if secResult}
        <!-- The engine names these a / yc / zc / syTop / szRight, not
             area / centroidY / wy — so area and the centroid never printed. -->
        <div class="adv-inline">
          {#if secResult.a != null}A={secResult.a.toExponential(3)} m²{/if}
          {#if secResult.iy != null} — Iy={secResult.iy.toExponential(3)} m⁴{/if}
          {#if secResult.iz != null} — Iz={secResult.iz.toExponential(3)} m⁴{/if}
        </div>
        <div class="adv-inline" style="font-size:0.62rem; opacity:0.8">
          CG: y={fmtNum(secResult.yc ?? 0)} m, z={fmtNum(secResult.zc ?? 0)} m
          {#if secResult.j != null} — J={secResult.j.toExponential(3)} m⁴{/if}
          {#if secResult.syTop != null} — Wy={secResult.syTop.toExponential(3)} m³{/if}
          {#if secResult.szRight != null} — Wz={secResult.szRight.toExponential(3)} m³{/if}
        </div>
      {/if}
      {/if}

    <!-- ── 18. Constrained Solver ── -->
      {#if advView === 'constrained'}
      <div class="adv-panel">
        <div class="adv-form">
          <!-- The engine ties the pair with a rigid link; there is no penalty
               alternative to choose between, so the selector is gone. -->
          <label class="adv-label">{t('pro.nodePairs')}:</label>
        </div>
        <textarea class="adv-textarea" bind:value={constraintPairs} rows="2" placeholder="1,5; 2,6; 3,7"></textarea>
        <p class="adv-hint">{t('pro.constrainedHint')}</p>
        <button class="adv-run-btn" onclick={handleConstrained} disabled={!hasModel || solving || !wasmAvailable || !constraintPairs.trim()}>{solving ? t('pro.solving') : t('pro.solveConstrained')}</button>
      </div>
      {#if constrainedResult}
        <div class="adv-inline">
          {#if constrainedResult.displacements?.length}
            δmax={fmtNum(Math.max(...constrainedResult.displacements.map((d: any) => Math.hypot(d.ux ?? 0, d.uy ?? 0, d.uz ?? 0))))} m
          {/if}
          <!-- Not dead: the export returns a bare AnalysisResults3D, but
               solve_constrained_3d fills its constraintForces. -->
          {#if constrainedResult.constraintForces?.length} — {constrainedResult.constraintForces.length} {t('pro.constraintForcesCount')}{/if}
        </div>
      {/if}
      {/if}

  </div>
</div>

<style>
  /* ── The analysis picker ───────────────────────────────────────────── */

  .adv-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem;
    padding: 0.35rem 0 0.45rem;
    border-bottom: 1px solid var(--st-hair);
    margin-bottom: 0.5rem;
  }

  .adv-chip {
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-family: var(--st-sans);
    font-size: 0.71rem;
    padding: 0.18rem 0.45rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .adv-chip:hover { background: var(--st-surface-3); color: var(--st-text); }
  .adv-chip.on { color: var(--st-accent); border-color: var(--st-accent); background: var(--st-selected-bg); }

  .adv-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .adv-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-surface-3);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .adv-scroll {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  /*
     A caveat, at the size of a caveat.
     ─────────────────────────────────
     It was a full-width amber strip that reappeared on every visit to the
     panel, permanently, above whatever you came to do — an announcement for
     something that is a footnote. It says the same thing in one quiet line.
  */
  .adv-wip-banner {
    display: block;
    margin: 0 0 0.5rem;
    padding: 0.1rem 0 0.3rem;
    border-bottom: 1px solid var(--st-hair);
    background: none;
    color: var(--st-text-3);
    font-size: 0.66rem;
    font-style: italic;
    text-align: left;
  }

  .adv-error {
    padding: 6px 12px;
    font-size: 0.72rem;
    color: var(--st-danger);
    background: rgba(229, 72, 42, 0.1);
    flex-shrink: 0;
  }

  .adv-wasm-warn {
    font-size: 0.65rem;
    color: var(--st-warn);
  }

  .adv-check {
    font-size: 0.7rem;
    color: var(--st-text-2);
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .adv-check input { cursor: pointer; }

  /* Groups — each analysis type */
  .adv-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--st-surface-3);
  }

  .adv-group-details {
    border-bottom: 1px solid var(--st-surface-3);
    padding: 6px 12px;
  }

  .adv-group-details > summary {
    list-style: none;
    cursor: pointer;
  }

  .adv-group-details > summary::-webkit-details-marker { display: none; }

  .adv-group-details > summary::before {
    content: '▸ ';
    font-size: 0.55rem;
    color: var(--st-text-3);
  }

  .adv-group-details[open] > summary::before {
    content: '▾ ';
  }

  .adv-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .adv-run-btn {
    padding: 5px 14px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--st-text);
    background: linear-gradient(135deg, var(--st-surface-3), var(--st-hair-strong));
    border: 1px solid var(--st-value);
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  .adv-run-btn:hover { background: linear-gradient(135deg, var(--st-info), var(--st-surface-3)); }
  .adv-run-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .adv-btn-sm {
    padding: 3px 10px;
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--st-text-2);
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    cursor: pointer;
  }

  .adv-btn-sm:hover { color: var(--st-text); border-color: var(--st-text-2); }
  .adv-btn-sm:disabled { opacity: 0.35; cursor: not-allowed; }

  .adv-title {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--st-text-2);
    user-select: none;
  }

  .adv-desc {
    font-size: 0.62rem;
    color: var(--st-text-3);
    font-style: italic;
  }

  .adv-hint {
    font-size: 0.6rem;
    color: var(--st-text-3);
    font-style: italic;
  }


  .adv-inline {
    font-size: 0.68rem;
    color: var(--st-text-2);
    padding: 2px 0;
    font-family: monospace;
  }

  .adv-divider {
    padding: 6px 12px;
    font-size: 0.6rem;
    font-weight: 600;
    color: var(--st-text-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-surface-3);
  }

  /* Forms */
  .adv-form {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .adv-label {
    font-size: 0.68rem;
    color: var(--st-text-3);
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .adv-num {
    width: 55px;
    padding: 3px 5px;
    font-size: 0.68rem;
    background: var(--st-surface);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text-2);
    text-align: right;
  }

  .adv-num-wide { width: 70px; }

  .adv-sel {
    padding: 3px 5px;
    font-size: 0.68rem;
    background: var(--st-surface);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text-2);
    cursor: pointer;
  }

  .adv-text {
    width: 120px;
    padding: 3px 5px;
    font-size: 0.68rem;
    background: var(--st-surface);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text-2);
  }

  .adv-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 0;
  }

  .adv-table-scroll {
    max-height: 150px;
    overflow-y: auto;
  }

  .adv-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.68rem;
  }

  .adv-table th {
    padding: 3px 5px;
    text-align: left;
    font-size: 0.6rem;
    font-weight: 600;
    color: var(--st-text-3);
    text-transform: uppercase;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-surface-3);
  }

  .adv-table td {
    padding: 3px 5px;
    border-bottom: 1px solid var(--st-surface-2);
    color: var(--st-text-2);
  }

  .col-id { color: var(--st-text-3); font-family: monospace; text-align: center; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.66rem; }

  .adv-rm {
    padding: 2px 6px;
    font-size: 0.62rem;
    color: var(--st-accent);
    background: transparent;
    border: 1px solid var(--st-accent);
    border-radius: 3px;
    cursor: pointer;
    line-height: 1;
  }

  .adv-rm:hover { background: rgba(229, 72, 42, 0.15); }

  .adv-accel-area {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .adv-textarea {
    width: 100%;
    padding: 4px 6px;
    font-size: 0.64rem;
    font-family: monospace;
    background: var(--st-surface-2);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text-2);
    resize: vertical;
    min-height: 32px;
  }

  .adv-textarea::placeholder { color: var(--st-text-3); }

  .adv-steps-toggle {
    font-size: 0.6rem;
    color: var(--st-ok);
    cursor: pointer;
  }

  .adv-step-line {
    font-size: 0.58rem;
    color: var(--st-text-2);
    padding: 1px 0;
  }

  .adv-sub-title {
    font-size: 0.66rem;
    font-weight: 600;
    color: var(--st-text-2);
    margin-top: 4px;
  }

  .adv-stage-card {
    background: var(--st-surface);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .adv-stage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .adv-stage-name {
    flex: 1;
    padding: 3px 5px;
    font-size: 0.68rem;
    font-weight: 600;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--st-surface-3);
    color: var(--st-text-2);
  }

  .adv-stage-name:focus { border-color: var(--st-value); outline: none; }

  .cum-ok { color: var(--st-ok); }
  .cum-warn { color: var(--st-warn); }
</style>
