<script lang="ts">
  import { modelStore, resultsStore, uiStore, verificationStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { DESIGN_CODES, type DesignCodeId } from '../../lib/engine/codes/index';
  import {
    normalizeWasmSteel, normalizeWasmRC,
    buildDesignSummary,
    type MemberDesignResult, type DesignCheckSummary, type CheckStatus,
  } from '../../lib/engine/design-check-results';
  import { computeStationDemands, runCirsocDesign, getCodeDetail } from '../../lib/engine/verification-service';
  import {
    extractElementStations, extractGoverningDemands, type ElementDesignDemands, type ElementStationResult,
    verifyProvidedReinforcement, rebarGroupArea, formatRebarGroup,
    resolveLayers, layersTotalArea, formatLayers, checkRowFit,
    computeSectionLayout, computeColumnLayout, resolveColumnReinf, checkBeamAnchorage, requiredLd,
    type SectionLayout, type ColumnLayout, type BarInstance, type SpacingIssue, type AnchorageCheck,
    type ProvidedRebarResult,
  } from '../../lib/engine/station-design-forces';
  import type { RebarLayer } from '../../lib/store/model.svelte';
  import { REBAR_DB } from '../../lib/engine/codes/argentina/cirsoc201';
  import type { ProvidedReinforcement, RebarGroup } from '../../lib/store/model.svelte';
  import { checkSteelMembers, checkRcMembers, checkEc2Members, checkEc3Members, checkTimberMembers, checkMasonryMembers, checkCfsMembers } from '../../lib/engine/wasm-solver';
  import { generateInteractionDiagram, generateInteractionSvg } from '../../lib/engine/codes/argentina/interaction-diagram';
  import type { DiagramParams } from '../../lib/engine/codes/argentina/interaction-diagram';

  // ─── State ──────────────────────────────────────────────────────
  let selectedCode = $state<DesignCodeId>('cirsoc');
  let running = $state(false);
  let error = $state<string | null>(null);
  let statusFilter = $state<'all' | CheckStatus | 'selected' | 'modified' | 'undesigned'>('selected');
  let expandedElemId = $state<number | null>(null);

  /** Selected bar in the section SVG. */
  interface BarSelection { elemId: number; region: 'start' | 'span' | 'end'; face: 'top' | 'bottom'; row: number; index: number; diameter: number }
  let selectedBar = $state<BarSelection | null>(null);

  /** Station-based data for ALL elements — computed via shared verification service. */
  const allStationData = $derived.by(() => {
    if (!resultsStore.hasCombinations3D) return { demands: new Map<number, ElementDesignDemands>(), stations: new Map<number, ElementStationResult>() };
    return computeStationDemands(resultsStore.perCombo3D, modelStore.model.combinations, { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports });
  });
  const allStationDemands = $derived(allStationData.demands);

  /** Station-based governing demands for the currently expanded element (for display). */
  const expandedDemands = $derived.by((): ElementDesignDemands | null => {
    if (expandedElemId === null) return null;
    return allStationDemands.get(expandedElemId) ?? null;
  });

  const results3D = $derived(resultsStore.results3D);
  const hasResults = $derived(results3D !== null);
  const summary = $derived(verificationStore.summary);
  const designResults = $derived(verificationStore.design);

  // Force reactivity when elements change — _reinfVersion increments on every
  // setProvided call, ensuring all derived computations re-evaluate
  let _reinfVersion = $state(0);

  /** Enriched results with live provided-verification data baked in.
   *  Recomputes whenever _reinfVersion changes (any setProvided call).
   *  By embedding utilization in the {#each} source items themselves, we bypass
   *  Svelte 5's keyed-block {@const} reactivity limitations entirely — the items
   *  change, so the blocks re-render. */
  type EnrichedResult = MemberDesignResult & {
    pv: ProvidedRebarResult | null;
    pvCapChecks: Array<{ category: string; ratio: number; status: string }>;
    pvWorstCheck: { category: string; ratio: number } | null;
    pvUtilization: number | null;
    govRatio: number;
  };
  const enrichedResults = $derived.by((): EnrichedResult[] => {
    void _reinfVersion; // explicit dependency — forces recompute on every setProvided
    return filteredResults.map(r => {
      const pv = getProvidedVerification(r.elementId);
      const pvCapChecks = pv?.checks.filter(c => !c.category.startsWith('Anchorage') && !c.category.startsWith('Fit') && c.ratio > 0) ?? [];
      const pvWorstCheck = pvCapChecks.length > 0 ? pvCapChecks.reduce((min, c) => c.ratio < min.ratio ? c : min) : null;
      const pvUtilization = pvWorstCheck ? Math.round((1 / pvWorstCheck.ratio) * 100) / 100 : null;
      return {
        ...r,
        pv,
        pvCapChecks,
        pvWorstCheck,
        pvUtilization,
        govRatio: pvUtilization != null ? pvUtilization : r.utilization,
      };
    });
  });
  const _elemVer = $derived(modelStore.model.elements.size);

  /** Get section geometry for an element directly from the model (not from verification). */
  function getElemSection(elemId: number): { b: number; h: number; cover: number; stirrupDia: number } {
    const elem = modelStore.elements.get(elemId);
    const sec = elem ? modelStore.sections.get(elem.sectionId) : undefined;
    const mat = elem ? modelStore.materials.get(elem.materialId) : undefined;
    return {
      b: sec?.b ?? 0.30,
      h: sec?.h ?? 0.50,
      cover: 0.025, // default cover
      stirrupDia: 8, // default stirrup
    };
  }

  /** Modified-rebar tracking: elements where the user has provided reinforcement. */
  const modifiedElements = $derived.by(() => {
    const mods: Array<{ elemId: number; type: string; regions: string[]; fitIssues: number; strengthFails: number; constrIssues: number }> = [];
    void _elemVer;
    for (const [id, elem] of modelStore.elements) {
      if (!elem.reinforcement) continue;
      const regions: string[] = [];
      const reg = elem.reinforcement.regions;
      if (reg?.topStartLayers?.length || reg?.topStart) regions.push('topStart');
      if (reg?.bottomSpanLayers?.length || reg?.bottomSpan) regions.push('bottomSpan');
      if (reg?.topEndLayers?.length || reg?.topEnd) regions.push('topEnd');
      if (reg?.stirrupsSupport) regions.push('stirrups-sup');
      if (reg?.stirrupsSpan) regions.push('stirrups-span');
      if (!reg && (elem.reinforcement.top || elem.reinforcement.bottom)) regions.push('global');
      if (elem.reinforcement.longitudinal) regions.push('longitudinal');
      if (elem.reinforcement.stirrups) regions.push('stirrups');
      const pv = getProvidedVerification(id);
      const fitIssues = pv?.checks.filter(c => c.category.startsWith('Fit:') && c.status === 'fail').length ?? 0;
      const strengthFails = pv?.checks.filter(c => !c.category.startsWith('Fit:') && c.status === 'fail').length ?? 0;
      // Count geometry-driven constructibility issues from layouts (uses model geometry, not verification)
      const sec = getElemSection(id);
      const stirDia = elem.reinforcement.stirrups?.diameter ?? elem.reinforcement.regions?.stirrupsSupport?.diameter ?? sec.stirrupDia;
      let constrIssues = 0;
      if (sec.b && sec.h && reg) {
        const tsL = resolveLayers(reg.topStartLayers, reg.topStart ?? elem.reinforcement.top);
        const bsL = resolveLayers(reg.bottomSpanLayers, reg.bottomSpan ?? elem.reinforcement.bottom);
        const layout = computeSectionLayout(tsL, bsL, sec.b, sec.h, sec.cover, stirDia);
        constrIssues = layout.issues.length;
      }
      // Column constructibility
      if (sec.b && sec.h && elem.reinforcement.longitudinal) {
        const colLayout = computeColumnLayout(elem.reinforcement.longitudinal.count, elem.reinforcement.longitudinal.diameter, sec.b, sec.h, sec.cover, stirDia);
        constrIssues += colLayout.issues.length;
      }
      mods.push({ elemId: id, type: regions.length > 0 ? 'beam' : 'column', regions, fitIssues, strengthFails, constrIssues });
    }
    return mods;
  });

  const filteredResults = $derived.by(() => {
    if (statusFilter === 'all') return designResults;
    if (statusFilter === 'selected') return designResults;
    if (statusFilter === 'undesigned') return designResults.filter(r => !modelStore.elements.get(r.elementId)?.reinforcement);
    if (statusFilter === 'modified') return designResults.filter(r => userModifiedElems.has(r.elementId));
    // Status filters only apply to elements with provided reinforcement (designed)
    return designResults.filter(r => {
      const hasReinf = modelStore.elements.get(r.elementId)?.reinforcement;
      return hasReinf && r.status === statusFilter;
    });
  });

  // ─── Section name lookup ────────────────────────────────────────
  function getSectionNames(): Map<number, string> {
    const names = new Map<number, string>();
    for (const elem of modelStore.elements.values()) {
      const sec = modelStore.sections.get(elem.sectionId);
      if (sec) names.set(elem.id, sec.name);
    }
    return names;
  }

  // ─── WASM check payload builder (mirrors ProVerificationTab) ────
  function buildCheckPayload() {
    if (!results3D) return null;
    const members: any[] = [];
    for (const ef of results3D.elementForces) {
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
        elementId: ef.elementId, length: L,
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

  // ─── Run design check ──────────────────────────────────────────
  function runDesignCheck() {
    error = null;
    if (!results3D) { error = t('pro.solveFirst'); return; }

    running = true;
    const sectionNames = getSectionNames();
    let normalized: MemberDesignResult[] = [];

    try {
      if (selectedCode === 'cirsoc') {
        // Single-call CIRSOC design via verification service
        const governing = resultsStore.governing3D.size > 0 ? resultsStore.governing3D : null;
        const { normalized: rcResults } = runCirsocDesign(
          results3D,
          { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports },
          allStationDemands.size > 0 ? allStationDemands : undefined,
          sectionNames, governing,
        );
        normalized = rcResults;
      } else {
        // WASM path for all other codes
        const payload = buildCheckPayload();
        if (!payload) { error = t('pro.solveFirst'); running = false; return; }

        let codeName = '';
        let rawResult: any = null;

        switch (selectedCode) {
          case 'aci-aisc': {
            codeName = 'ACI 318 / AISC 360';
            const rcResult = checkRcMembers(payload);
            const steelResult = checkSteelMembers(payload);
            const rcNorm = rcResult?.members ? normalizeWasmRC(rcResult.members, 'aci-aisc', 'ACI 318', sectionNames) : [];
            const steelNorm = steelResult?.members ? normalizeWasmSteel(steelResult.members, 'aci-aisc', 'AISC 360', sectionNames) : [];
            normalized = [...rcNorm, ...steelNorm];
            break;
          }
          case 'eurocode': {
            codeName = 'Eurocode 2/3';
            const ec2Result = checkEc2Members(payload);
            const ec3Result = checkEc3Members(payload);
            const ec2Norm = ec2Result?.members ? normalizeWasmRC(ec2Result.members, 'eurocode', 'Eurocode 2', sectionNames) : [];
            const ec3Norm = ec3Result?.members ? normalizeWasmSteel(ec3Result.members, 'eurocode', 'Eurocode 3', sectionNames) : [];
            normalized = [...ec2Norm, ...ec3Norm];
            break;
          }
          case 'nds': {
            codeName = 'NDS (Timber)';
            rawResult = checkTimberMembers(payload);
            // Timber normalization not yet implemented — show raw count
            if (rawResult?.members) normalized = normalizeWasmRC(rawResult.members, 'nds', codeName, sectionNames);
            break;
          }
          case 'masonry': {
            codeName = 'TMS 402 (Masonry)';
            rawResult = checkMasonryMembers(payload);
            if (rawResult?.members) normalized = normalizeWasmRC(rawResult.members, 'masonry', codeName, sectionNames);
            break;
          }
          case 'cfs': {
            codeName = 'AISI S100 (CFS)';
            rawResult = checkCfsMembers(payload);
            if (rawResult?.members) normalized = normalizeWasmRC(rawResult.members, 'cfs', codeName, sectionNames);
            break;
          }
        }

        if (normalized.length === 0) {
          error = `No members checked. The ${codeName || selectedCode} check may not be available for this model.`;
          running = false;
          return;
        }
      }

      // For non-CIRSOC codes, update the design results store (CIRSOC handled inside runCirsocDesign)
      if (selectedCode !== 'cirsoc') {
        const codeInfo = DESIGN_CODES.find(c => c.id === selectedCode);
        const summaryData = buildDesignSummary(normalized, selectedCode, codeInfo?.label ?? selectedCode);
        verificationStore.setDesignResults(summaryData.results, summaryData);
      }

      // Activate verification overlay in viewport
      resultsStore.diagramType = 'verification';
    } catch (e: any) {
      error = e.message || 'Design check failed';
    } finally {
      running = false;
    }
  }

  /** Combined action: run design check + auto-design all elements in one step. */
  function runDesign() {
    runDesignCheck();
    if (!error) {
      acceptAutoDesignAll();
    }
  }

  // ─── Formatting helpers ─────────────────────────────────────────
  function fmtRatio(r: number): string {
    if (r < 0.001) return '0.00';
    return r.toFixed(2);
  }

  function statusIcon(s: CheckStatus): string {
    return s === 'ok' ? '✓' : s === 'warn' ? '⚠' : '✗';
  }

  function statusClass(s: CheckStatus): string {
    return s === 'ok' ? 'status-ok' : s === 'warn' ? 'status-warn' : 'status-fail';
  }

  /** Track which elements were batch-auto-designed vs user-modified. */
  let autoDesignedElems = $state(new Set<number>());
  let userModifiedElems = $state(new Set<number>());

  /** Accept auto-design for ALL verified elements in one batch.
   *  Iterates normalized designResults (not concrete-specific storage). */
  function acceptAutoDesignAll() {
    let count = 0;
    for (const r of designResults) {
      const elem = modelStore.elements.get(r.elementId);
      if (!elem?.reinforcement) {
        acceptAutoDesign(r.elementId);
        count++;
      }
    }
    return count;
  }

  function ratioBarWidth(r: number): string {
    return Math.min(r * 100, 100) + '%';
  }

  function ratioBarColor(r: number): string {
    if (r <= 0.5) return '#22cc66';
    if (r <= 0.9) return '#88cc22';
    if (r <= 1.0) return '#ddaa00';
    if (r <= 1.1) return '#ff6600';
    return '#ee2222';
  }

  // ─── Provided Reinforcement helpers ────────────────────────────
  const LONG_DIAS = REBAR_DB.filter(r => r.diameter >= 10).map(r => r.diameter); // 10, 12, 16, 20, 25, 32
  const STIRRUP_DIAS = REBAR_DB.filter(r => r.diameter <= 12).map(r => r.diameter); // 6, 8, 10, 12

  /** Get provided reinforcement for an element. */
  function getProvided(elemId: number): ProvidedReinforcement | undefined {
    return modelStore.elements.get(elemId)?.reinforcement;
  }

  /** Update provided reinforcement on an element.
   *  Uses $state.snapshot + JSON round-trip to guarantee a completely fresh object
   *  tree with no Svelte 5 Proxy wrappers and no shared references. This is critical
   *  for reactivity: callers mutate the existing object in-place, so without deep
   *  cloning the Proxy-unwrapped data, template expressions see the same reference
   *  and skip re-rendering. */
  function setProvided(elemId: number, reinf: ProvidedReinforcement | undefined, isAutoDesign = false) {
    const elem = modelStore.elements.get(elemId);
    if (!elem) return;
    // Unwrap Svelte 5 Proxy, then deep-clone to guarantee new references
    elem.reinforcement = reinf ? JSON.parse(JSON.stringify($state.snapshot(reinf))) : undefined;
    modelStore.model.elements = new Map(modelStore.model.elements);
    _reinfVersion++;
    // Track auto-designed vs user-modified
    if (!isAutoDesign && reinf) {
      userModifiedElems = new Set([...userModifiedElems, elemId]);
    }
  }

  /** Accept auto-designed reinforcement as provided (copies from verification result).
   *  TRANSITIONAL: Reads CIRSOC-specific auto-design proposal from concreteMap.
   *  Phase 2: solver returns design proposals as part of VerificationReport. */
  function acceptAutoDesign(elemId: number) {
    const v = verificationStore.concreteMap.get(elemId);
    if (!v) return;
    const reinf: ProvidedReinforcement = {};
    if (v.elementType === 'beam' || v.elementType === 'wall') {
      const topBars = (v.flexure.isDoublyReinforced && v.flexure.barCountComp && v.flexure.barDiaComp)
        ? { count: v.flexure.barCountComp, diameter: v.flexure.barDiaComp }
        : undefined;
      const stirDef = { diameter: v.shear.stirrupDia, legs: v.shear.stirrupLegs, spacing: v.shear.spacing };
      reinf.regions = {
        topStart: topBars ? { ...topBars } : undefined,
        topEnd: topBars ? { ...topBars } : undefined,
        bottomSpan: { count: v.flexure.barCount, diameter: v.flexure.barDia },
        stirrupsSupport: { ...stirDef },
        stirrupsSpan: { ...stirDef, spacing: Math.min(stirDef.spacing * 1.5, 0.30) }, // wider in span
      };
    } else if (v.elementType === 'column') {
      if (v.column) {
        // Create structured column reinforcement from auto-design.
        // SYMMETRIC PREFERENCE: round total up to nearest multiple of 4 (4 equal faces).
        // This preserves biaxial symmetry which is overwhelmingly preferred in practice
        // unless the engineer explicitly overrides. Extra bars over the required count
        // provide additional margin — acceptable since auto-design provides the minimum.
        const nRequired = v.column.barCount;
        const dia = v.column.barDia;
        const nSymmetric = Math.ceil(Math.max(nRequired - 4, 0) / 4) * 4 + 4; // ensure ≥ required, symmetric
        const perFace = (nSymmetric - 4) / 4;
        reinf.column = {
          cornerDia: dia, faceDia: dia,
          nBottom: perFace, nTop: perFace,
          nRight: perFace, nLeft: perFace,
        };
        // Legacy field: use symmetric total, not the asymmetric original
        reinf.longitudinal = { count: nSymmetric, diameter: dia };
      }
      reinf.stirrups = {
        diameter: v.shear.stirrupDia,
        legs: v.shear.stirrupLegs,
        spacing: v.shear.spacing,
      };
    }
    setProvided(elemId, reinf, true);
    autoDesignedElems = new Set([...autoDesignedElems, elemId]);
  }

  /** Clear provided reinforcement from an element. */
  function clearProvided(elemId: number) {
    setProvided(elemId, undefined);
  }

  /** Get provided-reinforcement verification result for an element.
   *  TRANSITIONAL: Reads from concreteMap (CIRSOC-specific ElementVerification)
   *  for auto-design reference values. Phase 2: solver returns these as part of
   *  the unified VerificationReport, eliminating this dependency. */
  function getProvidedVerification(elemId: number): ProvidedRebarResult | null {
    const elem = modelStore.elements.get(elemId);
    if (!elem?.reinforcement) return null;
    const v = verificationStore.concreteMap.get(elemId);
    if (!v) return null;
    const demands = allStationDemands.get(elemId);
    // Pass section data for capacity-based recalculation (CIRSOC 201 φMn/φVn)
    const sectionData = (v.b && v.h && v.fc && v.fy)
      ? { b: v.b, h: v.h, fc: v.fc, fy: v.fy, cover: v.cover, stirrupDia: v.shear.stirrupDia }
      : undefined;
    const stationResult = allStationData.stations.get(elemId);
    return verifyProvidedReinforcement(
      elemId, v.elementType, elem.reinforcement, demands,
      {
        flexure: { AsReq: v.flexure.AsReq, AsComp: v.flexure.AsComp, isDoublyReinforced: v.flexure.isDoublyReinforced },
        shear: { AvOverS: v.shear.AvOverS, AvOverSMin: v.shear.AvOverSMin },
        column: v.column ? { AsTotal: v.column.AsTotal } : undefined,
      },
      sectionData,
      stationResult,
      // Model data for geometry-aware critical section computation
      {
        nodes: modelStore.nodes as any,
        elements: modelStore.elements as any,
        sections: modelStore.sections as any,
        supports: modelStore.supports as any,
      },
    );
  }

  // ─── Layer editing helpers ─────────────────────────────────────
  type LayerField = 'topStartLayers' | 'topEndLayers' | 'bottomSpanLayers';

  /** Get resolved layers for a region field. */
  function getRegionLayers(elemId: number, field: LayerField): RebarLayer[] {
    const prov = getProvided(elemId);
    if (!prov?.regions) {
      // Fallback: resolve from grouped field
      const gField = field === 'topStartLayers' ? 'topStart' : field === 'topEndLayers' ? 'topEnd' : 'bottomSpan';
      const legacyField = field.includes('top') ? 'top' : 'bottom';
      return resolveLayers(undefined, prov?.regions?.[gField] ?? (prov as any)?.[legacyField]);
    }
    const gField = field === 'topStartLayers' ? 'topStart' : field === 'topEndLayers' ? 'topEnd' : 'bottomSpan';
    return resolveLayers(prov.regions[field], prov.regions[gField] ?? (prov as any)?.[field.includes('top') ? 'top' : 'bottom']);
  }

  /** Set layers for a region field and update the model. */
  function setRegionLayers(elemId: number, field: LayerField, layers: RebarLayer[]) {
    const p = getProvided(elemId) ?? {};
    if (!p.regions) p.regions = {};
    p.regions[field] = layers.length > 0 ? layers : undefined;
    // Also update the grouped field from the first layer for backward compat
    const gField = field === 'topStartLayers' ? 'topStart' : field === 'topEndLayers' ? 'topEnd' : 'bottomSpan';
    if (layers.length > 0) {
      const total = layers.reduce((s, l) => s + l.count, 0);
      p.regions[gField] = { count: total, diameter: layers[0].diameter };
    } else {
      delete p.regions[gField];
    }
    setProvided(elemId, p);
  }

  /** Add a new layer row to a region. */
  function addLayerRow(elemId: number, field: LayerField) {
    const layers = getRegionLayers(elemId, field);
    const newRow = layers.length > 0 ? Math.max(...layers.map(l => l.row)) + 1 : 0;
    const prevDia = layers.length > 0 ? layers[layers.length - 1].diameter : 16;
    layers.push({ count: 2, diameter: prevDia, row: newRow });
    setRegionLayers(elemId, field, layers);
  }

  /** Remove a layer row from a region. */
  function removeLayerRow(elemId: number, field: LayerField, row: number) {
    let layers = getRegionLayers(elemId, field).filter(l => l.row !== row);
    // Re-index rows
    layers = layers.map((l, i) => ({ ...l, row: i }));
    setRegionLayers(elemId, field, layers);
  }

  /** Update a specific layer's count or diameter. */
  function updateLayer(elemId: number, field: LayerField, row: number, key: 'count' | 'diameter', value: number) {
    const layers = getRegionLayers(elemId, field);
    const layer = layers.find(l => l.row === row);
    if (layer) {
      if (key === 'count') layer.count = Math.max(1, value);
      else layer.diameter = value;
    }
    setRegionLayers(elemId, field, layers);
  }

  /** Auto-split bars into rows based on section width. */
  function autoSplitRows(elemId: number, field: LayerField) {
    const sec = getElemSection(elemId);
    if (!sec.b) return;
    const layers = getRegionLayers(elemId, field);
    if (layers.length === 0) return;
    const totalCount = layers.reduce((s, l) => s + l.count, 0);
    const dia = layers[0].diameter;
    const barDia_m = dia / 1000;
    const prov = getProvided(elemId);
    const stirDia_m = (prov?.stirrups?.diameter ?? prov?.regions?.stirrupsSupport?.diameter ?? sec.stirrupDia) / 1000;
    const avail = sec.b - 2 * sec.cover - 2 * stirDia_m;
    const minGap = Math.max(barDia_m, 0.025); // CIRSOC 201 §7.6
    const maxPerRow = Math.max(1, Math.floor((avail + minGap) / (barDia_m + minGap)));
    const nRows = Math.ceil(totalCount / maxPerRow);
    const newLayers: RebarLayer[] = [];
    let remaining = totalCount;
    for (let r = 0; r < nRows; r++) {
      const n = Math.min(remaining, maxPerRow);
      newLayers.push({ count: n, diameter: dia, row: r });
      remaining -= n;
    }
    setRegionLayers(elemId, field, newLayers);
  }

  /** Quick row-fit check for a single layer (for inline editor warnings). */
  function rowFits(elemId: number, layer: RebarLayer): boolean {
    const sec = getElemSection(elemId);
    if (!sec.b) return true;
    const prov = getProvided(elemId);
    const stirDia_m = (prov?.stirrups?.diameter ?? prov?.regions?.stirrupsSupport?.diameter ?? sec.stirrupDia) / 1000;
    const availW = sec.b - 2 * sec.cover - 2 * stirDia_m;
    const barDia_m = layer.diameter / 1000;
    const minGap = Math.max(barDia_m, 0.025);
    const reqW = layer.count * barDia_m + Math.max(0, layer.count - 1) * minGap;
    return reqW <= availW + 0.001;
  }

  // ─── Bar-level editing helpers ─────────────────────────────────

  /** Map a region name to the corresponding layer field. */
  function regionToField(region: 'start' | 'span' | 'end', face: 'top' | 'bottom'): LayerField {
    if (face === 'top') return region === 'end' ? 'topEndLayers' : 'topStartLayers';
    return 'bottomSpanLayers';
  }

  // ─── Bar Group editing helpers ─────────────────────────────────
  type GroupField = 'bottomGroups' | 'topStartGroups' | 'topEndGroups';
  import type { LongBarGroup } from '../../lib/store/model.svelte';
  import { resolveBarGroups } from '../../lib/engine/station-design-forces';

  function getBarGroups(elemId: number, field: GroupField): LongBarGroup[] {
    const prov = getProvided(elemId);
    if (!prov?.regions) return [];
    const groups = prov.regions[field];
    if (groups && groups.length > 0) return groups;
    // Fallback: resolve from flat layers into a single "all" group
    const flatField = field === 'bottomGroups' ? 'bottomSpanLayers' : field === 'topStartGroups' ? 'topStartLayers' : 'topEndLayers';
    const groupedField = field === 'bottomGroups' ? 'bottomSpan' : field === 'topStartGroups' ? 'topStart' : 'topEnd';
    const flat = resolveLayers(prov.regions[flatField], prov.regions[groupedField] ?? (field.includes('bottom') ? prov.bottom : prov.top));
    if (flat.length === 0) return [];
    const cont = prov.regions.continuity;
    const cs = field === 'bottomGroups' ? (cont?.bottomIntoStart !== false) : true;
    const ce = field === 'bottomGroups' ? (cont?.bottomIntoEnd !== false) : field === 'topStartGroups' ? (cont?.topStartIntoSpan !== false) : true;
    return [{ layers: flat, label: 'all', continueStart: cs, continueEnd: ce }];
  }

  function setBarGroups(elemId: number, field: GroupField, groups: LongBarGroup[]) {
    const p = getProvided(elemId) ?? {};
    if (!p.regions) p.regions = {};
    p.regions[field] = groups.length > 0 ? groups : undefined;
    // Also update flat layers from all groups combined for backward compat
    const allLayers: RebarLayer[] = [];
    for (const g of groups) allLayers.push(...g.layers);
    const flatField = field === 'bottomGroups' ? 'bottomSpanLayers' : field === 'topStartGroups' ? 'topStartLayers' : 'topEndLayers';
    p.regions[flatField] = allLayers.length > 0 ? allLayers : undefined;
    setProvided(elemId, p);
  }

  function addBarGroup(elemId: number, field: GroupField) {
    const groups = getBarGroups(elemId, field);
    groups.push({ layers: [{ count: 2, diameter: 16, row: 0 }], label: `G${groups.length + 1}`, continueStart: true, continueEnd: true });
    setBarGroups(elemId, field, groups);
  }

  function removeBarGroup(elemId: number, field: GroupField, idx: number) {
    const groups = getBarGroups(elemId, field);
    groups.splice(idx, 1);
    setBarGroups(elemId, field, groups);
  }

  function updateBarGroupField(elemId: number, field: GroupField, idx: number, key: string, value: any) {
    const groups = getBarGroups(elemId, field);
    if (groups[idx]) (groups[idx] as any)[key] = value;
    setBarGroups(elemId, field, groups);
  }

  function updateBarGroupLayer(elemId: number, field: GroupField, gIdx: number, lKey: 'count' | 'diameter', value: number) {
    const groups = getBarGroups(elemId, field);
    if (groups[gIdx]?.layers[0]) {
      if (lKey === 'count') groups[gIdx].layers[0].count = Math.max(1, value);
      else groups[gIdx].layers[0].diameter = value;
    }
    setBarGroups(elemId, field, groups);
  }

  /** Select a bar from the section SVG. */
  function selectBar(elemId: number, region: 'start' | 'span' | 'end', bar: BarInstance) {
    if (selectedBar && selectedBar.elemId === elemId && selectedBar.region === region && selectedBar.face === bar.face && selectedBar.row === bar.row && selectedBar.index === bar.index) {
      selectedBar = null; // toggle off
    } else {
      selectedBar = { elemId, region, face: bar.face, row: bar.row, index: bar.index, diameter: bar.diameter };
    }
  }

  /** Change the diameter of all bars in the selected bar's row. */
  function changeSelectedBarDia(newDia: number) {
    if (!selectedBar) return;
    const field = regionToField(selectedBar.region, selectedBar.face);
    updateLayer(selectedBar.elemId, field, selectedBar.row, 'diameter', newDia);
    selectedBar = { ...selectedBar, diameter: newDia };
  }

  /** Add one bar to the selected bar's row. */
  function addBarToSelectedRow() {
    if (!selectedBar) return;
    const field = regionToField(selectedBar.region, selectedBar.face);
    const layers = getRegionLayers(selectedBar.elemId, field);
    const layer = layers.find(l => l.row === selectedBar!.row);
    if (layer) {
      layer.count++;
      setRegionLayers(selectedBar.elemId, field, layers);
    }
  }

  /** Remove one bar from the selected bar's row. */
  function removeBarFromSelectedRow() {
    if (!selectedBar) return;
    const field = regionToField(selectedBar.region, selectedBar.face);
    const layers = getRegionLayers(selectedBar.elemId, field);
    const layer = layers.find(l => l.row === selectedBar!.row);
    if (layer && layer.count > 1) {
      layer.count--;
      setRegionLayers(selectedBar.elemId, field, layers);
      // If selected index is beyond new count, adjust
      if (selectedBar.index >= layer.count) selectedBar = { ...selectedBar, index: layer.count - 1 };
    } else if (layer && layer.count === 1) {
      // Removing last bar removes the row
      removeLayerRow(selectedBar.elemId, field, selectedBar.row);
      selectedBar = null;
    }
  }

  /** Check if a bar matches the current selection. */
  function isBarSelected(elemId: number, region: string, bar: BarInstance): boolean {
    if (!selectedBar) return false;
    return selectedBar.elemId === elemId && selectedBar.region === region && selectedBar.face === bar.face && selectedBar.row === bar.row && selectedBar.index === bar.index;
  }
</script>

<div class="design-tab">
  <!-- Summary bar -->
  <div class="summary-bar">
    <div class="summary-left">
      <select class="code-select" bind:value={selectedCode}>
        {#each DESIGN_CODES as code}
          <option value={code.id}>{code.label}</option>
        {/each}
      </select>
      <button class="run-btn" onclick={runDesign} disabled={!hasResults || running}>
        {running ? 'Designing...' : 'Run Design'}
      </button>
    </div>
    {#if summary}
      <div class="summary-counts">
        <span class="count count-total">{summary.totalMembers} members</span>
        <span class="count count-pass">{statusIcon('ok')} {summary.pass}</span>
        <span class="count count-warn">{statusIcon('warn')} {summary.warn}</span>
        <span class="count count-fail">{statusIcon('fail')} {summary.fail}</span>
      </div>
    {/if}
  </div>

  {#if error}
    <div class="error-bar">{error}</div>
  {/if}

  {#if !hasResults}
    <div class="placeholder">Solve the model first to run design checks.</div>
  {:else if designResults.length === 0 && !error}
    <div class="placeholder">Select a design code and click "Run Design" to design all members.</div>
  {:else}
    <!-- Filter bar -->
    <div class="filter-bar">
      <button class:active={statusFilter === 'selected'} onclick={() => { statusFilter = 'selected'; resultsStore.diagramType = 'verification'; if (expandedElemId) { uiStore.selectMode = 'elements'; uiStore.setSelection(new Set(), new Set([expandedElemId])); } else { uiStore.setSelection(new Set(), new Set()); } }}>Selected</button>
      <button class:active={statusFilter === 'all'} onclick={() => { statusFilter = 'all'; resultsStore.diagramType = 'verification'; uiStore.selectMode = 'elements'; uiStore.setSelection(new Set(), new Set()); }}>All</button>
      <button class:active={statusFilter === 'undesigned'} onclick={() => { statusFilter = 'undesigned'; resultsStore.diagramType = 'verification'; }}>Un-designed</button>
      <button class:active={statusFilter === 'fail'} onclick={() => { statusFilter = 'fail'; resultsStore.diagramType = 'verification'; }}>Fail</button>
      <button class:active={statusFilter === 'warn'} onclick={() => { statusFilter = 'warn'; resultsStore.diagramType = 'verification'; }}>Warn</button>
      <button class:active={statusFilter === 'ok'} onclick={() => { statusFilter = 'ok'; resultsStore.diagramType = 'verification'; }}>Pass</button>
      <button class:active={statusFilter === 'modified'} onclick={() => { statusFilter = 'modified'; resultsStore.diagramType = 'verification'; }}>Modified</button>
    </div>

    <!-- Member table -->
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th class="col-id">Elem</th>
            <th class="col-type">Type</th>
            <th class="col-section">Section</th>
            <th class="col-check">Governing Check</th>
            <th class="col-ratio">Utilization</th>
            <th class="col-status">Status</th>
            <th class="col-combo">Combo</th>
          </tr>
        </thead>
        <tbody>
          {#each enrichedResults as r (r.elementId)}
            {@const pv = r.pv}
            {@const pvWorstCheck = r.pvWorstCheck}
            {@const pvUtilization = r.pvUtilization}
            {@const govRatio = r.govRatio}
            {@const pvFailCheck = pv?.checks.find(c => c.status === 'fail')}
            {@const pvWarnCheck = pv?.checks.find(c => c.status === 'warn')}
            {@const pvFails = pv != null && pv.overallStatus === 'fail'}
            {@const pvWarns = pv != null && pv.overallStatus === 'warn'}
            {@const effectiveStatus = pvFails ? 'fail' : (pv == null || pv.overallStatus === 'none') ? r.status : pvWarns ? (r.status === 'fail' ? 'fail' : 'warn') : r.status}
            {@const govLabel = pvFails && pvFailCheck ? pvFailCheck.category : pvWarns && pvWarnCheck && r.status !== 'fail' ? pvWarnCheck.category : r.governingCheck}
            <tr class={statusClass(effectiveStatus)} onclick={() => { uiStore.selectMode = 'elements'; uiStore.selectElement(r.elementId, false); expandedElemId = expandedElemId === r.elementId ? null : r.elementId; }} style="cursor:pointer">
              <td class="col-id">{r.elementId}</td>
              <td class="col-type">{r.elementType}</td>
              <td class="col-section">{r.sectionName}</td>
              <td class="col-check">{govLabel}</td>
              <td class="col-ratio">
                <div class="ratio-cell">
                  <span class="ratio-value">{fmtRatio(govRatio)}</span>
                  <div class="ratio-bar">
                    <div class="ratio-fill" style="width:{ratioBarWidth(govRatio)};background:{ratioBarColor(govRatio)}"></div>
                  </div>
                </div>
              </td>
              <td class="col-status"><span class="status-badge {statusClass(effectiveStatus)}">{statusIcon(effectiveStatus)}</span></td>
              <td class="col-combo">{pvFails && pvFailCheck?.comboName ? pvFailCheck.comboName : (r.comboName ?? '—')}</td>
            </tr>
            {#if expandedElemId === r.elementId && r.checks.length > 0}
              {@const uniqueCombos = new Set(r.checks.map(c => c.comboName).filter(Boolean))}
              {@const multiCombo = uniqueCombos.size > 1}
              <tr class="check-detail-row">
                <td colspan="7">
                  {#if multiCombo}
                    <div class="multi-combo-note">Different checks governed by different combinations</div>
                  {/if}
                  <table class="check-detail-table">
                    <thead><tr><th>Check</th><th>Demand</th><th>Capacity</th><th>Ratio</th><th>Status</th><th>Gov. Combo</th></tr></thead>
                    <tbody>
                      {#each r.checks as ck}
                        <tr class={statusClass(ck.status)}>
                          <td>{ck.name}</td>
                          <td class="num">{ck.demand.toFixed(1)} {ck.unit}</td>
                          <td class="num">{ck.capacity.toFixed(1)} {ck.unit}</td>
                          <td class="num" style="font-weight:600">{fmtRatio(ck.ratio)}</td>
                          <td><span class="status-badge {statusClass(ck.status)}">{statusIcon(ck.status)}</span></td>
                          <td class="combo-ref" class:combo-highlight={multiCombo && ck.comboName}>{ck.comboName ?? '—'}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                  {#if expandedDemands && expandedDemands.demands.length > 0}
                    <div class="station-demands-section">
                      <div class="station-demands-header">Design-Driving Demands <span class="station-demands-note">(station-based, sign-aware — these forces drive the checks above)</span></div>
                      <table class="station-demands-table">
                        <thead><tr><th>Category</th><th>Value</th><th>Station</th><th>Combo</th><th>Concurrent N</th><th>Concurrent Vy</th><th>Concurrent Mz</th></tr></thead>
                        <tbody>
                          {#each expandedDemands.demands as d}
                            {@const isFlexure = d.category.startsWith('Mz') || d.category.startsWith('My')}
                            {@const isShear = d.category === 'Vy' || d.category === 'Vz'}
                            {@const isAxial = d.category.startsWith('N_')}
                            {@const drivesCheck = isFlexure ? 'Flexure' : isShear ? 'Shear' : isAxial ? 'Axial' : d.category}
                            <tr>
                              <td class="cat-label">{d.category} <span class="drives-label">{drivesCheck}</span></td>
                              <td class="num" style="font-weight:600">{d.value.toFixed(1)} {isFlexure ? 'kN·m' : 'kN'}</td>
                              <td class="num">x={d.stationX.toFixed(2)}m <span class="t-label">(t={d.stationT.toFixed(2)})</span></td>
                              <td class="combo-ref">{d.comboName}</td>
                              <td class="num">{d.forces.n.toFixed(1)}</td>
                              <td class="num">{d.forces.vy.toFixed(1)}</td>
                              <td class="num">{d.forces.mz.toFixed(1)}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                      <div class="station-demands-footer">
                        Reinforcement above is designed for the governing demand from these stations. Interior stations capture midspan peaks that endpoint-only extraction misses.
                      </div>
                    </div>
                  {/if}
                  <!-- ─── Provided Reinforcement Section ─── -->
                  {#if true}
                    {@const prov = getProvided(r.elementId)}
                    {@const provVerif = prov ? r.pv : null}
                    <div class="provided-section">
                      <div class="provided-header">
                        <span class="provided-title">Provided Reinforcement</span>
                        {#if !prov}
                          <button class="prov-btn prov-btn-accept" onclick={() => acceptAutoDesign(r.elementId)}>Accept Auto-Design</button>
                        {:else}
                          <button class="prov-btn prov-btn-clear" onclick={() => clearProvided(r.elementId)}>Clear</button>
                        {/if}
                        {#if provVerif}
                          <span class="prov-status-badge prov-status-{provVerif.overallStatus}">{provVerif.overallStatus === 'ok' ? '✓ OK' : provVerif.overallStatus === 'warn' ? '⚠ WARN' : '✗ FAIL'}</span>
                        {:else if !prov}
                          <span class="prov-status-badge prov-status-none">Not set</span>
                        {/if}
                      </div>
                      {#if provVerif?.criticalSections}
                        {@const cs = provVerif.criticalSections}
                        <div class="crit-section-info">
                          Regions: start [{cs.start.source === 'column' || cs.start.source === 'wall' ? `col face ${(cs.start.halfDepth*100).toFixed(0)}cm + d` : cs.start.source}] t=0–{cs.start.tCritShear.toFixed(3)}
                          | span t={cs.tSpanStart.toFixed(3)}–{cs.tSpanEnd.toFixed(3)}
                          | end [{cs.end.source === 'column' || cs.end.source === 'wall' ? `col face ${(cs.end.halfDepth*100).toFixed(0)}cm + d` : cs.end.source}] t={cs.tSpanEnd.toFixed(3)}–1
                        </div>
                      {/if}
                      {#if prov}
                        {@const isBeam = r.elementType === 'beam' || r.elementType === 'wall'}
                        {@const isCol = r.elementType === 'column'}
                        <div class="prov-editor">
                          {#if isBeam}
                            <!-- Top Start layers -->
                            {#if true}
                              {@const tsL = getRegionLayers(r.elementId, 'topStartLayers')}
                              <div class="prov-region-title">Start support — top bars {#if pvWorstCheck?.category?.includes('Start')}<span class="governs-badge">governs utilization</span>{/if}
                                <button class="layer-add-btn" onclick={() => addLayerRow(r.elementId, 'topStartLayers')}>+ row</button>
                                {#if tsL.length > 0}<button class="layer-split-btn" onclick={() => autoSplitRows(r.elementId, 'topStartLayers')}>auto</button>{/if}
                              </div>
                              {#each tsL as layer (layer.row)}
                                <div class="prov-row layer-row">
                                  <span class="layer-idx">r{layer.row}</span>
                                  <input type="number" class="prov-input" min="1" max="20" value={layer.count}
                                    oninput={(e) => { const v = +e.currentTarget.value; if (!isNaN(v) && v >= 1) updateLayer(r.elementId, 'topStartLayers', layer.row, 'count', v); }} />
                                  <select class="prov-select" value={layer.diameter}
                                    onchange={(e) => updateLayer(r.elementId, 'topStartLayers', layer.row, 'diameter', +e.currentTarget.value)}>
                                    {#each LONG_DIAS as dia}<option value={dia}>Ø{dia}</option>{/each}
                                  </select>
                                  <span class="prov-area">{rebarGroupArea(layer).toFixed(2)} cm²</span>
                                  <button class="layer-rm-btn" onclick={() => removeLayerRow(r.elementId, 'topStartLayers', layer.row)}>×</button>
                                  {#if !rowFits(r.elementId, layer)}<span class="fit-warn" title="Bars exceed section width">!</span>{/if}
                                </div>
                              {/each}
                              {#if tsL.length === 0}<div class="prov-row"><span class="prov-muted layer-empty">No top bars — click "+ row" to add</span></div>{/if}
                              {#if tsL.length > 0}<div class="layer-total">Total: {layersTotalArea(tsL).toFixed(2)} cm² ({tsL.length} row{tsL.length > 1 ? 's' : ''})</div>{/if}
                            {/if}

                            <!-- Bottom Span layers -->
                            {#if true}
                              {@const bsL = getRegionLayers(r.elementId, 'bottomSpanLayers')}
                              <div class="prov-region-title">Span — bottom bars {#if pvWorstCheck?.category?.includes('Span')}<span class="governs-badge">governs utilization</span>{/if}
                                <button class="layer-add-btn" onclick={() => addLayerRow(r.elementId, 'bottomSpanLayers')}>+ row</button>
                                {#if bsL.length > 0}<button class="layer-split-btn" onclick={() => autoSplitRows(r.elementId, 'bottomSpanLayers')}>auto</button>{/if}
                              </div>
                              {#each bsL as layer (layer.row)}
                                <div class="prov-row layer-row">
                                  <span class="layer-idx">r{layer.row}</span>
                                  <input type="number" class="prov-input" min="1" max="20" value={layer.count}
                                    oninput={(e) => { const v = +e.currentTarget.value; if (!isNaN(v) && v >= 1) updateLayer(r.elementId, 'bottomSpanLayers', layer.row, 'count', v); }} />
                                  <select class="prov-select" value={layer.diameter}
                                    onchange={(e) => updateLayer(r.elementId, 'bottomSpanLayers', layer.row, 'diameter', +e.currentTarget.value)}>
                                    {#each LONG_DIAS as dia}<option value={dia}>Ø{dia}</option>{/each}
                                  </select>
                                  <span class="prov-area">{rebarGroupArea(layer).toFixed(2)} cm²</span>
                                  <button class="layer-rm-btn" onclick={() => removeLayerRow(r.elementId, 'bottomSpanLayers', layer.row)}>×</button>
                                  {#if !rowFits(r.elementId, layer)}<span class="fit-warn" title="Bars exceed section width">!</span>{/if}
                                </div>
                              {/each}
                              {#if bsL.length === 0}<div class="prov-row"><span class="prov-muted layer-empty">No bottom bars — click "+ row" to add</span></div>{/if}
                              {#if bsL.length > 0}<div class="layer-total">Total: {layersTotalArea(bsL).toFixed(2)} cm² ({bsL.length} row{bsL.length > 1 ? 's' : ''})</div>{/if}
                            {/if}

                            <!-- Top End layers -->
                            {#if true}
                              {@const teL = getRegionLayers(r.elementId, 'topEndLayers')}
                              <div class="prov-region-title">End support — top bars
                                <button class="layer-add-btn" onclick={() => addLayerRow(r.elementId, 'topEndLayers')}>+ row</button>
                                {#if teL.length > 0}<button class="layer-split-btn" onclick={() => autoSplitRows(r.elementId, 'topEndLayers')}>auto</button>{/if}
                              </div>
                              {#each teL as layer (layer.row)}
                                <div class="prov-row layer-row">
                                  <span class="layer-idx">r{layer.row}</span>
                                  <input type="number" class="prov-input" min="1" max="20" value={layer.count}
                                    oninput={(e) => { const v = +e.currentTarget.value; if (!isNaN(v) && v >= 1) updateLayer(r.elementId, 'topEndLayers', layer.row, 'count', v); }} />
                                  <select class="prov-select" value={layer.diameter}
                                    onchange={(e) => updateLayer(r.elementId, 'topEndLayers', layer.row, 'diameter', +e.currentTarget.value)}>
                                    {#each LONG_DIAS as dia}<option value={dia}>Ø{dia}</option>{/each}
                                  </select>
                                  <span class="prov-area">{rebarGroupArea(layer).toFixed(2)} cm²</span>
                                  <button class="layer-rm-btn" onclick={() => removeLayerRow(r.elementId, 'topEndLayers', layer.row)}>×</button>
                                  {#if !rowFits(r.elementId, layer)}<span class="fit-warn" title="Bars exceed section width">!</span>{/if}
                                </div>
                              {/each}
                              {#if teL.length === 0}<div class="prov-row"><span class="prov-muted layer-empty">No top bars — click "+ row" to add</span></div>{/if}
                              {#if teL.length > 0}<div class="layer-total">Total: {layersTotalArea(teL).toFixed(2)} cm² ({teL.length} row{teL.length > 1 ? 's' : ''})</div>{/if}
                            {/if}
                          {/if}
                          {#if isCol}
                            {#if true}
                              {@const colR = prov.column}
                              {@const resolved = resolveColumnReinf(colR, prov.longitudinal)}
                              {@const curCornerDia = colR?.cornerDia ?? prov.longitudinal?.diameter ?? 16}
                              {@const curFaceDia = colR?.faceDia ?? prov.longitudinal?.diameter ?? 16}
                              {@const curNBot = resolved?.nBot ?? 0}
                              {@const curNTop = resolved?.nTop ?? 0}
                              {@const curNLeft = resolved?.nLeft ?? 0}
                              {@const curNRight = resolved?.nRight ?? 0}
                              {@const curStir = prov.stirrups}
                              {@const curLong = prov.longitudinal}
                              <div class="prov-region-title">Column Bars — Corners (4)</div>
                              <div class="prov-row">
                                <label class="prov-label">Corner Ø:</label>
                                <select class="prov-select" value={String(curCornerDia)}
                                  onchange={(e) => { const d = +e.currentTarget.value; setProvided(r.elementId, { stirrups: curStir ? { diameter: curStir.diameter, legs: curStir.legs, spacing: curStir.spacing } : undefined, longitudinal: curLong ? { count: curLong.count, diameter: curLong.diameter } : undefined, column: { cornerDia: d, faceDia: curFaceDia, nBottom: curNBot, nTop: curNTop, nLeft: curNLeft, nRight: curNRight } }); }}>
                                  {#each LONG_DIAS as dia}<option value={String(dia)}>Ø{dia}</option>{/each}
                                </select>
                              </div>
                              <div class="prov-region-title">Face Bars</div>
                              <div class="prov-row">
                                <label class="prov-label">Face Ø:</label>
                                <select class="prov-select" value={String(curFaceDia)}
                                  onchange={(e) => { const d = +e.currentTarget.value; setProvided(r.elementId, { stirrups: curStir ? { diameter: curStir.diameter, legs: curStir.legs, spacing: curStir.spacing } : undefined, longitudinal: curLong ? { count: curLong.count, diameter: curLong.diameter } : undefined, column: { cornerDia: curCornerDia, faceDia: d, nBottom: curNBot, nTop: curNTop, nLeft: curNLeft, nRight: curNRight } }); }}>
                                  {#each LONG_DIAS as dia}<option value={String(dia)}>Ø{dia}</option>{/each}
                                </select>
                              </div>
                              <div class="prov-row col-face-row">
                                <label class="prov-label">Bottom:</label>
                                <input type="number" class="prov-input" min="0" max="10" value={curNBot}
                                  oninput={(e) => { const v = +e.currentTarget.value; if (isNaN(v)) return; setProvided(r.elementId, { stirrups: curStir ? { diameter: curStir.diameter, legs: curStir.legs, spacing: curStir.spacing } : undefined, longitudinal: curLong ? { count: curLong.count, diameter: curLong.diameter } : undefined, column: { cornerDia: curCornerDia, faceDia: curFaceDia, nBottom: Math.max(0, v), nTop: curNTop, nLeft: curNLeft, nRight: curNRight } }); }} />
                                <label class="prov-label">Top:</label>
                                <input type="number" class="prov-input" min="0" max="10" value={curNTop}
                                  oninput={(e) => { const v = +e.currentTarget.value; if (isNaN(v)) return; setProvided(r.elementId, { stirrups: curStir ? { diameter: curStir.diameter, legs: curStir.legs, spacing: curStir.spacing } : undefined, longitudinal: curLong ? { count: curLong.count, diameter: curLong.diameter } : undefined, column: { cornerDia: curCornerDia, faceDia: curFaceDia, nBottom: curNBot, nTop: Math.max(0, v), nLeft: curNLeft, nRight: curNRight } }); }} />
                              </div>
                              <div class="prov-row col-face-row">
                                <label class="prov-label">Left:</label>
                                <input type="number" class="prov-input" min="0" max="10" value={curNLeft}
                                  oninput={(e) => { const v = +e.currentTarget.value; if (isNaN(v)) return; setProvided(r.elementId, { stirrups: curStir ? { diameter: curStir.diameter, legs: curStir.legs, spacing: curStir.spacing } : undefined, longitudinal: curLong ? { count: curLong.count, diameter: curLong.diameter } : undefined, column: { cornerDia: curCornerDia, faceDia: curFaceDia, nBottom: curNBot, nTop: curNTop, nLeft: Math.max(0, v), nRight: curNRight } }); }} />
                                <label class="prov-label">Right:</label>
                                <input type="number" class="prov-input" min="0" max="10" value={curNRight}
                                  oninput={(e) => { const v = +e.currentTarget.value; if (isNaN(v)) return; setProvided(r.elementId, { stirrups: curStir ? { diameter: curStir.diameter, legs: curStir.legs, spacing: curStir.spacing } : undefined, longitudinal: curLong ? { count: curLong.count, diameter: curLong.diameter } : undefined, column: { cornerDia: curCornerDia, faceDia: curFaceDia, nBottom: curNBot, nTop: curNTop, nLeft: curNLeft, nRight: Math.max(0, v) } }); }} />
                              </div>
                              {#if resolved}
                                <div class="layer-total">Total: {resolved.totalCount} bars = 4 corners Ø{curCornerDia} + {curNBot+curNTop+curNLeft+curNRight} face Ø{curFaceDia}</div>
                              {/if}
                            {/if}
                          {/if}
                          <!-- Stirrups/Ties -->
                          {#if isBeam}
                            {@const regS = prov.regions}
                            {@const ssup = regS?.stirrupsSupport ?? prov.stirrups}
                            {@const sspan = regS?.stirrupsSpan ?? prov.stirrups}
                            <div class="prov-region-title">Stirrups — support {#if pvWorstCheck?.category?.includes('Shear Support')}<span class="governs-badge">governs utilization</span>{/if}</div>
                            <div class="prov-row">
                              <label class="prov-label">Support:</label>
                              <span class="prov-sub">eØ</span>
                              <select class="prov-select prov-select-sm" value={ssup?.diameter ?? 8}
                                onchange={(e) => { const dd = +e.currentTarget.value; const p = getProvided(r.elementId) ?? {}; if (!p.regions) p.regions = {}; p.regions.stirrupsSupport = { diameter: dd, legs: ssup?.legs ?? 2, spacing: ssup?.spacing ?? 0.15 }; setProvided(r.elementId, p); }}>
                                {#each STIRRUP_DIAS as dd}<option value={dd}>{dd}</option>{/each}
                              </select>
                              <input type="number" class="prov-input prov-input-sm" min="2" max="6" value={ssup?.legs ?? 2}
                                oninput={(e) => { const v = +e.currentTarget.value; if (isNaN(v)) return; const p = getProvided(r.elementId) ?? {}; if (!p.regions) p.regions = {}; p.regions.stirrupsSupport = { diameter: ssup?.diameter ?? 8, legs: Math.max(2, v), spacing: ssup?.spacing ?? 0.15 }; setProvided(r.elementId, p); }} />
                              <span class="prov-sub">L c/</span>
                              <input type="number" class="prov-input prov-input-sp" min="0.05" max="0.50" step="0.01" value={ssup?.spacing ?? 0.15}
                                oninput={(e) => { const v = +e.currentTarget.value; if (isNaN(v)) return; const p = getProvided(r.elementId) ?? {}; if (!p.regions) p.regions = {}; p.regions.stirrupsSupport = { diameter: ssup?.diameter ?? 8, legs: ssup?.legs ?? 2, spacing: Math.max(0.05, v) }; setProvided(r.elementId, p); }} />
                              <span class="prov-sub">m</span>
                            </div>
                            <div class="prov-region-title">Stirrups — span {#if pvWorstCheck?.category?.includes('Shear Span')}<span class="governs-badge">governs utilization</span>{/if}</div>
                            <div class="prov-row">
                              <label class="prov-label">Span:</label>
                              <span class="prov-sub">eØ</span>
                              <select class="prov-select prov-select-sm" value={sspan?.diameter ?? 8}
                                onchange={(e) => { const dd = +e.currentTarget.value; const p = getProvided(r.elementId) ?? {}; if (!p.regions) p.regions = {}; p.regions.stirrupsSpan = { diameter: dd, legs: sspan?.legs ?? 2, spacing: sspan?.spacing ?? 0.20 }; setProvided(r.elementId, p); }}>
                                {#each STIRRUP_DIAS as dd}<option value={dd}>{dd}</option>{/each}
                              </select>
                              <input type="number" class="prov-input prov-input-sm" min="2" max="6" value={sspan?.legs ?? 2}
                                oninput={(e) => { const v = +e.currentTarget.value; if (isNaN(v)) return; const p = getProvided(r.elementId) ?? {}; if (!p.regions) p.regions = {}; p.regions.stirrupsSpan = { diameter: sspan?.diameter ?? 8, legs: Math.max(2, v), spacing: sspan?.spacing ?? 0.20 }; setProvided(r.elementId, p); }} />
                              <span class="prov-sub">L c/</span>
                              <input type="number" class="prov-input prov-input-sp" min="0.05" max="0.50" step="0.01" value={sspan?.spacing ?? 0.20}
                                oninput={(e) => { const v = +e.currentTarget.value; if (isNaN(v)) return; const p = getProvided(r.elementId) ?? {}; if (!p.regions) p.regions = {}; p.regions.stirrupsSpan = { diameter: sspan?.diameter ?? 8, legs: sspan?.legs ?? 2, spacing: Math.max(0.05, v) }; setProvided(r.elementId, p); }} />
                              <span class="prov-sub">m</span>
                            </div>
                            <!-- Bar Group Editor + Elevation -->
                            {#if true}
                              {@const bGroups = getBarGroups(r.elementId, 'bottomGroups')}
                              {@const tsGroups = getBarGroups(r.elementId, 'topStartGroups')}
                              {@const teGroups = getBarGroups(r.elementId, 'topEndGroups')}
                              {@const ssG = prov.regions?.stirrupsSupport ?? prov.stirrups}
                              {@const spG = prov.regions?.stirrupsSpan ?? prov.stirrups}
                              <div class="prov-region-title">Bottom bar groups <button class="layer-add-btn" onclick={() => addBarGroup(r.elementId, 'bottomGroups')}>+ group</button></div>
                              {#each bGroups as g, gi}
                                <div class="bar-group-card">
                                  <div class="bg-header">
                                    <span class="bg-label">{g.label ?? `G${gi+1}`}</span>
                                    <input type="number" class="prov-input" min="1" max="20" value={g.layers[0]?.count ?? 2}
                                      oninput={(e) => { const v = +e.currentTarget.value; if (!isNaN(v) && v >= 1) updateBarGroupLayer(r.elementId, 'bottomGroups', gi, 'count', v); }} />
                                    <select class="prov-select" value={g.layers[0]?.diameter ?? 16}
                                      onchange={(e) => updateBarGroupLayer(r.elementId, 'bottomGroups', gi, 'diameter', +e.currentTarget.value)}>
                                      {#each LONG_DIAS as dia}<option value={dia}>Ø{dia}</option>{/each}
                                    </select>
                                    <button class="layer-rm-btn" onclick={() => removeBarGroup(r.elementId, 'bottomGroups', gi)}>×</button>
                                  </div>
                                  <div class="bg-cont">
                                    <label class="cont-item"><input type="checkbox" checked={g.continueStart !== false} onchange={(e) => updateBarGroupField(r.elementId, 'bottomGroups', gi, 'continueStart', e.currentTarget.checked)} /><span>→ start</span></label>
                                    {#if g.continueStart !== false}
                                      <select class="anch-select" value={g.anchorageStart ?? 'straight'} onchange={(e) => updateBarGroupField(r.elementId, 'bottomGroups', gi, 'anchorageStart', e.currentTarget.value)}>
                                        <option value="straight">str</option><option value="hook">hook</option><option value="none">—</option>
                                      </select>
                                      <input type="number" class="prov-input ext-input" min="0" max="3" step="0.05" value={g.extensionStart ?? ''} placeholder="auto"
                                        onchange={(e) => { const v = e.currentTarget.value ? +e.currentTarget.value : undefined; updateBarGroupField(r.elementId, 'bottomGroups', gi, 'extensionStart', v); }} />
                                      <span class="prov-sub">m</span>
                                    {/if}
                                    <label class="cont-item"><input type="checkbox" checked={g.continueEnd !== false} onchange={(e) => updateBarGroupField(r.elementId, 'bottomGroups', gi, 'continueEnd', e.currentTarget.checked)} /><span>→ end</span></label>
                                    {#if g.continueEnd !== false}
                                      <select class="anch-select" value={g.anchorageEnd ?? 'straight'} onchange={(e) => updateBarGroupField(r.elementId, 'bottomGroups', gi, 'anchorageEnd', e.currentTarget.value)}>
                                        <option value="straight">str</option><option value="hook">hook</option><option value="none">—</option>
                                      </select>
                                      <input type="number" class="prov-input ext-input" min="0" max="3" step="0.05" value={g.extensionEnd ?? ''} placeholder="auto"
                                        onchange={(e) => { const v = e.currentTarget.value ? +e.currentTarget.value : undefined; updateBarGroupField(r.elementId, 'bottomGroups', gi, 'extensionEnd', v); }} />
                                      <span class="prov-sub">m</span>
                                    {/if}
                                  </div>
                                </div>
                              {/each}
                              <div class="prov-region-title">Top start groups <button class="layer-add-btn" onclick={() => addBarGroup(r.elementId, 'topStartGroups')}>+ group</button></div>
                              {#each tsGroups as g, gi}
                                <div class="bar-group-card">
                                  <div class="bg-header">
                                    <span class="bg-label">{g.label ?? `G${gi+1}`}</span>
                                    <input type="number" class="prov-input" min="1" max="20" value={g.layers[0]?.count ?? 2}
                                      onchange={(e) => updateBarGroupLayer(r.elementId, 'topStartGroups', gi, 'count', +e.currentTarget.value)} />
                                    <select class="prov-select" value={g.layers[0]?.diameter ?? 16}
                                      onchange={(e) => updateBarGroupLayer(r.elementId, 'topStartGroups', gi, 'diameter', +e.currentTarget.value)}>
                                      {#each LONG_DIAS as dia}<option value={dia}>Ø{dia}</option>{/each}
                                    </select>
                                    <button class="layer-rm-btn" onclick={() => removeBarGroup(r.elementId, 'topStartGroups', gi)}>×</button>
                                  </div>
                                  <div class="bg-cont">
                                    <label class="cont-item"><input type="checkbox" checked={g.continueEnd !== false} onchange={(e) => updateBarGroupField(r.elementId, 'topStartGroups', gi, 'continueEnd', e.currentTarget.checked)} /><span>→ span</span></label>
                                    {#if g.continueEnd !== false}
                                      <select class="anch-select" value={g.anchorageEnd ?? 'straight'} onchange={(e) => updateBarGroupField(r.elementId, 'topStartGroups', gi, 'anchorageEnd', e.currentTarget.value)}>
                                        <option value="straight">str</option><option value="hook">hook</option><option value="none">—</option>
                                      </select>
                                      <input type="number" class="prov-input ext-input" min="0" max="3" step="0.05" value={g.extensionEnd ?? ''} placeholder="auto"
                                        onchange={(e) => { const v = e.currentTarget.value ? +e.currentTarget.value : undefined; updateBarGroupField(r.elementId, 'topStartGroups', gi, 'extensionEnd', v); }} />
                                      <span class="prov-sub">m</span>
                                    {/if}
                                  </div>
                                </div>
                              {/each}
                              <div class="prov-region-title">Top end groups <button class="layer-add-btn" onclick={() => addBarGroup(r.elementId, 'topEndGroups')}>+ group</button></div>
                              {#each teGroups as g, gi}
                                <div class="bar-group-card">
                                  <div class="bg-header">
                                    <span class="bg-label">{g.label ?? `G${gi+1}`}</span>
                                    <input type="number" class="prov-input" min="1" max="20" value={g.layers[0]?.count ?? 2}
                                      onchange={(e) => updateBarGroupLayer(r.elementId, 'topEndGroups', gi, 'count', +e.currentTarget.value)} />
                                    <select class="prov-select" value={g.layers[0]?.diameter ?? 16}
                                      onchange={(e) => updateBarGroupLayer(r.elementId, 'topEndGroups', gi, 'diameter', +e.currentTarget.value)}>
                                      {#each LONG_DIAS as dia}<option value={dia}>Ø{dia}</option>{/each}
                                    </select>
                                    <button class="layer-rm-btn" onclick={() => removeBarGroup(r.elementId, 'topEndGroups', gi)}>×</button>
                                  </div>
                                  <div class="bg-cont">
                                    <label class="cont-item"><input type="checkbox" checked={g.continueStart !== false} onchange={(e) => updateBarGroupField(r.elementId, 'topEndGroups', gi, 'continueStart', e.currentTarget.checked)} /><span>→ span</span></label>
                                    {#if g.continueStart !== false}
                                      <select class="anch-select" value={g.anchorageStart ?? 'straight'} onchange={(e) => updateBarGroupField(r.elementId, 'topEndGroups', gi, 'anchorageStart', e.currentTarget.value)}>
                                        <option value="straight">str</option><option value="hook">hook</option><option value="none">—</option>
                                      </select>
                                      <input type="number" class="prov-input ext-input" min="0" max="3" step="0.05" value={g.extensionStart ?? ''} placeholder="auto"
                                        onchange={(e) => { const v = e.currentTarget.value ? +e.currentTarget.value : undefined; updateBarGroupField(r.elementId, 'topEndGroups', gi, 'extensionStart', v); }} />
                                      <span class="prov-sub">m</span>
                                    {/if}
                                  </div>
                                </div>
                              {/each}
                              <!-- Group-aware beam elevation with stirrup zones -->
                              <div class="elev-schematic">
                                <div class="elev-title">Beam Elevation <span class="live-badge">● updates with edits</span></div>
                                <svg class="elev-svg" viewBox="0 0 220 72" width="220" height="72">
                                  <!-- Beam concrete outline -->
                                  <rect x="10" y="16" width="200" height="24" fill="#1a2a40" stroke="#4ecdc4" stroke-width="0.5"/>
                                  <!-- Support triangles -->
                                  <polygon points="10,40 5,48 15,48" fill="#4ecdc4" opacity="0.5"/>
                                  <polygon points="210,40 205,48 215,48" fill="#4ecdc4" opacity="0.5"/>
                                  <!-- Region labels -->
                                  <text x="5" y="13" font-size="5" fill="#889">Start</text>
                                  <text x="100" y="13" font-size="5" fill="#889">Span</text>
                                  <text x="195" y="13" font-size="5" fill="#889">End</text>
                                  <!-- Stirrup zones (orange hatching) -->
                                  {#if ssG}
                                    <!-- Support stirrup zones (denser = tighter spacing) -->
                                    {#each Array(Math.round(50 / Math.max((ssG.spacing ?? 0.15) * 100, 5))) as _, si}
                                      <line x1={12 + si * Math.max((ssG.spacing ?? 0.15) * 100 * 0.5, 3)} y1="17" x2={12 + si * Math.max((ssG.spacing ?? 0.15) * 100 * 0.5, 3)} y2="39" stroke="#f0a500" stroke-width="0.4" opacity="0.35"/>
                                    {/each}
                                    {#each Array(Math.round(50 / Math.max((ssG.spacing ?? 0.15) * 100, 5))) as _, si}
                                      <line x1={208 - si * Math.max((ssG.spacing ?? 0.15) * 100 * 0.5, 3)} y1="17" x2={208 - si * Math.max((ssG.spacing ?? 0.15) * 100 * 0.5, 3)} y2="39" stroke="#f0a500" stroke-width="0.4" opacity="0.35"/>
                                    {/each}
                                  {/if}
                                  {#if spG}
                                    <!-- Span stirrup zone (wider spacing) -->
                                    {#each Array(Math.round(100 / Math.max((spG.spacing ?? 0.20) * 100 * 0.5, 4))) as _, si}
                                      <line x1={60 + si * Math.max((spG.spacing ?? 0.20) * 100 * 0.5, 4)} y1="17" x2={60 + si * Math.max((spG.spacing ?? 0.20) * 100 * 0.5, 4)} y2="39" stroke="#f0a500" stroke-width="0.3" opacity="0.2"/>
                                    {/each}
                                  {/if}
                                  <!-- Stirrup labels -->
                                  {#if ssG}<text x="12" y="54" font-size="4" fill="#f0a500">eØ{ssG.diameter} c/{(ssG.spacing * 100).toFixed(0)}</text>{/if}
                                  {#if spG}<text x="95" y="54" font-size="4" fill="#f0a500">eØ{spG.diameter} c/{(spG.spacing * 100).toFixed(0)}</text>{/if}
                                  <!-- Top bar groups (red) -->
                                  {#each tsGroups as g, gi}
                                    {@const yOff = 20 + gi * 3}
                                    {@const contEnd = g.continueEnd !== false}
                                    {@const xEnd = contEnd ? 110 : 60}
                                    <line x1="12" y1={yOff} x2={xEnd} y2={yOff} stroke="#e94560" stroke-width="1.5" opacity={0.9 - gi * 0.15}/>
                                    {#if !contEnd}<circle cx="60" cy={yOff} r="1.5" fill="#e94560"/>{/if}
                                    {#if contEnd && g.anchorageEnd === 'hook'}<path d="M {xEnd},{yOff} L {xEnd},{yOff+4}" stroke="#e94560" stroke-width="1" fill="none"/>{/if}
                                    <text x="14" y={yOff - 1} font-size="3.5" fill="#e94560">{g.layers[0]?.count ?? 0}Ø{g.layers[0]?.diameter ?? 0}{g.anchorageEnd === 'hook' ? ' hk' : ''}</text>
                                  {/each}
                                  {#each teGroups as g, gi}
                                    {@const yOff = 20 + gi * 3}
                                    {@const contStart = g.continueStart !== false}
                                    {@const xStart = contStart ? 110 : 160}
                                    <line x1={xStart} y1={yOff} x2="208" y2={yOff} stroke="#e94560" stroke-width="1.5" opacity={0.9 - gi * 0.15}/>
                                    {#if !contStart}<circle cx="160" cy={yOff} r="1.5" fill="#e94560"/>{/if}
                                    {#if contStart && g.anchorageStart === 'hook'}<path d="M {xStart},{yOff} L {xStart},{yOff+4}" stroke="#e94560" stroke-width="1" fill="none"/>{/if}
                                  {/each}
                                  <!-- Bottom bar groups (green) -->
                                  {#each bGroups as g, gi}
                                    {@const yOff = 37 - gi * 3}
                                    {@const cs = g.continueStart !== false}
                                    {@const ce = g.continueEnd !== false}
                                    {@const x1 = cs ? 12 : 60}
                                    {@const x2 = ce ? 208 : 160}
                                    <line x1={x1} y1={yOff} x2={x2} y2={yOff} stroke="#4caf50" stroke-width="1.5" opacity={0.9 - gi * 0.15}/>
                                    {#if !cs}<circle cx="60" cy={yOff} r="1.5" fill="#4caf50"/>{/if}
                                    {#if !ce}<circle cx="160" cy={yOff} r="1.5" fill="#4caf50"/>{/if}
                                    {#if cs && g.anchorageStart === 'hook'}<path d="M {x1},{yOff} L {x1},{yOff-4}" stroke="#4caf50" stroke-width="1" fill="none"/>{/if}
                                    {#if ce && g.anchorageEnd === 'hook'}<path d="M {x2},{yOff} L {x2},{yOff-4}" stroke="#4caf50" stroke-width="1" fill="none"/>{/if}
                                    <text x={cs ? 14 : 62} y={yOff - 1} font-size="3.5" fill="#4caf50">{g.layers[0]?.count ?? 0}Ø{g.layers[0]?.diameter ?? 0}{g.anchorageStart === 'hook' || g.anchorageEnd === 'hook' ? ' hk' : ''}</text>
                                  {/each}
                                  <!-- Legend row -->
                                  <text x="12" y="64" font-size="3.5" fill="#556">T=top(red) B=bot(green) S=stirrup(orange)</text>
                                </svg>
                              </div>
                            {/if}
                          {:else}
                            <div class="prov-row">
                              <label class="prov-label">Ties:</label>
                              <span class="prov-sub">eØ</span>
                              <select class="prov-select prov-select-sm" value={prov.stirrups?.diameter ?? 8}
                                onchange={(e) => { const dd = +e.currentTarget.value; const p = getProvided(r.elementId) ?? {}; p.stirrups = { diameter: dd, legs: p.stirrups?.legs ?? 2, spacing: p.stirrups?.spacing ?? 0.15 }; setProvided(r.elementId, p); }}>
                                {#each STIRRUP_DIAS as dd}<option value={dd}>{dd}</option>{/each}
                              </select>
                              <input type="number" class="prov-input prov-input-sm" min="2" max="6" value={prov.stirrups?.legs ?? 2}
                                oninput={(e) => { const v = +e.currentTarget.value; if (isNaN(v)) return; const p = getProvided(r.elementId) ?? {}; p.stirrups = { diameter: p.stirrups?.diameter ?? 8, legs: Math.max(2, v), spacing: p.stirrups?.spacing ?? 0.15 }; setProvided(r.elementId, p); }} />
                              <span class="prov-sub">L c/</span>
                              <input type="number" class="prov-input prov-input-sp" min="0.05" max="0.50" step="0.01" value={prov.stirrups?.spacing ?? 0.15}
                                oninput={(e) => { const v = +e.currentTarget.value; if (isNaN(v)) return; const p = getProvided(r.elementId) ?? {}; p.stirrups = { diameter: p.stirrups?.diameter ?? 8, legs: p.stirrups?.legs ?? 2, spacing: Math.max(0.05, v) }; setProvided(r.elementId, p); }} />
                              <span class="prov-sub">m</span>
                            </div>
                          {/if}
                        </div>
                        <!-- Column Section Layout (when column) -->
                        {#if isCol && (prov.column || prov.longitudinal)}
                          {#if true}
                            {@const sec = getElemSection(r.elementId)}
                            {@const colB = sec.b}
                            {@const colH = sec.h}
                            {@const colCover = sec.cover}
                            {@const colStirDia = prov.stirrups?.diameter ?? sec.stirrupDia}
                            {@const colRes = resolveColumnReinf(prov.column, prov.longitudinal)}
                            {@const colLayout = colRes ? computeColumnLayout(colRes.totalCount, colRes.cornerDia, colB, colH, colCover, colStirDia, prov.column) : null}
                            {@const colSc = 180 / Math.max(colB, colH)}
                            {@const colSvgW = colB * colSc + 16}
                            {@const colSvgH = colH * colSc + 16}
                            {@const tieEnv = (colCover + colStirDia/1000) * colSc}
                            {#if colLayout}
                            <div class="col-section-block">
                              <div class="beam-schematic-title">Column Section <span class="live-badge">● updates with edits</span> <span class="beam-schematic-note">(4 corners + {colRes ? colRes.nBot+colRes.nTop+colRes.nLeft+colRes.nRight : 0} face bars{prov.column ? ', structured' : ', auto-distributed'})</span></div>
                              <svg class="section-svg" viewBox="0 0 {colSvgW} {colSvgH}" width="{colSvgW}" height="{colSvgH}">
                                <rect x="8" y="8" width={colB * colSc} height={colH * colSc} fill="#1a2a40" stroke="#4ecdc4" stroke-width="1"/>
                                <rect x={8 + colCover * colSc} y={8 + colCover * colSc} width={(colB - 2*colCover) * colSc} height={(colH - 2*colCover) * colSc} fill="none" stroke="#334" stroke-width="0.5" stroke-dasharray="3,2"/>
                                <rect x={8 + tieEnv} y={8 + tieEnv} width={colB * colSc - 2*tieEnv} height={colH * colSc - 2*tieEnv} fill="none" stroke="#f0a500" stroke-width={Math.max(colStirDia / 1000 * colSc, 1.5)} rx="2" opacity="0.85"/>
                                {#each colLayout.bars as bar}
                                  {@const bx = 8 + bar.x * colSc}
                                  {@const by = 8 + (colH - bar.y) * colSc}
                                  {@const br = Math.max((bar.diameter / 2000) * colSc, 3.5)}
                                  {@const isCorner = bar.index < 4}
                                  {@const isSel = selectedBar?.elemId === r.elementId && selectedBar?.region === 'span' && selectedBar?.index === bar.index}
                                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                                  <g onclick={(e) => { e.stopPropagation(); selectedBar = isSel ? null : { elemId: r.elementId, region: 'span', face: 'bottom', row: 0, index: bar.index, diameter: bar.diameter }; }} style="cursor:pointer">
                                    {#if isSel}<circle cx={bx} cy={by} r={br + 3} fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="2,1"/>{/if}
                                    <circle cx={bx} cy={by} r={br} fill={isSel ? '#fff' : isCorner ? '#e94560' : '#f0a500'} stroke={isSel ? '#e94560' : isCorner ? '#ff8a9e' : '#ffcc66'} stroke-width={isSel ? '1' : '0.5'}/>
                                  </g>
                                {/each}
                              </svg>
                              <div class="section-legend">
                                <span class="legend-dim">{(colB*100).toFixed(0)}×{(colH*100).toFixed(0)}</span>
                                <span class="legend-item"><span class="legend-dot" style="background:#e94560"></span>4 corner</span>
                                {#if colRes && (colRes.nBot+colRes.nTop+colRes.nLeft+colRes.nRight) > 0}
                                  <span class="legend-item"><span class="legend-dot" style="background:#f0a500"></span>{colRes.nBot+colRes.nTop+colRes.nLeft+colRes.nRight} face</span>
                                {:else}
                                  <span class="legend-item" style="color:#556">no face bars</span>
                                {/if}
                                <span class="legend-dim">= {colLayout.totalArea.toFixed(1)} cm²</span>
                                {#if !colLayout.constructible}<span class="legend-warn">{colLayout.issues.length} issues</span>{/if}
                              </div>
                              {#if selectedBar?.elemId === r.elementId && selectedBar?.region === 'span' && isCol}
                                <div class="bar-edit-toolbar">
                                  <span class="bar-edit-info">#{selectedBar.index} {selectedBar.index < 4 ? 'corner' : 'face'} Ø{selectedBar.diameter}</span>
                                  <button class="bar-edit-btn bar-edit-desel" onclick={() => selectedBar = null}>✕</button>
                                </div>
                              {/if}
                              {#if colLayout.issues.length > 0}
                                <div class="constr-diagnostics" style="margin-top:4px">
                                  <div class="constr-title">Bars don't fit — {colLayout.issues.length} issue{colLayout.issues.length > 1 ? 's' : ''}</div>
                                  {#each colLayout.issues as issue}
                                    <div class="constr-issue constr-{issue.type}">
                                      <span class="constr-type">{issue.type === 'horizontal' ? 'Too close' : 'Cover violated'}</span>
                                      <span class="constr-desc">{issue.description}</span>
                                      <span class="constr-fix">{issue.type === 'horizontal' ? 'Reduce bars or use smaller diameter' : 'Check cover + stirrup clearance'}</span>
                                    </div>
                                  {/each}
                                </div>
                              {/if}
                            </div>
                            {/if}
                          {/if}
                        {/if}
                        <!-- Beam Region Interpretation Schematic (layer-aware, renders from model data) -->
                        {#if isBeam && prov}
                          {@const cs = provVerif?.criticalSections}
                          {@const regData = prov.regions}
                          {@const tsLayers = resolveLayers(regData?.topStartLayers, regData?.topStart ?? prov.top)}
                          {@const teLayers = resolveLayers(regData?.topEndLayers, regData?.topEnd ?? prov.top)}
                          {@const bsLayers = resolveLayers(regData?.bottomSpanLayers, regData?.bottomSpan ?? prov.bottom)}
                          {@const ssG = regData?.stirrupsSupport ?? prov.stirrups}
                          {@const spG = regData?.stirrupsSpan ?? prov.stirrups}
                          {@const sec = getElemSection(r.elementId)}
                          {@const secB = sec.b}
                          {@const secH = sec.h}
                          {@const secCover = sec.cover}
                          {@const secStirDia = ssG?.diameter ?? sec.stirrupDia}
                          {@const layoutStart = computeSectionLayout(tsLayers, bsLayers, secB, secH, secCover, secStirDia)}
                          {@const layoutSpan = computeSectionLayout(tsLayers, bsLayers, secB, secH, secCover, secStirDia)}
                          {@const layoutEnd = computeSectionLayout(teLayers, bsLayers, secB, secH, secCover, secStirDia)}
                          <div class="beam-schematic">
                            <div class="beam-schematic-title">Section Layout <span class="live-badge">● updates with edits</span></div>
                            <div class="beam-regions-row">
                              {#each [
                                { label: `Start${cs?.start.source === 'column' || cs?.start.source === 'wall' ? ` (${cs.start.source})` : ''}`, layout: layoutStart, topRole: 'tension', botRole: 'compression', cls: 'beam-region-support', ck: provVerif.checks.find(c => c.category === 'Top Start (Mz-)'), region: 'start' },
                                { label: 'Span', layout: layoutSpan, topRole: 'compression', botRole: 'tension', cls: 'beam-region-span', ck: provVerif.checks.find(c => c.category === 'Bottom Span (Mz+)'), region: 'span' },
                                { label: `End${cs?.end.source === 'column' || cs?.end.source === 'wall' ? ` (${cs.end.source})` : ''}`, layout: layoutEnd, topRole: 'tension', botRole: 'compression', cls: 'beam-region-support', ck: provVerif.checks.find(c => c.category === 'Top End (Mz-)'), region: 'end' },
                              ] as regView}
                                {@const sc = 120 / Math.max(regView.layout.sectionWidth, regView.layout.sectionHeight)}
                                {@const svgW = regView.layout.sectionWidth * sc + 16}
                                {@const svgH = regView.layout.sectionHeight * sc + 16}
                                {@const stirDef = regView.region === 'span' ? spG : ssG}
                                {@const stirThk = Math.max((stirDef?.diameter ?? 0) / 1000 * sc, 1.2)}
                                {@const stirInset = (secCover + (stirDef?.diameter ?? 0) / 2000) * sc}
                                <div class="beam-region {regView.cls}">
                                  <div class="beam-region-label">{regView.label}</div>
                                  <svg class="section-svg" viewBox="0 0 {svgW} {svgH}" width="{svgW}" height="{svgH}">
                                    <!-- Concrete outline -->
                                    <rect x="8" y="8" width={regView.layout.sectionWidth * sc} height={regView.layout.sectionHeight * sc} fill="#1a2a40" stroke="#4ecdc4" stroke-width="1"/>
                                    <!-- Cover dashed -->
                                    <rect x={8 + secCover * sc} y={8 + secCover * sc} width={(regView.layout.sectionWidth - 2*secCover) * sc} height={(regView.layout.sectionHeight - 2*secCover) * sc} fill="none" stroke="#334" stroke-width="0.5" stroke-dasharray="3,2"/>
                                    <!-- Stirrup outline (with visible thickness) -->
                                    {#if stirDef}
                                      <rect x={8 + stirInset} y={8 + stirInset} width={regView.layout.sectionWidth * sc - 2*stirInset} height={regView.layout.sectionHeight * sc - 2*stirInset} fill="none" stroke="#f0a500" stroke-width={stirThk} rx="2" opacity="0.85"/>
                                    {/if}
                                    <!-- Bars (clickable) -->
                                    {#each regView.layout.allBars as bar}
                                      {@const bx = 8 + bar.x * sc}
                                      {@const by = 8 + (regView.layout.sectionHeight - bar.y) * sc}
                                      {@const br = Math.max((bar.diameter / 2000) * sc, 2.5)}
                                      {@const isTens = (bar.face === 'top' && regView.topRole === 'tension') || (bar.face === 'bottom' && regView.botRole === 'tension')}
                                      {@const isSel = isBarSelected(r.elementId, regView.region, bar)}
                                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                                      <g onclick={(e) => { e.stopPropagation(); selectBar(r.elementId, regView.region, bar); }} style="cursor:pointer">
                                        {#if isSel}<circle cx={bx} cy={by} r={br + 3} fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="2,1"/>{/if}
                                        <circle cx={bx} cy={by} r={br} fill={isSel ? '#e94560' : isTens ? '#4caf50' : '#f0a500'} stroke={isSel ? '#fff' : isTens ? '#88dd88' : '#ffcc66'} stroke-width={isSel ? '1' : '0.5'} />
                                      </g>
                                    {/each}
                                  </svg>
                                  <div class="section-legend">
                                    <span class="legend-item"><span class="legend-dot legend-tension"></span>T</span>
                                    <span class="legend-item"><span class="legend-dot legend-compression"></span>C</span>
                                    {#if stirDef}<span class="legend-item"><span class="legend-stirrup-box"></span>eØ{stirDef.diameter}</span>{/if}
                                    <span class="legend-dim">{(secB*100).toFixed(0)}×{(secH*100).toFixed(0)}</span>
                                  </div>
                                  {#if regView.ck}
                                    <div class="beam-region-status {regView.ck.status}">{regView.ck.status === 'ok' ? '✓' : '✗'} {regView.ck.ratio.toFixed(2)}</div>
                                  {/if}
                                  {#if selectedBar && selectedBar.elemId === r.elementId && selectedBar.region === regView.region}
                                    <div class="bar-edit-toolbar">
                                      <span class="bar-edit-info">{selectedBar.face} r{selectedBar.row} #{selectedBar.index} Ø{selectedBar.diameter}</span>
                                      <select class="bar-edit-select" value={selectedBar.diameter}
                                        onchange={(e) => changeSelectedBarDia(+e.currentTarget.value)}>
                                        {#each LONG_DIAS as dia}<option value={dia}>Ø{dia}</option>{/each}
                                      </select>
                                      <button class="bar-edit-btn" onclick={addBarToSelectedRow} title="Add bar to this row">+</button>
                                      <button class="bar-edit-btn bar-edit-rm" onclick={removeBarFromSelectedRow} title="Remove bar from this row">−</button>
                                      <button class="bar-edit-btn bar-edit-desel" onclick={() => selectedBar = null}>✕</button>
                                    </div>
                                  {/if}
                                </div>
                              {/each}
                            </div>
                          </div>
                          <!-- Constructibility Diagnostics (inside schematic scope for layout access) -->
                          {#if layoutStart?.issues.length || layoutSpan?.issues.length || layoutEnd?.issues.length}
                            {@const allIssues = [...(layoutStart?.issues ?? []).map(i => ({ ...i, region: 'Start' })), ...(layoutSpan?.issues ?? []).map(i => ({ ...i, region: 'Span' })), ...(layoutEnd?.issues ?? []).map(i => ({ ...i, region: 'End' }))]}
                            <div class="constr-diagnostics">
                              <div class="constr-title">Bars don't fit — {allIssues.length} issue{allIssues.length > 1 ? 's' : ''}</div>
                              {#each allIssues as issue}
                                <div class="constr-issue constr-{issue.type}">
                                  <span class="constr-region">{issue.region}</span>
                                  <span class="constr-type">{issue.type === 'horizontal' ? 'Too close horizontally' : issue.type === 'vertical' ? 'Too close vertically' : issue.type === 'cover' ? 'Cover violated' : 'Top/bottom overlap'}</span>
                                  <span class="constr-desc">{issue.description}</span>
                                  <span class="constr-fix">{issue.type === 'horizontal' || issue.type === 'vertical' ? 'Reduce bars per row or use smaller diameter' : issue.type === 'cover' ? 'Move bars inward or reduce count' : 'Reduce rows or section too shallow'}</span>
                                </div>
                              {/each}
                            </div>
                          {/if}
                        {/if}
                        <!-- ─── Verification Section (rich — matches report content) ─── -->
                        {@const codeDetail = getCodeDetail(r.elementId)}
                        {#if provVerif && provVerif.checks.length > 0}
                          {@const inlineUtil = pvUtilization != null ? pvUtilization : r.utilization}
                          {@const utilSource = pvUtilization != null ? 'provided' : 'design-check'}
                          <div class="verif-section-header">
                            <span class="verif-section-title">Verification</span>
                            <span class="verif-section-badge prov-status-{provVerif.overallStatus}">{provVerif.overallStatus === 'ok' ? '✓ All checks pass' : provVerif.overallStatus === 'warn' ? '⚠ Warnings' : '✗ Failures found'}</span>
                            <span class="verif-util-display">Utilization: <strong>{fmtRatio(inlineUtil)}</strong>{pvWorstCheck ? ` — ${pvWorstCheck.category}` : ''} <span class="util-source">({utilSource}, {r.pvCapChecks.length} checks)</span></span>
                          </div>
                          <!-- Provided reinforcement check table -->
                          <table class="prov-check-table">
                            <thead><tr><th>Check</th><th>Demand / Req.</th><th>Capacity / Prov.</th><th>Ratio</th><th>Status</th><th>Method</th><th>Swept</th><th>Gov. Combo</th></tr></thead>
                            <tbody>
                              {#each provVerif.checks as pc}
                                {@const isAnch = pc.category === 'Anchorage'}
                                <tr class={pc.status === 'ok' ? 'status-ok' : pc.status === 'warn' ? 'status-warn' : 'status-fail'}>
                                  <td class="prov-check-name">{pc.category}</td>
                                  {#if isAnch}
                                    <td class="num prov-anch-desc" colspan="2">{pc.description}</td>
                                  {:else if pc.method === 'capacity'}
                                    <td class="num">{pc.demand?.toFixed(1)} {pc.unit}</td>
                                    <td class="num">{pc.capacity?.toFixed(1)} {pc.unit}</td>
                                  {:else}
                                    <td class="num">{pc.required?.toFixed(2)} {pc.unit}</td>
                                    <td class="num">{pc.provided?.toFixed(2)} {pc.unit}</td>
                                  {/if}
                                  <td class="num" style="font-weight:600">{isAnch ? '—' : (pc.ratio >= 100 ? '—' : pc.ratio.toFixed(2))}</td>
                                  <td><span class="status-badge {pc.status === 'ok' ? 'status-ok' : pc.status === 'warn' ? 'status-warn' : 'status-fail'}">{pc.status === 'ok' ? '✓' : pc.status === 'warn' ? '⚠' : '✗'}</span></td>
                                  <td class="prov-method prov-method-{pc.method}">{isAnch ? 'Ld' : pc.method === 'capacity' ? (pc.category.includes('Bresler') ? 'Bresler' : pc.category.includes('Uniaxial') ? 'P-M' : pc.category.includes('Shear') || pc.category.includes('Ties') ? 'φVn' : 'φMn') : 'As'}</td>
                                  <td class="prov-swept">{isAnch ? '—' : (pc.tuplesChecked > 1 ? `${pc.tuplesChecked}` : '1')}</td>
                                  <td class="combo-ref">{pc.comboName ?? '—'}</td>
                                </tr>
                              {/each}
                            </tbody>
                          </table>
                        {/if}
                        <!-- Interaction diagram (columns only) -->
                        {#if codeDetail?.interactionParams}
                          {@const ip = codeDetail.interactionParams}
                          {@const diagParams = { b: ip.b, h: ip.h, fc: ip.fc, fy: ip.fy, cover: ip.cover, AsProv: ip.AsProv, barCount: ip.barCount, barDia: ip.barDia } satisfies DiagramParams}
                          {@const diagram = generateInteractionDiagram(diagParams)}
                          <div class="verif-drawings">
                            <div class="verif-drawings-row">
                              <div class="verif-drawing-cell">
                                {@html generateInteractionSvg(diagram, { Nu: ip.Nu, Mu: ip.Mu }, 220, 280)}
                              </div>
                            </div>
                          </div>
                        {/if}
                        {#if codeDetail}
                          <!-- Calculation memos via code-detail adapter -->
                          <div class="verif-memos-title">CIRSOC 201 — Calculation Details</div>
                          <div class="verif-memos">
                            {#each codeDetail.memos as memo}
                              <div class="memo-section">
                                <div class="memo-title">{memo.title}</div>
                                {#each memo.steps as step}<div class="memo-step">{step}</div>{/each}
                              </div>
                            {/each}
                            {#if codeDetail.slender}
                              <div class="memo-section">
                                <div class="memo-title">Slenderness {codeDetail.slender.isSlender ? '(slender)' : '(short)'}</div>
                                <div class="slender-factors">
                                  <span>k = {codeDetail.slender.k.toFixed(2)}</span>
                                  <span>Lu = {codeDetail.slender.lu.toFixed(2)} m</span>
                                  <span>r = {(codeDetail.slender.r * 100).toFixed(1)} cm</span>
                                  <span>k·Lu/r = {codeDetail.slender.klu_r.toFixed(1)}</span>
                                  {#if codeDetail.slender.isSlender}
                                    <span class="slender-highlight">δ_ns = {codeDetail.slender.delta_ns.toFixed(3)}</span>
                                  {/if}
                                </div>
                                {#each codeDetail.slender.steps as step}<div class="memo-step">{step}</div>{/each}
                              </div>
                            {/if}
                            {#if codeDetail.detailing}
                              <div class="memo-section">
                                <div class="memo-title">Detailing</div>
                                {#each codeDetail.detailing.bars as bar}
                                  <div class="memo-step">Ø{bar.diameter}: ld={bar.ld.toFixed(2)}m, ldh={bar.ldh.toFixed(2)}m, splice={bar.lapSplice.toFixed(2)}m</div>
                                {/each}
                                <div class="memo-step">Min clear spacing: {(codeDetail.detailing.minClearSpacing * 1000).toFixed(0)}mm</div>
                              </div>
                            {/if}
                          </div>
                        {/if}
                      {:else}
                        <div class="prov-empty">No provided reinforcement. Click "Run Design" to design all members.</div>
                      {/if}
                    </div>
                  {/if}
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .design-tab { display: flex; flex-direction: column; gap: 0; height: 100%; overflow: hidden; }

  .summary-bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #0a1a30; border-bottom: 1px solid #1a4a7a; flex-shrink: 0; gap: 8px; }
  .summary-left { display: flex; gap: 6px; align-items: center; }
  .code-select { padding: 4px 8px; background: #0f3460; border: 1px solid #1a4a7a; border-radius: 4px; color: #eee; font-size: 0.75rem; }
  .run-btn { padding: 4px 12px; background: #1a4a7a; border: 1px solid #2a6ab0; border-radius: 4px; color: white; font-size: 0.75rem; font-weight: 600; cursor: pointer; }
  .run-btn:hover:not(:disabled) { background: #2a6ab0; }
  .run-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .summary-counts { display: flex; gap: 10px; font-size: 0.75rem; }
  .count { font-weight: 600; }
  .count-total { color: #aaa; }
  .count-pass { color: #22cc66; }
  .count-warn { color: #ddaa00; }
  .count-fail { color: #ee2222; }

  .error-bar { padding: 6px 12px; background: #3a1020; color: #ff6666; font-size: 0.75rem; border-bottom: 1px solid #5a2030; }

  .placeholder { padding: 24px; text-align: center; color: #666; font-size: 0.8rem; }

  .filter-bar { display: flex; gap: 4px; padding: 6px 12px; background: #0d1b2e; border-bottom: 1px solid #1a3050; flex-shrink: 0; }
  .filter-bar button { padding: 2px 10px; background: transparent; border: 1px solid #334; border-radius: 3px; color: #888; font-size: 0.7rem; cursor: pointer; }
  .filter-bar button:hover { color: #ccc; border-color: #555; }
  .filter-bar button.active { background: #1a4a7a; color: white; border-color: #2a6ab0; }

  .table-scroll { flex: 1; overflow-y: auto; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
  thead { position: sticky; top: 0; z-index: 1; }
  th { background: #0f2040; color: #999; font-weight: 600; text-align: left; padding: 5px 8px; border-bottom: 2px solid #1a4a7a; white-space: nowrap; }
  td { padding: 4px 8px; border-bottom: 1px solid #1a2a40; color: #ccc; }
  tr:hover { background: rgba(26, 74, 122, 0.15); }

  .col-id { width: 50px; text-align: center; }
  .col-type { width: 60px; }
  .col-section { width: 90px; }
  .col-check { width: 120px; }
  .col-ratio { width: 130px; }
  .col-status { width: 40px; text-align: center; }
  .col-combo { width: 100px; font-size: 0.65rem; color: #888; }

  .check-detail-row td { padding: 0; }
  .check-detail-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; background: #0a1828; }
  .check-detail-table th { padding: 3px 6px; font-size: 0.6rem; font-weight: 600; color: #556; text-transform: uppercase; text-align: left; border-bottom: 1px solid #12253d; }
  .check-detail-table td { padding: 3px 6px; border-bottom: 1px solid #0f1e30; color: #aab; }
  .check-detail-table .num { text-align: right; font-family: monospace; font-variant-numeric: tabular-nums; }
  .check-detail-table .combo-ref { font-size: 0.6rem; color: #667; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
  .check-detail-table .combo-highlight { color: #4ecdc4; font-weight: 600; }
  .multi-combo-note { font-size: 0.6rem; color: #f0a500; padding: 4px 8px; background: rgba(240,165,0,0.06); border-bottom: 1px solid rgba(240,165,0,0.15); font-style: italic; }

  .station-demands-section { margin-top: 6px; border-top: 1px solid #1a3050; padding-top: 6px; }
  .station-demands-header { font-size: 0.65rem; font-weight: 700; color: #4ecdc4; margin-bottom: 4px; }
  .station-demands-note { font-weight: 400; color: #556; font-style: italic; }
  .station-demands-table { width: 100%; border-collapse: collapse; font-size: 0.65rem; }
  .station-demands-table th { padding: 2px 5px; font-size: 0.58rem; font-weight: 600; color: #445; text-transform: uppercase; text-align: left; border-bottom: 1px solid #12253d; }
  .station-demands-table td { padding: 2px 5px; border-bottom: 1px solid #0f1e30; color: #99a; }
  .station-demands-table .cat-label { font-weight: 600; color: #ccc; white-space: nowrap; }
  .station-demands-table .num { text-align: right; font-family: monospace; font-variant-numeric: tabular-nums; }
  .station-demands-table .combo-ref { font-size: 0.58rem; color: #667; max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
  .station-demands-table .t-label { font-size: 0.52rem; color: #445; }
  .station-demands-table .drives-label { font-size: 0.52rem; color: #4ecdc4; margin-left: 3px; font-weight: 400; }
  .station-demands-footer { font-size: 0.58rem; color: #556; padding: 3px 5px; font-style: italic; border-top: 1px solid #12253d; margin-top: 2px; }

  .ratio-cell { display: flex; align-items: center; gap: 6px; }
  .ratio-value { width: 32px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .ratio-bar { flex: 1; height: 6px; background: #1a2a40; border-radius: 3px; overflow: hidden; }
  .ratio-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }

  .status-badge { font-size: 0.85rem; font-weight: 700; }
  .status-ok { color: #22cc66; }
  .status-warn { color: #ddaa00; }
  .status-fail { color: #ee2222; }

  tr.status-fail { background: rgba(238, 34, 34, 0.05); }
  tr.status-warn { background: rgba(221, 170, 0, 0.03); }

  /* ─── Provided Reinforcement Section ─── */
  .provided-section { margin-top: 8px; border-top: 2px solid #1a4a7a; padding-top: 6px; }
  .provided-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .provided-title { font-size: 0.7rem; font-weight: 700; color: #f0a500; }
  .prov-btn { padding: 2px 8px; border-radius: 3px; font-size: 0.6rem; cursor: pointer; border: 1px solid; }
  .prov-btn-accept { background: #1a3a2a; border-color: #2a6a3a; color: #4caf50; }
  .prov-btn-accept:hover { background: #2a4a3a; }
  .prov-btn-clear { background: #3a1a1a; border-color: #5a2a2a; color: #e94560; }
  .prov-btn-clear:hover { background: #4a2a2a; }
  .prov-status-badge { font-size: 0.6rem; font-weight: 700; padding: 1px 6px; border-radius: 3px; }
  .prov-status-ok { background: #1a3a2a; color: #22cc66; }
  .prov-status-warn { background: #3a3a1a; color: #ddaa00; }
  .prov-status-fail { background: #3a1a1a; color: #ee2222; }
  .prov-status-none { background: #1a1a2a; color: #667; }

  .prov-editor { display: flex; flex-direction: column; gap: 4px; padding: 4px 6px; background: #0a1525; border-radius: 4px; }
  .prov-row { display: flex; align-items: center; gap: 4px; }
  .prov-label { font-size: 0.62rem; color: #889; width: 85px; flex-shrink: 0; }
  .prov-input { width: 36px; padding: 2px 4px; background: #0f2040; border: 1px solid #1a4a7a; border-radius: 3px; color: #eee; font-size: 0.62rem; text-align: center; }
  .prov-input-sm { width: 28px; }
  .prov-input-sp { width: 44px; }
  .prov-select { padding: 2px 4px; background: #0f2040; border: 1px solid #1a4a7a; border-radius: 3px; color: #eee; font-size: 0.62rem; }
  .prov-select-sm { width: 42px; }
  .prov-area { font-size: 0.6rem; color: #4ecdc4; font-family: monospace; font-variant-numeric: tabular-nums; margin-left: 4px; }
  .prov-muted { color: #445; }
  .prov-sub { font-size: 0.58rem; color: #667; }
  .prov-empty { font-size: 0.6rem; color: #556; padding: 4px 6px; font-style: italic; }
  .prov-region-title { font-size: 0.56rem; font-weight: 600; color: #4ecdc4; margin-top: 4px; margin-bottom: 1px; text-transform: uppercase; letter-spacing: 0.03em; opacity: 0.7; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .governs-badge { font-size: 0.52rem; color: #f0a500; background: #2a2a10; padding: 0 4px; border-radius: 2px; border: 1px solid #554400; text-transform: none; font-weight: 700; opacity: 1; }
  .layer-add-btn, .layer-split-btn { font-size: 0.5rem; padding: 0 4px; background: #0f2040; border: 1px solid #1a4a7a; border-radius: 2px; color: #4ecdc4; cursor: pointer; text-transform: none; letter-spacing: 0; }
  .layer-add-btn:hover, .layer-split-btn:hover { background: #1a3060; }
  .layer-split-btn { color: #f0a500; border-color: #5a3a1a; }
  .layer-row { background: rgba(78,205,196,0.03); border-left: 2px solid #1a3050; padding-left: 4px; }
  .layer-idx { font-size: 0.5rem; color: #556; font-family: monospace; width: 16px; flex-shrink: 0; }
  .layer-rm-btn { font-size: 0.6rem; padding: 0 3px; background: none; border: 1px solid #3a1a1a; border-radius: 2px; color: #e94560; cursor: pointer; line-height: 1; }
  .layer-rm-btn:hover { background: #3a1a1a; }
  .layer-empty { font-size: 0.52rem; }
  .layer-total { font-size: 0.52rem; color: #4ecdc4; padding-left: 20px; font-family: monospace; }
  .fit-warn { display: inline-block; width: 14px; height: 14px; line-height: 14px; text-align: center; background: #ee2222; color: white; font-weight: 700; font-size: 0.55rem; border-radius: 2px; margin-left: 2px; cursor: help; }

  /* Modified-rebar tracking bar */
  .modified-bar { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 5px 12px; background: rgba(240,165,0,0.08); border-bottom: 1px solid rgba(240,165,0,0.25); border-top: 1px solid rgba(240,165,0,0.15); font-size: 0.68rem; }
  .modified-bar-empty { background: rgba(136,136,136,0.05); border-bottom-color: rgba(136,136,136,0.15); border-top-color: rgba(136,136,136,0.1); }
  .modified-bar-empty .modified-label { color: #778; font-style: italic; font-weight: 400; }
  .batch-bar { display: flex; padding: 6px 12px; background: rgba(34,204,102,0.06); border-bottom: 1px solid rgba(34,204,102,0.2); }
  .batch-btn { padding: 5px 14px; background: #1a3a2a; border: 1px solid #2a6a3a; border-radius: 4px; color: #22cc66; font-size: 0.75rem; font-weight: 600; cursor: pointer; }
  .batch-btn:hover { background: #2a4a3a; }
  .live-badge { display: inline-block; font-size: 0.55rem; color: #22cc66; font-weight: 600; padding: 1px 6px; background: rgba(34,204,102,0.12); border: 1px solid rgba(34,204,102,0.3); border-radius: 3px; letter-spacing: 0.03em; }
  .modified-label { color: #f0a500; font-weight: 600; margin-right: 4px; }
  .modified-elem { color: #ccc; padding: 1px 5px; background: #0f2040; border: 1px solid #1a4a7a; border-radius: 3px; white-space: nowrap; }
  .modified-elem:hover { border-color: #4ecdc4; color: #4ecdc4; }
  .modified-ok { border-color: #22cc66; color: #22cc66; }
  .modified-strength { border-color: #ee2222; color: #ff6666; }
  .modified-constr { border-color: #f0a500; color: #f0a500; }
  .modified-fit-issue { border-color: #ee8822; color: #ee8822; }

  /* Constructibility diagnostics */
  .constr-diagnostics { padding: 4px 6px; background: rgba(238,34,34,0.04); border: 1px solid rgba(238,34,34,0.15); border-radius: 3px; margin-top: 4px; }
  .constr-title { font-size: 0.58rem; font-weight: 700; color: #ee2222; margin-bottom: 3px; }
  .constr-issue { display: flex; gap: 4px; align-items: center; font-size: 0.52rem; padding: 1px 0; border-bottom: 1px solid rgba(238,34,34,0.08); }
  .constr-region { color: #889; font-weight: 600; width: 32px; flex-shrink: 0; }
  .constr-type { font-weight: 600; width: 40px; flex-shrink: 0; padding: 0 3px; border-radius: 2px; text-align: center; }
  .constr-horizontal .constr-type { color: #f0a500; background: rgba(240,165,0,0.1); }
  .constr-vertical .constr-type { color: #e94560; background: rgba(233,69,96,0.1); }
  .constr-cover .constr-type { color: #4ecdc4; background: rgba(78,205,196,0.1); }
  .constr-overlap .constr-type { color: #ee2222; background: rgba(238,34,34,0.15); }
  .constr-desc { color: #aab; }
  .constr-fix { color: #4ecdc4; font-style: italic; font-size: 0.48rem; }
  .crit-section-info { font-size: 0.54rem; color: #889; padding: 2px 6px; background: rgba(78,205,196,0.05); border: 1px solid rgba(78,205,196,0.15); border-radius: 3px; margin-bottom: 4px; font-family: monospace; }

  /* ─── Beam Region Interpretation Schematic ─── */
  .beam-schematic { margin-top: 6px; padding: 6px; background: #0a1525; border: 1px solid #1a3050; border-radius: 4px; }
  .beam-schematic-title { font-size: 0.6rem; font-weight: 700; color: #f0a500; margin-bottom: 4px; }
  .beam-schematic-note { font-weight: 400; color: #556; font-style: italic; font-size: 0.52rem; }
  .beam-regions-row { display: flex; gap: 4px; align-items: stretch; }
  .beam-region { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px; border-radius: 3px; }
  .beam-region-support { background: rgba(240,165,0,0.06); border: 1px solid rgba(240,165,0,0.15); }
  .beam-region-span { background: rgba(78,205,196,0.06); border: 1px solid rgba(78,205,196,0.15); flex: 2; }
  .beam-region-label { font-size: 0.52rem; font-weight: 600; color: #889; text-transform: uppercase; letter-spacing: 0.03em; }
  .beam-section-box { display: flex; flex-direction: column; gap: 6px; padding: 4px 6px; background: #0f1e30; border: 1px solid #1a2a40; border-radius: 3px; width: 100%; min-height: 36px; justify-content: space-between; }
  .beam-layer { display: flex; align-items: center; gap: 3px; font-size: 0.56rem; }
  .beam-layer-top { justify-content: center; }
  .beam-layer-bot { justify-content: center; }
  .bar-badge { font-family: monospace; font-size: 0.56rem; color: #ddd; font-weight: 600; }
  .bar-na { color: #334; font-size: 0.52rem; }
  .role-tag { font-size: 0.48rem; font-weight: 700; padding: 0 3px; border-radius: 2px; letter-spacing: 0.05em; }
  .role-tension { background: #1a3a2a; color: #4caf50; }
  .role-compression { background: #3a2a1a; color: #f0a500; }
  .section-svg { display: block; margin: 0 auto; }
  .section-legend { display: flex; gap: 6px; align-items: center; justify-content: center; font-size: 0.46rem; color: #889; margin-top: 2px; }
  .legend-item { display: flex; align-items: center; gap: 2px; }
  .legend-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
  .legend-tension { background: #4caf50; }
  .legend-compression { background: #f0a500; }
  .legend-stirrup-box { display: inline-block; width: 10px; height: 6px; border: 1.5px solid #f0a500; border-radius: 1px; }
  .legend-dim { color: #556; font-family: monospace; font-size: 0.44rem; }
  .legend-warn { color: #ee2222; font-weight: 600; font-size: 0.46rem; }
  .col-section-block { padding: 6px; background: #0a1525; border: 1px solid #1a3050; border-radius: 4px; margin-top: 4px; }

  /* Continuity controls */
  .cont-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; padding: 2px 4px; }
  .cont-item { display: flex; align-items: center; gap: 3px; font-size: 0.52rem; color: #aab; cursor: pointer; }
  .cont-item input[type="checkbox"] { width: 12px; height: 12px; accent-color: #4ecdc4; }

  /* Bar group cards */
  .bar-group-card { padding: 3px 5px; background: rgba(78,205,196,0.04); border: 1px solid #1a3050; border-radius: 3px; margin-bottom: 3px; }
  .bg-header { display: flex; align-items: center; gap: 3px; }
  .bg-label { font-size: 0.52rem; font-weight: 600; color: #4ecdc4; width: 24px; flex-shrink: 0; }
  .bg-cont { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 2px; align-items: center; }
  .anch-select { padding: 1px 2px; background: #0f2040; border: 1px solid #1a4a7a; border-radius: 2px; color: #eee; font-size: 0.48rem; width: 34px; }
  .ext-input { width: 38px !important; font-size: 0.5rem !important; }

  /* Elevation schematic */
  .elev-schematic { padding: 4px; background: #0a1525; border: 1px solid #1a3050; border-radius: 4px; margin-top: 4px; }
  .elev-title { font-size: 0.56rem; font-weight: 700; color: #f0a500; margin-bottom: 2px; }
  .elev-svg { display: block; margin: 0 auto; }
  .col-face-row { gap: 3px; }

  /* Bar-edit toolbar */
  .bar-edit-toolbar { display: flex; gap: 3px; align-items: center; justify-content: center; padding: 3px 4px; background: #1a1030; border: 1px solid #e94560; border-radius: 3px; margin-top: 2px; }
  .bar-edit-info { font-size: 0.48rem; color: #e94560; font-family: monospace; font-weight: 600; }
  .bar-edit-select { padding: 1px 2px; background: #0f2040; border: 1px solid #1a4a7a; border-radius: 2px; color: #eee; font-size: 0.52rem; }
  .bar-edit-btn { padding: 0 5px; background: #0f2040; border: 1px solid #1a4a7a; border-radius: 2px; color: #4ecdc4; font-size: 0.62rem; font-weight: 700; cursor: pointer; line-height: 1.4; }
  .bar-edit-btn:hover { background: #1a3060; }
  .bar-edit-rm { color: #e94560; border-color: #5a2030; }
  .bar-edit-rm:hover { background: #3a1020; }
  .bar-edit-desel { color: #888; border-color: #334; font-size: 0.5rem; }
  .beam-region-status { font-size: 0.56rem; font-weight: 700; }
  .beam-region-status.ok { color: #22cc66; }
  .beam-region-status.fail { color: #ee2222; }

  .verif-section-header { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 4px 0; border-top: 2px solid #4ecdc4; }
  .verif-section-title { font-size: 0.72rem; font-weight: 700; color: #4ecdc4; letter-spacing: 0.03em; }
  .verif-section-badge { font-size: 0.6rem; font-weight: 600; padding: 1px 6px; border-radius: 3px; }
  .verif-util-display { font-size: 0.62rem; color: #ccd; margin-left: auto; }
  .verif-util-display strong { color: #f0a500; font-size: 0.72rem; }
  .util-source { font-size: 0.52rem; color: #667; }
  .verif-drawings { margin: 8px 0; }
  .verif-drawings-row { display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; }
  .verif-drawing-cell { background: #0a1525; border-radius: 4px; padding: 4px; }
  .verif-drawing-cell :global(svg) { max-width: 280px; height: auto; }
  .verif-memos-title { font-size: 0.72rem; font-weight: 700; color: #f0a500; margin-top: 12px; padding: 4px 0; border-top: 1px solid #1a4a7a; letter-spacing: 0.03em; }
  .verif-memos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
  .memo-section { background: #0f1e35; border: 1px solid #1a3050; border-radius: 4px; padding: 8px 10px; min-width: 200px; flex: 1; max-width: 320px; }
  .memo-title { font-size: 0.72rem; font-weight: 700; color: #4ecdc4; margin-bottom: 4px; border-bottom: 1px solid #1a4a7a; padding-bottom: 3px; text-transform: uppercase; letter-spacing: 0.03em; }
  .memo-step { font-size: 0.65rem; color: #ccd; line-height: 1.5; font-family: monospace; }
  .slender-factors { display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.65rem; color: #ccd; margin-bottom: 4px; }
  .slender-factors span { background: #0f1e30; padding: 2px 5px; border-radius: 2px; border: 1px solid #1a3050; }
  .slender-highlight { color: #f0a500; font-weight: 600; }
  .prov-check-table { width: 100%; border-collapse: collapse; font-size: 0.62rem; margin-top: 4px; background: #0a1525; }
  .prov-check-table th { padding: 2px 5px; font-size: 0.56rem; font-weight: 600; color: #556; text-transform: uppercase; text-align: left; border-bottom: 1px solid #12253d; }
  .prov-check-table td { padding: 2px 5px; border-bottom: 1px solid #0f1e30; color: #aab; }
  .prov-check-table .num { text-align: right; font-family: monospace; font-variant-numeric: tabular-nums; }
  .prov-check-table .prov-check-name { font-weight: 600; color: #ccc; }
  .prov-check-table .prov-anch-desc { font-size: 0.58rem; color: #e97; text-align: left; font-style: italic; }
  .prov-check-table .combo-ref { font-size: 0.56rem; color: #667; max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
  .prov-method { font-size: 0.52rem; font-weight: 600; padding: 0 3px; }
  .prov-method-capacity { color: #4ecdc4; }
  .prov-method-area { color: #888; }
  .prov-swept { font-size: 0.52rem; color: #667; text-align: center; font-variant-numeric: tabular-nums; }
</style>
