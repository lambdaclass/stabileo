<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import { modelStore, resultsStore, uiStore, verificationStore, tabManager } from '../../lib/store';
  import { openReport } from '../../lib/engine/pro-report';
  import type { ReportData, ReportConfig } from '../../lib/engine/pro-report';
  import type { ElementVerification } from '../../lib/engine/codes/argentina/cirsoc201';
  import { autoVerifyFromResults } from '../../lib/engine/auto-verify';
  import { computeQuantities } from '../../lib/engine/quantity-takeoff';
  import { checkCrackWidth, checkDeflection } from '../../lib/engine/codes/argentina/serviceability';
  import { classifyElement } from '../../lib/engine/codes/argentina/cirsoc201';
  import { computeBarMarks } from '../../lib/engine/bar-marks';
  import { buildStructuralGraph } from '../../lib/engine/structural-graph';
  import type { FrameLineElevationOpts } from '../../lib/engine/reinforcement-svg';
  import { runGlobalSolve } from '../../lib/engine/live-calc';
  import ProReportDialog from './ProReportDialog.svelte';
  import ProNodesTab from './ProNodesTab.svelte';
  import ProElementsTab from './ProElementsTab.svelte';
  import ProMaterialsTab from './ProMaterialsTab.svelte';
  import ProSectionsTab from './ProSectionsTab.svelte';
  import ProSupportsTab from './ProSupportsTab.svelte';
  import ProLoadsTab from './ProLoadsTab.svelte';
  import ProResultsTab from './ProResultsTab.svelte';
  import ProVerificationTab from './ProVerificationTab.svelte';
  import ProShellTab from './ProShellTab.svelte';
  import ProConstraintsTab from './ProConstraintsTab.svelte';
  import ProAdvancedTab from './ProAdvancedTab.svelte';
  import ProDiagnosticsTab from './ProDiagnosticsTab.svelte';
  import ProConnectionsTab from './ProConnectionsTab.svelte';
  import { checkModel } from '../../lib/engine/model-diagnostics';
  import { get2DDisplayNodalLoadMoment, get2DDisplayNodalLoadVertical } from '../../lib/geometry/coordinate-system';

  type ProTab = 'nodes' | 'elements' | 'shells' | 'materials' | 'sections' | 'supports' | 'constraints' | 'loads' | 'advanced' | 'results' | 'verification' | 'connections' | 'diagnostics';

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
        { id: 'verification' as ProTab, label: t('pro.tabVerification') },
        { id: 'connections' as ProTab, label: t('pro.tabConnections') },
        { id: 'diagnostics' as ProTab, label: t('pro.tabDiagnostics') },
      ],
    },
  ]);

  // activeTab is shared via uiStore.proActiveTab so App.svelte can render the nav strip
  const activeTab = $derived(uiStore.proActiveTab as ProTab);
  let verificationsRef = $state<ElementVerification[]>([]);
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

  type ExampleGroup = 'buildings' | 'industrial' | 'foundations' | 'longspan' | 'xl';
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
    const order: ExampleGroup[] = ['buildings', 'industrial', 'foundations', 'longspan', 'xl'];
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
    if (!showExampleMenu || !exampleButtonEl || typeof window === 'undefined') return;
    const rect = exampleButtonEl.getBoundingClientRect();
    const width = Math.min(720, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    const top = Math.min(rect.bottom + 6, window.innerHeight - 120);
    const maxHeight = Math.max(260, Math.min(560, window.innerHeight - top - 16));
    exampleMenuStyle = `left:${left}px;top:${top}px;width:${width}px;max-height:${maxHeight}px;`;
  }

  async function handleSolve() {
    solveError = null;
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

  /** Auto-run CIRSOC verification on current results (delegates to extracted utility) */
  function autoVerify(): ElementVerification[] {
    const results = resultsStore.results3D;
    if (!results) return [];
    const { concrete } = autoVerifyFromResults(
      results,
      { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports },
      resultsStore.governing3D.size > 0 ? resultsStore.governing3D : null,
    );
    return concrete;
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

    // Auto-verify CIRSOC if not already done
    if (verificationsRef.length === 0) {
      verificationsRef = autoVerify();
      verificationStore.setConcrete(verificationsRef);
    }

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
      data.quantities = computeQuantities(verificationsRef, elemLengths);
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
</script>

<svelte:window onresize={updateExampleMenuPosition} onscroll={updateExampleMenuPosition} />

<div class="pro-panel">
  {#if uiStore.isMobile}
    <!-- Mobile-only PRO navigation and actions -->
    <div class="pro-mobile-nav">
      <div class="pro-mobile-actions">
        <button class="pm-action pm-example" onclick={toggleExampleMenu}>{t('pro.exampleBtn')}</button>
        <button class="pm-action pm-solve" onclick={handleSolve} disabled={!hasModel || solving}>{solving ? t('pro.solving') : t('pro.solve')}</button>
        <button class="pm-action pm-report" onclick={handleOpenReportDialog} disabled={modelStore.nodes.size === 0}>{t('pro.reportBtn')}</button>
      </div>
      <select class="pm-tab-select" value={activeTab} onchange={(e) => { tabError = null; uiStore.proActiveTab = e.currentTarget.value; }}>
        {#each tabGroups as group}
          <optgroup label={group.label}>
            {#each group.tabs as tab}
              <option value={tab.id}>{tab.label}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
    </div>
  {/if}

  {#if solveError}
    <div class="pro-solve-error">{solveError}</div>
  {/if}

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
        {#if activeTab === 'nodes'}
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
        {:else if activeTab === 'verification'}
          <ProVerificationTab bind:verifications={verificationsRef} />
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
  /* ─── Mobile PRO navigation ─── */
  .pro-mobile-nav {
    padding: 8px 10px;
    border-bottom: 1px solid #1a4a7a;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
    background: #0a1a30;
  }
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
    color: #fff;
  }
  .pm-action:disabled { opacity: 0.35; }
  .pm-example { background: linear-gradient(135deg, #f0a500, #d99200); }
  .pm-solve { background: linear-gradient(135deg, #4ecdc4, #3ab8b0); }
  .pm-report { background: linear-gradient(135deg, #e94560, #c73e54); }
  .pm-tab-select {
    width: 100%;
    padding: 8px 10px;
    background: #0f2840;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #ddd;
    font-size: 0.82rem;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
  }
  .pm-tab-select:focus { border-color: #4ecdc4; outline: none; }

  .pro-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #16213e;
    color: #ddd;
    overflow: visible;
  }

  /* ─── Action bar ─── */
  .pro-actions {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    background: #0d1b33;
    border-bottom: 1px solid #1a3a5a;
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
    color: #f0a500;
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
    background: linear-gradient(180deg, #162746 0%, #122038 100%);
    border: 1px solid #31507c;
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
    border-bottom: 1px solid #29456d;
    margin-bottom: 8px;
  }

  .pro-example-menu-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: #f3f6ff;
  }

  .pro-example-menu-subtitle {
    font-size: 0.66rem;
    color: #8ea3c8;
    letter-spacing: 0.02em;
  }

  .pro-example-group {
    padding: 0 6px 10px;
  }

  .pro-example-group + .pro-example-group {
    border-top: 1px solid #223b60;
    padding-top: 10px;
  }

  .pro-example-group-title {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7891b9;
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
    border: 1px solid #29456d;
    border-radius: 8px;
    color: #dbe5ff;
    cursor: pointer;
    text-align: left;
    min-height: 124px;
    transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
  }

  .pro-example-item:hover {
    background: #153158;
    border-color: #4f79b2;
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
    color: #f7f9ff;
  }

  .pro-example-purpose {
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #f0a500;
  }

  .pro-example-desc {
    font-size: 0.66rem;
    color: #90a4c6;
    line-height: 1.3;
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
    background: rgba(240, 165, 0, 0.12);
    border: 1px solid rgba(240, 165, 0, 0.18);
    color: #ffd27a;
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
    color: #7f97bc;
  }

  .pro-example-heavy {
    color: #a08050;
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
    color: #fff;
    background: linear-gradient(135deg, #4ecdc4, #36b5ad);
    border: 1px solid #4ecdc4;
    border-radius: 4px;
    cursor: pointer;
  }
  .pro-solve-btn:hover { background: linear-gradient(135deg, #5fe0d7, #4ecdc4); }
  .pro-solve-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .pro-report-btn {
    padding: 5px 16px;
    font-size: 0.72rem;
    font-weight: 600;
    color: #fff;
    background: linear-gradient(135deg, #e94560, #c73e54);
    border: 1px solid #e94560;
    border-radius: 4px;
    cursor: pointer;
  }
  .pro-report-btn:hover { background: linear-gradient(135deg, #ff5a75, #e94560); }
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
    color: #ff8a9e;
    background: rgba(233, 69, 96, 0.1);
    border-bottom: 1px solid #1a3a5a;
  }

  /* ─── Content area ─── */
  .pro-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }

  .pro-tab-error {
    padding: 16px;
    color: #ff6b6b;
    font-size: 0.8rem;
  }
  .pro-tab-error pre {
    background: #1a0a0a;
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
    background: #0f3460;
    border: 1px solid #1a4a7a;
    color: #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.72rem;
  }
</style>
