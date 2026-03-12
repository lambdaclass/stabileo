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
    solveArcLength,
    solveDisplacementControl,
    solveWithImperfections3D,
    computeInfluenceLine3D,
    solveCable2D,
    guyanReduce2D,
    craigBampton2D,
    solveMultiCase2D,
    solveMultiCase3D,
    analyzeSection,
    solveConstrained2D,
    solveConstrained3D,
  } from '../../lib/engine/wasm-solver';
  // JS fallback solvers for when WASM is not available
  import { solvePDelta3D as jsPDelta3D } from '../../lib/engine/pdelta-3d';
  import { solveModal3D as jsModal3D } from '../../lib/engine/modal-3d';
  import { solveBuckling3D as jsBuckling3D } from '../../lib/engine/buckling-3d';
  import { solveSpectral3D as jsSpectral3D } from '../../lib/engine/spectral-3d';
  import type { SpectralConfig3D } from '../../lib/engine/spectral-3d';
  import { buildSolverInput3D } from '../../lib/engine/solver-service';
  import { cirsoc103Spectrum } from '../../lib/engine/spectral';
  import type { DesignSpectrum } from '../../lib/engine/spectral';
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

  let useDiaphragm = $state(false);

  function buildInput() {
    const input = buildSolverInput3D(
      { nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
        loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
        quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints },
      uiStore.includeSelfWeight,
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
      try { res = wasmPDelta3D(input); } catch { res = jsPDelta3D(input); }
      const elapsed = performance.now() - t0;
      if (typeof res === 'string') { solveError = `P-Delta: ${res}`; solving = false; return; }
      pdeltaElapsed = elapsed;
      pdeltaResult = res;
      if (res.results) {
        resultsStore.setPDeltaResult3D(res);
      }
      advancedResults = { ...advancedResults, pdelta: { converged: res.converged, iterations: res.iterations, b2Factor: res.b2Factor } };
    } catch (e: any) {
      solveError = `P-Delta: ${e.message ?? 'Error'}`;
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
      try { res = wasmModal3D(input, densities, numModes); } catch { res = jsModal3D(input, densities, numModes); }
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
      solveError = `Modal: ${e.message ?? 'Error'}`;
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
      try {
        res = wasmSpectral3D({
          solver: input,
          densities,
          spectrum,
          directions: ['X', 'Y', 'Z'],
          combination: spectralCombination,
          numModes,
        });
      } catch {
        // JS fallback: solveSpectral3D(input, modalResult, densities, config) per direction
        const config: SpectralConfig3D = {
          direction: 'X',
          spectrum,
          rule: spectralCombination,
        };
        const resX = jsSpectral3D(input, modalResult, densities, { ...config, direction: 'X' });
        const resY = jsSpectral3D(input, modalResult, densities, { ...config, direction: 'Y' });
        if (typeof resX === 'string') { solveError = `Espectral: ${resX}`; solving = false; return; }
        if (typeof resY === 'string') { solveError = `Espectral: ${resY}`; solving = false; return; }
        res = {
          baseShearX: resX.baseShear,
          baseShearY: resY.baseShear,
          results: resX.results,
          perModeX: resX.perMode,
          perModeY: resY.perMode,
        };
      }
      if (typeof res === 'string') { solveError = `Espectral: ${res}`; solving = false; return; }
      spectralResult = res;
      advancedResults = { ...advancedResults, spectral: { baseShearX: res.baseShearX ?? res.baseShear, baseShearY: res.baseShearY, baseShearZ: res.baseShearZ } };
    } catch (e: any) {
      solveError = `Espectral: ${e.message ?? 'Error'}`;
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
      try { res = wasmBuckling3D(input, numBucklingModes); } catch { res = jsBuckling3D(input, numBucklingModes); }
      const elapsed = performance.now() - t0;
      if (typeof res === 'string') { solveError = `Buckling: ${res}`; solving = false; return; }
      bucklingElapsed = elapsed;
      bucklingResult = res;
      const factors = res.factors ?? res.eigenvalues ?? (res.modes?.map((m: any) => m.loadFactor ?? m.factor ?? m.eigenvalue) ?? []);
      advancedResults = { ...advancedResults, buckling: { factors } };
    } catch (e: any) {
      solveError = `Buckling: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }

  // ─── 5. Time History ──────────────────────────────────────────

  let thDt = $state(0.01);
  let thNSteps = $state(200);
  let thDir = $state<'X' | 'Y'>('X');
  let thDamping = $state(0.05);
  let thMethod = $state<'newmark' | 'hht'>('newmark');
  let thAccelText = $state('');
  let thResult = $state<any | null>(null);
  let thUseSine = $state(false);
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
        groundAccel,
        groundDirection: thDir,
      });
      thResult = res;
    } catch (e: any) {
      solveError = `Time History: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }

  // ─── 6b. Harmonic Response ───────────────────────────────────

  let harmFMin = $state(0.1);
  let harmFMax = $state(50);
  let harmNPoints = $state(200);
  let harmDamping = $state(0.05);
  let harmDir = $state<'X' | 'Y' | 'Z'>('X');
  let harmResult = $state<any | null>(null);

  function handleHarmonic() {
    solveError = null;
    solving = true;
    harmonicElapsed = null;
    try {
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      const densities: Record<string, number> = {};
      for (const [id, mat] of modelStore.materials) {
        densities[String(id)] = (mat as any).rho ?? 0;
      }
      const t0 = performance.now();
      const res = solveHarmonic3D({
        solver: input,
        densities,
        fMin: harmFMin,
        fMax: harmFMax,
        nPoints: harmNPoints,
        dampingXi: harmDamping,
        direction: harmDir,
      });
      const elapsed = performance.now() - t0;
      harmonicElapsed = elapsed;
      harmResult = res;
    } catch (e: any) {
      solveError = `Harmónico: ${e.message ?? 'Error'}`;
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
      solveError = `No lineal: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }

  // ─── 7b. Arc-Length ──────────────────────────────────────────

  let arcMaxIter = $state(50);
  let arcTol = $state(1e-6);
  let arcIncrements = $state(20);
  let arcResult = $state<any | null>(null);

  function handleArcLength() {
    solveError = null;
    solving = true;
    try {
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      arcResult = solveArcLength({
        solver: input,
        maxIter: arcMaxIter,
        tolerance: arcTol,
        nIncrements: arcIncrements,
      });
    } catch (e: any) {
      solveError = `Arc-Length: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }

  // ─── 7c. Displacement Control ──────────────────────────────

  let dcNodeId = $state<number | null>(null);
  let dcDof = $state<'ux' | 'uy' | 'uz'>('uy');
  let dcTargetDisp = $state(-0.05);
  let dcIncrements = $state(20);
  let dcResult = $state<any | null>(null);

  function handleDispControl() {
    solveError = null;
    solving = true;
    try {
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      dcResult = solveDisplacementControl({
        solver: input,
        controlNode: dcNodeId,
        controlDof: dcDof,
        targetDisplacement: dcTargetDisp,
        nIncrements: dcIncrements,
      });
    } catch (e: any) {
      solveError = `Disp. Control: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }

  // ─── 7d. Imperfections ─────────────────────────────────────

  let imperfType = $state<'global' | 'local'>('global');
  let imperfAmplitude = $state(0.001);
  let imperfResult = $state<any | null>(null);

  function handleImperfections() {
    solveError = null;
    solving = true;
    try {
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      imperfResult = solveWithImperfections3D({
        solver: input,
        type: imperfType,
        amplitude: imperfAmplitude,
      });
    } catch (e: any) {
      solveError = `Imperfecciones: ${e.message ?? 'Error'}`;
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
      winklerResult = res;
      if (res.results) resultsStore.setResults3D(res.results);
    } catch (e: any) {
      solveError = `Winkler: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }

  // ─── 9. SSI ────────────────────────────────────────────────────

  let ssiNodeId = $state<number | null>(null);
  let ssiDirection = $state<'Y' | 'Z'>('Y');
  let ssiCurveType = $state<'softClay' | 'sand' | 'stiffClay' | 'custom'>('softClay');
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

  function addSsiSpring() {
    if (ssiNodeId == null) return;
    const params: any = { type: ssiCurveType };
    if (ssiCurveType === 'softClay' || ssiCurveType === 'stiffClay') {
      params.su = ssiSu; params.gamma = ssiGamma; params.d = ssiDiameter; params.depth = ssiDepth;
    } else if (ssiCurveType === 'sand') {
      params.phi = ssiPhi; params.gamma = ssiGamma; params.d = ssiDiameter; params.depth = ssiDepth;
    }
    ssiSprings = [...ssiSprings, { nodeId: ssiNodeId, direction: ssiDirection, curve: params, tributaryLength: ssiTribLength }];
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
      solveError = `SSI: ${e.message ?? 'Error'}`;
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

  function handleContact() {
    solveError = null;
    solving = true;
    try {
      const input = buildInput();
      const elements: any[] = [];
      for (const [elementId, behavior] of contactBehaviors) {
        elements.push({ elementId, behavior });
      }
      const res = solveContact3D({ solver: input, contactElements: elements });
      contactResult = res;
      if (res.results) resultsStore.setResults3D(res.results);
    } catch (e: any) {
      solveError = `Contacto: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }

  // ─── 11. Staged Construction ───────────────────────────────────

  let stages = $state<{ name: string; addElements: number[]; removeElements: number[]; loadIndices: number[] }[]>([]);
  let stagedResult = $state<any | null>(null);

  function addStage() {
    stages = [...stages, { name: t('pro.stageN').replace('{n}', String(stages.length + 1)), addElements: [], removeElements: [], loadIndices: [] }];
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
        stages: stages.map(s => ({ addElements: s.addElements, removeElements: s.removeElements, loadIndices: s.loadIndices })),
      });
      stagedResult = res;
      if (res.results) resultsStore.setResults3D(res.results);
    } catch (e: any) {
      solveError = `Etapas: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }

  // ─── 12. Creep & Shrinkage ─────────────────────────────────────

  let creepFc = $state(30);
  let creepRH = $state(60);
  let creepH0 = $state(200);
  let creepAge = $state(28);
  let creepCementClass = $state<'R' | 'N' | 'S'>('N');
  let creepTimeSteps = $state<{ time: number; additionalLoadFactor: number }[]>([
    { time: 365, additionalLoadFactor: 0 },
  ]);
  let creepResult = $state<any | null>(null);

  function addCreepStep() {
    const lastTime = creepTimeSteps.length > 0 ? creepTimeSteps[creepTimeSteps.length - 1].time : 0;
    creepTimeSteps = [...creepTimeSteps, { time: lastTime + 365, additionalLoadFactor: 0 }];
  }

  function removeCreepStep(idx: number) {
    creepTimeSteps = creepTimeSteps.filter((_, i) => i !== idx);
  }

  function handleCreep() {
    solveError = null;
    solving = true;
    try {
      const input = buildInput();
      creepResult = solveCreepShrinkage3D({
        solver: input,
        concrete: { fc: creepFc, rh: creepRH, h0: creepH0, ageAtLoading: creepAge, cementClass: creepCementClass },
        timeSteps: creepTimeSteps,
      });
    } catch (e: any) {
      solveError = `Fluencia: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }

  // ─── 13. Cable Analysis (2D) ──────────────────────────────────

  let cableMaxIter = $state(50);
  let cableTol = $state(1e-6);
  let cableResult = $state<any | null>(null);

  function handleCable() {
    solveError = null;
    solving = true;
    try {
      // Cable analysis is 2D-only — uses buildSolverInput from modelStore
      const input = modelStore.buildSolverInput(true); // always include self-weight for cables
      if (!input) { solveError = t('advanced.emptyModel'); solving = false; return; }
      cableResult = solveCable2D(input, cableMaxIter, cableTol);
    } catch (e: any) {
      solveError = `Cable: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }

  // ─── 14. Influence Lines 3D ──────────────────────────────────

  let ilElementId = $state<number | null>(null);
  let ilResponse = $state<'moment' | 'shear' | 'axial' | 'reaction'>('moment');
  let ilResult = $state<any | null>(null);

  function handleInfluenceLine3D() {
    solveError = null;
    solving = true;
    try {
      let input = buildInput();
      input = maybeApplyDiaphragm(input);
      ilResult = computeInfluenceLine3D({
        solver: input,
        elementId: ilElementId,
        responseType: ilResponse,
      });
    } catch (e: any) {
      solveError = `Influence Line 3D: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }

  // ─── 15. Model Reduction ─────────────────────────────────────

  let reductionMethod = $state<'guyan' | 'craigBampton'>('guyan');
  let retainedDofs = $state('');   // comma-separated DOF indices
  let numCBModes = $state(10);
  let reductionResult = $state<any | null>(null);

  function handleModelReduction() {
    solveError = null;
    solving = true;
    try {
      const retained = retainedDofs.split(/[,\s]+/).map(Number).filter(n => !isNaN(n) && n >= 0);
      if (retained.length === 0) {
        solveError = t('pro.noRetainedDofs');
        solving = false;
        return;
      }
      // Model reduction is 2D only
      const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
      if (!input) { solveError = t('advanced.emptyModel'); solving = false; return; }
      if (reductionMethod === 'guyan') {
        reductionResult = guyanReduce2D({ solver: input, retainedDofs: retained });
      } else {
        reductionResult = craigBampton2D({ solver: input, retainedDofs: retained, numModes: numCBModes });
      }
    } catch (e: any) {
      solveError = `Model Reduction: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }

  // ─── 16. Multi-Case Solver ──────────────────────────────────

  let multiCaseResult = $state<any | null>(null);

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
      const is3DMode = modelStore.nodes.size > 0 && [...modelStore.nodes.values()].some(n => (n.z ?? 0) !== 0);
      if (is3DMode) {
        let input = buildInput();
        input = maybeApplyDiaphragm(input);
        multiCaseResult = solveMultiCase3D({ solver: input, caseIds: cases.map(c => c.id) });
      } else {
        const input2D = modelStore.buildSolverInput(uiStore.includeSelfWeight);
        if (!input2D) { solveError = t('advanced.emptyModel'); solving = false; return; }
        multiCaseResult = solveMultiCase2D({ solver: input2D, caseIds: cases.map(c => c.id) });
      }
    } catch (e: any) {
      solveError = `Multi-Case: ${e.message ?? 'Error'}`;
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

  function handleSectionAnalysis() {
    solveError = null;
    try {
      let geometry: any;
      switch (secShape) {
        case 'rect': geometry = { shape: 'rect', b: secB, h: secH }; break;
        case 'circle': geometry = { shape: 'circle', r: secR }; break;
        case 'I': geometry = { shape: 'I', h: secH, b: secBf, tw: secTw, tf: secTf }; break;
        case 'L': geometry = { shape: 'L', h: secH, b: secB, tw: secTw, tf: secTf }; break;
        case 'T': geometry = { shape: 'T', h: secH, b: secBf, tw: secTw, tf: secTf }; break;
        case 'polygon': {
          const pts = secPolyText.split(';').map(p => {
            const [x, y] = p.trim().split(',').map(Number);
            return { x: x ?? 0, y: y ?? 0 };
          }).filter(p => !isNaN(p.x) && !isNaN(p.y));
          if (pts.length < 3) { solveError = t('pro.needPolygonPts'); return; }
          geometry = { shape: 'polygon', vertices: pts };
          break;
        }
      }
      secResult = analyzeSection(geometry);
    } catch (e: any) {
      solveError = `Section: ${e.message ?? 'Error'}`;
    }
  }

  // ─── 18. Constrained Solver ────────────────────────────────

  let constraintType = $state<'rigid' | 'penalty'>('rigid');
  let constraintPairs = $state('');  // "nodeA,nodeB; nodeC,nodeD; ..."
  let constrainedResult = $state<any | null>(null);

  function handleConstrained() {
    solveError = null;
    solving = true;
    try {
      const pairs = constraintPairs.split(';').map(p => {
        const [a, b] = p.trim().split(',').map(Number);
        return { nodeA: a, nodeB: b };
      }).filter(p => !isNaN(p.nodeA) && !isNaN(p.nodeB));
      if (pairs.length === 0) {
        solveError = t('pro.needConstraintPairs');
        solving = false;
        return;
      }
      const is3DMode = modelStore.nodes.size > 0 && [...modelStore.nodes.values()].some(n => (n.z ?? 0) !== 0);
      let res: any;
      if (is3DMode) {
        let input = buildInput();
        input = maybeApplyDiaphragm(input);
        res = solveConstrained3D({ solver: input, constraints: pairs, method: constraintType });
      } else {
        const input2D = modelStore.buildSolverInput(uiStore.includeSelfWeight);
        if (!input2D) { solveError = t('advanced.emptyModel'); solving = false; return; }
        res = solveConstrained2D({ solver: input2D, constraints: pairs, method: constraintType });
      }
      constrainedResult = res;
      if (res.results) {
        is3DMode ? resultsStore.setResults3D(res.results) : resultsStore.setResults(res.results);
      }
    } catch (e: any) {
      solveError = `Constrained: ${e.message ?? 'Error'}`;
    }
    solving = false;
  }
</script>

<div class="adv-tab">
  <!-- Global options -->
  <div class="adv-header">
    <label class="adv-check">
      <input type="checkbox" bind:checked={uiStore.includeSelfWeight} />
      {t('pro.selfWeightLabel')}
    </label>
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
    <details class="adv-group-details">
      <summary class="adv-title">Time History</summary>
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">dt (s): <input type="number" class="adv-num" bind:value={thDt} min={0.001} max={1} step={0.001} /></label>
          <label class="adv-label">Pasos: <input type="number" class="adv-num adv-num-wide" bind:value={thNSteps} min={1} max={10000} /></label>
          <label class="adv-label">Dir: <select class="adv-sel" bind:value={thDir}><option value="X">X</option><option value="Y">Y</option></select></label>
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
          {#if thResult.peakDisplacement != null}δmax={fmtNum(thResult.peakDisplacement)} m{/if}
          {#if thResult.peakBaseShear != null} — Vb={fmtNum(thResult.peakBaseShear)} kN{/if}
          {#if thResult.timeAtPeak != null} — t={fmtNum(thResult.timeAtPeak)} s{/if}
        </div>
      {/if}
    </details>

    <!-- ── 6b. Harmonic Response ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.harmonicTitle')}</summary>
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">f min (Hz): <input type="number" class="adv-num" bind:value={harmFMin} min={0.01} max={100} step={0.1} /></label>
          <label class="adv-label">f max (Hz): <input type="number" class="adv-num" bind:value={harmFMax} min={0.1} max={500} step={1} /></label>
          <label class="adv-label">Puntos: <input type="number" class="adv-num" bind:value={harmNPoints} min={10} max={2000} step={10} /></label>
          <label class="adv-label">&#x03BE;: <input type="number" class="adv-num" bind:value={harmDamping} min={0} max={1} step={0.01} /></label>
          <label class="adv-label">Dir: <select class="adv-sel" bind:value={harmDir}><option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option></select></label>
        </div>
        <button class="adv-run-btn" onclick={handleHarmonic} disabled={!hasModel || solving || !wasmAvailable}>{solving ? t('pro.solving') : t('pro.runHarmonic')}</button>
      </div>
      {#if harmResult}
        <div class="adv-inline">
          {#if harmResult.peakAmplitude != null}{t('pro.peakAmplitude')}: {fmtNum(harmResult.peakAmplitude)} m{/if}
          {#if harmResult.resonanceFreq != null} — f_res={fmtNum(harmResult.resonanceFreq)} Hz{/if}
          {#if harmResult.peakDynamicFactor != null} — DAF={fmtNum(harmResult.peakDynamicFactor)}{/if}
          {#if harmonicElapsed != null} — {harmonicElapsed >= 1000 ? (harmonicElapsed / 1000).toFixed(2) + ' s' : harmonicElapsed.toFixed(0) + ' ms'} (WASM){/if}
        </div>
        {#if harmResult.frf?.length}
          <details>
            <summary class="adv-steps-toggle">{t('pro.frfCurve')}</summary>
            <div class="adv-frf-table">
              <table class="adv-table">
                <thead><tr><th>f (Hz)</th><th>|H| (m/kN)</th></tr></thead>
                <tbody>
                  {#each harmResult.frf.filter((_: any, i: number) => i % Math.max(1, Math.floor(harmResult.frf.length / 20)) === 0) as pt}
                    <tr><td class="col-num">{fmtNum(pt.frequency)}</td><td class="col-num">{pt.amplitude.toExponential(3)}</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>
        {/if}
      {/if}
    </details>

    <!-- ── 7. Nonlinear ── -->
    <details class="adv-group-details">
      <summary class="adv-title">No lineal</summary>
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
        <div class="adv-inline">
          {#if nlResult.converged != null}{nlResult.converged ? t('pro.converged') : t('pro.notConverged')}{/if}
          {#if nlResult.loadFactor != null} — λ={fmtNum(nlResult.loadFactor)}{/if}
          {#if nlResult.maxDisplacement != null} — δmax={fmtNum(nlResult.maxDisplacement)} m{/if}
          {#if nlResult.numHinges != null} — {nlResult.numHinges} {t('pro.hinges')}{/if}
        </div>
      {/if}
    </details>

    <!-- ── 7b. Arc-Length ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.arcLengthTitle')}</summary>
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">Max iter: <input type="number" class="adv-num" bind:value={arcMaxIter} min={1} max={500} /></label>
          <label class="adv-label">Tol: <input type="number" class="adv-num adv-num-wide" bind:value={arcTol} min={1e-12} max={1} step={1e-6} /></label>
          <label class="adv-label">Incr: <input type="number" class="adv-num" bind:value={arcIncrements} min={1} max={200} /></label>
        </div>
        <button class="adv-run-btn" onclick={handleArcLength} disabled={!hasModel || solving || !wasmAvailable}>{solving ? t('pro.solving') : t('pro.runArcLength')}</button>
      </div>
      {#if arcResult}
        <div class="adv-inline">
          {#if arcResult.converged != null}{arcResult.converged ? t('pro.yes') : t('pro.no')}{/if}
          {#if arcResult.loadFactor != null} — λ={fmtNum(arcResult.loadFactor)}{/if}
          {#if arcResult.maxDisplacement != null} — δmax={fmtNum(arcResult.maxDisplacement)} m{/if}
          {#if arcResult.steps != null} — {arcResult.steps.length} {t('pro.steps')}{/if}
        </div>
      {/if}
    </details>

    <!-- ── 7c. Displacement Control ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.dispControlTitle')}</summary>
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">{t('pro.nodeLabel')}:
            <select class="adv-sel" bind:value={dcNodeId}>
              <option value={null}>--</option>
              {#each nodeIds as nid}<option value={nid}>{nid}</option>{/each}
            </select>
          </label>
          <label class="adv-label">DOF: <select class="adv-sel" bind:value={dcDof}><option value="ux">ux</option><option value="uy">uy</option><option value="uz">uz</option></select></label>
          <label class="adv-label">δ (m): <input type="number" class="adv-num" bind:value={dcTargetDisp} step={0.001} /></label>
          <label class="adv-label">Incr: <input type="number" class="adv-num" bind:value={dcIncrements} min={1} max={200} /></label>
        </div>
        <button class="adv-run-btn" onclick={handleDispControl} disabled={!hasModel || solving || !wasmAvailable || dcNodeId == null}>{solving ? t('pro.solving') : t('pro.runDispControl')}</button>
      </div>
      {#if dcResult}
        <div class="adv-inline">
          {#if dcResult.converged != null}{dcResult.converged ? t('pro.yes') : t('pro.no')}{/if}
          {#if dcResult.finalLoad != null} — P={fmtNum(dcResult.finalLoad)} kN{/if}
          {#if dcResult.maxDisplacement != null} — δmax={fmtNum(dcResult.maxDisplacement)} m{/if}
        </div>
      {/if}
    </details>

    <!-- ── 7d. Imperfections ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.imperfectionsTitle')}</summary>
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">{t('pro.imperfType')}:
            <select class="adv-sel" bind:value={imperfType}>
              <option value="global">Global (sway)</option>
              <option value="local">Local (bow)</option>
            </select>
          </label>
          <label class="adv-label">{t('pro.amplitude')} (L/...): <input type="number" class="adv-num" bind:value={imperfAmplitude} min={0.0001} max={0.1} step={0.0001} /></label>
        </div>
        <button class="adv-run-btn" onclick={handleImperfections} disabled={!hasModel || solving || !wasmAvailable}>{solving ? t('pro.solving') : t('pro.runImperfections')}</button>
      </div>
      {#if imperfResult}
        <div class="adv-inline">
          {#if imperfResult.maxAdditionalMoment != null}ΔM_max={fmtNum(imperfResult.maxAdditionalMoment)} kN·m{/if}
          {#if imperfResult.maxLateralForce != null} — H_imp={fmtNum(imperfResult.maxLateralForce)} kN{/if}
          {#if imperfResult.imperfectionShape != null} — {imperfResult.imperfectionShape.length} {t('pro.nodes')}{/if}
        </div>
      {/if}
    </details>

    <!-- ─── Divider: Modelado especial ─── -->
    <div class="adv-divider">Modelado especial</div>

    <!-- ── 8. Winkler Foundation ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.winklerFoundation')}</summary>
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
        <div class="adv-inline">
          <span>{t('pro.convergence')}: {winklerResult.converged ? t('pro.yes') : t('pro.no')}</span> — <span>{t('pro.iterations')}: {winklerResult.iterations ?? '?'}</span>
          {#if winklerResult.maxDisplacement != null} — <span>{t('pro.maxDisp')}: {fmtNum(winklerResult.maxDisplacement)} m</span>{/if}
        </div>
      {/if}
    </details>

    <!-- ── 9. SSI ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.ssiTitle')}</summary>
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
              <option value="custom">{t('pro.customCurve')}</option>
            </select>
          </label>
        </div>
        {#if ssiCurveType === 'softClay' || ssiCurveType === 'stiffClay'}
          <div class="adv-form">
            <label class="adv-label">su (kPa): <input type="number" class="adv-num" bind:value={ssiSu} min={0} step={5} /></label>
            <label class="adv-label">&#947; (kN/m3): <input type="number" class="adv-num" bind:value={ssiGamma} min={0} step={1} /></label>
            <label class="adv-label">d (m): <input type="number" class="adv-num" bind:value={ssiDiameter} min={0.1} step={0.1} /></label>
            <label class="adv-label">{t('pro.depth')}: <input type="number" class="adv-num" bind:value={ssiDepth} min={0} step={0.5} /></label>
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
          {#if ssiResult.maxDisplacement != null} — <span>{t('pro.maxDisp')}: {fmtNum(ssiResult.maxDisplacement)} m</span>{/if}
        </div>
      {/if}
    </details>

    <!-- ── 10. Contact / Gap ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.contactGap')}</summary>
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
          {#if contactResult.deactivated} — <span>{t('pro.deactivatedElems')}: {contactResult.deactivated.length}</span>{/if}
        </div>
      {/if}
    </details>

    <!-- ── 11. Staged Construction ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.stagedConstruction')}</summary>
      <div class="adv-panel">
        <button class="adv-btn-sm" onclick={addStage}>{t('pro.addStage')}</button>
        {#each stages as stage, i}
          <div class="adv-stage-card">
            <div class="adv-stage-header">
              <input type="text" class="adv-stage-name" bind:value={stage.name} />
              <button class="adv-rm" onclick={() => removeStage(i)}>x</button>
            </div>
            <div class="adv-form">
              <label class="adv-label">{t('pro.addElemIds')} <input type="text" class="adv-text" value={stage.addElements.join(',')} oninput={(e) => { stage.addElements = (e.target as HTMLInputElement).value.split(',').map(Number).filter(n => !isNaN(n) && n > 0); stages = [...stages]; }} /></label>
            </div>
            <div class="adv-form">
              <label class="adv-label">{t('pro.removeElemIds')} <input type="text" class="adv-text" value={stage.removeElements.join(',')} oninput={(e) => { stage.removeElements = (e.target as HTMLInputElement).value.split(',').map(Number).filter(n => !isNaN(n) && n > 0); stages = [...stages]; }} /></label>
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
            {#each stagedResult.stages as sr, i}
              <div>{t('pro.stageN').replace('{n}', String(i + 1))}: {sr.converged != null ? (sr.converged ? t('pro.ok') : t('pro.noConv')) : t('pro.solved')}</div>
            {/each}
          {/if}
          {#if stagedResult.totalDisplacement != null} <span>{t('pro.totalMaxDisp')}: {fmtNum(stagedResult.totalDisplacement)} m</span>{/if}
        </div>
      {/if}
    </details>

    <!-- ── 12. Creep & Shrinkage ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.creepShrinkage')}</summary>
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
            <label class="adv-label">{t('pro.addLoadFactor')}: <input type="number" class="adv-num" bind:value={step.additionalLoadFactor} min={0} step={0.1} /></label>
            <button class="adv-rm" onclick={() => removeCreepStep(i)}>x</button>
          </div>
        {/each}
        <button class="adv-btn-sm" onclick={addCreepStep}>{t('pro.addStep')}</button>
        <button class="adv-run-btn" onclick={handleCreep} disabled={!hasModel || solving || !wasmAvailable || creepTimeSteps.length === 0}>{solving ? t('pro.calculating') : t('pro.calcCreep')}</button>
      </div>
      {#if creepResult}
        <div class="adv-result-title">{t('pro.resultCreep')}</div>
        <div class="adv-inline">
          {#if creepResult.phiCreep != null}{t('pro.creepCoeff')}: {fmtNum(creepResult.phiCreep)}{/if}
          {#if creepResult.shrinkageStrain != null} — {t('pro.shrinkageStrain')}: {creepResult.shrinkageStrain.toExponential(2)}{/if}
          {#if creepResult.maxDisplacement != null} — {t('pro.finalMaxDisp')}: {fmtNum(creepResult.maxDisplacement)} m{/if}
        </div>
      {/if}
    </details>

    <!-- ─── Divider: Herramientas avanzadas ─── -->
    <div class="adv-divider">{t('pro.advancedTools')}</div>

    <!-- ── 13. Cable (2D) ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.cableTitle')}</summary>
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">{t('pro.maxIter')}: <input type="number" class="adv-num" bind:value={cableMaxIter} min={1} max={500} /></label>
          <label class="adv-label">{t('pro.tolerance')}: <input type="number" class="adv-num adv-num-wide" bind:value={cableTol} min={1e-12} max={1} step={1e-6} /></label>
        </div>
        <p class="adv-hint">{t('pro.cableHint')}</p>
        <button class="adv-run-btn" onclick={handleCable} disabled={!hasModel || solving || !wasmAvailable}>{solving ? t('pro.solving') : t('pro.solveCable')}</button>
      </div>
      {#if cableResult}
        <div class="adv-inline">
          {#if cableResult.converged != null}{cableResult.converged ? t('pro.yes') : t('pro.no')}{/if}
          {#if cableResult.maxSag != null} — {t('pro.maxSag')}: {fmtNum(cableResult.maxSag)} m{/if}
          {#if cableResult.maxTension != null} — T_max={fmtNum(cableResult.maxTension)} kN{/if}
        </div>
      {/if}
    </details>

    <!-- ── 14. Influence Lines 3D ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.influenceLine3dTitle')}</summary>
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">{t('pro.element')}:
            <select class="adv-sel" bind:value={ilElementId}>
              <option value={null}>--</option>
              {#each elementIds as eid}<option value={eid}>{eid}</option>{/each}
            </select>
          </label>
          <label class="adv-label">{t('pro.response')}:
            <select class="adv-sel" bind:value={ilResponse}>
              <option value="moment">M</option>
              <option value="shear">V</option>
              <option value="axial">N</option>
              <option value="reaction">R</option>
            </select>
          </label>
        </div>
        <button class="adv-run-btn" onclick={handleInfluenceLine3D} disabled={!hasModel || solving || !wasmAvailable || ilElementId == null}>{solving ? t('pro.solving') : t('pro.computeIL')}</button>
      </div>
      {#if ilResult}
        <div class="adv-inline">
          {#if ilResult.maxPositive != null}{t('pro.maxPos')}: {fmtNum(ilResult.maxPositive)}{/if}
          {#if ilResult.maxNegative != null} — {t('pro.maxNeg')}: {fmtNum(ilResult.maxNegative)}{/if}
        </div>
        {#if ilResult.ordinates?.length}
          <details>
            <summary class="adv-steps-toggle">{t('pro.ilOrdinates')}</summary>
            <div class="adv-frf-table">
              <table class="adv-table">
                <thead><tr><th>{t('pro.nodeLabel')}</th><th>{t('pro.ilValue')}</th></tr></thead>
                <tbody>
                  {#each ilResult.ordinates as pt}
                    <tr><td class="col-id">{pt.nodeId ?? pt.position?.toFixed(2) ?? '?'}</td><td class="col-num">{fmtNum(pt.value)}</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>
        {/if}
      {/if}
    </details>

    <!-- ── 15. Model Reduction ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.modelReductionTitle')}</summary>
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">{t('pro.method')}:
            <select class="adv-sel" bind:value={reductionMethod}>
              <option value="guyan">Guyan (estático)</option>
              <option value="craigBampton">Craig-Bampton</option>
            </select>
          </label>
        </div>
        <div class="adv-form">
          <label class="adv-label">{t('pro.retainedDofs')}: <input type="text" class="adv-text" bind:value={retainedDofs} placeholder="0,1,2,6,7,8..." /></label>
        </div>
        {#if reductionMethod === 'craigBampton'}
          <div class="adv-form">
            <label class="adv-label">{t('pro.numCBModes')}: <input type="number" class="adv-num" bind:value={numCBModes} min={1} max={100} /></label>
          </div>
        {/if}
        <p class="adv-hint">{t('pro.reductionHint')}</p>
        <button class="adv-run-btn" onclick={handleModelReduction} disabled={!hasModel || solving || !wasmAvailable}>{solving ? t('pro.solving') : t('pro.reduce')}</button>
      </div>
      {#if reductionResult}
        <div class="adv-inline">
          {#if reductionResult.originalSize != null}DOF orig: {reductionResult.originalSize}{/if}
          {#if reductionResult.reducedSize != null} → red: {reductionResult.reducedSize}{/if}
          {#if reductionResult.ratio != null} ({(reductionResult.ratio * 100).toFixed(0)}%){/if}
        </div>
      {/if}
    </details>

    <!-- ── 16. Multi-Case Solver ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.multiCaseTitle')}</summary>
      <div class="adv-panel">
        <p class="adv-hint">{t('pro.multiCaseHint')}</p>
        <button class="adv-run-btn" onclick={handleMultiCase} disabled={!hasModel || solving || !wasmAvailable}>{solving ? t('pro.solving') : t('pro.solveMultiCase')}</button>
      </div>
      {#if multiCaseResult}
        <div class="adv-inline">
          {#if multiCaseResult.cases != null}{multiCaseResult.cases.length} {t('pro.casesResolved')}{/if}
          {#if multiCaseResult.maxDisplacement != null} — δmax={fmtNum(multiCaseResult.maxDisplacement)} m{/if}
        </div>
      {/if}
    </details>

    <!-- ── 17. Section Analyzer ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.sectionAnalyzerTitle')}</summary>
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
        <div class="adv-inline">
          {#if secResult.area != null}A={secResult.area.toExponential(3)} m²{/if}
          {#if secResult.iy != null} — Iy={secResult.iy.toExponential(3)} m⁴{/if}
          {#if secResult.iz != null} — Iz={secResult.iz.toExponential(3)} m⁴{/if}
        </div>
        {#if secResult.centroidY != null || secResult.centroidZ != null}
          <div class="adv-inline" style="font-size:0.62rem; opacity:0.8">
            CG: y={fmtNum(secResult.centroidY ?? 0)} m, z={fmtNum(secResult.centroidZ ?? 0)} m
            {#if secResult.j != null} — J={secResult.j.toExponential(3)} m⁴{/if}
            {#if secResult.wy != null} — Wy={secResult.wy.toExponential(3)} m³{/if}
            {#if secResult.wz != null} — Wz={secResult.wz.toExponential(3)} m³{/if}
          </div>
        {/if}
      {/if}
    </details>

    <!-- ── 18. Constrained Solver ── -->
    <details class="adv-group-details">
      <summary class="adv-title">{t('pro.constrainedTitle')}</summary>
      <div class="adv-panel">
        <div class="adv-form">
          <label class="adv-label">{t('pro.constraintMethod')}:
            <select class="adv-sel" bind:value={constraintType}>
              <option value="rigid">{t('pro.rigidLink')}</option>
              <option value="penalty">{t('pro.penaltyMethod')}</option>
            </select>
          </label>
        </div>
        <div class="adv-form">
          <label class="adv-label">{t('pro.nodePairs')}:</label>
        </div>
        <textarea class="adv-textarea" bind:value={constraintPairs} rows="2" placeholder="1,5; 2,6; 3,7"></textarea>
        <p class="adv-hint">{t('pro.constrainedHint')}</p>
        <button class="adv-run-btn" onclick={handleConstrained} disabled={!hasModel || solving || !wasmAvailable}>{solving ? t('pro.solving') : t('pro.solveConstrained')}</button>
      </div>
      {#if constrainedResult}
        <div class="adv-inline">
          {#if constrainedResult.converged != null}{constrainedResult.converged ? t('pro.yes') : t('pro.no')}{/if}
          {#if constrainedResult.maxDisplacement != null} — δmax={fmtNum(constrainedResult.maxDisplacement)} m{/if}
          {#if constrainedResult.constraintForces?.length} — {constrainedResult.constraintForces.length} {t('pro.constraintForcesCount')}{/if}
        </div>
      {/if}
    </details>

  </div>
</div>

<style>
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
    background: #0d1b33;
    border-bottom: 1px solid #1a3a5a;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .adv-scroll {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .adv-wip-banner {
    padding: 7px 12px;
    font-size: 0.72rem;
    color: #f0c040;
    background: rgba(240, 192, 64, 0.08);
    border-bottom: 1px solid rgba(240, 192, 64, 0.15);
    flex-shrink: 0;
    text-align: center;
  }

  .adv-error {
    padding: 6px 12px;
    font-size: 0.72rem;
    color: #ff8a9e;
    background: rgba(233, 69, 96, 0.1);
    flex-shrink: 0;
  }

  .adv-wasm-warn {
    font-size: 0.65rem;
    color: #ffa726;
  }

  .adv-check {
    font-size: 0.7rem;
    color: #aaa;
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
    border-bottom: 1px solid #1a3050;
  }

  .adv-group-details {
    border-bottom: 1px solid #1a3050;
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
    color: #666;
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
    color: #fff;
    background: linear-gradient(135deg, #1a4a7a, #1a3860);
    border: 1px solid #4ecdc4;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  .adv-run-btn:hover { background: linear-gradient(135deg, #1a5a9a, #1a4a7a); }
  .adv-run-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .adv-btn-sm {
    padding: 3px 10px;
    font-size: 0.68rem;
    font-weight: 600;
    color: #ccc;
    background: #1a3050;
    border: 1px solid #1a3050;
    border-radius: 3px;
    cursor: pointer;
  }

  .adv-btn-sm:hover { color: #fff; border-color: #4ecdc4; }
  .adv-btn-sm:disabled { opacity: 0.35; cursor: not-allowed; }

  .adv-title {
    font-size: 0.72rem;
    font-weight: 600;
    color: #4ecdc4;
    user-select: none;
  }

  .adv-desc {
    font-size: 0.62rem;
    color: #666;
    font-style: italic;
  }

  .adv-hint {
    font-size: 0.6rem;
    color: #665;
    font-style: italic;
  }

  .adv-inline {
    font-size: 0.68rem;
    color: #aaa;
    padding: 2px 0;
    font-family: monospace;
  }

  .adv-divider {
    padding: 6px 12px;
    font-size: 0.6rem;
    font-weight: 600;
    color: #556;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: #0a1a30;
    border-bottom: 1px solid #1a3050;
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
    color: #888;
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .adv-num {
    width: 55px;
    padding: 3px 5px;
    font-size: 0.68rem;
    background: #0a1a30;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ccc;
    text-align: right;
  }

  .adv-num-wide { width: 70px; }

  .adv-sel {
    padding: 3px 5px;
    font-size: 0.68rem;
    background: #0a1a30;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ccc;
    cursor: pointer;
  }

  .adv-text {
    width: 120px;
    padding: 3px 5px;
    font-size: 0.68rem;
    background: #0a1a30;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ccc;
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
    color: #888;
    text-transform: uppercase;
    background: #0a1a30;
    border-bottom: 1px solid #1a3050;
  }

  .adv-table td {
    padding: 3px 5px;
    border-bottom: 1px solid #0f2030;
    color: #ccc;
  }

  .col-id { color: #666; font-family: monospace; text-align: center; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.66rem; }

  .adv-rm {
    padding: 2px 6px;
    font-size: 0.62rem;
    color: #e94560;
    background: transparent;
    border: 1px solid #e94560;
    border-radius: 3px;
    cursor: pointer;
    line-height: 1;
  }

  .adv-rm:hover { background: rgba(233, 69, 96, 0.15); }

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
    background: #0f2030;
    border: 1px solid #1a3050;
    border-radius: 3px;
    color: #ccc;
    resize: vertical;
    min-height: 32px;
  }

  .adv-textarea::placeholder { color: #555; }

  .adv-steps-toggle {
    font-size: 0.6rem;
    color: #8ba;
    cursor: pointer;
  }

  .adv-step-line {
    font-size: 0.58rem;
    color: #9ab;
    padding: 1px 0;
  }

  .adv-sub-title {
    font-size: 0.66rem;
    font-weight: 600;
    color: #aaa;
    margin-top: 4px;
  }

  .adv-stage-card {
    background: #0a1a30;
    border: 1px solid #1a3050;
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
    border-bottom: 1px solid #1a3050;
    color: #ccc;
  }

  .adv-stage-name:focus { border-color: #4ecdc4; outline: none; }

  .cum-ok { color: #4caf50; }
  .cum-warn { color: #f0a500; }
</style>
