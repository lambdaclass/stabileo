<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import ProProjectFileActions from './ProProjectFileActions.svelte';
  import { modelStore, resultsStore, uiStore, verificationStore, tabManager, historyStore } from '../../lib/store';
  import { buildProStages, PRO_TAB_STAGE, type ProCmd } from '../../lib/pro/stages';
  import Icon from '../ribbon/Icon.svelte';
  import { openReport } from '../../lib/engine/pro-report';
  import type { ReportData, ReportConfig } from '../../lib/engine/pro-report';
  import type { ElementVerification } from '../../lib/engine/codes/argentina/cirsoc201';
  import { computeStationDemands as computeStationDemandsService, runUnifiedVerification } from '../../lib/engine/verification-service';
  import { estimateQuantitiesFromVerification } from '../../lib/engine/quantity-takeoff';
  import { checkCrackWidth, checkDeflection } from '../../lib/engine/codes/argentina/serviceability';
  import { classifyElement } from '../../lib/engine/codes/argentina/cirsoc201';
  import { computeBarMarks } from '../../lib/engine/bar-marks';
  import { buildStructuralGraph } from '../../lib/engine/structural-graph';
  import type { FrameLineElevationOpts } from '../../lib/engine/reinforcement-svg';
  import { runGlobalSolve } from '../../lib/engine/live-calc';
  import ProReportDialog from './ProReportDialog.svelte';
  import ProNodesTab from './ProNodesTab.svelte';
  import ProProjectTab from './ProProjectTab.svelte';
  import ProElementsTab from './ProElementsTab.svelte';
  import ProMaterialsTab from './ProMaterialsTab.svelte';
  import ProSectionsTab from './ProSectionsTab.svelte';
  import ProSupportsTab from './ProSupportsTab.svelte';
  import ProLoadsTab from './ProLoadsTab.svelte';
  import ProResultsTab from './ProResultsTab.svelte';
  import ProDesignTab from './ProDesignTab.svelte';
  import ProRcWorkflowTab from './ProRcWorkflowTab.svelte';
  import ProShellTab from './ProShellTab.svelte';
  import ProConstraintsTab from './ProConstraintsTab.svelte';
  import ProAdvancedTab from './ProAdvancedTab.svelte';
  import ProDiagnosticsTab from './ProDiagnosticsTab.svelte';
  import ProConnectionsTab from './ProConnectionsTab.svelte';
  import { checkModel } from '../../lib/engine/model-diagnostics';
  import { get2DDisplayNodalLoadMoment, get2DDisplayNodalLoadVertical } from '../../lib/geometry/coordinate-system';

  type ProTab = 'project' | 'nodes' | 'elements' | 'shells' | 'materials' | 'sections' | 'supports' | 'constraints' | 'loads' | 'advanced' | 'results' | 'design' | 'connections' | 'diagnostics';

  // Group tabs into logical categories
  interface TabGroup {
    label: string;
    tabs: { id: ProTab; label: string; badge?: () => number }[];
  }

  const tabGroups: TabGroup[] = $derived([
    {
      label: t('pro.groupGeometry'),
      tabs: [
        { id: 'nodes' as ProTab, label: t('pro.tabNodes') },
        { id: 'elements' as ProTab, label: t('pro.tabElements') },
        { id: 'shells' as ProTab, label: t('pro.tabShells') },
      ],
    },
    {
      label: t('pro.groupProperties'),
      tabs: [
        { id: 'materials' as ProTab, label: t('pro.tabMaterials') },
        { id: 'sections' as ProTab, label: t('pro.tabSections') },
      ],
    },
    {
      label: t('pro.groupConditions'),
      tabs: [
        { id: 'supports' as ProTab, label: t('pro.tabSupports') },
        { id: 'constraints' as ProTab, label: t('pro.tabConstraints') },
        { id: 'loads' as ProTab, label: t('pro.tabLoads') },
      ],
    },
    {
      label: t('pro.groupAnalysis'),
      tabs: [
        { id: 'advanced' as ProTab, label: t('pro.tabAdvanced') },
        { id: 'results' as ProTab, label: t('pro.tabResults') },
        { id: 'design' as ProTab, label: 'RC Design' },
        { id: 'connections' as ProTab, label: t('pro.tabConnections') },
        { id: 'diagnostics' as ProTab, label: t('pro.tabDiagnostics') },
      ],
    },
  ]);

  // activeTab is shared via uiStore.proActiveTab so App.svelte can render the nav strip
  const activeTab = $derived(uiStore.proActiveTab as ProTab);
  /** Verification results — derived from verificationStore (single source of truth).
   *  No longer a local $state — reads directly from the store. */
  const verificationsRef = $derived(verificationStore.concrete);
  let advancedResultsRef = $state<Record<string, any>>({});
  let tabError = $state<string | null>(null);
  let showReportDialog = $state(false);
  let solving = $state(false);
  let solveError = $state<string | null>(null);
  let showExampleMenu = $state(false);
  let exampleButtonEl = $state<HTMLButtonElement | null>(null);
  let exampleMenuStyle = $state('');
  const hasModel = $derived(modelStore.nodes.size > 0 && modelStore.elements.size > 0);

  // Expose action handlers for App.svelte's top strip via bind:this
  export function solve() { handleSolve(); }
  export function report() { handleOpenReportDialog(); }
  export function examples(btnEl: HTMLButtonElement) { exampleButtonEl = btnEl; toggleExampleMenu(); }
  export function isSolving() { return solving; }
  export function canSolve() { return hasModel && !solving; }
  export function canReport() { return modelStore.nodes.size > 0; }
  /**
   * The model's error count, for the ribbon's stage badge.
   *
   * The banner at the top of this panel already knows it, but only this panel
   * shows the banner — so the count was invisible from any other stage. The
   * ribbon needs it to say whether MODEL is clean without the user going to
   * Diagnostics to find out.
   */
  export function errorCount() { return modelErrorCount; }

  type ExampleGroup = 'buildings' | 'industrial' | 'foundations' | 'longspan' | 'energy' | 'xl';
  type ExamplePreset = 'default' | 'xl' | 'clean-shell' | 'bridge';
  interface ProExample {
    nameKey: string;
    descKey: string;
    purposeKey: string;
    groupKey: string;
    group: ExampleGroup;
    tags: string[];
    stats: { nodes: string; members: string; shells?: string };
    preset?: ExamplePreset;
    featured?: boolean;
    load: () => void;
  }

  const proExamples: ProExample[] = [
    {
      group: 'buildings',
      groupKey: 'pro.examples.groupBuildings',
      nameKey: 'ex.pro-edificio-7p',
      descKey: 'ex.pro-edificio-7p.desc',
      purposeKey: 'ex.pro-edificio-7p.purpose',
      tags: ['pro.tagRC', 'pro.tagCodes'],
      stats: { nodes: '141', members: '203', shells: '120' },
      preset: 'clean-shell',
      load: () => modelStore.loadExample('pro-edificio-7p'),
    },
    {
      group: 'buildings',
      groupKey: 'pro.examples.groupBuildings',
      nameKey: 'ex.irregularSetbackTower3D',
      descKey: 'ex.irregularSetbackTower3D.desc',
      purposeKey: 'ex.irregularSetbackTower3D.purpose',
      tags: ['pro.tagDrift', 'pro.tagTorsion'],
      stats: { nodes: '420', members: '1180' },
      preset: 'default',
      load: () => modelStore.loadExample('torre-irregular-con-retiros'),
    },
    {
      group: 'buildings',
      groupKey: 'pro.examples.groupBuildings',
      nameKey: 'ex.rcDesignFrame3D',
      descKey: 'ex.rcDesignFrame3D.desc',
      purposeKey: 'ex.rcDesignFrame3D.purpose',
      tags: ['pro.tagDesign', 'pro.tagRC'],
      stats: { nodes: '180', members: '344' },
      preset: 'default',
      load: () => modelStore.loadExample('rc-design-frame'),
    },
    {
      group: 'buildings',
      groupKey: 'pro.examples.groupBuildings',
      nameKey: 'ex.rc-qa-diagnostic',
      descKey: 'ex.rc-qa-diagnostic.desc',
      purposeKey: 'ex.rc-qa-diagnostic.purpose',
      tags: ['pro.tagDesign', 'pro.tagRC'],
      stats: { nodes: '18', members: '26' },
      preset: 'default',
      load: () => modelStore.loadExample('rc-qa-diagnostic'),
    },
    {
      group: 'buildings',
      groupKey: 'pro.examples.groupBuildings',
      nameKey: 'ex.cad-arch-structure-dxf',
      descKey: 'ex.cad-arch-structure-dxf.desc',
      purposeKey: 'ex.cad-arch-structure-dxf.purpose',
      tags: ['pro.tagRC', 'pro.tagCad'],
      stats: { nodes: '2101', members: '970', shells: '1160' },
      preset: 'default',
      load: () => modelStore.loadExample('cad-arch-structure-dxf'),
    },
    {
      group: 'buildings',
      groupKey: 'pro.examples.groupBuildings',
      nameKey: 'ex.cad-arch-only-dxf',
      descKey: 'ex.cad-arch-only-dxf.desc',
      purposeKey: 'ex.cad-arch-only-dxf.purpose',
      tags: ['pro.tagRC', 'pro.tagCad'],
      stats: { nodes: '794', members: '1000', shells: '660' },
      preset: 'default',
      load: () => modelStore.loadExample('cad-arch-only-dxf'),
    },
    {
      group: 'industrial',
      groupKey: 'pro.examples.groupIndustrial',
      nameKey: 'ex.3d-nave-industrial',
      descKey: 'ex.3d-nave-industrial.desc',
      purposeKey: 'ex.3d-nave-industrial.purpose',
      tags: ['pro.tagSteel', 'pro.tagCrane'],
      stats: { nodes: '232', members: '633' },
      preset: 'default',
      load: () => modelStore.loadExample('3d-nave-industrial'),
    },
    {
      group: 'industrial',
      groupKey: 'pro.examples.groupIndustrial',
      nameKey: 'ex.pipeRack3D',
      descKey: 'ex.pipeRack3D.desc',
      purposeKey: 'ex.pipeRack3D.purpose',
      tags: ['pro.tagIndustrial', 'pro.tagSteel'],
      stats: { nodes: '90', members: '173' },
      preset: 'default',
      load: () => modelStore.loadExample('pipe-rack'),
    },
    {
      group: 'energy',
      groupKey: 'pro.examples.groupEnergy',
      nameKey: 'ex.offshorePlatform',
      descKey: 'ex.offshorePlatform.desc',
      purposeKey: 'ex.offshorePlatform.purpose',
      tags: ['pro.tagSteel', 'pro.tagOffshore'],
      stats: { nodes: '196', members: '762' },
      preset: 'default',
      featured: true,
      load: () => modelStore.loadExample('offshore-platform'),
    },
    {
      group: 'foundations',
      groupKey: 'pro.examples.groupFoundations',
      nameKey: 'ex.matFoundation3D',
      descKey: 'ex.matFoundation3D.desc',
      purposeKey: 'ex.matFoundation3D.purpose',
      tags: ['pro.tagFoundation', 'pro.tagSoil'],
      stats: { nodes: '99', members: '180', shells: '80' },
      preset: 'clean-shell',
      load: () => modelStore.loadExample('mat-foundation'),
    },
    {
      group: 'longspan',
      groupKey: 'pro.examples.groupLongSpan',
      nameKey: 'ex.suspensionBridge3D',
      descKey: 'ex.suspensionBridge3D.desc',
      purposeKey: 'ex.suspensionBridge3D.purpose',
      tags: ['pro.tagCables', 'pro.tagLongSpan'],
      stats: { nodes: '378', members: '932' },
      preset: 'bridge',
      load: () => modelStore.loadExample('suspension-bridge'),
    },
    {
      group: 'longspan',
      groupKey: 'pro.examples.groupLongSpan',
      nameKey: 'ex.cableStayedBridge3D',
      descKey: 'ex.cableStayedBridge3D.desc',
      purposeKey: 'ex.cableStayedBridge3D.purpose',
      tags: ['pro.tagCables', 'pro.tagBridge'],
      stats: { nodes: '74', members: '125' },
      preset: 'bridge',
      load: () => modelStore.loadExample('cable-stayed-bridge'),
    },
    {
      group: 'longspan',
      groupKey: 'pro.examples.groupLongSpan',
      nameKey: 'ex.fullStadium3D',
      descKey: 'ex.fullStadium3D.desc',
      purposeKey: 'ex.fullStadium3D.purpose',
      tags: ['pro.tagRoof', 'pro.tagBowl'],
      stats: { nodes: '360', members: '876', shells: '48' },
      preset: 'clean-shell',
      load: () => modelStore.loadExample('full-stadium'),
    },
    {
      group: 'xl',
      groupKey: 'pro.examples.groupXL',
      nameKey: 'ex.geodesicDome3D',
      descKey: 'ex.geodesicDome3D.desc',
      purposeKey: 'ex.geodesicDome3D.purpose',
      tags: ['pro.tagShells', 'pro.tagScale'],
      stats: { nodes: '641', members: '1920' },
      preset: 'xl',
      load: () => modelStore.loadExample('geodesic-dome'),
    },
    {
      group: 'xl',
      groupKey: 'pro.examples.groupXL',
      nameKey: 'ex.laBombonera3D',
      descKey: 'ex.laBombonera3D.desc',
      purposeKey: 'ex.laBombonera3D.purpose',
      tags: ['pro.tagBowl', 'pro.tagScale'],
      stats: { nodes: '1005', members: '2476', shells: '120' },
      preset: 'clean-shell',
      featured: true,
      load: () => modelStore.loadExample('la-bombonera'),
    },
    {
      group: 'xl',
      groupKey: 'pro.examples.groupXL',
      nameKey: 'ex.xlDiagridTower3D',
      descKey: 'ex.xlDiagridTower3D.desc',
      purposeKey: 'ex.xlDiagridTower3D.purpose',
      tags: ['pro.tagScale', 'pro.tagDrift'],
      stats: { nodes: '1262', members: '5013' },
      preset: 'xl',
      load: () => modelStore.loadExample('xl-diagrid-tower'),
    },
    // Sagrada Familia removed upstream — fixture no longer available
  ];
  const proExampleGroups = $derived.by(() => {
    const order: ExampleGroup[] = ['buildings', 'industrial', 'energy', 'foundations', 'longspan', 'xl'];
    return order.map(group => ({
      group,
      title: t(proExamples.find(ex => ex.group === group)?.groupKey ?? ''),
      examples: proExamples.filter(ex => ex.group === group),
    })).filter(group => group.examples.length > 0);
  });

  async function toggleExampleMenu() {
    showExampleMenu = !showExampleMenu;
    if (showExampleMenu) {
      await tick();
      updateExampleMenuPosition();
    }
  }

  function updateExampleMenuPosition() {
    if (!showExampleMenu || typeof window === 'undefined') return;
    if (uiStore.isMobile) {
      // Mobile: full-width centered, below header
      const width = window.innerWidth - 16;
      const top = 48;
      const maxHeight = window.innerHeight - top - 60;
      exampleMenuStyle = `left:8px;top:${top}px;width:${width}px;max-height:${maxHeight}px;`;
      return;
    }
    if (!exampleButtonEl) return;
    const rect = exampleButtonEl.getBoundingClientRect();
    const width = Math.min(720, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    const top = Math.min(rect.bottom + 6, window.innerHeight - 120);
    const maxHeight = Math.max(260, Math.min(560, window.innerHeight - top - 16));
    exampleMenuStyle = `left:${left}px;top:${top}px;width:${width}px;max-height:${maxHeight}px;`;
  }

  /** Pre-solve model quality check — returns error diagnostics if any. */
  function getModelErrors(): import('../../lib/engine/types').SolverDiagnostic[] {
    return checkModel({
      nodes: modelStore.nodes,
      elements: modelStore.elements,
      materials: modelStore.materials,
      sections: modelStore.sections,
      supports: modelStore.supports,
      loads: modelStore.loads as any,
      loadCases: modelStore.model.loadCases,
      plates: modelStore.model.plates,
      quads: modelStore.model.quads,
      connectors: modelStore.model.connectors,
      constraints: modelStore.model.constraints,
    }).filter(d => d.severity === 'error');
  }

  /** Reactive count of blocking model errors (for UI state). */
  const modelErrorCount = $derived.by(() => {
    // Touch reactive deps
    void(modelStore.nodes.size + modelStore.elements.size + modelStore.supports.size + modelStore.loads.length);
    return getModelErrors().length;
  });

  async function handleSolve() {
    solveError = null;

    // ─── Pre-solve quality gate ─────────────────────────
    const errors = getModelErrors();
    if (errors.length > 0) {
      solveError = `${errors.length} ${t('pro.modelErrorsBlock')} — ${t('pro.seeDiagnostics')}`;
      uiStore.proActiveTab = 'diagnostics';
      return;
    }

    solving = true;
    try {
      await runGlobalSolve();
      if (!resultsStore.results3D) {
        solveError = t('pro.noResults');
        solving = false;
        return;
      }
      // Combinations are already solved inside runGlobalSolve for PRO mode
      uiStore.proActiveTab = 'results';
    } catch (e: any) {
      console.error('PRO solve error:', e);
      solveError = e?.message || String(e) || t('pro.unknownError');
    }
    solving = false;
  }

  // Merge model + assembly + solver diagnostics with dedup (mirrors ProDiagnosticsTab logic)
  const diagCount = $derived.by(() => {
    const is3D = uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro';
    const general = is3D ? resultsStore.diagnostics3D : resultsStore.diagnostics;
    const solver = is3D ? resultsStore.solverDiagnostics3D : resultsStore.solverDiagnostics;
    const modelDiags = checkModel({
      nodes: modelStore.nodes,
      elements: modelStore.elements,
      materials: modelStore.materials,
      sections: modelStore.sections,
      supports: modelStore.supports,
      loads: modelStore.loads as any,
      loadCases: modelStore.model.loadCases,
      plates: modelStore.model.plates,
      quads: modelStore.model.quads,
      connectors: modelStore.model.connectors,
      constraints: modelStore.model.constraints,
    });
    const merged = [...modelDiags];
    for (const sd of [...general, ...solver]) {
      const isDupe = merged.some(
        d => d.code === sd.code && d.message === sd.message &&
             JSON.stringify(d.elementIds) === JSON.stringify(sd.elementIds) &&
             JSON.stringify(d.nodeIds) === JSON.stringify(sd.nodeIds)
      );
      if (!isDupe) merged.push(sd);
    }
    return merged.filter(d => d.severity === 'error' || d.severity === 'warning').length;
  });

  // Counts for badges
  const nodeCount = $derived(modelStore.nodes.size);
  const elemCount = $derived(modelStore.elements.size);
  const loadCount = $derived(modelStore.loads.length);

  /** Compute station-based demands for all elements (when per-combo data available) */
  /** Auto-run CIRSOC verification on current results via unified service. */
  function autoVerify(): ElementVerification[] {
    const results = resultsStore.results3D;
    if (!results) return [];
    const stationData = resultsStore.hasCombinations3D
      ? computeStationDemandsService(resultsStore.perCombo3D, modelStore.model.combinations, { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports })
      : undefined;
    return runUnifiedVerification(
      results,
      { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports },
      resultsStore.governing3D.size > 0 ? resultsStore.governing3D : null,
      stationData?.demands,
    );
  }

  /** Serialize loads for the report */
  function serializeLoads(): ReportData['loads'] {
    const loads: NonNullable<ReportData['loads']> = [];
    for (const load of modelStore.model.loads) {
      let tipo = '', destino = '', valores = '';
      switch (load.type) {
        case 'nodal': { const d = load.data; tipo = t('file.loadNodal'); destino = `Nodo ${d.nodeId}`; valores = `Fx=${d.fx} kN, Fz=${get2DDisplayNodalLoadVertical(d)} kN, My=${get2DDisplayNodalLoadMoment(d)} kN·m`; break; }
        case 'distributed': { const d = load.data; tipo = t('file.loadDistributed'); destino = `Elem ${d.elementId}`; valores = d.qI === d.qJ ? `q=${d.qI} kN/m` : `qI=${d.qI}, qJ=${d.qJ} kN/m`; break; }
        case 'pointOnElement': { const d = load.data; tipo = t('file.loadPointOnElement'); destino = `Elem ${d.elementId}`; valores = `P=${d.p} kN, a=${d.a} m`; break; }
        case 'thermal': { const d = load.data; tipo = t('file.loadThermal'); destino = `Elem ${d.elementId}`; valores = `ΔT=${d.dtUniform} °C, ΔTg=${d.dtGradient} °C`; break; }
      }
      loads.push({ type: tipo, target: destino, values: valores, caseLabel: (load as any).caseLabel });
    }
    return loads;
  }

  async function handleOpenReportDialog() {
    // Auto-solve if no results yet
    if (!resultsStore.results3D) {
      if (modelStore.nodes.size === 0) { uiStore.toast(t('pro.solveFirst'), 'error'); return; }
      await runGlobalSolve();
    }
    if (!resultsStore.results3D) return;

    // Re-verify CIRSOC against the CURRENT model state — writes to
    // verificationStore, which updates verificationsRef (derived) automatically.
    // (Always, not just when the store is empty: a prior run may have left
    // verifications from a since-edited model, which would put stale results in
    // the report next to current model data.)
    const concrete = autoVerify();
    verificationStore.setConcrete(concrete);

    showReportDialog = true;
  }

  function exportReport(config: ReportConfig) {
    showReportDialog = false;

    const results = resultsStore.results3D;
    if (!results) return;

    let screenshot: string | undefined;
    const canvas = document.querySelector('canvas');
    if (canvas) {
      try { screenshot = canvas.toDataURL('image/png'); } catch { /* ignore */ }
    }

    const data: ReportData = {
      projectName: modelStore.model.name || 'Estructura',
      date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
      provenance: modelStore.model.provenance,
      nodes: [...modelStore.nodes.values()],
      elements: [...modelStore.elements.values()],
      materials: [...modelStore.materials.values()],
      sections: [...modelStore.sections.values()],
      supports: [...modelStore.supports.values()],
      quads: modelStore.model.quads.size > 0 ? [...modelStore.model.quads.values()] : undefined,
      loadCount: modelStore.loads.length,
      loads: serializeLoads(),
      results,
      verifications: verificationsRef,
      combinations: modelStore.model.combinations.length > 0
        ? modelStore.model.combinations.map(c => ({
            id: c.id, name: c.name,
            factors: c.factors
              .map(f => { const lc = modelStore.model.loadCases.find(lc2 => lc2.id === f.caseId); return lc ? { caseName: lc.name, factor: f.factor } : null; })
              .filter((f): f is { caseName: string; factor: number } => f !== null),
          }))
        : undefined,
      advancedResults: Object.keys(advancedResultsRef).length > 0 ? advancedResultsRef : undefined,
      diagnostics: resultsStore.diagnostics3D.length > 0 ? resultsStore.diagnostics3D : undefined,
      serviceability: verificationsRef.length > 0 ? verificationsRef.map(v => {
        const Ms = v.Mu / 1.4;
        const crack = (v.elementType === 'beam' && v.flexure.AsProv > 0)
          ? checkCrackWidth(v.b, v.h, v.flexure.d, v.flexure.AsProv, Ms, v.cover, v.flexure.barDia, v.flexure.barCount)
          : undefined;
        const elem = modelStore.elements.get(v.elementId);
        const nI = elem ? modelStore.nodes.get(elem.nodeI) : undefined;
        const nJ = elem ? modelStore.nodes.get(elem.nodeJ) : undefined;
        const L = (nI && nJ) ? Math.sqrt((nJ.x - nI.x) ** 2 + (nJ.y - nI.y) ** 2 + ((nJ.z ?? 0) - (nI.z ?? 0)) ** 2) : 0;
        const maxDisp = results.displacements.reduce((mx, d) => Math.max(mx, Math.abs(d.uz)), 0);
        const defl = (L > 0 && v.elementType === 'beam') ? checkDeflection(L, maxDisp) : undefined;
        return { elementId: v.elementId, elementType: v.elementType, crack: crack ? { wk: crack.wk, wkLimit: crack.wLimit, status: crack.status } : undefined, deflection: defl ? { ratio: defl.ratio, limit: defl.limit, status: defl.status } : undefined };
      }).filter(s => s.crack || s.deflection) : undefined,
      screenshot,
      t,
      config,
    };

    // ── Assemble upgraded joint details for report ──
    if (verificationsRef.length > 0) {
      const verifMap = new Map(verificationsRef.map(v => [v.elementId, v]));
      // Build structural graph for joint/frame-line discovery
      const graphNodes = new Map<number, { id: number; x: number; y: number; z: number }>();
      for (const [id, n] of modelStore.nodes) graphNodes.set(id, { id, x: n.x, y: n.y, z: n.z ?? 0 });
      const graphElements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; type: string }>();
      for (const [id, e] of modelStore.elements) graphElements.set(id, { id, nodeI: e.nodeI, nodeJ: e.nodeJ, sectionId: e.sectionId, type: e.type });
      const graphSections = new Map<number, { id: number; b?: number; h?: number }>();
      for (const [id, s] of modelStore.sections) graphSections.set(id, { id, b: s.b, h: s.h });
      const graphSupports = new Map<number, { nodeId: number; type: string }>();
      for (const [, s] of modelStore.supports) graphSupports.set(s.nodeId, { nodeId: s.nodeId, type: s.type });
      const graph = buildStructuralGraph(graphNodes, graphElements, graphSections, graphSupports);

      // Joint details (up to 4 for report)
      const seen = new Set<string>();
      const jOpts: typeof data.jointDetailOpts = [];
      for (const joint of graph.joints) {
        const beam = joint.beamIds.map(id => verifMap.get(id)).find(v => v && v.elementType === 'beam');
        const col = joint.columnIds.map(id => verifMap.get(id)).find(v => v && (v.elementType === 'column' || v.elementType === 'wall'));
        if (!beam || !col) continue;
        const key = `${beam.b}_${beam.h}_${col.b}_${col.h}`;
        if (seen.has(key)) continue;
        seen.add(key);
        jOpts.push({
          beamB: beam.b, beamH: beam.h, colB: col.b, colH: col.h, cover: beam.cover,
          beamBars: beam.flexure.bars, colBars: col.column?.bars ?? `${col.flexure.barCount} Ø${col.flexure.barDia}`,
          stirrupDia: col.shear.stirrupDia, stirrupSpacing: col.shear.spacing,
          beamDetailing: beam.detailing, colDetailing: col.detailing, nodeId: joint.nodeId,
          labels: { title: t('pro.jointDetail'), beam: t('pro.beam'), column: t('pro.column'), joint: t('pro.jointWord') !== 'pro.jointWord' ? t('pro.jointWord') : 'joint', splice: t('pro.lapSplice') },
        });
        if (jOpts.length >= 4) break;
      }
      if (jOpts.length > 0) data.jointDetailOpts = jOpts;

      // Beam continuity frame lines (up to 3 for report)
      const elemLengths = new Map<number, number>();
      for (const v of verificationsRef) {
        const elem = modelStore.elements.get(v.elementId);
        if (elem) {
          const nI = modelStore.nodes.get(elem.nodeI);
          const nJ = modelStore.nodes.get(elem.nodeJ);
          if (nI && nJ) elemLengths.set(v.elementId, Math.sqrt((nJ.x - nI.x) ** 2 + (nJ.y - nI.y) ** 2 + ((nJ.z ?? 0) - (nI.z ?? 0)) ** 2));
        }
      }
      // Read moment envelope for report parity with UI
      const envMomentZ = resultsStore.envelope3D?.momentZ;
      const envMap = new Map<number, { t: number[]; posM: number[]; negM: number[] }>();
      if (envMomentZ) {
        for (const ed of envMomentZ.elements) {
          envMap.set(ed.elementId, { t: ed.tPositions, posM: ed.posValues, negM: ed.negValues.map(v => Math.abs(v)) });
        }
      }

      const flOpts: FrameLineElevationOpts[] = [];
      for (const fl of graph.frameLines) {
        if (fl.direction !== 'horizontal' || fl.elementIds.length < 2) continue;
        const spans = fl.elementIds.map(eid => {
          const v = verifMap.get(eid); const len = elemLengths.get(eid);
          if (!v || !len) return null;
          const hasComp = v.flexure.isDoublyReinforced && !!v.flexure.barCountComp;
          const momentStations = envMap.get(eid);
          return { length: len, bottomBars: v.flexure.bars, topBars: hasComp ? (v.flexure.barsComp ?? '2 Ø10') : '2 Ø10', hasCompSteel: hasComp, stirrupSpacing: v.shear.spacing, stirrupDia: v.shear.stirrupDia, detailing: v.detailing, momentStations, barCount: v.flexure.barCount, barDia: v.flexure.barDia, asMin: v.flexure.AsMin, topBarCount: hasComp ? v.flexure.barCountComp : undefined, topBarDia: hasComp ? v.flexure.barDiaComp : undefined, sectionB: v.b, cover: v.cover };
        });
        if (spans.filter(Boolean).length < 2) continue;
        const nodes = fl.nodeIds.map(nid => { const c = graph.nodes.get(nid); return { hasColumn: (c?.columns.length ?? 0) > 0, hasSupport: !!c?.support, supportType: c?.support }; });
        flOpts.push({ spans: spans.map(s => s ?? { length: 1, bottomBars: '?', topBars: '2 Ø10', hasCompSteel: false, stirrupSpacing: 0.2, stirrupDia: 8 }), nodes, labels: { splice: t('pro.lapSplice') }, axis: fl.axis });
        if (flOpts.length >= 3) break;
      }
      if (flOpts.length > 0) data.beamContinuityOpts = flOpts;

      // Column stack continuity (up to 3 for report)
      const csOpts: import('../../lib/engine/reinforcement-svg').ColumnStackElevationOpts[] = [];
      for (const fl of graph.frameLines) {
        if (fl.direction !== 'vertical' || fl.elementIds.length < 2) continue;
        const segData = fl.elementIds.map(eid => { const v = verifMap.get(eid); const len = elemLengths.get(eid); return v && len && v.column ? { v, len } : null; });
        if (segData.filter(Boolean).length < 2) continue;
        const firstValid = segData.find(Boolean)!;
        const segments = fl.elementIds.map((_, i) => {
          const sd = segData[i];
          if (!sd) return { height: 3, bars: '?', barCount: 4, barDia: 16, stirrupSpacing: 0.2, stirrupDia: 8 };
          return { height: sd.len, bars: sd.v.column?.bars ?? sd.v.flexure.bars, barCount: sd.v.column?.barCount ?? sd.v.flexure.barCount, barDia: sd.v.column?.barDia ?? sd.v.flexure.barDia, stirrupSpacing: sd.v.shear.spacing, stirrupDia: sd.v.shear.stirrupDia, detailing: sd.v.detailing };
        });
        const flNodes = fl.nodeIds.map(nid => { const c = graph.nodes.get(nid); return { hasBeam: (c?.beams.length ?? 0) > 0, hasSupport: !!c?.support, supportType: c?.support }; });
        csOpts.push({ segments, nodes: flNodes, sectionB: firstValid.v.b, sectionH: firstValid.v.h, cover: firstValid.v.cover, labels: { splice: t('pro.lapSplice') } });
        if (csOpts.length >= 3) break;
      }
      if (csOpts.length > 0) data.columnStackOpts = csOpts;

      // Slender column summary
      const slenderData = verificationsRef.filter(v => v.slender).map(v => ({
        elementId: v.elementId, k: v.slender!.k, lu: v.slender!.lu, r: v.slender!.r,
        klu_r: v.slender!.klu_r, lambda_lim: v.slender!.lambda_lim, isSlender: v.slender!.isSlender,
        delta_ns: v.slender!.delta_ns, Cm: v.slender!.Cm, Mc: v.slender!.Mc,
      }));
      if (slenderData.length > 0) data.slenderSummary = slenderData;

      // Bar marks
      const marks = computeBarMarks(verificationsRef, elemLengths);
      if (marks.length > 0) data.barMarks = marks.map(m => ({ mark: m.mark, diameter: m.diameter, shape: m.shape, cuttingLength: m.cuttingLength, count: m.count, totalLength: m.totalLength, weight: m.weight, overStock: m.overStock, stockLength: m.stockLength, needsStockSplice: m.needsStockSplice, nStockSplices: m.nStockSplices }));

      // Per-element per-combo forces for detailed report
      if (resultsStore.perCombo3D.size > 0 && modelStore.model.combinations.length > 0) {
        const cfMap = new Map<number, Array<{ comboId: number; comboName: string; Mu: number; Vu: number; Nu: number }>>();
        for (const combo of modelStore.model.combinations) {
          const comboResults = resultsStore.perCombo3D.get(combo.id);
          if (!comboResults) continue;
          for (const ef of comboResults.elementForces) {
            let arr = cfMap.get(ef.elementId);
            if (!arr) { arr = []; cfMap.set(ef.elementId, arr); }
            arr.push({
              comboId: combo.id,
              comboName: combo.name,
              Mu: Math.max(Math.abs(ef.mzStart), Math.abs(ef.mzEnd)),
              Vu: Math.max(Math.abs(ef.vyStart), Math.abs(ef.vyEnd)),
              Nu: Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd)),
            });
          }
        }
        if (cfMap.size > 0) data.comboForces = cfMap;
      }
    }

    if (verificationsRef.length > 0) {
      const elemLengths = new Map<number, number>();
      for (const v of verificationsRef) {
        const elem = modelStore.elements.get(v.elementId);
        if (elem) {
          const nI = modelStore.nodes.get(elem.nodeI);
          const nJ = modelStore.nodes.get(elem.nodeJ);
          if (nI && nJ) {
            const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = (nJ.z ?? 0) - (nI.z ?? 0);
            elemLengths.set(v.elementId, Math.sqrt(dx * dx + dy * dy + dz * dz));
          }
        }
      }
      data.quantities = estimateQuantitiesFromVerification(verificationsRef, elemLengths);
      data.elementLengths = elemLengths;
    }

    // Story drift for report
    const yTol = 0.05;
    const yLevels: number[] = [];
    for (const [, node] of modelStore.nodes) {
      if (!yLevels.some(lv => Math.abs(lv - node.y) < yTol)) yLevels.push(node.y);
    }
    yLevels.sort((a, b) => a - b);
    if (yLevels.length >= 2) {
      const drifts: NonNullable<ReportData['storyDrifts']> = [];
      const driftLimit = 0.015;
      for (let i = 1; i < yLevels.length; i++) {
        const level = yLevels[i], prevLevel = yLevels[i - 1];
        const storyH = level - prevLevel;
        if (storyH < 0.1) continue;
        let maxUxCur = 0, maxUzCur = 0, maxUxPrev = 0, maxUzPrev = 0;
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
        const deltaX = Math.abs(maxUxCur - maxUxPrev), deltaZ = Math.abs(maxUzCur - maxUzPrev);
        const ratioX = deltaX / storyH, ratioZ = deltaZ / storyH;
        const maxRatio = Math.max(ratioX, ratioZ);
        drifts.push({
          level, height: storyH, driftX: deltaX, driftZ: deltaZ, ratioX, ratioZ,
          status: maxRatio > driftLimit ? 'fail' : maxRatio > driftLimit * 0.8 ? 'warn' : 'ok',
        });
      }
      if (drifts.length > 0) data.storyDrifts = drifts;
    }

    openReport(data);
  }

  function getTabCount(id: ProTab): string {
    switch (id) {
      case 'nodes': return nodeCount > 0 ? String(nodeCount) : '';
      case 'elements': return elemCount > 0 ? String(elemCount) : '';
      case 'loads': return loadCount > 0 ? String(loadCount) : '';
      default: return '';
    }
  }

  function applyExamplePreset(preset: ExamplePreset = 'default') {
    // Only configure label/display preferences — grid and axes stay user-controlled
    uiStore.showLengths3D = false;
    uiStore.showNodeLabels3D = false;
    uiStore.showElementLabels3D = false;
  }

  async function loadProExample(ex: ProExample) {
    await ex.load();
    uiStore.includeSelfWeight = true;
    applyExamplePreset(ex.preset);
    tabManager.syncActiveTabName();
    resultsStore.clear();
    resultsStore.clear3D();
    showExampleMenu = false;
    setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 200);
    setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 600);
  }

  /* ── The phone's command grid ──────────────────────────────────────────
   *
   * A desktop shows PRO as a ribbon: a row of stages, and under it the groups
   * of whichever stage is open. That does not fit in 375 px — the ANALYSE stage
   * alone carries fifteen commands, and a touch row holds about nine.
   *
   * So on a phone the stage is chosen in the top bar and its commands are drawn
   * HERE, as a grid above the panel's content. The grid grows downward, which a
   * panel can afford and a row cannot: adding a sixteenth command to ANALYSE
   * makes this one cell longer and changes nothing else.
   *
   * Read from `lib/pro/stages.ts`, the same definition the desktop ribbon uses.
   */
  const proStages = $derived(buildProStages({
    solved: resultsStore.results3D != null || resultsStore.results != null,
    canSolve: hasModel && !solving,
    canReport: modelStore.nodes.size > 0,
    onSolve: handleSolve,
    onReport: handleOpenReportDialog,
  }));

  /*
   * Which stage the grid is showing. Follows the open tab rather than being a
   * separate selection — two sources of truth for "where am I" is how a ribbon
   * comes to show one stage while the panel shows another. Project belongs to
   * no stage, so the grid keeps showing the one you came from.
   */
  let lastProStage = $state('model');
  const mappedProStage = $derived(PRO_TAB_STAGE[uiStore.proActiveTab] ?? 'model');
  $effect(() => { if (mappedProStage) lastProStage = mappedProStage; });
  const gridStage = $derived(
    proStages.find((s) => s.id === (mappedProStage || lastProStage)) ?? proStages[0],
  );
  /*
   * BY GROUP, not flattened.
   *
   * Flat, ANALYSE was fifteen buttons in five rows with nothing saying where
   * one kind of thing ended and the next began — solve sat beside "no diagram"
   * beside a colour map beside the report. The stages already carry the
   * grouping the desktop ribbon draws as ruled sections; the phone draws it as
   * headings, which is the same information in the shape a column can hold.
   */
  const gridGroups = $derived(gridStage ? gridStage.groups : []);
  const gridCmds = $derived(gridGroups.flatMap((g) => g.cmds));

  /*
   * The grid folds away once it has been used.
   *
   * ANALYSE has fifteen commands, which is five rows — 256 px of a 300 px
   * sheet. Left permanently open it would push the tab's own content below the
   * fold on the stage where that content matters most. So picking a command
   * collapses it: the errand is over, and what you asked for is what you should
   * be looking at. The header re-opens it, and it re-opens itself when the
   * stage changes, because that IS the errand starting again.
   */
  let proGridOpen = $state(true);
  $effect(() => { gridStage; proGridOpen = true; });

  function runProCmd(c: ProCmd) {
    if (c.enabled && !c.enabled()) return;
    if (c.diagram) resultsStore.diagramType = c.diagram as never;
    if (c.tab) { tabError = null; uiStore.proActiveTab = c.tab as never; }
    if (c.action) c.action();
    proGridOpen = false;
  }

  /** Lit when this command is what the panel or the model is showing. */
  function proCmdActive(c: ProCmd): boolean {
    if (c.tab) return uiStore.proActiveTab === c.tab;
    if (c.diagram) {
      const shown = resultsStore.diagramType === 'axialColor' ? 'axial' : resultsStore.diagramType;
      return shown === c.diagram;
    }
    return false;
  }

  /** What the panel calls each destination. */
  const TAB_TITLE: Record<string, string> = {
    project: 'ribbon.project', nodes: 'pro.tabNodes', elements: 'pro.tabElements',
    shells: 'pro.tabShells', materials: 'pro.tabMaterials', sections: 'pro.tabSections',
    supports: 'pro.tabSupports', constraints: 'pro.tabConstraints', loads: 'pro.tabLoads',
    advanced: 'ribbon.advanced', results: 'ribbon.results', design: 'pro.tabDesign',
    connections: 'pro.tabConnections', diagnostics: 'pro.tabDiagnostics',
  };
