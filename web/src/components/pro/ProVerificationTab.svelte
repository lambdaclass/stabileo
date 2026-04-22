<script lang="ts">
  /**
   * DORMANT COMPONENT — not currently rendered in the active UI.
   *
   * ProRcWorkflowTab was simplified to render ProDesignTab only (per QA3).
   * This component is retained as a reference for features that should be
   * re-integrated into the Design workflow or service layer:
   *   - Serviceability (cracking, deflection) — currently has Phase 1 bridges
   *   - Quantities / bar marks — post-design detailing
   *   - Slab reinforcement design
   *   - Steel verification rendering (CIRSOC 301)
   *   - Story drift
   *   - Frame-line / column-stack elevations
   *
   * When reactivating these features:
   *   - Read verification data from verificationStore (single source of truth)
   *   - Do not re-introduce a local verifications array as a parallel state
   *   - Use getCodeDetail() for code-specific rendering data
   *   - Route verification through verification-service.ts
   */
  import { modelStore, resultsStore, uiStore, verificationStore } from '../../lib/store';
  import type { SolverDiagnostic } from '../../lib/engine/types';
  import { verifyElement, classifyElement, REBAR_DB, computeJointPsiFromModel } from '../../lib/engine/codes/argentina/cirsoc201';
  import type { ElementVerification, VerificationInput } from '../../lib/engine/codes/argentina/cirsoc201';
  import { generateCrossSectionSvg, generateBeamElevationSvg, generateColumnElevationSvg, generateJointDetailSvg, generateSlabReinforcementSvg, designSlabReinforcement, generateFrameLineElevationSvg, generateColumnStackElevationSvg } from '../../lib/engine/reinforcement-svg';
  import type { SlabDesignResult, FramingContext, FrameLineElevationOpts, ColumnStackElevationOpts } from '../../lib/engine/reinforcement-svg';
  import { buildStructuralGraph, getElementFramingContext, type StructuralGraph } from '../../lib/engine/structural-graph';
  import { computeBarMarks, type BarMark } from '../../lib/engine/bar-marks';
  import { checkCrackWidth, checkDeflection } from '../../lib/engine/codes/argentina/serviceability';
  import type { CrackResult, DeflectionResult } from '../../lib/engine/codes/argentina/serviceability';
  import { computeQuantities } from '../../lib/engine/quantity-takeoff';
  import type { QuantitySummary } from '../../lib/engine/quantity-takeoff';
  import type { SteelVerification } from '../../lib/engine/codes/argentina/cirsoc301';
  import { generateInteractionDiagram, generateInteractionSvg } from '../../lib/engine/codes/argentina/interaction-diagram';
  import type { DiagramParams } from '../../lib/engine/codes/argentina/interaction-diagram';
  import { isDesignCheckAvailable, checkSteelMembers, checkRcMembers, checkEc2Members, checkEc3Members, checkTimberMembers, checkMasonryMembers, checkCfsMembers, checkBoltGroups, checkWeldGroups, checkSpreadFootings } from '../../lib/engine/wasm-solver';
  import { t } from '../../lib/i18n';
  import * as XLSX from 'xlsx';
  import { computeStationDemands, runUnifiedVerification, runSteelVerification } from '../../lib/engine/verification-service';

  /** Normative code options for design checks */
  type NormativeCode = 'cirsoc' | 'aci-aisc' | 'eurocode' | 'nds' | 'masonry' | 'cfs';

  const normativeOptionsDefs: { value: NormativeCode; label?: string; labelKey?: string; wasmKeys: string[] }[] = [
    { value: 'cirsoc', label: 'CIRSOC 201/301', wasmKeys: [] },
    { value: 'aci-aisc', label: 'ACI 318 / AISC 360', wasmKeys: ['rcMembers', 'steelMembers'] },
    { value: 'eurocode', label: 'Eurocode 2/3', wasmKeys: ['ec2Members', 'ec3Members'] },
    { value: 'nds', labelKey: 'pro.codeTimber', wasmKeys: ['timberMembers'] },
    { value: 'masonry', labelKey: 'pro.codeMasonry', wasmKeys: ['masonryMembers'] },
    { value: 'cfs', labelKey: 'pro.codeCfs', wasmKeys: ['cfsMembers'] },
  ];
  function normLabel(def: typeof normativeOptionsDefs[number]): string {
    return def.labelKey ? t(def.labelKey) : def.label!;
  }

  let { verifications = $bindable([]) }: { verifications: ElementVerification[] } = $props();
  let expandedId = $state<number | null>(null);
  let expandedSteelId = $state<number | null>(null);

  // On first render, inherit context from design tab:
  // 1. Auto-expand the selected element
  // 2. Auto-run verification if design has been done
  let didInitFromDesign = false;
  $effect(() => {
    if (didInitFromDesign) return;
    didInitFromDesign = true;
    // Inherit selected element
    const sel = uiStore.selectedElements;
    if (sel.size === 1) {
      const elemId = sel.values().next().value;
      if (elemId != null && modelStore.elements.get(elemId)?.reinforcement) {
        expandedId = elemId;
      }
    }
    // Auto-run verification if results exist and elements have been designed
    if (resultsStore.results3D && designedCount > 0 && verifications.length === 0) {
      // Use queueMicrotask so the UI renders first, then verification runs
      queueMicrotask(() => runVerification());
    }
  });
  let rebarFy = $state(420);    // MPa — default ADN 420
  let cover = $state(0.025);    // m — default 2.5cm
  let stirrupDia = $state(8);   // mm
  let verifyError = $state<string | null>(null);
  let exposure = $state<'interior' | 'exterior'>('interior');
  let selectedNormative = $state<NormativeCode>('cirsoc');

  // ── Code mixing: per-category code selection ──
  let mixCodes = $state(false);
  type CheckCategory = 'rc' | 'steel' | 'seismic';
  const categoryLabelKeys: Record<CheckCategory, string> = { rc: 'pro.catRc', steel: 'pro.catSteel', seismic: 'pro.catSeismic' };
  function catLabel(cat: CheckCategory): string { return t(categoryLabelKeys[cat]); }
  const codesForCategory: Record<CheckCategory, NormativeCode[]> = {
    rc: ['cirsoc', 'aci-aisc', 'eurocode'],
    steel: ['cirsoc', 'aci-aisc', 'eurocode', 'cfs'],
    seismic: ['cirsoc'],
  };
  let mixedCodes = $state<Record<CheckCategory, NormativeCode>>({ rc: 'cirsoc', steel: 'cirsoc', seismic: 'cirsoc' });
  function getCodeFor(cat: CheckCategory): NormativeCode {
    return mixCodes ? mixedCodes[cat] : selectedNormative;
  }

  /** Whether the selected normative code has its WASM checks compiled */
  const selectedNormativeAvailable = $derived(() => {
    const opt = normativeOptionsDefs.find(o => o.value === selectedNormative);
    if (!opt || opt.wasmKeys.length === 0) return true; // CIRSOC uses JS, always available
    return opt.wasmKeys.every(k => isDesignCheckAvailable(k));
  });

  const isCirsocSelected = $derived(selectedNormative === 'cirsoc');

  // Store serviceability results per element
  let crackResults = $state<Map<number, CrackResult>>(new Map());
  let deflectionResults = $state<Map<number, DeflectionResult>>(new Map());
  let quantities = $state<QuantitySummary | null>(null);

  // ── Manual reinforcement overrides (session-local) ──
  interface RebarOverride { barCount: number; barDia: number }
  let overrides = $state<Map<number, RebarOverride>>(new Map());
  const overrideCount = $derived(overrides.size);

  function setOverride(elemId: number, barCount: number, barDia: number) {
    const next = new Map(overrides);
    next.set(elemId, { barCount, barDia });
    overrides = next;
  }
  function clearOverride(elemId: number) {
    const next = new Map(overrides);
    next.delete(elemId);
    overrides = next;
  }
  function clearAllOverrides() { overrides = new Map(); }

  /** Effective main bars string for an element, considering overrides */
  function effectiveBars(v: ElementVerification): string {
    const ov = overrides.get(v.elementId);
    if (ov) return `${ov.barCount} Ø${ov.barDia}`;
    return v.column ? v.column.bars : v.flexure.bars;
  }
  /** Effective AsProv (cm²) for an element, considering overrides */
  function effectiveAs(v: ElementVerification): number {
    const ov = overrides.get(v.elementId);
    if (ov) {
      const rebar = REBAR_DB.find(r => r.diameter === ov.barDia);
      return rebar ? ov.barCount * rebar.area : 0;
    }
    return v.column ? v.column.AsProv : v.flexure.AsProv;
  }

  /** Quantities adjusted for active overrides (longitudinal rebar only) */
  const effectiveQuantities = $derived.by((): QuantitySummary | null => {
    if (!quantities) return null;
    if (overrides.size === 0) return quantities;
    const STEEL_DENSITY = 7850;
    const elements = quantities.elements.map(eq => {
      const v = verifications.find(vv => vv.elementId === eq.elementId);
      if (!v || !overrides.has(eq.elementId)) return eq;
      const ovAs = effectiveAs(v); // cm²
      const rebarWeight = ovAs * 1e-4 * eq.length * STEEL_DENSITY;
      return { ...eq, rebarWeight, totalSteelWeight: rebarWeight + eq.stirrupWeight };
    });
    const totalConcreteVolume = elements.reduce((s, e) => s + e.concreteVolume, 0);
    const totalRebarWeight = elements.reduce((s, e) => s + e.rebarWeight, 0);
    const totalStirrupWeight = elements.reduce((s, e) => s + e.stirrupWeight, 0);
    const totalSteelWeight = totalRebarWeight + totalStirrupWeight;
    const steelRatio = totalConcreteVolume > 0 ? totalSteelWeight / totalConcreteVolume : 0;
    return { elements, totalConcreteVolume, totalRebarWeight, totalStirrupWeight, totalSteelWeight, steelRatio };
  });

  // Steel verification results (CIRSOC 301)
  let steelVerifications = $state<SteelVerification[]>([]);

  // Element lengths for elevation views
  let elementLengthMap = $state<Map<number, number>>(new Map());

  // Slab reinforcement results
  let slabDesigns = $state<Array<{ quadId: number; spanX: number; spanZ: number; thickness: number; fc: number; designX: SlabDesignResult; designZ: SlabDesignResult }>>([]);

  // Story drift results
  interface StoryDriftResult {
    level: number;      // floor elevation (m)
    height: number;     // story height (m)
    driftX: number;     // max lateral displacement X (m)
    driftZ: number;     // max lateral displacement Z (m)
    ratioX: number;     // drift ratio Δ/h
    ratioZ: number;
    status: 'ok' | 'warn' | 'fail';
  }
  let storyDrifts = $state<StoryDriftResult[]>([]);
  const driftLimit = 0.015; // CIRSOC 103 §5.2.8: 0.015 for RC, 0.020 for steel

  // Detail view tabs
  type DetailSection = 'verification' | 'detailing' | 'schedule' | 'slabs' | 'drift' | 'connections';
  let activeSection = $state<DetailSection>('verification');

  const results = $derived(resultsStore.results3D);
  const hasResults = $derived(results !== null);
  const hasEnvelope = $derived(resultsStore.hasCombinations3D);

  /** Count of elements with provided reinforcement (designed in RC Design tab). */
  const designedCount = $derived.by(() => {
    let n = 0;
    for (const [, elem] of modelStore.elements) { if (elem.reinforcement) n++; }
    return n;
  });

  // getEnvelopeSolicitations removed — both RC and steel paths now use
  // station-based demands via verification-service.ts

  /** Build generic check payload from model data for WASM-based design checks */
  function buildWasmCheckPayload() {
    if (!results) return null;
    const members: any[] = [];
    for (const ef of results.elementForces) {
      const elem = modelStore.elements.get(ef.elementId);
      if (!elem) continue;
      const sec = modelStore.sections.get(elem.sectionId);
      const mat = modelStore.materials.get(elem.materialId);
      const nI = modelStore.nodes.get(elem.nodeI);
      const nJ = modelStore.nodes.get(elem.nodeJ);
      if (!sec || !mat || !nI || !nJ) continue;
      const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = (nJ.z ?? 0) - (nI.z ?? 0);
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      members.push({
        elementId: ef.elementId,
        length: L,
        section: { b: sec.b, h: sec.h, a: sec.a, iz: sec.iz, iy: sec.iy, profileName: (sec as any).profileName },
        material: { e: mat.e, fy: mat.fy, fu: (mat as any).fu, rho: mat.rho },
        forces: {
          nStart: ef.nStart, nEnd: ef.nEnd,
          vyStart: ef.vyStart, vyEnd: ef.vyEnd,
          vzStart: ef.vzStart, vzEnd: ef.vzEnd,
          mzStart: ef.mzStart, mzEnd: ef.mzEnd,
          myStart: ef.myStart, myEnd: ef.myEnd,
          mxStart: ef.mxStart, mxEnd: ef.mxEnd,
        },
      });
    }
    return { members };
  }


  /** Dispatch WASM check for a specific code */
  function runWasmCheck(code: NormativeCode, payload: any): any | null {
    switch (code) {
      case 'aci-aisc': return checkRcMembers(payload) ?? checkSteelMembers(payload);
      case 'eurocode': return checkEc2Members(payload) ?? checkEc3Members(payload);
      case 'nds': return checkTimberMembers(payload);
      case 'masonry': return checkMasonryMembers(payload);
      case 'cfs': return checkCfsMembers(payload);
      default: return null;
    }
  }

  function runVerification() {
    verifyError = null;
    if (!results) {
      verifyError = t('pro.solveFirst');
      return;
    }

    // Code mixing mode: run different codes per category
    if (mixCodes) {
      const payload = buildWasmCheckPayload();
      const wasmResults: any[] = [];
      for (const cat of ['rc', 'steel'] as CheckCategory[]) {
        const code = getCodeFor(cat);
        if (code !== 'cirsoc' && payload) {
          try {
            const r = runWasmCheck(code, payload);
            if (r && Array.isArray(r.members)) {
              const found = normativeOptionsDefs.find(o => o.value === code);
              const label = found ? normLabel(found) : code;
              wasmResults.push(...r.members.map((m: any) => ({ ...m, _source: `${catLabel(cat)} (${label})` })));
            } else if (r) {
              wasmResults.push(r);
            }
          } catch (e: any) {
            verifyError = `${catLabel(cat)}: ${e.message}`;
          }
        }
      }
      if (wasmResults.length > 0) void wasmResults;
      if (getCodeFor('rc') !== 'cirsoc' && getCodeFor('steel') !== 'cirsoc') return;
      // Fall through to CIRSOC JS for categories that use it
    }

    // Single-code mode: non-CIRSOC → dispatch to WASM
    if (!mixCodes && !isCirsocSelected) {
      const payload = buildWasmCheckPayload();
      if (!payload) { verifyError = t('pro.solveFirst'); return; }
      let checkResult: any = null;
      try {
        checkResult = runWasmCheck(selectedNormative, payload);
      } catch (e: any) {
        verifyError = e.message || t('pro.wasmCheckError');
        return;
      }
      if (checkResult && Array.isArray(checkResult.members)) {
        void checkResult.members;
      } else if (checkResult) {
        void [checkResult];
      } else {
        verifyError = t('pro.wasmCheckUnavailable');
      }
      return;
    }

    // Unified RC verification via shared service (station-based when available)
    // This replaces the old endpoint-only force extraction loop — see §13.1 of SOLVER_APP_COVERAGE_MAP.md
    const governing = resultsStore.governing3D.size > 0 ? resultsStore.governing3D : null;
    const stationData = resultsStore.hasCombinations3D
      ? computeStationDemands(resultsStore.perCombo3D, modelStore.model.combinations)
      : undefined;
    const verifs = runUnifiedVerification(
      results,
      { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports },
      governing,
      stationData?.demands,
    );

    // Compute element lengths (still needed for elevations/detailing)
    const lengths = new Map<number, number>();
    for (const ef of results.elementForces) {
      const elem = modelStore.elements.get(ef.elementId);
      if (!elem) continue;
      const nodeI = modelStore.nodes.get(elem.nodeI);
      const nodeJ = modelStore.nodes.get(elem.nodeJ);
      if (!nodeI || !nodeJ) continue;
      const dx = nodeJ.x - nodeI.x, dy = nodeJ.y - nodeI.y, dz = (nodeJ.z ?? 0) - (nodeI.z ?? 0);
      lengths.set(ef.elementId, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }

    // Steel verification via shared service (uses station demands when available)
    const steelVerifs = runSteelVerification(
      results,
      { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports },
      stationData?.demands,
    );
    steelVerifications = steelVerifs;

    // Check if there are any verifiable elements (including quads/plates for slabs)
    const hasQuads = results.quadStresses && results.quadStresses.length > 0;
    if (verifs.length === 0 && steelVerifs.length === 0 && !hasQuads) {
      verifyError = t('pro.noVerifiableElems');
      return;
    }

    // Serviceability checks (crack width for beams)
    const newCracks = new Map<number, CrackResult>();
    const newDefl = new Map<number, DeflectionResult>();
    for (const v of verifs) {
      if (v.elementType === 'beam') {
        // TEMPORARY Phase 1 bridge — service moment approximation (Bug #5 from §13.2)
        // Uses dead-load case when available; falls back to Mu/1.4 unfactoring.
        // Phase 2 target: solver provides actual service-combo results directly.
        let Ms = v.Mu / 1.4;
        if (resultsStore.perCase3D.size > 0) {
          const deadCase = modelStore.model.loadCases.find(c => c.type === 'D');
          if (deadCase) {
            const deadResult = resultsStore.perCase3D.get(deadCase.id);
            if (deadResult) {
              const deadForces = deadResult.elementForces.find(ef => ef.elementId === v.elementId);
              if (deadForces) {
                Ms = Math.max(Math.abs(deadForces.mzStart), Math.abs(deadForces.mzEnd));
              }
            }
          }
        }
        const crack = checkCrackWidth(
          v.b, v.h, v.flexure.d,
          v.flexure.AsProv, Ms,
          v.cover, v.flexure.barDia, v.flexure.barCount,
          exposure,
        );
        newCracks.set(v.elementId, crack);

        // TEMPORARY Phase 1 bridge — midspan deflection estimate (Bug #3 from §13.2)
        // Solver only returns endpoint displacements; midspan is estimated from beam equation.
        // Phase 2 target: solver provides midspan displacement directly (or check_serviceability WASM).
        const elem = modelStore.elements.get(v.elementId);
        if (elem) {
          const nodeI = modelStore.nodes.get(elem.nodeI);
          const nodeJ = modelStore.nodes.get(elem.nodeJ);
          if (nodeI && nodeJ) {
            const dx = nodeJ.x - nodeI.x;
            const dy = nodeJ.y - nodeI.y;
            const dz = (nodeJ.z ?? 0) - (nodeI.z ?? 0);
            const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
            // First try endpoint displacements (valid for cantilevers/overhangs)
            const di = results!.displacements.find(d => d.nodeId === elem.nodeI);
            const dj = results!.displacements.find(d => d.nodeId === elem.nodeJ);
            let maxDisp = Math.max(
              Math.abs(di?.uy ?? 0), Math.abs(dj?.uy ?? 0),
              Math.abs(di?.uz ?? 0), Math.abs(dj?.uz ?? 0),
            );
            // TEMPORARY Phase 1 estimate: 5·Ms·L²/(48·E·Ig) (uniform load equivalent)
            // Only used when endpoint displacements are negligible (simply-supported beams).
            if (maxDisp < L / 10000) {
              const sec = modelStore.sections.get(elem.sectionId);
              const mat = modelStore.materials.get(elem.materialId);
              if (sec?.iz && mat?.e) {
                const E = mat.e * 1000; // MPa → kPa
                const Ig = sec.iz; // m⁴
                maxDisp = (5 * Ms * L * L) / (48 * E * Ig);
              }
            }
            if (L > 0 && maxDisp > 0) {
              newDefl.set(v.elementId, checkDeflection(L, maxDisp));
            }
          }
        }
      }
    }
    crackResults = newCracks;
    deflectionResults = newDefl;

    // Store lengths for elevation views
    elementLengthMap = lengths;

    // Compute material quantities
    quantities = computeQuantities(verifs, lengths);

    // Design slab reinforcement from quad stresses
    const slabResults: typeof slabDesigns = [];
    if (results.quadStresses && results.quadStresses.length > 0) {
      // Group quads by unique geometry (spanX × spanZ × thickness)
      const processedGeom = new Set<string>();
      for (const qs of results.quadStresses) {
        const quad = modelStore.quads.get(qs.elementId);
        if (!quad) continue;
        const mat = modelStore.materials.get(quad.materialId);
        if (!mat) continue;
        const fc = mat.fy ?? 30;

        // Compute span from node positions
        const qNodes = quad.nodes.map(nid => modelStore.nodes.get(nid)).filter(Boolean) as Array<{x:number;y:number;z?:number}>;
        if (qNodes.length < 4) continue;
        const xVals = qNodes.map(n => n.x);
        const zVals = qNodes.map(n => n.z ?? 0);
        const spanX = Math.max(...xVals) - Math.min(...xVals);
        const spanZ = Math.max(...zVals) - Math.min(...zVals);
        if (spanX < 0.1 || spanZ < 0.1) continue;

        // Deduplicate by approximate geometry
        const key = `${spanX.toFixed(1)}_${spanZ.toFixed(1)}_${quad.thickness.toFixed(2)}`;
        if (processedGeom.has(key)) continue;
        processedGeom.add(key);

        const designX = designSlabReinforcement(qs.mx, quad.thickness, fc, rebarFy, cover, 'X');
        const designZ = designSlabReinforcement(qs.my, quad.thickness, fc, rebarFy, cover, 'Z');
        slabResults.push({
          quadId: qs.elementId, spanX, spanZ,
          thickness: quad.thickness, fc,
          designX, designZ,
        });
      }
    }
    slabDesigns = slabResults;

    // ─── Story drift computation ───
    const drifts: StoryDriftResult[] = [];
    if (results) {
      // Group nodes by Y elevation (story level)
      const yTol = 0.05; // 5cm tolerance
      const yLevels: number[] = [];
      for (const [, node] of modelStore.nodes) {
        const y = node.y;
        if (!yLevels.some(lv => Math.abs(lv - y) < yTol)) {
          yLevels.push(y);
        }
      }
      yLevels.sort((a, b) => a - b);

      if (yLevels.length >= 2) {
        // For each level (except base), compute max lateral drift
        for (let i = 1; i < yLevels.length; i++) {
          const level = yLevels[i];
          const prevLevel = yLevels[i - 1];
          const storyH = level - prevLevel;
          if (storyH < 0.1) continue;

          // Find max horizontal displacements at this level and previous
          let maxUxCur = 0, maxUzCur = 0;
          let maxUxPrev = 0, maxUzPrev = 0;
          for (const d of results.displacements) {
            const node = modelStore.nodes.get(d.nodeId);
            if (!node) continue;
            if (Math.abs(node.y - level) < yTol) {
              maxUxCur = Math.max(maxUxCur, Math.abs(d.ux));
              maxUzCur = Math.max(maxUzCur, Math.abs(d.uz));
            } else if (Math.abs(node.y - prevLevel) < yTol) {
              maxUxPrev = Math.max(maxUxPrev, Math.abs(d.ux));
              maxUzPrev = Math.max(maxUzPrev, Math.abs(d.uz));
            }
          }
          const deltaX = Math.abs(maxUxCur - maxUxPrev);
          const deltaZ = Math.abs(maxUzCur - maxUzPrev);
          const ratioX = deltaX / storyH;
          const ratioZ = deltaZ / storyH;
          const maxRatio = Math.max(ratioX, ratioZ);

          drifts.push({
            level,
            height: storyH,
            driftX: deltaX,
            driftZ: deltaZ,
            ratioX,
            ratioZ,
            status: maxRatio > driftLimit ? 'fail' : maxRatio > driftLimit * 0.8 ? 'warn' : 'ok',
          });
        }
      }
    }
    storyDrifts = drifts;

    verifications = verifs;

    // Update global verification store for 3D color mapping
    verificationStore.setConcrete(verifs);
    verificationStore.setSteel(steelVerifs);

    // Collect all diagnostics from verifications and push to results store
    const allDiags: SolverDiagnostic[] = [];
    for (const v of verifs) {
      if (v.diagnostics) allDiags.push(...v.diagnostics);
    }
    for (const sv of steelVerifs) {
      if (sv.diagnostics) allDiags.push(...sv.diagnostics);
    }
    for (const [, cr] of newCracks) {
      if (cr.diagnostics) allDiags.push(...cr.diagnostics);
    }
    for (const [, dr] of newDefl) {
      if (dr.diagnostics) allDiags.push(...dr.diagnostics);
    }
    if (allDiags.length > 0) {
      resultsStore.addDiagnostics(allDiags, true);
    }
  }

  // ─── Connection checks (Bolt/Weld/Footing) ────────────────

  // Bolt group
  let boltDia = $state(20);      // mm
  let boltGrade = $state<'4.6' | '8.8' | '10.9'>('8.8');
  let boltCount = $state(4);
  let boltGauge = $state(60);    // mm
  let boltPitch = $state(80);    // mm
  let boltShearForce = $state(100); // kN
  let boltTensionForce = $state(0); // kN
  let boltResult = $state<any | null>(null);

  function handleBoltCheck() {
    try {
      boltResult = checkBoltGroups({
        diameter: boltDia,
        grade: boltGrade,
        count: boltCount,
        gauge: boltGauge,
        pitch: boltPitch,
        shearForce: boltShearForce,
        tensionForce: boltTensionForce,
      });
    } catch (e: any) {
      verifyError = `Bulones: ${e.message ?? 'Error'}`;
    }
  }

  // Weld group
  let weldType = $state<'fillet' | 'groove'>('fillet');
  let weldSize = $state(6);      // mm
  let weldLength = $state(200);  // mm
  let weldElectrode = $state(490); // MPa (E70xx)
  let weldShear = $state(100);   // kN
  let weldResult = $state<any | null>(null);

  function handleWeldCheck() {
    try {
      weldResult = checkWeldGroups({
        type: weldType,
        size: weldSize,
        length: weldLength,
        electrodeStrength: weldElectrode,
        shearForce: weldShear,
      });
    } catch (e: any) {
      verifyError = `Soldadura: ${e.message ?? 'Error'}`;
    }
  }

  // Spread footing
  let footB = $state(1.5);       // m
  let footL = $state(1.5);       // m
  let footH = $state(0.5);       // m
  let footFc = $state(25);       // MPa
  let footSigmaAdm = $state(200); // kPa
  let footNu = $state(500);      // kN
  let footMu = $state(50);       // kN·m
  let footResult = $state<any | null>(null);

  function handleFootingCheck() {
    try {
      footResult = checkSpreadFootings({
        width: footB,
        length: footL,
        depth: footH,
        fc: footFc,
        allowableBearing: footSigmaAdm,
        axialLoad: footNu,
        moment: footMu,
      });
    } catch (e: any) {
      verifyError = `Fundación: ${e.message ?? 'Error'}`;
    }
  }

  function toggleExpand(id: number) {
    expandedId = expandedId === id ? null : id;
  }

  function toggleSteelExpand(id: number) {
    expandedSteelId = expandedSteelId === id ? null : id;
  }

  /** Activate verification color map on 3D model */
  function showOnModel() {
    resultsStore.diagramType = 'verification';
  }

  /** Select element in 3D viewport when clicking verification row */
  function selectElementInViewport(elementId: number) {
    uiStore.selectMode = 'elements';
    uiStore.selectElement(elementId, false);
  }

  function statusIcon(s: 'ok' | 'fail' | 'warn'): string {
    if (s === 'ok') return '✓';
    if (s === 'fail') return '✗';
    return '⚠';
  }

  function statusClass(s: 'ok' | 'fail' | 'warn'): string {
    if (s === 'ok') return 'status-ok';
    if (s === 'fail') return 'status-fail';
    return 'status-warn';
  }

  function fmtNum(n: number): string {
    if (Math.abs(n) < 0.01) return '0';
    return n.toFixed(2);
  }

  const countOk = $derived(verifications.filter(v => v.overallStatus === 'ok').length + steelVerifications.filter(v => v.overallStatus === 'ok').length);
  const countFail = $derived(verifications.filter(v => v.overallStatus === 'fail').length + steelVerifications.filter(v => v.overallStatus === 'fail').length);
  const countWarn = $derived(verifications.filter(v => v.overallStatus === 'warn').length + steelVerifications.filter(v => v.overallStatus === 'warn').length);

  // Rebar schedule: group by identical reinforcement design and track element IDs
  interface RebarScheduleEntry {
    sectionName: string;
    elementType: 'beam' | 'column' | 'wall';
    elementIds: number[];
    b: number; h: number;
    mainBars: string;
    stirrups: string;
    totalAsPerElem: number; // cm² per element
    hasOverride: boolean;
  }
  const rebarSchedule = $derived.by(() => {
    const groups = new Map<string, RebarScheduleEntry>();
    for (const v of verifications) {
      const isOv = overrides.has(v.elementId);
      const mainBars = effectiveBars(v);
      const asProv = effectiveAs(v);
      const stirrups = `eØ${v.shear.stirrupDia} c/${(v.shear.spacing * 100).toFixed(0)}`;
      // Group by identical reinforcement: same type + dimensions + bars + stirrups + override status
      const key = `${v.elementType}_${(v.b*100).toFixed(0)}x${(v.h*100).toFixed(0)}_${mainBars}_${stirrups}_${isOv ? 'ov' : 'auto'}`;
      const existing = groups.get(key);
      if (existing) {
        existing.elementIds.push(v.elementId);
      } else {
        const sec = modelStore.sections.get(
          modelStore.elements.get(v.elementId)?.sectionId ?? 0
        );
        groups.set(key, {
          sectionName: sec?.name ?? `${(v.b*100).toFixed(0)}×${(v.h*100).toFixed(0)}`,
          elementType: v.elementType,
          elementIds: [v.elementId],
          b: v.b, h: v.h,
          mainBars,
          stirrups,
          totalAsPerElem: asProv,
          hasOverride: isOv,
        });
      }
    }
    // Sort: type (column → beam → wall), then dimensions (largest first), then first element ID
    const typeOrder: Record<string, number> = { column: 0, beam: 1, wall: 2 };
    return Array.from(groups.values()).sort((a, b) => {
      const t = (typeOrder[a.elementType] ?? 9) - (typeOrder[b.elementType] ?? 9);
      if (t !== 0) return t;
      const area = (b.b * b.h) - (a.b * a.h); // larger sections first
      if (Math.abs(area) > 1e-6) return area;
      return (a.elementIds[0] ?? 0) - (b.elementIds[0] ?? 0);
    });
  });

  // ─── Structural connectivity graph ───
  const structGraph = $derived.by((): StructuralGraph | null => {
    if (modelStore.elements.size === 0 || modelStore.nodes.size === 0) return null;
    const graphNodes = new Map<number, { id: number; x: number; y: number; z: number }>();
    for (const [id, n] of modelStore.nodes) graphNodes.set(id, { id, x: n.x, y: n.y, z: n.z ?? 0 });
    const graphElements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; type: string }>();
    for (const [id, e] of modelStore.elements) graphElements.set(id, { id, nodeI: e.nodeI, nodeJ: e.nodeJ, sectionId: e.sectionId, type: e.type });
    const graphSections = new Map<number, { id: number; b?: number; h?: number }>();
    for (const [id, s] of modelStore.sections) graphSections.set(id, { id, b: s.b, h: s.h });
    const graphSupports = new Map<number, { nodeId: number; type: string }>();
    for (const [, s] of modelStore.supports) graphSupports.set(s.nodeId, { nodeId: s.nodeId, type: s.type });
    return buildStructuralGraph(graphNodes, graphElements, graphSections, graphSupports);
  });

  /** Derive joint details from the structural graph. */
  const jointDetails = $derived.by(() => {
    if (!structGraph || structGraph.joints.length === 0) return [];
    const verifMap = new Map<number, ElementVerification>();
    for (const v of verifications) verifMap.set(v.elementId, v);

    // Collect unique joint types (by beam-section + col-section pair)
    const seen = new Set<string>();
    const result: Array<ReturnType<typeof makeJointOpts>> = [];
    for (const joint of structGraph.joints) {
      const beam = joint.beamIds.map(id => verifMap.get(id)).find(v => v && v.elementType === 'beam');
      const col = joint.columnIds.map(id => verifMap.get(id)).find(v => v && (v.elementType === 'column' || v.elementType === 'wall'));
      if (!beam || !col) continue;
      const key = `${beam.b}_${beam.h}_${col.b}_${col.h}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(makeJointOpts(joint.nodeId, beam, col));
      if (result.length >= 8) break;
    }
    return result;
  });

  function makeJointOpts(nodeId: number, beam: ElementVerification, col: ElementVerification) {
    return {
      beamB: beam.b, beamH: beam.h,
      colB: col.b, colH: col.h,
      cover: beam.cover,
      beamBars: beam.flexure.bars,
      colBars: col.column?.bars ?? `${col.flexure.barCount} Ø${col.flexure.barDia}`,
      stirrupDia: col.shear.stirrupDia,
      stirrupSpacing: col.shear.spacing,
      beamDetailing: beam.detailing,
      colDetailing: col.detailing,
      nodeId,
      labels: {
        title: t('pro.jointDetail'),
        beam: t('pro.beam'),
        column: t('pro.column'),
        joint: t('pro.jointWord') !== 'pro.jointWord' ? t('pro.jointWord') : 'joint',
        splice: t('pro.lapSplice'),
      },
    };
  }

  // Backward compat: single jointDetail for report/existing code
  const jointDetail = $derived(jointDetails.length > 0 ? jointDetails[0] : null);

  /** Beam frame-line continuity data for continuous elevation drawings. */
  /** Beam frame lines organized by floor level and axis. */
  interface FloorBeamGroup {
    z: number;
    label: string;
    xLines: FrameLineElevationOpts[];
    yLines: FrameLineElevationOpts[];
    otherLines: FrameLineElevationOpts[];
  }

  const beamFloorGroups = $derived.by((): FloorBeamGroup[] => {
    if (!structGraph) return [];
    const verifMap = new Map<number, ElementVerification>();
    for (const v of verifications) verifMap.set(v.elementId, v);

    // Build all beam frame lines (no flat cap)
    const allLines: Array<{ opts: FrameLineElevationOpts; z: number }> = [];
    for (const fl of structGraph.frameLines) {
      if (fl.direction !== 'horizontal' || fl.elementIds.length < 2) continue;
      const spanData = fl.elementIds.map(eid => {
        const v = verifMap.get(eid); const len = elementLengthMap.get(eid);
        return v && len ? { v, len } : null;
      });
      if (spanData.filter(Boolean).length < 2) continue;

      // Read moment envelope data if available
      const envMomentZ = resultsStore.envelope3D?.momentZ;
      const envMap = new Map<number, { t: number[]; posM: number[]; negM: number[] }>();
      if (envMomentZ) {
        for (const ed of envMomentZ.elements) {
          envMap.set(ed.elementId, {
            t: ed.tPositions,
            posM: ed.posValues,
            negM: ed.negValues.map(v => Math.abs(v)), // stored as negative; take abs
          });
        }
      }

      const spans = fl.elementIds.map((eid, i) => {
        const sd = spanData[i];
        if (!sd) return { length: 1, bottomBars: '?', topBars: '2 Ø10', hasCompSteel: false, stirrupSpacing: 0.2, stirrupDia: 8 };
        const v = sd.v;
        const hasComp = v.flexure.isDoublyReinforced && !!v.flexure.barCountComp;
        const momentStations = envMap.get(eid);
        return { length: sd.len, bottomBars: v.flexure.bars, topBars: hasComp ? (v.flexure.barsComp ?? '2 Ø10') : '2 Ø10', hasCompSteel: hasComp, stirrupSpacing: v.shear.spacing, stirrupDia: v.shear.stirrupDia, detailing: v.detailing, momentStations, barCount: v.flexure.barCount, barDia: v.flexure.barDia, asMin: v.flexure.AsMin, topBarCount: hasComp ? v.flexure.barCountComp : undefined, topBarDia: hasComp ? v.flexure.barDiaComp : undefined, sectionB: v.b, cover: v.cover };
      });

      const flNodes = fl.nodeIds.map(nid => {
        const conn = structGraph.nodes.get(nid);
        return { hasColumn: (conn?.columns.length ?? 0) > 0, hasSupport: !!conn?.support, supportType: conn?.support };
      });

      // Determine floor Z from the first node's Z coordinate
      const firstNodeId = fl.nodeIds[0];
      const firstNode = modelStore.nodes.get(firstNodeId);
      const z = firstNode ? Math.round((firstNode.z ?? 0) * 10) / 10 : 0;

      allLines.push({ opts: { spans, nodes: flNodes, labels: { splice: t('pro.lapSplice') }, axis: fl.axis }, z });
    }

    // Group by floor Z
    const floorMap = new Map<number, { x: FrameLineElevationOpts[]; y: FrameLineElevationOpts[]; other: FrameLineElevationOpts[] }>();
    for (const { opts, z } of allLines) {
      let group = floorMap.get(z);
      if (!group) { group = { x: [], y: [], other: [] }; floorMap.set(z, group); }
      if (opts.axis === 'X') group.x.push(opts);
      else if (opts.axis === 'Y') group.y.push(opts);
      else group.other.push(opts);
    }

    // Sort floors top-to-bottom (roof first — typical engineering reading)
    const floors = [...floorMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([z, g]) => ({
        z,
        label: `Z = ${z.toFixed(1)} m`,
        xLines: g.x.slice(0, 4),
        yLines: g.y.slice(0, 4),
        otherLines: g.other.slice(0, 2),
      }));

    // Cap: show up to 4 representative floors (top, bottom, 2 middle)
    if (floors.length > 4) {
      const top = floors[0];
      const bottom = floors[floors.length - 1];
      const mid1 = floors[Math.floor(floors.length / 3)];
      const mid2 = floors[Math.floor(2 * floors.length / 3)];
      const selected = [top, mid1, mid2, bottom].filter((f, i, arr) => arr.indexOf(f) === i);
      return selected;
    }
    return floors;
  });

  // Flat list for report compatibility
  const beamFrameLines = $derived(beamFloorGroups.flatMap(fg => [...fg.xLines, ...fg.yLines, ...fg.otherLines]));

  /** Column stack continuity data for vertical frame-line drawings. */
  const columnStackLines = $derived.by((): ColumnStackElevationOpts[] => {
    if (!structGraph) return [];
    const verifMap = new Map<number, ElementVerification>();
    for (const v of verifications) verifMap.set(v.elementId, v);

    const result: ColumnStackElevationOpts[] = [];
    for (const fl of structGraph.frameLines) {
      if (fl.direction !== 'vertical' || fl.elementIds.length < 2) continue;
      const segData = fl.elementIds.map(eid => {
        const v = verifMap.get(eid);
        const len = elementLengthMap.get(eid);
        return v && len && v.column ? { v, len } : null;
      });
      if (segData.filter(Boolean).length < 2) continue;

      const firstValid = segData.find(Boolean)!;
      const segments = fl.elementIds.map((_, i) => {
        const sd = segData[i];
        if (!sd) return { height: 3, bars: '?', barCount: 4, barDia: 16, stirrupSpacing: 0.2, stirrupDia: 8 };
        const v = sd.v;
        return {
          height: sd.len,
          bars: v.column?.bars ?? v.flexure.bars,
          barCount: v.column?.barCount ?? v.flexure.barCount,
          barDia: v.column?.barDia ?? v.flexure.barDia,
          stirrupSpacing: v.shear.spacing,
          stirrupDia: v.shear.stirrupDia,
          detailing: v.detailing,
        };
      });

      const flNodes = fl.nodeIds.map(nid => {
        const conn = structGraph.nodes.get(nid);
        return { hasBeam: (conn?.beams.length ?? 0) > 0, hasSupport: !!conn?.support, supportType: conn?.support };
      });

      result.push({
        segments, nodes: flNodes,
        sectionB: firstValid.v.b, sectionH: firstValid.v.h, cover: firstValid.v.cover,
        labels: { splice: t('pro.lapSplice') },
      });
      if (result.length >= 4) break;
    }
    return result;
  });

  // Grouped schedule entries by element type
  const beamEntries = $derived(rebarSchedule.filter(e => e.elementType === 'beam'));
  const colEntries = $derived(rebarSchedule.filter(e => e.elementType === 'column'));
  const wallEntries = $derived(rebarSchedule.filter(e => e.elementType === 'wall'));

  /** Bar marks with cutting lengths */
  const barMarks = $derived(verifications.length > 0 ? computeBarMarks(verifications, elementLengthMap) : []);

  /** Export rebar schedule + quantities to XLSX */
  function exportRebarSchedule() {
    if (rebarSchedule.length === 0) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Grouped rebar schedule
    const typeLabel = (et: string) => et === 'beam' ? t('pro.elemTypeBeam') : et === 'wall' ? t('pro.elemTypeWall') : t('pro.elemTypeColumn');
    const schedHeaders = [
      t('pro.thSectionName'), t('pro.thType'), t('pro.thElements'),
      'b×h (cm)', t('pro.thMainBars'), t('pro.thStirrups'),
      `${t('pro.thAsPerElem')} (cm²)`, t('pro.overrideSource'),
    ];
    const schedData: (string | number)[][] = [schedHeaders];
    for (const entry of rebarSchedule) {
      schedData.push([
        entry.sectionName,
        typeLabel(entry.elementType),
        entry.elementIds.join(', '),
        `${(entry.b * 100).toFixed(0)}×${(entry.h * 100).toFixed(0)}`,
        entry.mainBars,
        entry.stirrups,
        Number(entry.totalAsPerElem.toFixed(1)),
        entry.hasOverride ? t('pro.overrideManual') : t('pro.overrideAuto'),
      ]);
    }
    const wsSchedule = XLSX.utils.aoa_to_sheet(schedData);
    wsSchedule['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsSchedule, t('pro.scheduleTab'));

    // Sheet 2: Per-element quantities (override-aware for longitudinal rebar)
    const effQty = effectiveQuantities ?? quantities;
    if (effQty) {
      const qtyHeaders = [
        'ID', t('pro.thType'), `L (m)`,
        `${t('pro.totalConcrete')} (m³)`,
        `${t('pro.exportRebarWeight')} (kg)`,
        `${t('pro.exportStirrupWeight')} (kg)`,
        `${t('pro.totalSteel')} (kg)`,
      ];
      const qtyData: (string | number)[][] = [qtyHeaders];
      const typeOrd: Record<string, number> = { column: 0, beam: 1, wall: 2 };
      const sortedElems = [...effQty.elements].sort((a, b) => {
        const diff = (typeOrd[a.elementType] ?? 9) - (typeOrd[b.elementType] ?? 9);
        return diff !== 0 ? diff : a.elementId - b.elementId;
      });
      for (const eq of sortedElems) {
        qtyData.push([
          eq.elementId,
          typeLabel(eq.elementType),
          Number(eq.length.toFixed(3)),
          Number(eq.concreteVolume.toFixed(4)),
          Number(eq.rebarWeight.toFixed(1)),
          Number(eq.stirrupWeight.toFixed(1)),
          Number(eq.totalSteelWeight.toFixed(1)),
        ]);
      }
      // Summary row
      qtyData.push([]);
      qtyData.push([
        t('excel.total'), '', '',
        Number(effQty.totalConcreteVolume.toFixed(2)),
        Number(effQty.totalRebarWeight.toFixed(0)),
        Number(effQty.totalStirrupWeight.toFixed(0)),
        Number(effQty.totalSteelWeight.toFixed(0)),
      ]);
      qtyData.push([
        t('pro.globalRatio'), '', '', '', '', '',
        `${effQty.steelRatio.toFixed(1)} kg/m³`,
      ]);
      if (overrideCount > 0) {
        qtyData.push([]);
        qtyData.push([t('pro.qtyOverrideNote')]);
      }
      const wsQty = XLSX.utils.aoa_to_sheet(qtyData);
      wsQty['!cols'] = [{ wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsQty, t('pro.materialsSummary'));
    }

    // Sheet 3: Bar marks
    if (barMarks.length > 0) {
      const shapeLabel = (s: string) => s === 'stirrup' ? t('pro.bmStirrup') || 'Stirrup' : s === 'hooked' ? t('pro.bmHooked') || 'Hooked' : t('pro.bmStraight') || 'Straight';
      const bmHeaders = [
        t('pro.bmMark') || 'Mark', `Ø (mm)`, t('pro.bmShape') || 'Shape',
        `${t('pro.bmCutLen') || 'Cut. L'} (m)`, t('pro.bmCount') || 'Count',
        `${t('pro.bmTotalLen') || 'Total L'} (m)`, `${t('pro.bmWeight') || 'Weight'} (kg)`,
        'Stock (m)', 'Splices',
        t('pro.bmNote') || 'Note',
      ];
      const bmData: (string | number)[][] = [bmHeaders];
      for (const m of barMarks) {
        bmData.push([
          m.mark, m.diameter, shapeLabel(m.shape),
          m.cuttingLength, m.count,
          Number(m.totalLength.toFixed(1)), Number(m.weight.toFixed(1)),
          m.shape !== 'stirrup' ? m.stockLength : '',
          m.needsStockSplice ? m.nStockSplices : '',
          m.overStock ? '>12m' : '',
        ]);
      }
      // Totals row
      const totalWeight = barMarks.reduce((s, m) => s + m.weight, 0);
      const totalLen = barMarks.reduce((s, m) => s + m.totalLength, 0);
      bmData.push(['', '', '', '', '', Number(totalLen.toFixed(1)), Number(totalWeight.toFixed(1)), '']);
      const wsBM = XLSX.utils.aoa_to_sheet(bmData);
      wsBM['!cols'] = [{ wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 8 }];
      XLSX.utils.book_append_sheet(wb, wsBM, t('pro.bmSheet') || 'Bar Marks');
    }

    XLSX.writeFile(wb, `planilla-hierros-${modelStore.model.name || 'modelo'}.xlsx`);
  }

  /** Get support type for an element end node */
  function getSupportType(nodeId: number): 'fixed' | 'pinned' | 'free' {
    const sup = modelStore.supports.get(nodeId);
    if (!sup) return 'free';
    if (sup.type === 'fixed') return 'fixed';
    return 'pinned';
  }

  /** Framing context from the structural graph (replaces ad-hoc per-call scanning). */
  function getFramingContext(elementId: number): FramingContext | undefined {
    if (!structGraph) return undefined;
    return getElementFramingContext(structGraph, elementId, modelStore.elements as any) as FramingContext | undefined;
  }
</script>

<div class="pro-verif">
  {#if designedCount > 0}
    <div class="design-context-banner">
      Continuing from RC Design — {designedCount} element{designedCount > 1 ? 's' : ''} with provided reinforcement
    </div>
  {/if}
  <div class="pro-verif-header">
    <div class="pro-verif-title-row">
      <div class="pro-verif-title">{t('pro.normativeVerif')}</div>
      <select bind:value={selectedNormative} class="pro-sel normative-sel" disabled={mixCodes}>
        {#each normativeOptionsDefs as opt}
          <option value={opt.value}>{normLabel(opt)}</option>
        {/each}
      </select>
      <label class="mix-toggle" title={t('pro.mixCodesTooltip')}>
        <input type="checkbox" bind:checked={mixCodes} />
        <span>Mix</span>
      </label>
    </div>
    {#if mixCodes}
      <div class="mix-codes-row">
        {#each Object.entries(codesForCategory) as [cat, codes]}
          <label class="mix-code-item">
            <span class="mix-cat-label">{catLabel(cat as CheckCategory)}:</span>
            <select bind:value={mixedCodes[cat as CheckCategory]} class="pro-sel mix-sel">
              {#each codes as code}
                {@const def = normativeOptionsDefs.find(o => o.value === code)}
                <option value={code}>{def ? normLabel(def) : code}</option>
              {/each}
            </select>
          </label>
        {/each}
      </div>
    {/if}
    {#if !isCirsocSelected && !selectedNormativeAvailable()}
      <div class="pro-wasm-notice">
        {t('pro.wasmNotice').replace('{code}', (() => { const d = normativeOptionsDefs.find(o => o.value === selectedNormative); return d ? normLabel(d) : ''; })())}
      </div>
    {/if}
    <div class="pro-verif-params">
      <label>{t('pro.rebarSteel')}: <select bind:value={rebarFy} class="pro-sel">
        <option value={420}>ADN 420</option>
        <option value={500}>ADN 500</option>
      </select></label>
      <label>{t('pro.coverLabel')}:
        <select bind:value={cover} class="pro-sel">
          <option value={0.020}>2.0 cm</option>
          <option value={0.025}>2.5 cm</option>
          <option value={0.030}>3.0 cm</option>
          <option value={0.035}>3.5 cm</option>
          <option value={0.040}>4.0 cm</option>
          <option value={0.050}>5.0 cm</option>
        </select>
      </label>
      <label>{t('pro.stirrupLabel')}:
        <select bind:value={stirrupDia} class="pro-sel">
          {#each REBAR_DB.filter(r => r.diameter <= 12) as r}
            <option value={r.diameter}>{r.label}</option>
          {/each}
        </select>
      </label>
      <label>{t('pro.exposureLabel')}:
        <select bind:value={exposure} class="pro-sel">
          <option value="interior">{t('pro.interior')}</option>
          <option value="exterior">{t('pro.exterior')}</option>
        </select>
      </label>
    </div>
    <button class="pro-verify-btn" onclick={runVerification} disabled={!hasResults || (!isCirsocSelected && !selectedNormativeAvailable())}>
      {designedCount > 0 ? `Verify ${designedCount} designed element${designedCount > 1 ? 's' : ''}` : t('pro.verifyElements')}
    </button>
    {#if hasEnvelope}
      <span class="pro-env-badge">{t('pro.envelopeActive')}</span>
    {/if}
    {#if verifyError}
      <div class="pro-verify-error">{verifyError}</div>
    {/if}
  </div>

  {#if verifications.length > 0 || steelVerifications.length > 0 || slabDesigns.length > 0}
    <div class="pro-verif-summary">
      <span class="status-ok">{countOk} ✓</span>
      <span class="status-warn">{countWarn} ⚠</span>
      <span class="status-fail">{countFail} ✗</span>
      {#if effectiveQuantities}
        <span class="qty-badge">{t('pro.qtyConcreteBadge')}: {effectiveQuantities.totalConcreteVolume.toFixed(2)} m³</span>
        <span class="qty-badge">{t('pro.qtySteelBadge')}: {effectiveQuantities.totalSteelWeight.toFixed(0)} kg ({effectiveQuantities.steelRatio.toFixed(0)} kg/m³)</span>
        {#if overrideCount > 0}<span class="override-mark" title={t('pro.qtyOverrideNote')}>*</span>{/if}
      {/if}
      <button class="pro-show-model-btn" onclick={showOnModel} title={t('pro.showOnModel')}>
        {t('pro.showOnModel')}
      </button>
    </div>

    <!-- Serviceability summary badges -->
    {#if crackResults.size > 0 || deflectionResults.size > 0}
      <div class="pro-verif-summary" style="margin-top:4px">
        {#if crackResults.size > 0}
          {@const crackOk = [...crackResults.values()].filter(c => c.status === 'ok').length}
          {@const crackFail = [...crackResults.values()].filter(c => c.status === 'fail').length}
          <span class="svc-badge">{t('pro.cracking')}: <span class="status-ok">{crackOk} ✓</span>{#if crackFail > 0} <span class="status-fail">{crackFail} ✗</span>{/if}</span>
        {/if}
        {#if deflectionResults.size > 0}
          {@const deflOk = [...deflectionResults.values()].filter(d => d.status === 'ok').length}
          {@const deflFail = [...deflectionResults.values()].filter(d => d.status === 'fail').length}
          <span class="svc-badge">{t('pro.deflection')}: <span class="status-ok">{deflOk} ✓</span>{#if deflFail > 0} <span class="status-fail">{deflFail} ✗</span>{/if}</span>
        {/if}
      </div>
    {/if}

    <!-- Section tabs -->
    <div class="section-tabs">
      <button class:active={activeSection === 'verification'} onclick={() => activeSection = 'verification'}>{t('pro.verificationTab')}</button>
      <button class:active={activeSection === 'detailing'} onclick={() => activeSection = 'detailing'}>{t('pro.detailingTab')}</button>
      <button class:active={activeSection === 'schedule'} onclick={() => activeSection = 'schedule'}>{t('pro.scheduleTab')}</button>
      {#if slabDesigns.length > 0}
        <button class:active={activeSection === 'slabs'} onclick={() => activeSection = 'slabs'}>{t('pro.slabsTab')}</button>
      {/if}
      {#if storyDrifts.length > 0}
        <button class:active={activeSection === 'drift'} onclick={() => activeSection = 'drift'}>Drift{#if storyDrifts.some(d => d.status === 'fail')} ✗{/if}</button>
      {/if}
      <button class:active={activeSection === 'connections'} onclick={() => activeSection = 'connections'}>{t('pro.connectionsTab')}</button>
    </div>

    <!-- ═══ VERIFICATION TAB ═══ -->
    {#if activeSection === 'verification'}
      {#if verifications.length > 0}
        <div class="pro-section-label">{t('pro.cirsoc201')}</div>
      {/if}
      <div class="pro-verif-table-wrap">
        {#if verifications.length > 0}
        <table class="pro-verif-table">
          <thead>
            <tr>
              <th>Elem</th>
              <th>{t('pro.thType')}</th>
              <th>Mu</th>
              <th>Vu</th>
              <th>Nu</th>
              <th>As req</th>
              <th>As prov</th>
              <th>{t('pro.thStirrups')}</th>
              <th>SLS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each verifications as v}
              <tr class={statusClass(v.overallStatus)} onclick={() => { toggleExpand(v.elementId); selectElementInViewport(v.elementId); }} style="cursor:pointer">
                <td class="col-id">{v.elementId}</td>
                <td class="col-type">{v.elementType === 'beam' ? t('pro.beam') : v.elementType === 'wall' ? t('pro.wall') : t('pro.column')}</td>
                <td class="col-num">{fmtNum(v.Mu)}{#if v.governingCombos?.flexure}<br><span class="governing-label">{v.governingCombos.flexure.comboName}</span>{/if}</td>
                <td class="col-num">{fmtNum(v.Vu)}{#if v.governingCombos?.shear && v.governingCombos.shear.comboId !== v.governingCombos?.flexure?.comboId}<br><span class="governing-label">{v.governingCombos.shear.comboName}</span>{/if}</td>
                <td class="col-num">{fmtNum(v.Nu)}{#if v.governingCombos?.axial && v.governingCombos.axial.comboId !== v.governingCombos?.flexure?.comboId}<br><span class="governing-label">{v.governingCombos.axial.comboName}</span>{/if}</td>
                <td class="col-num">{v.column ? v.column.AsTotal.toFixed(1) : v.flexure.AsReq.toFixed(1)}</td>
                <td class="col-num">{#if overrides.has(v.elementId)}<span class="override-mark" title={t('pro.overrideActive')}>{effectiveAs(v).toFixed(1)}</span>{:else}{v.column ? v.column.AsProv.toFixed(1) : v.flexure.AsProv.toFixed(1)}{#if !v.column && v.flexure.isDoublyReinforced && v.flexure.AsComp}<br><span style="font-size:0.65rem;color:#4a90d9">+{v.flexure.AsComp.toFixed(1)} A's</span>{/if}{/if}</td>
                <td class="col-stirrup">eØ{v.shear.stirrupDia} c/{(v.shear.spacing * 100).toFixed(0)}</td>
                <td class="col-sls">{#if crackResults.has(v.elementId) || deflectionResults.has(v.elementId)}{@const cr = crackResults.get(v.elementId)}{@const dr = deflectionResults.get(v.elementId)}{#if cr}<span class={statusClass(cr.status)} title="w_k={cr.wk.toFixed(2)}mm / {cr.wLimit.toFixed(2)}mm">{cr.wk.toFixed(2)}</span>{/if}{#if cr && dr}<br>{/if}{#if dr}<span class={statusClass(dr.status)} title="L/{Math.round(1/dr.ratio)} vs L/{Math.round(1/dr.limit)}">L/{Math.round(1/dr.ratio)}</span>{/if}{:else}<span class="dim-text">—</span>{/if}</td>
                <td class="col-status">
                  <span class={statusClass(v.overallStatus)}>{statusIcon(v.overallStatus)}</span>
                  {#if v.slender && v.slender.isSlender}<br><span class="slender-badge" title="k·Lu/r={v.slender.klu_r.toFixed(1)}, δns={v.slender.delta_ns.toFixed(2)}">δ={v.slender.delta_ns.toFixed(2)}</span>{/if}
                </td>
              </tr>
              {#if expandedId === v.elementId}
                <tr class="detail-row">
                  <td colspan="10">
                    <div class="detail-panel">
                      <!-- Cross section + elevation + interaction SVGs (override-aware) -->
                      {#if true}
                        {@const ov = overrides.get(v.elementId)}
                        {@const effFlexure = ov
                          ? { ...v.flexure, barCount: ov.barCount, barDia: ov.barDia, bars: `${ov.barCount} Ø${ov.barDia}`, AsProv: effectiveAs(v) }
                          : v.flexure}
                        {@const effColumn = v.column
                          ? (ov ? { ...v.column, barCount: ov.barCount, barDia: ov.barDia, bars: `${ov.barCount} Ø${ov.barDia}`, AsProv: effectiveAs(v) } : v.column)
                          : undefined}

                        <div class="detail-svg">
                          {@html generateCrossSectionSvg({
                            b: v.b, h: v.h, cover: v.cover,
                            flexure: effFlexure, shear: v.shear,
                            column: effColumn, isColumn: v.elementType === 'column' || v.elementType === 'wall',
                            layerWord: t('pro.layerWord'),
                          })}
                        </div>

                        {#if v.elementType === 'beam'}
                          {@const elemLen = elementLengthMap.get(v.elementId) ?? 3}
                          {@const elem = modelStore.elements.get(v.elementId)}
                          <div class="detail-svg">
                            {@html generateBeamElevationSvg({
                              length: elemLen, b: v.b, h: v.h, cover: v.cover,
                              flexure: effFlexure, shear: v.shear,
                              supportI: elem ? getSupportType(elem.nodeI) : 'pinned',
                              supportJ: elem ? getSupportType(elem.nodeJ) : 'pinned',
                              detailing: v.detailing,
                              context: getFramingContext(v.elementId),
                              spliceLabel: t('pro.lapSplice'),
                            })}
                          </div>
                        {:else if effColumn && (v.elementType === 'column' || v.elementType === 'wall')}
                          {@const elemLen = elementLengthMap.get(v.elementId) ?? 3}
                          <div class="detail-svg">
                            {@html generateColumnElevationSvg({
                              height: elemLen, b: v.b, h: v.h, cover: v.cover,
                              column: effColumn, shear: v.shear,
                              detailing: v.detailing,
                              context: getFramingContext(v.elementId),
                              spliceLabel: t('pro.lapSplice'),
                            })}
                          </div>
                        {/if}

                        {#if effColumn}
                          {@const effBarDia = ov ? ov.barDia : v.flexure.barDia}
                          {@const diagParams = {
                            b: v.b, h: v.h, fc: v.fc, fy: rebarFy,
                            cover: v.cover + stirrupDia / 2000 + effBarDia / 2000,
                            AsProv: effColumn.AsProv,
                            barCount: effColumn.barCount,
                            barDia: effBarDia,
                          } satisfies DiagramParams}
                          {@const diagram = generateInteractionDiagram(diagParams)}
                          <div class="detail-svg interaction-diagram">
                            {@html generateInteractionSvg(diagram, { Nu: v.Nu, Mu: v.Mu }, 280, 350)}
                          </div>
                        {/if}
                      {/if}

                      <!-- Override control -->
                      {#if true}
                        {@const curOv = overrides.get(v.elementId)}
                        {@const autoBarCount = v.column ? v.column.barCount : v.flexure.barCount}
                        {@const autoBarDia = v.column ? (v.column.barDia ?? v.flexure.barDia) : v.flexure.barDia}
                        {@const ovBarCount = curOv?.barCount ?? autoBarCount}
                        {@const ovBarDia = curOv?.barDia ?? autoBarDia}
                        <div class="override-card">
                          <div class="override-header">
                            <span class="override-title">{t('pro.overrideTitle')}</span>
                            {#if curOv}
                              <button class="override-revert" onclick={() => clearOverride(v.elementId)}>{t('pro.overrideRevert')}</button>
                            {/if}
                          </div>
                          <div class="override-auto">
                            <span class="override-label">{t('pro.overrideAutoDesign')}:</span>
                            <span class="override-val">{v.column ? v.column.bars : v.flexure.bars} ({(v.column ? v.column.AsProv : v.flexure.AsProv).toFixed(1)} cm²)</span>
                          </div>
                          <div class="override-controls">
                            <label class="override-label">{t('pro.overrideBarCount')}</label>
                            <input type="number" class="override-input" min="2" max="40" value={ovBarCount}
                              oninput={(e: Event) => { const val = parseInt((e.target as HTMLInputElement).value); if (!isNaN(val) && val >= 2 && val <= 40) setOverride(v.elementId, val, ovBarDia); }} />
                            <label class="override-label">Ø</label>
                            <select class="override-input" value={ovBarDia}
                              onchange={(e: Event) => { const dia = parseInt((e.target as HTMLSelectElement).value); setOverride(v.elementId, ovBarCount, dia); }}>
                              {#each REBAR_DB.filter(r => r.diameter >= 10) as rb}
                                <option value={rb.diameter}>{rb.diameter}</option>
                              {/each}
                            </select>
                          </div>
                          {#if curOv}
                            {@const ovAs = effectiveAs(v)}
                            {@const reqAs = v.column ? v.column.AsTotal : v.flexure.AsReq}
                            <div class="override-result" class:override-under={ovAs < reqAs}>
                              As = {ovAs.toFixed(1)} cm² {ovAs < reqAs ? `< As,req ${reqAs.toFixed(1)}` : `>= As,req ${reqAs.toFixed(1)}`}
                            </div>
                          {/if}
                        </div>
                      {/if}

                      <div class="detail-memo">
                        <div class="memo-section">
                          <div class="memo-title">{t('pro.flexure')}</div>
                          {#each v.flexure.steps as step}<div class="memo-step">{step}</div>{/each}
                        </div>
                        <div class="memo-section">
                          <div class="memo-title">{t('pro.shear')}</div>
                          {#each v.shear.steps as step}<div class="memo-step">{step}</div>{/each}
                        </div>
                        {#if v.column}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.flexoCompression')}</div>
                            {#each v.column.steps as step}<div class="memo-step">{step}</div>{/each}
                          </div>
                        {/if}
                        {#if v.torsion}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.torsion')} {v.torsion.neglect ? t('pro.torsionNeglect') : ''}</div>
                            {#each v.torsion.steps as step}<div class="memo-step">{step}</div>{/each}
                          </div>
                        {/if}
                        {#if v.biaxial}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.biaxialBresler')}</div>
                            {#each v.biaxial.steps as step}<div class="memo-step">{step}</div>{/each}
                          </div>
                        {/if}
                        {#if v.slender}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.slenderness')} {v.slender.isSlender ? t('pro.slenderCol') : t('pro.shortCol')}</div>
                            <div class="slender-factors">
                              <span>k = {v.slender.k.toFixed(2)}</span>
                              <span>Lu = {v.slender.lu.toFixed(2)} m</span>
                              <span>r = {(v.slender.r * 100).toFixed(1)} cm</span>
                              <span>k·Lu/r = {v.slender.klu_r.toFixed(1)}</span>
                              <span>λ_lim = {v.slender.lambda_lim.toFixed(0)}</span>
                              {#if v.slender.isSlender}
                                <span class="slender-highlight">δ_ns = {v.slender.delta_ns.toFixed(3)}</span>
                                <span>C_m = {v.slender.Cm.toFixed(3)}</span>
                                <span>M_c = {v.slender.Mc.toFixed(1)} kN·m</span>
                              {/if}
                              {#if v.slender.psiA != null}<span>Ψ_A = {v.slender.psiA.toFixed(2)}</span>{/if}
                              {#if v.slender.psiB != null}<span>Ψ_B = {v.slender.psiB.toFixed(2)}</span>{/if}
                            </div>
                            {#each v.slender.steps as step}<div class="memo-step">{step}</div>{/each}
                          </div>
                        {/if}
                        {#if crackResults.get(v.elementId)}
                          {@const cr = crackResults.get(v.elementId)!}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.cracking')} <span class={statusClass(cr.status)}>{statusIcon(cr.status)}</span></div>
                            {#each cr.steps as step}<div class="memo-step">{step}</div>{/each}
                          </div>
                        {/if}
                        {#if deflectionResults.get(v.elementId)}
                          {@const dr = deflectionResults.get(v.elementId)!}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.deflection')} <span class={statusClass(dr.status)}>{statusIcon(dr.status)}</span></div>
                            {#each dr.steps as step}<div class="memo-step">{step}</div>{/each}
                          </div>
                        {/if}
                        {#if v.detailing}
                          <div class="memo-section">
                            <div class="memo-title">{t('pro.detailing')}</div>
                            <div class="memo-step" style="color:#888;font-style:italic">{t('pro.detailingSubtitle')}</div>
                            {#each v.detailing.bars as bar}
                              <div class="memo-step">Ø{bar.diameter}: {t('pro.devLength')} = {(bar.ld * 100).toFixed(0)} cm · {t('pro.hookedDev')} = {(bar.ldh * 100).toFixed(0)} cm · {t('pro.lapSplice')} = {(bar.lapSplice * 100).toFixed(0)} cm</div>
                            {/each}
                            <div class="memo-step">{t('pro.minSpacing')}: {(v.detailing.minClearSpacing * 1000).toFixed(0)} mm · {t('pro.stirrupHook')}: {v.detailing.stirrupHook}</div>
                          </div>
                        {/if}
                      </div>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
        {/if}
      </div>
      {#if steelVerifications.length > 0}
        <div class="pro-section-label">{t('pro.cirsoc301')}</div>
        <div class="pro-verif-table-wrap">
          <table class="pro-verif-table">
            <thead><tr><th>Elem</th><th>Nu</th><th>Muz</th><th>Muy</th><th>Vu</th><th>{t('pro.interaction')}</th><th></th></tr></thead>
            <tbody>
              {#each steelVerifications as sv}
                <tr class={statusClass(sv.overallStatus)} onclick={() => { toggleSteelExpand(sv.elementId); selectElementInViewport(sv.elementId); }} style="cursor:pointer">
                  <td class="col-id">{sv.elementId}</td>
                  <td class="col-num">{fmtNum(sv.Nu)}</td>
                  <td class="col-num">{fmtNum(sv.Muz)}</td>
                  <td class="col-num">{fmtNum(sv.Muy)}</td>
                  <td class="col-num">{fmtNum(sv.Vu)}</td>
                  <td class="col-num">{sv.interaction?.ratio != null ? sv.interaction.ratio.toFixed(2) : '—'}</td>
                  <td class="col-status"><span class={statusClass(sv.overallStatus)}>{statusIcon(sv.overallStatus)}</span></td>
                </tr>
                {#if expandedSteelId === sv.elementId}
                  <tr class="detail-row">
                    <td colspan="7">
                      <div class="detail-panel"><div class="detail-memo">
                        {#if sv.tension}<div class="memo-section"><div class="memo-title">{t('pro.tension')} <span class={statusClass(sv.tension.status)}>{statusIcon(sv.tension.status)}</span></div>{#each sv.tension.steps as step}<div class="memo-step">{step}</div>{/each}</div>{/if}
                        {#if sv.compression}<div class="memo-section"><div class="memo-title">{t('pro.compression')} <span class={statusClass(sv.compression.status)}>{statusIcon(sv.compression.status)}</span></div>{#each sv.compression.steps as step}<div class="memo-step">{step}</div>{/each}</div>{/if}
                        {#if sv.flexureZ}<div class="memo-section"><div class="memo-title">{t('pro.flexure')} <span class={statusClass(sv.flexureZ.status)}>{statusIcon(sv.flexureZ.status)}</span></div>{#each sv.flexureZ.steps as step}<div class="memo-step">{step}</div>{/each}</div>{/if}
                        {#if sv.shear}<div class="memo-section"><div class="memo-title">{t('pro.shear')} <span class={statusClass(sv.shear.status)}>{statusIcon(sv.shear.status)}</span></div>{#each sv.shear.steps as step}<div class="memo-step">{step}</div>{/each}</div>{/if}
                        {#if sv.interaction}<div class="memo-section"><div class="memo-title">{t('pro.interaction')} <span class={statusClass(sv.interaction.status)}>{statusIcon(sv.interaction.status)}</span></div>{#each sv.interaction.steps as step}<div class="memo-step">{step}</div>{/each}</div>{/if}
                      </div></div>
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

    <!-- ═══ DETAILING TAB ═══ -->
    {:else if activeSection === 'detailing'}
      <div class="detailing-content">
        <!-- Joint details first — most important context for understanding reinforcement -->
        {#if jointDetails.length > 0}
          <div class="pro-section-label">{t('pro.jointDetail')}</div>
          <div class="detailing-gallery">
            {#each jointDetails as jd}
              <div class="gallery-item">
                <div class="detail-svg">
                  {@html generateJointDetailSvg(jd)}
                </div>
                <div class="joint-notes">
                  <div class="memo-step">{t('pro.jointAnchor')}{#if jd.beamDetailing} — ldh = {(Math.max(...jd.beamDetailing.bars.map(b => b.ldh)) * 100).toFixed(0)} cm{/if}</div>
                  <div class="memo-step">{t('pro.jointStirrup')} eØ{jd.stirrupDia} c/{(jd.stirrupSpacing * 100).toFixed(0)} (CIRSOC 201 §21.5)</div>
                  {#if jd.colDetailing}<div class="memo-step">{t('pro.lapSplice')}: {(Math.max(...jd.colDetailing.bars.map(b => b.lapSplice)) * 100).toFixed(0)} cm</div>{/if}
                  <div class="memo-step">{t('pro.jointConfined')}</div>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Beam continuity elevations — organized by floor and axis -->
        {#if beamFloorGroups.length > 0}
          {#each beamFloorGroups as fg}
            {#if fg.xLines.length > 0}
              <div class="pro-section-label">{t('pro.beamContinuity')} — X · {fg.label}</div>
              <div class="detailing-gallery">
                {#each fg.xLines as fl}
                  <div class="gallery-item" style="max-width:100%">
                    <div class="detail-svg" style="overflow-x:auto">{@html generateFrameLineElevationSvg(fl)}</div>
                  </div>
                {/each}
              </div>
            {/if}
            {#if fg.yLines.length > 0}
              <div class="pro-section-label">{t('pro.beamContinuity')} — Y · {fg.label}</div>
              <div class="detailing-gallery">
                {#each fg.yLines as fl}
                  <div class="gallery-item" style="max-width:100%">
                    <div class="detail-svg" style="overflow-x:auto">{@html generateFrameLineElevationSvg(fl)}</div>
                  </div>
                {/each}
              </div>
            {/if}
            {#if fg.otherLines.length > 0}
              <div class="pro-section-label">{t('pro.beamContinuity')} · {fg.label}</div>
              <div class="detailing-gallery">
                {#each fg.otherLines as fl}
                  <div class="gallery-item" style="max-width:100%">
                    <div class="detail-svg" style="overflow-x:auto">{@html generateFrameLineElevationSvg(fl)}</div>
                  </div>
                {/each}
              </div>
            {/if}
          {/each}
        {/if}

        <!-- Column continuity elevations -->
        {#if columnStackLines.length > 0}
          <div class="pro-section-label">{t('pro.columnContinuity') !== 'pro.columnContinuity' ? t('pro.columnContinuity') : 'Column Continuity'}</div>
          <div class="detailing-gallery">
            {#each columnStackLines as cs}
              <div class="gallery-item">
                <div class="detail-svg">
                  {@html generateColumnStackElevationSvg(cs)}
                </div>
              </div>
            {/each}
          </div>
        {/if}

        {#if beamEntries.length > 0}
          <div class="pro-section-label">{t('pro.beamsLabel')}</div>
          <div class="detailing-gallery">
            {#each beamEntries as entry}
              {@const rep = verifications.find(v => v.elementId === entry.elementIds[0])}
              {#if rep}
                {@const elemLen = elementLengthMap.get(rep.elementId) ?? 3}
                {@const elem = modelStore.elements.get(rep.elementId)}
                <div class="gallery-item">
                  <div class="gallery-title">{entry.sectionName} — {t('data.elements')} {entry.elementIds.join(', ')}</div>
                  <div class="detail-svg">
                    {@html generateCrossSectionSvg({
                      b: rep.b, h: rep.h, cover: rep.cover,
                      flexure: rep.flexure, shear: rep.shear,
                      column: rep.column, isColumn: false,
                      layerWord: t('pro.layerWord'),
                    })}
                  </div>
                  <div class="detail-svg">
                    {@html generateBeamElevationSvg({
                      length: elemLen, b: rep.b, h: rep.h, cover: rep.cover,
                      flexure: rep.flexure, shear: rep.shear,
                      supportI: elem ? getSupportType(elem.nodeI) : 'pinned',
                      supportJ: elem ? getSupportType(elem.nodeJ) : 'pinned',
                      detailing: rep.detailing,
                      context: getFramingContext(rep.elementId),
                      spliceLabel: t('pro.lapSplice'),
                    })}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        {#if colEntries.length > 0}
          <div class="pro-section-label">{t('pro.columnsLabel')}</div>
          <div class="detailing-gallery">
            {#each colEntries as entry}
              {@const rep = verifications.find(v => v.elementId === entry.elementIds[0])}
              {#if rep && rep.column}
                {@const elemLen = elementLengthMap.get(rep.elementId) ?? 3}
                <div class="gallery-item">
                  <div class="gallery-title">{entry.sectionName} — {t('data.elements')} {entry.elementIds.join(', ')}</div>
                  <div class="detail-svg">
                    {@html generateCrossSectionSvg({
                      b: rep.b, h: rep.h, cover: rep.cover,
                      flexure: rep.flexure, shear: rep.shear,
                      column: rep.column, isColumn: true,
                      layerWord: t('pro.layerWord'),
                    })}
                  </div>
                  <div class="detail-svg">
                    {@html generateColumnElevationSvg({
                      height: elemLen, b: rep.b, h: rep.h, cover: rep.cover,
                      column: rep.column, shear: rep.shear,
                      detailing: rep.detailing,
                      context: getFramingContext(rep.elementId),
                      spliceLabel: t('pro.lapSplice'),
                    })}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        {#if wallEntries.length > 0}
          <div class="pro-section-label">{t('pro.wallsLabel')}</div>
          <div class="detailing-gallery">
            {#each wallEntries as entry}
              {@const rep = verifications.find(v => v.elementId === entry.elementIds[0])}
              {#if rep && rep.column}
                {@const elemLen = elementLengthMap.get(rep.elementId) ?? 3}
                <div class="gallery-item">
                  <div class="gallery-title">{entry.sectionName} — {t('data.elements')} {entry.elementIds.join(', ')}</div>
                  <div class="detail-svg">
                    {@html generateCrossSectionSvg({
                      b: rep.b, h: rep.h, cover: rep.cover,
                      flexure: rep.flexure, shear: rep.shear,
                      column: rep.column, isColumn: true,
                      layerWord: t('pro.layerWord'),
                    })}
                  </div>
                  <div class="detail-svg">
                    {@html generateColumnElevationSvg({
                      height: elemLen, b: rep.b, h: rep.h, cover: rep.cover,
                      column: rep.column, shear: rep.shear,
                      detailing: rep.detailing,
                      context: getFramingContext(rep.elementId),
                      spliceLabel: t('pro.lapSplice'),
                    })}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

      </div>

    <!-- ═══ SCHEDULE TAB ═══ -->
    {:else if activeSection === 'schedule'}
      <div class="pro-section-label schedule-header">
        <span>{t('pro.scheduleTitle')}</span>
        <span class="schedule-actions">
          {#if overrideCount > 0}
            <button class="pro-export-btn" onclick={clearAllOverrides} title={t('pro.overrideClearAllTooltip')}>
              {t('pro.overrideClearAll')} ({overrideCount})
            </button>
          {/if}
          <button class="pro-export-btn" disabled={rebarSchedule.length === 0} onclick={exportRebarSchedule} title={t('pro.exportScheduleTooltip')}>
            {t('pro.exportSchedule')}
          </button>
        </span>
      </div>
      <div class="pro-verif-table-wrap">
        <table class="pro-verif-table">
          <thead>
            <tr>
              <th>{t('pro.thSectionName')}</th>
              <th>{t('pro.thType')}</th>
              <th>{t('pro.thElements')}</th>
              <th>b×h</th>
              <th>{t('pro.thMainBars')}</th>
              <th>{t('pro.thStirrups')}</th>
              <th>{t('pro.thAsPerElem')}</th>
            </tr>
          </thead>
          <tbody>
            {#each rebarSchedule as entry}
              <tr class:schedule-override={entry.hasOverride}>
                <td style="color:#4ecdc4">{entry.sectionName}</td>
                <td class="col-type">{entry.elementType === 'beam' ? t('pro.elemTypeBeam') : entry.elementType === 'wall' ? t('pro.elemTypeWall') : t('pro.elemTypeColumn')}</td>
                <td class="col-elems" title={entry.elementIds.join(', ')}>{entry.elementIds.length === 1 ? entry.elementIds[0] : `${entry.elementIds.length} elem. (${entry.elementIds.join(', ')})`}</td>
                <td class="col-num">{(entry.b * 100).toFixed(0)}×{(entry.h * 100).toFixed(0)}</td>
                <td class="col-stirrup">{entry.mainBars}{#if entry.hasOverride} <span class="override-mark" title={t('pro.overrideActive')}>*</span>{/if}</td>
                <td class="col-stirrup">{entry.stirrups}</td>
                <td class="col-num">{entry.totalAsPerElem.toFixed(1)} cm²</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if effectiveQuantities}
        <div class="pro-section-label">{t('pro.materialsSummary')}{#if overrideCount > 0} <span class="override-mark">*</span>{/if}</div>
        <div class="schedule-summary">
          <div class="schedule-item">
            <span class="schedule-label">{t('pro.totalConcrete')}</span>
            <span class="schedule-value">{effectiveQuantities.totalConcreteVolume.toFixed(2)} m³</span>
          </div>
          <div class="schedule-item">
            <span class="schedule-label">{t('pro.totalSteel')}</span>
            <span class="schedule-value">{effectiveQuantities.totalSteelWeight.toFixed(0)} kg</span>
          </div>
          <div class="schedule-item">
            <span class="schedule-label">{t('pro.globalRatio')}</span>
            <span class="schedule-value">{effectiveQuantities.steelRatio.toFixed(1)} kg/m³</span>
          </div>
          {#if overrideCount > 0}
            <div class="schedule-item">
              <span class="schedule-label override-mark">{t('pro.qtyOverrideNote')}</span>
            </div>
          {/if}
          {#if slabDesigns.length > 0}
            {@const totalSlabArea = slabDesigns.reduce((s, d) => s + d.spanX * d.spanZ, 0)}
            {@const totalSlabVol = slabDesigns.reduce((s, d) => s + d.spanX * d.spanZ * d.thickness, 0)}
            <div class="schedule-item">
              <span class="schedule-label">{t('pro.slabTotalArea')}</span>
              <span class="schedule-value">{totalSlabArea.toFixed(1)} m²</span>
            </div>
            <div class="schedule-item">
              <span class="schedule-label">{t('pro.slabConcrete')}</span>
              <span class="schedule-value">{totalSlabVol.toFixed(2)} m³</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Bar marks table -->
      {#if barMarks.length > 0}
        <div class="pro-section-label" style="margin-top:12px">{t('pro.bmTitle') || 'Bar Marks — Estimated Cutting Lengths'}</div>
        <div class="pro-verif-table-wrap">
          <table class="pro-verif-table">
            <thead>
              <tr>
                <th>{t('pro.bmMark') || 'Mark'}</th>
                <th>Ø</th>
                <th>{t('pro.bmShape') || 'Shape'}</th>
                <th>{t('pro.bmCutLen') || 'Cut. L'} (m)</th>
                <th>{t('pro.bmCount') || 'Count'}</th>
                <th>{t('pro.bmTotalLen') || 'Total L'} (m)</th>
                <th>{t('pro.bmWeight') || 'Weight'} (kg)</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each barMarks as m}
                <tr class={m.overStock ? 'status-warn' : ''}>
                  <td style="font-weight:600">{m.mark}</td>
                  <td class="col-num">{m.diameter}</td>
                  <td style="font-size:0.65rem">{m.shape === 'stirrup' ? (t('pro.bmStirrup') || 'Stirrup') : m.shape === 'hooked' ? (t('pro.bmHooked') || 'Hooked') : (t('pro.bmStraight') || 'Straight')}</td>
                  <td class="col-num">{m.cuttingLength.toFixed(2)}</td>
                  <td class="col-num">{m.count}</td>
                  <td class="col-num">{m.totalLength.toFixed(1)}</td>
                  <td class="col-num">{m.weight.toFixed(1)}</td>
                  <td class="col-num" style="font-size:0.6rem">{m.shape !== 'stirrup' ? `${m.stockLength}m` : ''}{#if m.needsStockSplice}<br><span class="status-warn">{m.nStockSplices}sp</span>{/if}</td>
                  <td>{#if m.overStock}<span class="status-warn" title=">12m stock">⚠</span>{/if}</td>
                </tr>
              {/each}
              <tr style="font-weight:600;border-top:2px solid #334">
                <td colspan="5"></td>
                <td class="col-num">{barMarks.reduce((s, m) => s + m.totalLength, 0).toFixed(1)}</td>
                <td class="col-num">{barMarks.reduce((s, m) => s + m.weight, 0).toFixed(1)}</td>
                <td></td><td></td>
              </tr>
            </tbody>
          </table>
        </div>
      {/if}

    <!-- ═══ SLABS TAB ═══ -->
    {:else if activeSection === 'slabs'}
      <div class="pro-section-label">{t('pro.slabReinfTitle')}</div>
      {#each slabDesigns as slab, i}
        <div class="slab-card">
          <div class="slab-header">{t('pro.slabPanelN').replace('{n}', String(i + 1))} — {slab.spanX.toFixed(1)}×{slab.spanZ.toFixed(1)} m, e={( slab.thickness * 100).toFixed(0)} cm, f'c={slab.fc} MPa</div>
          <div class="slab-detail-row">
            <div class="detail-svg">
              {@html generateSlabReinforcementSvg({
                spanX: slab.spanX, spanZ: slab.spanZ,
                thickness: slab.thickness,
                mxDesign: slab.designX.Mu, mzDesign: slab.designZ.Mu,
                barsX: slab.designX.bars, barsZ: slab.designZ.bars,
                asxProv: slab.designX.AsProv, aszProv: slab.designZ.AsProv,
              })}
            </div>
            <div class="slab-memo">
              <div class="memo-section">
                <div class="memo-title">{t('pro.dirX')}</div>
                <div class="memo-step">Mu = {slab.designX.Mu.toFixed(2)} kN·m/m</div>
                <div class="memo-step">d = {(slab.designX.d * 100).toFixed(1)} cm</div>
                <div class="memo-step">As,req = {slab.designX.AsReq.toFixed(2)} cm²/m</div>
                <div class="memo-step">As,min = {slab.designX.AsMin.toFixed(2)} cm²/m {t('pro.shrinkageLabel')}</div>
                <div class="memo-step">{t('pro.adopted')} {slab.designX.bars} → As,prov = {slab.designX.AsProv.toFixed(2)} cm²/m</div>
              </div>
              <div class="memo-section">
                <div class="memo-title">{t('pro.dirZ')}</div>
                <div class="memo-step">Mu = {slab.designZ.Mu.toFixed(2)} kN·m/m</div>
                <div class="memo-step">d = {(slab.designZ.d * 100).toFixed(1)} cm</div>
                <div class="memo-step">As,req = {slab.designZ.AsReq.toFixed(2)} cm²/m</div>
                <div class="memo-step">As,min = {slab.designZ.AsMin.toFixed(2)} cm²/m {t('pro.shrinkageLabel')}</div>
                <div class="memo-step">{t('pro.adopted')} {slab.designZ.bars} → As,prov = {slab.designZ.AsProv.toFixed(2)} cm²/m</div>
              </div>
            </div>
          </div>
        </div>
      {/each}
      {#if slabDesigns.length === 0}
        <div class="pro-empty">{t('pro.noSlabs')}</div>
      {/if}

    {:else if activeSection === 'drift'}
      <!-- ═══ STORY DRIFT TAB ═══ -->
      <div class="pro-section-label">{t('pro.driftTitle')}</div>
      <div class="drift-limit-note">{t('pro.driftLimit')}: Δ/h ≤ {driftLimit} (hormigón armado)</div>
      <div class="pro-verif-table-wrap">
        <table class="pro-verif-table">
          <thead>
            <tr>
              <th>{t('pro.driftLevel')}</th>
              <th>h piso (m)</th>
              <th>Δx (mm)</th>
              <th>Δz (mm)</th>
              <th>Δx/h</th>
              <th>Δz/h</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each storyDrifts as d}
              <tr class={d.status === 'fail' ? 'status-fail' : d.status === 'warn' ? 'status-warn' : ''}>
                <td class="col-num">{d.level.toFixed(2)}</td>
                <td class="col-num">{d.height.toFixed(2)}</td>
                <td class="col-num">{(d.driftX * 1000).toFixed(2)}</td>
                <td class="col-num">{(d.driftZ * 1000).toFixed(2)}</td>
                <td class="col-num">{d.ratioX < 0.0001 ? '<0.0001' : d.ratioX.toFixed(4)}</td>
                <td class="col-num">{d.ratioZ < 0.0001 ? '<0.0001' : d.ratioZ.toFixed(4)}</td>
                <td class="col-status"><span class={'status-' + d.status}>{d.status === 'ok' ? '✓' : d.status === 'fail' ? '✗' : '⚠'}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if storyDrifts.length === 0}
        <div class="pro-empty">{t('pro.driftNone')}</div>
      {/if}

    {:else if activeSection === 'connections'}
      <!-- ═══ CONNECTIONS TAB ═══ -->
      <div class="pro-section-label">{t('pro.connectionsTitle')}</div>

      <!-- Bolt group check -->
      <details class="conn-details">
        <summary class="conn-summary">{t('pro.boltGroupTitle')}</summary>
        <div class="conn-panel">
          <div class="conn-form">
            <label class="conn-label">∅ (mm): <input type="number" class="adv-num" bind:value={boltDia} min={6} max={36} step={2} /></label>
            <label class="conn-label">{t('pro.grade')}: <select class="pro-sel" bind:value={boltGrade}><option value="4.6">4.6</option><option value="8.8">8.8</option><option value="10.9">10.9</option></select></label>
            <label class="conn-label">n: <input type="number" class="adv-num" bind:value={boltCount} min={1} max={50} /></label>
            <label class="conn-label">g (mm): <input type="number" class="adv-num" bind:value={boltGauge} min={30} max={200} /></label>
            <label class="conn-label">p (mm): <input type="number" class="adv-num" bind:value={boltPitch} min={40} max={300} /></label>
          </div>
          <div class="conn-form">
            <label class="conn-label">V (kN): <input type="number" class="adv-num" bind:value={boltShearForce} min={0} step={10} /></label>
            <label class="conn-label">T (kN): <input type="number" class="adv-num" bind:value={boltTensionForce} min={0} step={10} /></label>
            <button class="adv-btn-sm" onclick={handleBoltCheck}>{t('pro.verify')}</button>
          </div>
          {#if boltResult}
            <div class="conn-result" class:fail={boltResult.ratio >= 1}>
              <span>{t('pro.utilization')}: {((boltResult.ratio ?? 0) * 100).toFixed(0)}%</span>
              {#if boltResult.shearCapacity != null}<span>Vn={boltResult.shearCapacity.toFixed(1)} kN</span>{/if}
              {#if boltResult.tensionCapacity != null}<span>Tn={boltResult.tensionCapacity.toFixed(1)} kN</span>{/if}
              {#if boltResult.status}<span class={'status-' + boltResult.status}>{boltResult.status === 'ok' ? '✓' : '✗'}</span>{/if}
            </div>
          {/if}
        </div>
      </details>

      <!-- Weld group check -->
      <details class="conn-details">
        <summary class="conn-summary">{t('pro.weldGroupTitle')}</summary>
        <div class="conn-panel">
          <div class="conn-form">
            <label class="conn-label">{t('pro.weldType')}:
              <select class="pro-sel" bind:value={weldType}><option value="fillet">{t('pro.fillet')}</option><option value="groove">{t('pro.groove')}</option></select>
            </label>
            <label class="conn-label">a (mm): <input type="number" class="adv-num" bind:value={weldSize} min={3} max={25} /></label>
            <label class="conn-label">L (mm): <input type="number" class="adv-num" bind:value={weldLength} min={20} max={2000} /></label>
            <label class="conn-label">Fexx (MPa): <input type="number" class="adv-num" bind:value={weldElectrode} min={350} max={700} step={10} /></label>
          </div>
          <div class="conn-form">
            <label class="conn-label">V (kN): <input type="number" class="adv-num" bind:value={weldShear} min={0} step={10} /></label>
            <button class="adv-btn-sm" onclick={handleWeldCheck}>{t('pro.verify')}</button>
          </div>
          {#if weldResult}
            <div class="conn-result" class:fail={weldResult.ratio >= 1}>
              <span>{t('pro.utilization')}: {((weldResult.ratio ?? 0) * 100).toFixed(0)}%</span>
              {#if weldResult.capacity != null}<span>Rn={weldResult.capacity.toFixed(1)} kN</span>{/if}
              {#if weldResult.status}<span class={'status-' + weldResult.status}>{weldResult.status === 'ok' ? '✓' : '✗'}</span>{/if}
            </div>
          {/if}
        </div>
      </details>

      <!-- Spread footing check -->
      <details class="conn-details">
        <summary class="conn-summary">{t('pro.footingTitle')}</summary>
        <div class="conn-panel">
          <div class="conn-form">
            <label class="conn-label">B (m): <input type="number" class="adv-num" bind:value={footB} min={0.3} max={5} step={0.1} /></label>
            <label class="conn-label">L (m): <input type="number" class="adv-num" bind:value={footL} min={0.3} max={5} step={0.1} /></label>
            <label class="conn-label">h (m): <input type="number" class="adv-num" bind:value={footH} min={0.2} max={2} step={0.05} /></label>
            <label class="conn-label">f'c (MPa): <input type="number" class="adv-num" bind:value={footFc} min={15} max={50} /></label>
          </div>
          <div class="conn-form">
            <label class="conn-label">σ_adm (kPa): <input type="number" class="adv-num" bind:value={footSigmaAdm} min={50} max={1000} step={10} /></label>
            <label class="conn-label">N (kN): <input type="number" class="adv-num" bind:value={footNu} min={0} step={50} /></label>
            <label class="conn-label">M (kN·m): <input type="number" class="adv-num" bind:value={footMu} min={0} step={10} /></label>
            <button class="adv-btn-sm" onclick={handleFootingCheck}>{t('pro.verify')}</button>
          </div>
          {#if footResult}
            <div class="conn-result" class:fail={footResult.ratio >= 1}>
              <span>{t('pro.utilization')}: {((footResult.ratio ?? 0) * 100).toFixed(0)}%</span>
              {#if footResult.bearingPressure != null}<span>σ={footResult.bearingPressure.toFixed(0)} kPa</span>{/if}
              {#if footResult.punchingRatio != null}<span>{t('pro.punching')}: {(footResult.punchingRatio * 100).toFixed(0)}%</span>{/if}
              {#if footResult.status}<span class={'status-' + footResult.status}>{footResult.status === 'ok' ? '✓' : '✗'}</span>{/if}
            </div>
          {/if}
        </div>
      </details>
    {/if}

  {:else if !verifyError}
    <div class="pro-empty">
      {#if hasResults}
        {t('pro.verifyPrompt')}
      {:else}
        {t('pro.solveFirst')}
      {/if}
    </div>
  {/if}
</div>

<style>
  .pro-verif { display: flex; flex-direction: column; height: 100%; }

  .design-context-banner {
    padding: 4px 10px;
    font-size: 0.65rem;
    color: #4ecdc4;
    background: #0a2a40;
    border-bottom: 1px solid #1a4a7a;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .pro-verif-header {
    padding: 8px 10px;
    border-bottom: 1px solid #1a3050;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pro-verif-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pro-verif-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: #4ecdc4;
  }

  .normative-sel {
    font-size: 0.65rem;
    padding: 3px 6px;
    min-width: 130px;
  }

  .mix-toggle {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.6rem;
    color: #888;
    cursor: pointer;
  }
  .mix-toggle input { width: 12px; height: 12px; }

  .mix-codes-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 4px 0;
  }
  .mix-code-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6rem;
    color: #888;
  }
  .mix-cat-label { color: #4ecdc4; font-weight: 600; }
  .mix-sel { min-width: 100px; }

  .pro-wasm-notice {
    padding: 4px 8px;
    font-size: 0.62rem;
    color: #f0a500;
    background: rgba(240, 165, 0, 0.1);
    border: 1px solid rgba(240, 165, 0, 0.25);
    border-radius: 3px;
  }

  .pro-verif-params {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .pro-verif-params label {
    font-size: 0.62rem;
    color: #888;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .pro-sel {
    padding: 2px 4px;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 2px;
    color: #ccc;
    font-size: 0.62rem;
    cursor: pointer;
  }

  .pro-verify-btn {
    align-self: flex-start;
    padding: 5px 16px;
    font-size: 0.72rem;
    font-weight: 600;
    color: #fff;
    background: linear-gradient(135deg, #0f7b6c, #0a5a4e);
    border: 1px solid #4ecdc4;
    border-radius: 4px;
    cursor: pointer;
  }

  .pro-verify-btn:hover { background: linear-gradient(135deg, #1a9a8a, #0f7b6c); }
  .pro-verify-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .qty-badge {
    font-size: 0.62rem;
    color: #aaa;
    font-family: monospace;
    margin-left: auto;
  }

  .qty-badge + .qty-badge { margin-left: 8px; }

  .pro-env-badge {
    font-size: 0.6rem;
    color: #4ecdc4;
    background: rgba(78, 205, 196, 0.1);
    padding: 2px 8px;
    border-radius: 3px;
    border: 1px solid rgba(78, 205, 196, 0.3);
  }

  .pro-verify-error {
    padding: 4px 8px;
    font-size: 0.68rem;
    color: #ff8a9e;
    background: rgba(233, 69, 96, 0.1);
    border-radius: 3px;
  }

  .pro-verif-summary {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 6px 10px;
    font-size: 0.75rem;
    font-weight: 600;
    border-bottom: 1px solid #1a3050;
  }
  .pro-show-model-btn {
    margin-left: auto;
    padding: 3px 10px;
    font-size: 0.65rem;
    font-weight: 600;
    background: linear-gradient(135deg, #2a6a5a, #1a5040);
    color: #ccc;
    border: 1px solid #3a7a6a;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }
  .pro-show-model-btn:hover { background: linear-gradient(135deg, #3a8a7a, #2a6060); color: #fff; }

  .pro-verif-table-wrap { flex: 1; overflow: auto; }

  .pro-verif-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
  .pro-verif-table thead { position: sticky; top: 0; z-index: 2; }
  .pro-verif-table th {
    padding: 4px 5px; text-align: left; font-size: 0.56rem; font-weight: 600;
    color: #888; text-transform: uppercase; background: #0a1a30; border-bottom: 1px solid #1a4a7a;
  }
  .pro-verif-table td { padding: 3px 5px; border-bottom: 1px solid #0f2030; color: #ccc; }
  .pro-verif-table tbody tr:hover { background: rgba(78, 205, 196, 0.05); }

  .col-id { width: 30px; color: #666; font-family: monospace; text-align: center; }
  .col-type { font-size: 0.62rem; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.65rem; }
  .governing-label { font-size: 0.55rem; color: #4a90d9; font-family: sans-serif; font-style: italic; }
  .col-stirrup { font-family: monospace; font-size: 0.6rem; white-space: nowrap; }
  .col-elems { font-size: 0.58rem; color: #888; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col-status { text-align: center; font-size: 0.85rem; }
  .slender-badge { font-size: 0.55rem; color: #f0a500; font-family: monospace; }
  .svc-badge { font-size: 0.68rem; color: #aaa; margin-right: 10px; }
  .col-sls { font-family: monospace; font-size: 0.6rem; text-align: center; white-space: nowrap; }
  .dim-text { color: #444; }
  .slender-factors { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 4px 0 6px; font-size: 0.65rem; font-family: monospace; color: #aaa; }
  .slender-factors span { white-space: nowrap; }
  .slender-highlight { color: #f0a500; font-weight: 600; }

  .status-ok { color: #4ecdc4; }
  .status-fail { color: #e94560; }
  .status-warn { color: #f0a500; }

  .detail-row td { padding: 0 !important; background: #0a1628 !important; }

  .detail-panel {
    display: flex;
    gap: 10px;
    padding: 10px;
    flex-wrap: wrap;
  }

  .detail-svg {
    flex-shrink: 0;
    background: #0f1a30;
    border: 1px solid #1a3050;
    border-radius: 4px;
    padding: 8px;
    overflow: auto;
    max-width: 100%;
  }

  .detail-svg :global(svg) {
    max-width: 100%;
    height: auto;
  }

  .detail-memo {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .memo-section {
    background: #0f1a30;
    border: 1px solid #1a3050;
    border-radius: 4px;
    padding: 6px 8px;
  }

  .memo-title {
    font-size: 0.65rem;
    font-weight: 600;
    color: #4ecdc4;
    margin-bottom: 4px;
    text-transform: uppercase;
  }

  .memo-step {
    font-size: 0.62rem;
    color: #aaa;
    font-family: monospace;
    line-height: 1.5;
  }

  .pro-section-label {
    padding: 6px 10px;
    font-size: 0.65rem;
    font-weight: 600;
    color: #4ecdc4;
    text-transform: uppercase;
    border-bottom: 1px solid #1a3050;
    background: rgba(78, 205, 196, 0.05);
  }

  .interaction-diagram {
    flex-shrink: 0;
  }

  .pro-empty {
    text-align: center;
    color: #555;
    font-style: italic;
    padding: 40px 10px;
  }

  /* ─── Section tabs ─── */
  .section-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid #1a3050;
    background: #0a1628;
  }
  .section-tabs button {
    padding: 6px 14px;
    font-size: 0.65rem;
    font-weight: 600;
    color: #666;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .section-tabs button:hover { color: #aaa; }
  .section-tabs button.active {
    color: #4ecdc4;
    border-bottom-color: #4ecdc4;
  }

  /* ─── Detailing gallery ─── */
  .detailing-content { flex: 1; overflow: auto; }

  .detailing-gallery {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 10px;
  }

  .gallery-item {
    background: #0a1628;
    border: 1px solid #1a3050;
    border-radius: 4px;
    padding: 8px;
    min-width: 200px;
    max-width: 500px;
  }

  .gallery-title {
    font-size: 0.62rem;
    font-weight: 600;
    color: #4ecdc4;
    margin-bottom: 6px;
    text-transform: uppercase;
  }

  .joint-notes {
    margin-top: 8px;
    padding: 6px 8px;
    background: #0f1a30;
    border: 1px solid #1a3050;
    border-radius: 3px;
  }

  /* ─── Schedule summary ─── */
  .schedule-summary {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .schedule-item {
    display: flex;
    justify-content: space-between;
    padding: 5px 10px;
    background: #0f1a30;
    border: 1px solid #1a3050;
    border-radius: 3px;
    font-size: 0.68rem;
  }
  .schedule-label { color: #888; }
  .schedule-value { color: #4ecdc4; font-family: monospace; font-weight: 600; }

  .pro-export-btn {
    padding: 3px 10px;
    font-size: 0.62rem;
    background: rgba(78, 205, 196, 0.1);
    color: #4ecdc4;
    border: 1px solid rgba(78, 205, 196, 0.3);
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
  }
  .pro-export-btn:hover:not(:disabled) { background: rgba(78, 205, 196, 0.2); }
  .pro-export-btn:disabled { opacity: 0.4; cursor: default; }

  /* ─── Schedule header ─── */
  .schedule-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .schedule-actions {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  /* ─── Override controls ─── */
  .override-card {
    flex-shrink: 0;
    width: 190px;
    background: #0f1a30;
    border: 1px solid #1a3050;
    border-radius: 4px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .override-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .override-title {
    font-size: 0.6rem;
    font-weight: 600;
    color: #4ecdc4;
    text-transform: uppercase;
  }
  .override-revert {
    font-size: 0.55rem;
    padding: 1px 6px;
    background: rgba(233, 69, 96, 0.15);
    color: #e94560;
    border: 1px solid rgba(233, 69, 96, 0.3);
    border-radius: 2px;
    cursor: pointer;
  }
  .override-revert:hover { background: rgba(233, 69, 96, 0.3); }
  .override-auto {
    font-size: 0.58rem;
    color: #777;
  }
  .override-auto .override-val {
    font-family: monospace;
    color: #999;
  }
  .override-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6rem;
  }
  .override-label { color: #888; font-size: 0.58rem; white-space: nowrap; }
  .override-input {
    width: 48px;
    padding: 2px 4px;
    font-size: 0.6rem;
    font-family: monospace;
    background: #0a1628;
    color: #ccc;
    border: 1px solid #1a3050;
    border-radius: 2px;
  }
  select.override-input { width: 52px; }
  .override-result {
    font-size: 0.58rem;
    font-family: monospace;
    color: #4ecdc4;
    padding: 2px 4px;
    background: rgba(78, 205, 196, 0.08);
    border-radius: 2px;
  }
  .override-under { color: #e94560; background: rgba(233, 69, 96, 0.08); }

  /* ─── Override marks ─── */
  .override-mark { color: #f0a500; font-weight: 600; }
  .schedule-override { background: rgba(240, 165, 0, 0.04); }
  .schedule-override td { border-bottom-color: rgba(240, 165, 0, 0.15); }

  /* ─── Slab cards ─── */
  .slab-card {
    margin: 8px 10px;
    background: #0a1628;
    border: 1px solid #1a3050;
    border-radius: 4px;
    overflow: hidden;
  }
  .slab-header {
    padding: 6px 10px;
    font-size: 0.65rem;
    font-weight: 600;
    color: #4ecdc4;
    background: rgba(78, 205, 196, 0.05);
    border-bottom: 1px solid #1a3050;
  }
  .slab-detail-row {
    display: flex;
    gap: 10px;
    padding: 10px;
    flex-wrap: wrap;
  }
  .slab-memo {
    flex: 1;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .drift-limit-note {
    font-size: 0.65rem;
    color: #8ba;
    padding: 2px 10px 4px;
  }

  /* ─── WASM check results ─── */
  .pro-verif-wasm { padding: 8px; overflow-y: auto; flex: 1; }
  .wasm-check-card { padding: 6px 8px; margin-bottom: 4px; background: #0d1b33; border: 1px solid #1a3a5a; border-radius: 4px; font-size: 0.72rem; }
  .wasm-check-card.fail { border-color: #e94560; }
  .wasm-check-header { display: flex; align-items: center; gap: 8px; }
  .wasm-ratio { font-weight: 700; color: #4ecdc4; }
  .wasm-ratio.fail { color: #e94560; }
  .wasm-status { font-size: 0.65rem; color: #778; }
  .wasm-checks { margin-top: 4px; padding-left: 8px; border-left: 2px solid #1a3a5a; }
  .wasm-check-line { display: flex; gap: 6px; font-size: 0.65rem; color: #aaa; padding: 1px 0; }
  .wasm-check-name { color: #8ab; }
  .wasm-check-ratio { font-weight: 600; color: #4ecdc4; }
  .wasm-check-ratio.fail { color: #e94560; }
  .wasm-check-msg { color: #888; font-size: 0.6rem; }

  /* ── Connections tab ── */
  .conn-details { margin-bottom: 6px; }
  .conn-summary { font-size: 0.72rem; color: #4ecdc4; font-weight: 600; cursor: pointer; padding: 4px 8px; background: #0d1b33; border-radius: 4px; }
  .conn-summary:hover { background: #122644; }
  .conn-panel { padding: 6px 8px; display: flex; flex-direction: column; gap: 6px; }
  .conn-form { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .conn-label { font-size: 0.62rem; color: #888; display: flex; align-items: center; gap: 3px; }
  .conn-label .adv-num { width: 55px; }
  .conn-result { padding: 4px 8px; font-size: 0.68rem; color: #ccc; background: rgba(78, 205, 196, 0.08); border: 1px solid rgba(78, 205, 196, 0.2); border-radius: 4px; display: flex; gap: 10px; flex-wrap: wrap; }
  .conn-result.fail { border-color: #e94560; background: rgba(233, 69, 96, 0.08); }
  .adv-btn-sm { padding: 3px 10px; border: 1px solid #1a4a7a; border-radius: 4px; background: #0f3460; color: #4ecdc4; font-size: 0.68rem; cursor: pointer; }
  .adv-btn-sm:hover { background: #1a4a7a; color: white; }
</style>
