<script lang="ts">
  import { t } from '../../lib/i18n';
  import { modelStore, resultsStore, uiStore, verificationStore } from '../../lib/store';
  import { openReport } from '../../lib/engine/pro-report';
  import type { ReportData, ReportConfig } from '../../lib/engine/pro-report';
  import { verifyElement, classifyElement, computeJointPsiFromModel } from '../../lib/engine/codes/argentina/cirsoc201';
  import type { ElementVerification, VerificationInput } from '../../lib/engine/codes/argentina/cirsoc201';
  import { computeQuantities } from '../../lib/engine/quantity-takeoff';
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
  import type { SolverDiagnostic } from '../../lib/engine/types';
  import { checkModel } from '../../lib/engine/model-diagnostics';

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

  let activeTab = $state<ProTab>('nodes');
  let verificationsRef = $state<ElementVerification[]>([]);
  let advancedResultsRef = $state<Record<string, any>>({});
  let tabError = $state<string | null>(null);
  let showReportDialog = $state(false);
  let solving = $state(false);
  let solveError = $state<string | null>(null);
  const hasModel = $derived(modelStore.nodes.size > 0 && modelStore.elements.size > 0);

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
      activeTab = 'results';
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

  /** Auto-run CIRSOC verification on current results */
  function autoVerify(): ElementVerification[] {
    const results = resultsStore.results3D;
    if (!results) return [];
    const verifs: ElementVerification[] = [];
    const rebarFy = 420, cover = 0.025, stirrupDia = 8;

    for (const ef of results.elementForces) {
      const elem = modelStore.elements.get(ef.elementId);
      if (!elem) continue;
      const nodeI = modelStore.nodes.get(elem.nodeI);
      const nodeJ = modelStore.nodes.get(elem.nodeJ);
      if (!nodeI || !nodeJ) continue;
      const section = modelStore.sections.get(elem.sectionId);
      const material = modelStore.materials.get(elem.materialId);
      if (!section || !material) continue;
      if (!section.b || !section.h) continue;
      const fc = material.fy;
      if (!fc || fc > 80) continue;

      const dx = nodeJ.x - nodeI.x, dy = nodeJ.y - nodeI.y, dz = (nodeJ.z ?? 0) - (nodeI.z ?? 0);
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const elemType = classifyElement(nodeI.x, nodeI.y, nodeI.z ?? 0, nodeJ.x, nodeJ.y, nodeJ.z ?? 0, section.b, section.h);
      const MuMax = Math.max(Math.abs(ef.mzStart), Math.abs(ef.mzEnd));
      const VuMax = Math.max(Math.abs(ef.vyStart), Math.abs(ef.vyEnd));
      const NuMax = Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd));
      const MuyMax = Math.max(Math.abs(ef.myStart), Math.abs(ef.myEnd));
      const VzMax = Math.max(Math.abs(ef.vzStart), Math.abs(ef.vzEnd));
      const TuMax = Math.max(Math.abs(ef.mxStart), Math.abs(ef.mxEnd));
      const isVertical = elemType === 'column' || elemType === 'wall';

      let M1: number | undefined, M2: number | undefined;
      if (isVertical) {
        if (Math.abs(ef.mzStart) >= Math.abs(ef.mzEnd)) {
          M2 = Math.abs(ef.mzStart);
          M1 = Math.sign(ef.mzStart) === Math.sign(ef.mzEnd) ? Math.abs(ef.mzEnd) : -Math.abs(ef.mzEnd);
        } else {
          M2 = Math.abs(ef.mzEnd);
          M1 = Math.sign(ef.mzStart) === Math.sign(ef.mzEnd) ? Math.abs(ef.mzStart) : -Math.abs(ef.mzStart);
        }
      }

      let psiA: number | undefined, psiB: number | undefined;
      if (isVertical) {
        const psi = computeJointPsiFromModel(
          ef.elementId,
          modelStore.nodes as any, modelStore.elements as any,
          modelStore.sections as any, modelStore.materials as any,
          modelStore.supports as any,
        );
        psiA = psi.psiA;
        psiB = psi.psiB;
      }

      const input: VerificationInput = {
        elementId: ef.elementId, elementType: elemType,
        Mu: MuMax, Vu: VuMax, Nu: NuMax,
        b: section.b, h: section.h, fc, fy: rebarFy, cover, stirrupDia,
        Muy: isVertical ? MuyMax : undefined,
        Vz: VzMax > 0.01 ? VzMax : undefined,
        Tu: TuMax > 0.001 ? TuMax : undefined,
        Lu: isVertical ? L : undefined, M1, M2, psiA, psiB,
      };
      verifs.push(verifyElement(input));
    }
    return verifs;
  }

  /** Serialize loads for the report */
  function serializeLoads(): ReportData['loads'] {
    const loads: NonNullable<ReportData['loads']> = [];
    for (const load of modelStore.model.loads) {
      let tipo = '', destino = '', valores = '';
      switch (load.type) {
        case 'nodal': { const d = load.data; tipo = t('file.loadNodal'); destino = `Nodo ${d.nodeId}`; valores = `Fx=${d.fx} kN, Fy=${d.fy} kN, Mz=${d.mz} kN·m`; break; }
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
      advancedResults: Object.keys(advancedResultsRef).length > 0 ? advancedResultsRef : undefined,
      diagnostics: resultsStore.diagnostics3D.length > 0 ? resultsStore.diagnostics3D : undefined,
      screenshot,
      t,
      config,
    };

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
</script>

<div class="pro-panel">
  <!-- Action bar -->
  <div class="pro-actions">
    <button class="pro-example-btn" onclick={() => { modelStore.loadExample('pro-edificio-7p'); uiStore.includeSelfWeight = true; uiStore.showGrid3D = false; uiStore.showAxes3D = false; setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 100); }} title={t('pro.exampleTitle')}>
      {t('pro.exampleBtn')}
    </button>
    <button class="pro-solve-btn" onclick={handleSolve} disabled={!hasModel || solving}>
      {solving ? t('pro.solving') : t('pro.solve')}
    </button>
    <button class="pro-report-btn" onclick={handleOpenReportDialog} disabled={modelStore.nodes.size === 0} title={t('pro.reportTitle')}>
      {t('pro.reportBtn')}
    </button>
  </div>
  {#if solveError}
    <div class="pro-solve-error">{solveError}</div>
  {/if}

  <!-- Grouped tab navigation -->
  <nav class="pro-nav">
    {#each tabGroups as group}
      <div class="tab-group">
        <span class="tab-group-label">{group.label}</span>
        <div class="tab-group-buttons">
          {#each group.tabs as tab}
            <button
              class="pro-tab"
              class:active={activeTab === tab.id}
              onclick={() => { tabError = null; activeTab = tab.id; }}
            >
              {tab.label}
              {#if tab.id === 'diagnostics' && diagCount > 0}
                <span class="badge badge-error">{diagCount}</span>
              {:else}
                {@const count = getTabCount(tab.id)}
                {#if count}
                  <span class="badge badge-count">{count}</span>
                {/if}
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </nav>

  <!-- Tab content -->
  <div class="pro-content">
    <svelte:boundary onerror={(e) => { tabError = String(e); console.error('ProPanel tab error:', e); }}>
      {#if tabError}
        <div class="pro-tab-error">
          <p>{t('pro.errorInTab').replace('{tab}', activeTab)}</p>
          <pre>{tabError}</pre>
          <button onclick={() => { tabError = null; activeTab = 'nodes'; }}>{t('pro.backToNodes')}</button>
        </div>
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
      {:else if activeTab === 'verification'}
        <ProVerificationTab bind:verifications={verificationsRef} />
      {:else if activeTab === 'connections'}
        <ProConnectionsTab />
      {:else if activeTab === 'diagnostics'}
        <ProDiagnosticsTab />
      {/if}
    </svelte:boundary>
  </div>
</div>

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
  .pro-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #16213e;
    color: #ddd;
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

  .pro-solve-error {
    padding: 4px 10px;
    font-size: 0.7rem;
    color: #ff8a9e;
    background: rgba(233, 69, 96, 0.1);
    border-bottom: 1px solid #1a3a5a;
  }

  /* ─── Grouped tab navigation ─── */
  .pro-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    padding: 4px 4px 0;
    background: #0a1a30;
    border-bottom: 1px solid #1a4a7a;
    flex-shrink: 0;
  }

  .tab-group {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 2px 3px;
    min-width: 0;
  }

  .tab-group-label {
    font-size: 0.5rem;
    font-weight: 600;
    color: #556;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 3px 0 1px;
    white-space: nowrap;
    writing-mode: horizontal-tb;
  }

  .tab-group-buttons {
    display: flex;
    gap: 1px;
  }

  .pro-tab {
    padding: 4px 7px;
    font-size: 0.7rem;
    font-weight: 500;
    color: #778;
    background: #0f2840;
    border: none;
    border-radius: 3px 3px 0 0;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    position: relative;
  }

  .pro-tab:hover {
    color: #ccc;
    background: #1a3860;
  }

  .pro-tab.active {
    color: #fff;
    background: #16213e;
    border-bottom: 2px solid #e94560;
  }

  .badge {
    display: inline-block;
    margin-left: 3px;
    padding: 0 4px;
    font-size: 0.55rem;
    font-weight: 700;
    border-radius: 6px;
    min-width: 12px;
    text-align: center;
    line-height: 13px;
    vertical-align: middle;
  }

  .badge-error {
    background: #e94560;
    color: #fff;
  }

  .badge-count {
    background: #1a4a7a;
    color: #8ab;
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