</script>

<svelte:window onresize={updateExampleMenuPosition} onscroll={updateExampleMenuPosition} />

<div class="pro-panel">
  {#if uiStore.isMobile}
    <!-- Mobile-only PRO navigation and actions (tools moved to upper toolbar in App.svelte) -->
    <div class="pro-mobile-nav">
      <!--
        Open, Save and Examples belong to the DOCUMENT, so they show where the
        document is: the Project tab. They used to sit above every tab, which
        put three file buttons over the nodes table, over the diagnostics, over
        the RC design — a permanent header for an errand you run twice a
        session.
      -->
      {#if uiStore.proActiveTab === 'project'}
      <div class="pro-mobile-actions">
        <!--
          Same controls as the desktop PRO bar, which this row replaces on mobile. `shortcuts`
          stays off here: the two bars are mutually exclusive, and only the desktop one binds
          Ctrl+S / Ctrl+O.
        -->
        <ProProjectFileActions variant="mobile" />
        <button class="pm-action pm-example" onclick={toggleExampleMenu}>{t('pro.exampleBtn')}</button>
      </div>
      {/if}
      <!--
        Solve and Report used to sit in that row too. They are commands of the
        ANALYSE stage and appear in the grid below, and Solve is also in the top
        bar — three copies of one button, which is three places to look when it
        is greyed and you want to know why.
      -->
      <!--
        The stage's commands, as a grid.
        ───────────────────────────────
        This replaces a native `<select>` that listed all thirteen panel tabs in
        one flat drop-down. The select was honest and it scaled, but it hid every
        destination behind a tap and told the reader nothing about the shape of
        the application — which stage they were in, what else was in it, or that
        stages existed at all. It also could not offer the eight diagrams or the
        two colour maps, because those are not tabs, so on a phone they were
        unreachable.

        A grid says all of it at once and still grows: a sixteenth command in
        ANALYSE is one more cell, and nothing above or below has to move.
      -->
      <button
        class="pm-grid-head"
        class:open={proGridOpen}
        onclick={() => proGridOpen = !proGridOpen}
        aria-expanded={proGridOpen}
        data-testid="pm-grid-toggle"
      >
        <span>{gridStage ? t(gridStage.labelKey) : ''}</span>
        <span class="pm-grid-count">{gridCmds.length}</span>
      </button>
      {#if proGridOpen}
      <div class="pm-groups" data-stage={gridStage?.id} data-testid="pm-grid">
        {#each gridGroups as g (g.id)}
          <section class="pm-group">
            <h4 class="pm-group-title">{t(g.labelKey)}</h4>
            <div class="pm-grid">
              {#each g.cmds as c (c.id)}
                {@const on = !c.enabled || c.enabled()}
                <button
                  class="pm-cell"
                  class:active={proCmdActive(c)}
                  disabled={!on}
                  data-testid="pm-cmd-{c.id}"
                  onclick={() => runProCmd(c)}
                  title={c.label ? `${t(c.labelKey)} (${c.label})` : t(c.labelKey)}
                >
                  <!--
                    The icon is always drawn, and the SHORT name goes under it.
                    Before, a diagram cell showed its symbol where the icon goes
                    and the full name underneath — "Momento flector respecto a
                    y" ellipsised to "Momento flector respect…" in a 116 px
                    cell, which is a truncation pretending to be a label. The
                    symbol IS the short name for those; the full one is in the
                    tooltip, exactly as the desktop ribbon does it.
                  -->
                  <span class="pm-cell-icon">
                    <Icon name={c.icon ?? 'data'} size={20} rotate={c.rotate ?? 0} />
                  </span>
                  <span class="pm-cell-label" class:symbol={!!c.label}>{c.label ?? t(c.labelKey)}</span>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </div>
      {/if}
    </div>
  {/if}

  {#if solveError}
    <div class="pro-solve-error">{solveError}</div>
  {/if}

  <!--
    The panel says what it is showing, as Basic's does.
    ──────────────────────────────────────────────────
    It opened straight into content, so the ✕ floated with nothing beside it
    and the one thing the panel could not tell you was which of thirteen
    destinations you were looking at.

    The model-error count rides here rather than as a banner. It used to be a
    full-width amber strip pinned above every tab, permanently, on the panel
    that has the least room to spare — it was the first thing you saw on
    opening PRO and it stayed there through every unrelated task. It is a
    STATE, not an announcement: a count beside the heading, in the same place
    whatever tab is open, and still a click away from the diagnostics that
    explain it.
  -->
  <header class="pro-head">
    <span class="pro-head-title" data-testid="pro-panel-title">{t(TAB_TITLE[activeTab] ?? 'pro.tabNodes')}</span>
    <!--
      The model-diagnostics chip is NOT here any more.

      It used to render on every tab, driven by `modelErrorCount > 0`, and `checkModel` returns
      three errors for an empty model — so an untouched PRO opened with a yellow "⚠ 3" over the
      right panel before the user had done anything. It now lives at the right of the Design
      command row, where the commands it blocks are, and only once it has something to say:
      `lib/store/diagnostics-warning.svelte.ts` holds the rule and the dismissal policy.

      Global visibility is not lost. The ribbon's MODEL badge still carries the count, under the
      same arming rule, so the fact is reachable from any tab without interrupting from all of
      them. `modelErrorCount` stays exported for the ribbon and for the pre-solve gate — the
      gate reads `checkModel` directly and is not affected by anything the user hides.
    -->
  </header>

  <!-- Tab content -->
  <div class="pro-content">
    {#if tabError}
      <div class="pro-tab-error">
        <p>{t('pro.errorInTab').replace('{tab}', activeTab)}</p>
        <pre>{tabError}</pre>
        <button onclick={() => { tabError = null; uiStore.proActiveTab = 'nodes'; }}>{t('pro.backToNodes')}</button>
      </div>
    {:else}
      <svelte:boundary onerror={(e) => { tabError = String(e); console.error('ProPanel tab error:', e); }}>
        {#if activeTab === 'project'}
          <ProProjectTab groups={proExampleGroups} onLoadExample={loadProExample} />
        {:else if activeTab === 'nodes'}
          <ProNodesTab />
        {:else if activeTab === 'elements'}
          <ProElementsTab />
        {:else if activeTab === 'shells'}
          <ProShellTab />
        {:else if activeTab === 'materials'}
          <ProMaterialsTab />
        {:else if activeTab === 'sections'}
          <ProSectionsTab />
        {:else if activeTab === 'supports'}
          <ProSupportsTab />
        {:else if activeTab === 'constraints'}
          <ProConstraintsTab />
        {:else if activeTab === 'loads'}
          <ProLoadsTab />
        {:else if activeTab === 'advanced'}
          <ProAdvancedTab bind:advancedResults={advancedResultsRef} />
        {:else if activeTab === 'results'}
          <ProResultsTab />
        {:else if activeTab === 'design'}
          <ProRcWorkflowTab />
        {:else if activeTab === 'connections'}
          <ProConnectionsTab />
        {:else if activeTab === 'diagnostics'}
          <ProDiagnosticsTab />
        {/if}
      </svelte:boundary>
    {/if}
  </div>
</div>

{#if showExampleMenu}
  <div class="pro-example-backdrop" onclick={() => showExampleMenu = false}></div>
  <div class="pro-example-menu" style={exampleMenuStyle}>
    <div class="pro-example-menu-head">
      <div class="pro-example-menu-title">{t('pro.exampleTitle')}</div>
      <div class="pro-example-menu-subtitle">{t('pro.examples.subtitle')}</div>
    </div>
    {#each proExampleGroups as group}
      <section class="pro-example-group">
        <div class="pro-example-group-title">{group.title}</div>
        <div class="pro-example-grid">
          {#each group.examples as ex}
            <button class="pro-example-item" class:pro-example-featured={ex.featured} onclick={() => loadProExample(ex)}>
              <div class="pro-example-topline">
                <span class="pro-example-name">{t(ex.nameKey)}</span>
                <span class="pro-example-purpose">{t(ex.purposeKey)}</span>
              </div>
              <span class="pro-example-desc">{t(ex.descKey)}</span>
              <div class="pro-example-tags">
                {#each ex.tags as tag}
                  <span class="pro-example-tag">{t(tag)}</span>
                {/each}
              </div>
              <div class="pro-example-stats">
                <span>{ex.stats.nodes} {t('pro.stats.nodes')}</span>
                <span>{ex.stats.members} {t('pro.stats.members')}</span>
                {#if ex.stats.shells}
                  <span>{ex.stats.shells} {t('pro.stats.shells')}</span>
                {/if}
                {#if Number(ex.stats.nodes) >= 1000}
                  <span class="pro-example-heavy">{t('pro.stats.heavy')}</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}

<ProReportDialog
  open={showReportDialog}
  hasResults={!!resultsStore.results3D}
  hasVerifications={verificationsRef.length > 0}
  hasAdvanced={Object.keys(advancedResultsRef).length > 0}
  hasDrift={false}
  hasDiagnostics={resultsStore.diagnostics3D.length > 0}
  hasQuantities={verificationsRef.length > 0}
  ongenerate={exportReport}
  onclose={() => { showReportDialog = false; }}
/>

<style>
  .pro-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 2rem 0.45rem 0.7rem;
    border-bottom: 1px solid var(--st-hair);
    flex: none;
  }

  .pro-head-title {
    font-family: var(--st-mono);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  /* `.pro-head-errors` lived here. Its markup moved to the Design command row — see the note
     in the header above — and the rule went with it rather than being left behind unreachable,
     the way `.autosave-banner` was in App.svelte for a whole release. */

  /* ─── Mobile PRO navigation ─── */
  .pro-mobile-nav {
    padding: 8px 10px;
    border-bottom: 1px solid var(--st-surface-3);
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
    background: var(--st-surface);
  }
  .pm-tools-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .pm-tool {
    padding: 6px 10px;
    font-size: 0.78rem;
    color: var(--st-text-2);
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 5px;
    cursor: pointer;
  }
  .pm-tool:hover { color: var(--st-text); }
  .pm-tool.active { color: var(--st-text); background: var(--st-accent); border-color: var(--st-danger); }
  .pm-tool.pm-undo {
    padding: 6px 8px;
    font-size: 0.85rem;
    min-width: 36px;
    text-align: center;
  }
  .pm-tool.pm-undo:disabled { opacity: 0.25; cursor: not-allowed; }
  .pm-select-modes {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }
  .pm-sel {
    padding: 4px 8px;
    font-size: 0.68rem;
    color: var(--st-text-2);
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    cursor: pointer;
  }
  .pm-sel:hover { color: var(--st-text); }
  .pm-sel.active { color: var(--st-text); background: var(--st-accent); border-color: var(--st-danger); }
  .pro-mobile-actions {
    display: flex;
    gap: 4px;
  }
  .pm-action {
    flex: 1;
    padding: 8px 4px;
    font-size: 0.72rem;
    font-weight: 600;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--st-text);
  }
  .pm-action:disabled { opacity: 0.35; }
  .pm-example { background: linear-gradient(135deg, var(--st-warn), var(--st-warn)); }
  .pm-solve { background: linear-gradient(135deg, var(--st-value), var(--st-value)); }
  .pm-report { background: linear-gradient(135deg, var(--st-accent), var(--st-accent)); }
  /* ── The phone's stage grid ─────────────────────────────────────────
     Three columns, because at 375 px that is a 113 px cell — wide enough for
     "Diagnósticos" at a readable size and tall enough to be a 48 px target.
     It wraps downward without limit, which is the property the row it replaced
     did not have and the reason this is a grid at all.
     ──────────────────────────────────────────────────────────────── */
  .pm-grid-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 44px;
    padding: 0 10px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-family: var(--st-mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    margin-bottom: 4px;
  }
  .pm-grid-count {
    font-size: 0.62rem;
    color: var(--st-text-3);
  }
  .pm-grid-head.open .pm-grid-count::after { content: ' ▾'; }
  .pm-grid-head:not(.open) .pm-grid-count::after { content: ' ▸'; }

  /*
     One column of groups, each a grid of three. The heading is what turns
     fifteen buttons into four things to choose between — the same job the
     vertical rules do between the desktop ribbon's groups.
  */
  .pm-groups {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pm-group-title {
    margin: 0 0 3px;
    font-family: var(--st-mono);
    font-size: 0.58rem;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  .pm-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }

  .pm-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 48px;
    padding: 4px 2px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    cursor: pointer;
    overflow: hidden;
  }

  .pm-cell-icon { display: flex; color: var(--st-text); line-height: 1; }

  /* N, My, Vz are notation, so the label takes the mono face when it is one. */
  .pm-cell-label.symbol {
    font-family: var(--st-mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .pm-cell-label {
    font-size: 0.56rem;
    line-height: 1.15;
    text-align: center;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pm-cell.active {
    background: var(--st-selected-bg);
    border-color: var(--st-accent);
    color: var(--st-text);
  }
  .pm-cell.active .pm-cell-icon { color: var(--st-accent); }

  /* Greyed, never removed — the same rule the ribbon follows. */
  .pm-cell:disabled { opacity: 0.34; cursor: default; }


  .pro-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--st-surface-3);
    color: var(--st-text);
    overflow: visible;
  }

  /* ─── Action bar ─── */
  .pro-actions {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-surface-3);
    flex-shrink: 0;
    justify-content: flex-end;
    position: relative;
    overflow: visible;
    z-index: 2;
  }

  .pro-example-wrap {
    position: relative;
    overflow: visible;
  }

  .pro-example-btn {
    padding: 5px 12px;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--st-warn);
    background: transparent;
    border: 1px solid #f0a50044;
    border-radius: 4px;
    cursor: pointer;
  }
  .pro-example-btn:hover { background: #f0a50018; }

  .pro-example-backdrop {
    position: fixed;
    inset: 0;
    z-index: 219;
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .pro-example-menu {
    position: fixed;
    overflow-y: auto;
    background: linear-gradient(180deg, var(--st-surface-3) 0%, var(--st-surface-3) 100%);
    border: 1px solid var(--st-info);
    border-radius: 10px;
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.42);
    padding: 8px;
    z-index: 220;
  }

  .pro-example-menu-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px 10px;
    border-bottom: 1px solid var(--st-hair-strong);
    margin-bottom: 8px;
  }

  .pro-example-menu-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--st-text);
  }

  .pro-example-menu-subtitle {
    font-size: 0.66rem;
    color: var(--st-info);
    letter-spacing: 0.02em;
  }

  .pro-example-group {
    padding: 0 6px 10px;
  }

  .pro-example-group + .pro-example-group {
    border-top: 1px solid var(--st-hair-strong);
    padding-top: 10px;
  }

  .pro-example-group-title {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--st-info);
    padding: 0 2px 8px;
  }

  .pro-example-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .pro-example-item {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 10px 11px;
    background: rgba(18, 42, 74, 0.72);
    border: 1px solid var(--st-hair-strong);
    border-radius: 8px;
    color: var(--st-text);
    cursor: pointer;
    text-align: left;
    min-height: 124px;
    transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
  }

  .pro-example-item:hover {
    background: var(--st-surface-3);
    border-color: var(--st-info);
    transform: translateY(-1px);
  }

  .pro-example-topline {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pro-example-name {
    font-size: 0.77rem;
    font-weight: 700;
    color: var(--st-text);
    overflow-wrap: break-word;
    word-break: break-word;
  }

  .pro-example-purpose {
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--st-warn);
  }

  .pro-example-desc {
    font-size: 0.66rem;
    color: var(--st-info);
    line-height: 1.3;
    overflow-wrap: break-word;
    word-break: break-word;
  }

  .pro-example-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .pro-example-tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(217, 164, 65, 0.12);
    border: 1px solid rgba(217, 164, 65, 0.18);
    color: var(--st-warn);
    font-size: 0.56rem;
    font-weight: 600;
    letter-spacing: 0.03em;
  }

  .pro-example-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: auto;
    font-size: 0.58rem;
    color: var(--st-info);
  }

  .pro-example-heavy {
    color: var(--st-warn);
    font-style: italic;
  }

  .pro-example-featured {
    border-color: #f0a50044;
  }
  .pro-example-featured:hover {
    border-color: #f0a500aa;
  }

  .pro-solve-btn {
    padding: 5px 18px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--st-text);
    background: linear-gradient(135deg, var(--st-value), var(--st-value));
    border: 1px solid var(--st-value);
    border-radius: 4px;
    cursor: pointer;
  }
  .pro-solve-btn:hover { background: linear-gradient(135deg, var(--st-value), var(--st-value)); }
  .pro-solve-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .pro-report-btn {
    padding: 5px 16px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--st-text);
    background: linear-gradient(135deg, var(--st-accent), var(--st-accent));
    border: 1px solid var(--st-accent);
    border-radius: 4px;
    cursor: pointer;
  }
  .pro-report-btn:hover { background: linear-gradient(135deg, var(--st-danger), var(--st-accent)); }
  .pro-report-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  @media (max-width: 720px) {
    .pro-example-menu {
      width: min(420px, calc(100vw - 16px));
    }
    .pro-example-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .pro-solve-error {
    padding: 4px 10px;
    font-size: 0.7rem;
    color: var(--st-danger);
    background: rgba(229, 72, 42, 0.1);
    border-bottom: 1px solid var(--st-surface-3);
  }

  /*
     `.pro-quality-gate` lived here: PR19's full-width amber banner across the top of the panel,
     the one that "took the whole height of the panel to say one sentence". PR125 replaced it
     with the header chip, the merge kept PR125's markup, and these six rules were left behind
     with nothing to style — six `css_unused_selector` warnings on every build.

     Both are now gone. The same fact is carried by the chip at the right of the Design command
     row, which is one line tall and next to the commands it blocks.
  */

  /* ─── Content area ─── */
  .pro-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }

  .pro-tab-error {
    padding: 16px;
    color: var(--st-danger);
    font-size: 0.8rem;
  }
  .pro-tab-error pre {
    background: var(--st-bg);
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.7rem;
    margin: 8px 0;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .pro-tab-error button {
    padding: 6px 14px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    color: var(--st-text-2);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.72rem;
  }
</style>
