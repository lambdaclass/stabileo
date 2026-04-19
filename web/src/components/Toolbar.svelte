<script lang="ts">
  import { uiStore, resultsStore, modelStore, historyStore } from '../lib/store';
  import { saveProject, loadFile, saveSession } from '../lib/store/file';
  import type { ClipboardData } from '../lib/store/ui.svelte.ts';
  import { t } from '../lib/i18n';
  import { hasInvalid2DDisplacements, hasInvalid3DDisplacements } from '../lib/geometry/coordinate-system';
  import { countCollapsedElements, buildSimplified2DModel, type DrawPlane } from '../lib/geometry/plane-projection';
  import { initSolver, isWasmReady } from '../lib/engine/wasm-solver';
  import { hasExplicitLocalY, pickElement3DMetadata } from '../lib/model/element-3d-metadata';

  import ToolbarResults from './toolbar/ToolbarResults.svelte';
  import ToolbarAdvanced from './toolbar/ToolbarAdvanced.svelte';
  import ToolbarExamples from './toolbar/ToolbarExamples.svelte';
  import ToolbarConfig from './toolbar/ToolbarConfig.svelte';
  import ToolbarProject from './toolbar/ToolbarProject.svelte';

  let fileInput: HTMLInputElement;

  // ─── 3D→2D plane-selection modal ──────────────────────────────
  let show2DPlaneModal = $state(false);
  let planeCollapsed = $state<Record<DrawPlane, number>>({ xy: 0, xz: 0, yz: 0 });

  function isModelNative2D(): boolean {
    for (const node of modelStore.nodes.values()) {
      if (Math.abs(node.z ?? 0) > 1e-9) return false;
    }
    const _3dSups = new Set(['fixed3d','pinned3d','spring3d','rollerXZ','rollerXY','rollerYZ','custom3d']);
    for (const s of modelStore.supports.values()) {
      if (_3dSups.has(s.type)) return false;
    }
    const _3dLoads = new Set(['nodal3d','distributed3d','pointOnElement3d','surface3d']);
    for (const l of modelStore.loads) {
      if (_3dLoads.has(l.type)) return false;
    }
    return true;
  }

  function computePlaneStats() {
    const nodeArr = [...modelStore.nodes.values()];
    const elemArr = [...modelStore.elements.values()];
    // Count collapsed elements per plane for informational display
    for (const plane of ['xy', 'xz', 'yz'] as DrawPlane[]) {
      planeCollapsed[plane] = countCollapsedElements(plane, nodeArr, elemArr);
    }
  }

  function handleSwitchTo2D() {
    if (modelStore.nodes.size === 0 || isModelNative2D()) {
      uiStore.drawPlane2D = 'xy';
      uiStore.analysisMode = '2d';
    } else {
      computePlaneStats();
      show2DPlaneModal = true;
    }
  }

  // Backup of original 3D model for restoration when exiting simplified mode
  let original3DBackup: { nodes: Map<number, any>; elements: Map<number, any>; supports: Map<number, any>; loads: any[] } | null = null;

  function selectPlane(plane: DrawPlane) {
    const result = buildSimplified2DModel(
      plane,
      modelStore.nodes.values(),
      modelStore.elements.values(),
      modelStore.supports.values(),
      modelStore.loads,
      modelStore.materials,
      modelStore.sections,
    );
    if (!result.ok) {
      uiStore.toast(result.error, 'error');
      return;
    }

    // Backup original 3D model (only once — don't overwrite if already backed up)
    if (!original3DBackup) {
      original3DBackup = {
        nodes: new Map(modelStore.nodes),
        elements: new Map(modelStore.elements),
        supports: new Map(modelStore.supports),
        loads: [...modelStore.loads],
      };
    }

    // Replace model with simplified version
    const m = result.model;
    modelStore.replaceModelData(m.nodes, m.elements, m.supports, m.loads);

    // In simplified mode, the model data is already in XY convention (projected by the builder).
    // Set drawPlane2D to 'xy' so the viewport and solver don't double-remap.
    uiStore.drawPlane2D = 'xy';
    uiStore.simplified2DMode = true;
    uiStore.simplified2DStats = m.stats;
    uiStore.analysisMode = '2d';
    resultsStore.clear();
    show2DPlaneModal = false;
  }

  // Restore original 3D model when switching back
  function exitSimplified2D() {
    if (original3DBackup) {
      modelStore.replaceModelData(
        original3DBackup.nodes,
        original3DBackup.elements,
        original3DBackup.supports,
        original3DBackup.loads,
      );
      original3DBackup = null;
    }
    uiStore.simplified2DMode = false;
    uiStore.simplified2DStats = null;
    uiStore.drawPlane2D = 'xy';
    uiStore.analysisMode = '3d';
    resultsStore.clear();
  }

  const tools = [
    { id: 'pan', icon: '✋', labelKey: 'toolbar.pan', key: 'A' },
    { id: 'select', icon: '↖', labelKey: 'toolbar.select', key: 'V' },
    { id: 'node', icon: '●', labelKey: 'toolbar.node', key: 'N' },
    { id: 'element', icon: '—', labelKey: 'toolbar.element', key: 'E' },
    { id: 'support', icon: '▽', labelKey: 'toolbar.support', key: 'S' },
    { id: 'load', icon: '↓', labelKey: 'toolbar.load', key: 'L' },
  ] as const;


  function handleSolve() {
    if (uiStore.analysisMode === '3d') {
      handleSolve3D();
      return;
    }
    const results = modelStore.solve(uiStore.includeSelfWeight, uiStore.drawPlane2D);
    if (typeof results === 'string') {
      uiStore.toast(results, 'error');
    } else if (results) {
      // Validate results aren't degenerate
      const hasNaN = hasInvalid2DDisplacements(results.displacements);
      if (hasNaN) {
        uiStore.toast(t('results.numericError'), 'error');
        return;
      }
      resultsStore.setResults(results);
      // Show classification in success toast
      const kin = modelStore.kinematicResult;
      let classText = '';
      if (kin) {
        if (kin.classification === 'isostatic') classText = t('toast.isostatic');
        else if (kin.classification === 'hyperstatic') classText = t('toast.hyperstatic').replace('{degree}', String(kin.degree));
      }
      // Auto-solve combinations if they exist
      let comboText = '';
      if (modelStore.model.combinations.length > 0) {
        const comboResult = modelStore.solveCombinations(uiStore.includeSelfWeight, uiStore.drawPlane2D);
        if (comboResult && typeof comboResult !== 'string') {
          resultsStore.setCombinationResults(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
          comboText = t('toast.plusCombinations').replace('{n}', String(comboResult.perCombo.size));
        }
      }
      uiStore.toast(`${t('results.calcSuccess')}${classText} — ${results.elementForces.length} ${t('results.bars')}, ${results.reactions.length} ${t('results.reactions')}${comboText}`, 'success');
      // Show diagnostics toast if any issues were found
      showDiagnosticsToast(false);
    } else {
      uiStore.toast(t('results.emptyModelError'), 'error');
    }
    // Auto-close drawer on mobile after solve, show floating results panel
    if (uiStore.isMobile) {
      uiStore.leftDrawerOpen = false;
      uiStore.mobileResultsPanelOpen = true;
    }
  }

  function showDiagnosticsToast(is3D: boolean) {
    const diags = is3D ? resultsStore.diagnostics3D : resultsStore.diagnostics;
    if (diags.length === 0) return;
    const errors = diags.filter(d => d.severity === 'error').length;
    const warnings = diags.filter(d => d.severity === 'warning').length;
    if (errors === 0 && warnings === 0) return;
    const msg = t('diag.toastSummary').replace('{errors}', String(errors)).replace('{warnings}', String(warnings));
    uiStore.toast(msg, errors > 0 ? 'error' : 'info');
  }

  async function handleSolve3D() {
    if (!isWasmReady()) {
      try { await initSolver(); } catch (e: any) {
        uiStore.toast(e?.message || 'WASM solver initialization failed', 'error');
        return;
      }
    }
    const isPro = uiStore.analysisMode === 'pro';
    const results = modelStore.solve3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', isPro);
    if (typeof results === 'string') {
      uiStore.toast(results, 'error');
    } else if (results) {
      // Validate results aren't degenerate
      const hasNaN = hasInvalid3DDisplacements(results.displacements as Array<{ ux: number; uy: number; uz: number }>);
      if (hasNaN) {
        uiStore.toast(t('results.numericError3d'), 'error');
        return;
      }
      resultsStore.setResults3D(results);
      // Auto-solve 3D combinations if they exist
      let comboText = '';
      if (modelStore.model.combinations.length > 0) {
        const comboResult = modelStore.solveCombinations3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', isPro);
        if (comboResult && typeof comboResult !== 'string') {
          resultsStore.setCombinationResults3D(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
          comboText = t('toast.plusCombinations').replace('{n}', String(comboResult.perCombo.size));
        }
      }
      uiStore.toast(
        `${t('results.analysis3dSuccess')} — ${results.elementForces.length} ${t('results.bars')}, ${results.reactions.length} ${t('results.reactions')}${comboText}`,
        'success',
      );
      // Show diagnostics toast if any issues were found
      showDiagnosticsToast(true);
    } else {
      uiStore.toast(t('results.emptyModelError'), 'error');
    }
    if (uiStore.isMobile) {
      uiStore.leftDrawerOpen = false;
      uiStore.mobileResultsPanelOpen = true;
    }
  }

  function zoomToFit() {
    if (modelStore.nodes.size === 0) return;
    const canvas = document.querySelector('.viewport-container canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    uiStore.zoomToFit(modelStore.nodes.values(), canvas.width, canvas.height);
  }

  function handleCopy() {
    // Collect selected nodes + nodes from selected elements
    const nodeIds = new Set<number>(uiStore.selectedNodes);
    for (const elemId of uiStore.selectedElements) {
      const elem = modelStore.elements.get(elemId);
      if (elem) {
        nodeIds.add(elem.nodeI);
        nodeIds.add(elem.nodeJ);
      }
    }
    if (nodeIds.size === 0) return;

    const nodes: ClipboardData['nodes'] = [];
    for (const id of nodeIds) {
      const n = modelStore.getNode(id);
      if (n) nodes.push({ origId: n.id, x: n.x, y: n.y, z: n.z ?? 0 });
    }

    // Collect elements where both nodes are in the set
    const elements: ClipboardData['elements'] = [];
    for (const elem of modelStore.elements.values()) {
      if (nodeIds.has(elem.nodeI) && nodeIds.has(elem.nodeJ)) {
        elements.push({
          origNodeI: elem.nodeI,
          origNodeJ: elem.nodeJ,
          type: elem.type,
          materialId: elem.materialId,
          sectionId: elem.sectionId,
          hingeStart: elem.hingeStart,
          hingeEnd: elem.hingeEnd,
          ...pickElement3DMetadata(elem),
        });
      }
    }

    // Collect supports on copied nodes
    const supports: ClipboardData['supports'] = [];
    for (const sup of modelStore.supports.values()) {
      if (nodeIds.has(sup.nodeId)) {
        supports.push({ origNodeId: sup.nodeId, type: sup.type as any });
      }
    }

    uiStore.clipboard = { nodes, elements, supports };
  }

  function handlePaste() {
    const clip = uiStore.clipboard;
    if (!clip || clip.nodes.length === 0) return;

    // Offset: in 3D mode offset in Z, in 2D offset in XY
    const is3D = uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro';
    const ox = is3D ? 0 : 1;
    const oy = is3D ? 0 : 1;
    const oz = is3D ? 3 : 0;

    const idMap = new Map<number, number>();
    const pastedElements: number[] = [];

    modelStore.batch(() => {
      // Create new nodes
      for (const n of clip.nodes) {
        const newId = modelStore.addNode(n.x + ox, n.y + oy, (n.z ?? 0) + oz);
        idMap.set(n.origId, newId);
      }

      // Create new elements
      for (const el of clip.elements) {
        const ni = idMap.get(el.origNodeI);
        const nj = idMap.get(el.origNodeJ);
        if (ni == null || nj == null) return;
        const matId = modelStore.materials.has(el.materialId) ? el.materialId : 1;
        const secId = modelStore.sections.has(el.sectionId) ? el.sectionId : 1;
        const newElemId = modelStore.addElement(ni, nj, el.type);
        modelStore.updateElementMaterial(newElemId, matId);
        modelStore.updateElementSection(newElemId, secId);
        if (el.hingeStart) modelStore.toggleHinge(newElemId, 'start');
        if (el.hingeEnd) modelStore.toggleHinge(newElemId, 'end');
        if (hasExplicitLocalY(el)) {
          modelStore.updateElementLocalY(newElemId, el.localYx, el.localYy, el.localYz);
        }
        if (el.rollAngle !== undefined && Math.abs(el.rollAngle) > 1e-9) {
          modelStore.rotateElementLocalAxes(newElemId, el.rollAngle);
        }
        pastedElements.push(newElemId);
      }

      // Create supports
      for (const s of clip.supports) {
        const newNodeId = idMap.get(s.origNodeId);
        if (newNodeId != null) {
          modelStore.addSupport(newNodeId, s.type);
        }
      }
    });

    // Select pasted items
    uiStore.setSelection(new Set(idMap.values()), new Set(pastedElements));
  }

  async function handleLoadFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await loadFile(file);
      if (result.type === 'session') {
        uiStore.toast(t('toast.sessionRestored').replace('{n}', String(result.count)), 'success');
      }
    } catch (err: any) {
      alert(err.message || t('toast.loadFileError'));
    }
    input.value = ''; // reset so same file can be loaded again
  }

  function handleKeydown(e: KeyboardEvent) {
    // Ignore if typing in an input or textarea
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

    const key = e.key.toUpperCase();

    // Ctrl+Shift+S: Save session (all tabs)
    if ((e.ctrlKey || e.metaKey) && key === 'S' && e.shiftKey) {
      e.preventDefault();
      saveSession();
      return;
    }

    // Ctrl+S: Save project (current tab)
    if ((e.ctrlKey || e.metaKey) && key === 'S' && !e.shiftKey) {
      e.preventDefault();
      saveProject();
      return;
    }

    // Ctrl+O: Open/Load
    if ((e.ctrlKey || e.metaKey) && key === 'O') {
      e.preventDefault();
      fileInput?.click();
      return;
    }

    // Ctrl+Z: Undo
    if ((e.ctrlKey || e.metaKey) && key === 'Z' && !e.shiftKey) {
      e.preventDefault();
      historyStore.undo();
      return;
    }

    // Ctrl+Y or Ctrl+Shift+Z: Redo
    if ((e.ctrlKey || e.metaKey) && (key === 'Y' || (key === 'Z' && e.shiftKey))) {
      e.preventDefault();
      historyStore.redo();
      return;
    }

    // Ctrl+A: Select all
    if ((e.ctrlKey || e.metaKey) && key === 'A') {
      e.preventDefault();
      uiStore.setSelection(new Set(modelStore.nodes.keys()), new Set(modelStore.elements.keys()));
      return;
    }

    // Ctrl+C: Copy
    if ((e.ctrlKey || e.metaKey) && key === 'C') {
      e.preventDefault();
      handleCopy();
      return;
    }

    // Ctrl+X: Cut
    if ((e.ctrlKey || e.metaKey) && key === 'X') {
      e.preventDefault();
      handleCopy();
      const nodesToDelete = [...uiStore.selectedNodes];
      const elemsToDelete = [...uiStore.selectedElements];
      modelStore.batch(() => {
        for (const nodeId of nodesToDelete) modelStore.removeNode(nodeId);
        for (const elemId of elemsToDelete) modelStore.removeElement(elemId);
      });
      uiStore.clearSelection();
      return;
    }

    // Ctrl+V: Paste
    if ((e.ctrlKey || e.metaKey) && key === 'V') {
      e.preventDefault();
      handlePaste();
      return;
    }

    // +/=: Zoom in
    if (e.key === '+' || e.key === '=') {
      uiStore.zoom *= 1.2;
      return;
    }

    // -: Zoom out
    if (e.key === '-') {
      uiStore.zoom *= 0.8;
      return;
    }

    // F: Zoom to fit
    if (key === 'F') {
      if (uiStore.analysisMode === '3d') {
        window.dispatchEvent(new Event('stabileo-zoom-to-fit'));
      } else {
        zoomToFit();
      }
      return;
    }

    // Tool shortcuts (only without Ctrl/Meta to avoid conflicts with Ctrl+A, etc.)
    const tool = !e.ctrlKey && !e.metaKey ? tools.find(tl => tl.key === key) : undefined;
    if (tool) {
      e.preventDefault();
      uiStore.currentTool = tool.id;
      return;
    }

    // Diagram shortcuts (0-9)
    if (resultsStore.results || resultsStore.results3D) {
      const is3D = uiStore.analysisMode === '3d';
      switch (e.key) {
        case '0': resultsStore.diagramType = 'none'; return;
        case '1': resultsStore.diagramType = 'deformed'; return;
        case '2': resultsStore.diagramType = is3D ? 'shearZ' : 'shear'; return;
        case '3': resultsStore.diagramType = is3D ? 'momentY' : 'moment'; return;
        case '4': if (is3D) { resultsStore.diagramType = 'shearY'; } return;
        case '5': if (is3D) { resultsStore.diagramType = 'momentZ'; } return;
        case '6': if (is3D) { resultsStore.diagramType = 'torsion'; } return;
        case '7': resultsStore.diagramType = 'axial'; return;
        case '8': resultsStore.diagramType = 'axialColor'; return;
        case '9': resultsStore.diagramType = 'colorMap'; return;
      }
    }

    // Delete selected supports/nodes/elements/loads
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (uiStore.selectedSupports.size > 0) {
        const supToDelete = [...uiStore.selectedSupports];
        modelStore.batch(() => {
          for (const supId of supToDelete) modelStore.removeSupport(supId);
        });
        uiStore.clearSelectedSupports();
        resultsStore.clear();
        return;
      }
      if (uiStore.selectedLoads.size > 0) {
        const loadsToDelete = [...uiStore.selectedLoads];
        modelStore.batch(() => {
          for (const loadId of loadsToDelete) modelStore.removeLoad(loadId);
        });
        uiStore.clearSelectedLoads();
        resultsStore.clear();
      } else if (uiStore.selectedNodes.size > 0 || uiStore.selectedElements.size > 0) {
        const nodesToDelete = [...uiStore.selectedNodes];
        const elemsToDelete = [...uiStore.selectedElements];
        modelStore.batch(() => {
          for (const nodeId of nodesToDelete) modelStore.removeNode(nodeId);
          for (const elemId of elemsToDelete) modelStore.removeElement(elemId);
        });
        uiStore.clearSelection();
        resultsStore.clear();
      }
      return;
    }

    // ESC: cancel / clear selection / close editors
    if (e.key === 'Escape') {
      uiStore.currentTool = 'select';
      uiStore.clearSelection();
      uiStore.editingNodeId = null;
      uiStore.editingElementId = null;
      return;
    }

    // ?: toggle help
    if (e.key === '?' || (e.shiftKey && key === '/')) {
      uiStore.showHelp = !uiStore.showHelp;
      return;
    }

    // G: toggle grid (2D and 3D)
    if (key === 'G') {
      if (uiStore.analysisMode === '3d') {
        uiStore.showGrid3D = !uiStore.showGrid3D;
      } else {
        uiStore.showGrid = !uiStore.showGrid;
      }
      return;
    }

    // H: toggle axes (2D and 3D)
    if (key === 'H' && !e.ctrlKey && !e.metaKey) {
      if (uiStore.analysisMode === '3d') {
        uiStore.showAxes3D = !uiStore.showAxes3D;
      } else {
        uiStore.showAxes = !uiStore.showAxes;
      }
      return;
    }

    // Enter: solve (both 2D and 3D)
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSolve();
      return;
    }

  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="toolbar">
  <div class="toolbar-section">
    <div class="undo-redo-row">
      <button
        class="undo-redo-btn"
        onclick={() => historyStore.undo()}
        disabled={!historyStore.canUndo}
        title={uiStore.isMobile ? t('toolbar.undo') : `${t('toolbar.undo')} (Ctrl+Z)`}
      >↶ {t('toolbar.undo')}</button>
      <button
        class="undo-redo-btn"
        onclick={() => historyStore.redo()}
        disabled={!historyStore.canRedo}
        title={uiStore.isMobile ? t('toolbar.redo') : `${t('toolbar.redo')} (Ctrl+Y)`}
      >↷ {t('toolbar.redo')}</button>
    </div>
  </div>

  <!-- 2D/3D dimension toggle (only in Básico mode) -->
  {#if uiStore.appMode === 'basico'}
    <div class="toolbar-section dim-toggle-section">
      <div class="dim-toggle">
        <button class:active={uiStore.analysisMode === '2d'} onclick={handleSwitchTo2D}>2D</button>
        <button class:active={uiStore.analysisMode === '3d'} onclick={() => { if (uiStore.simplified2DMode) exitSimplified2D(); else uiStore.analysisMode = '3d'; }}>3D</button>
      </div>
    </div>
  {/if}

  <ToolbarResults />
  <ToolbarAdvanced />
  <ToolbarExamples />

  <!-- Configuración + Proyecto wrapper for tour spotlight -->
  <div data-tour="config-project-section" style="display:flex;flex-direction:column;gap:1rem">
    <ToolbarConfig />
    <ToolbarProject />
  </div>

  <input
    bind:this={fileInput}
    type="file"
    accept=".ded,.json"
    style="display:none"
    onchange={handleLoadFile}
  />
</div>

{#if show2DPlaneModal}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="plane-modal-overlay" onclick={() => show2DPlaneModal = false}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="plane-modal" onclick={(e) => e.stopPropagation()}>
    <h3>{t('toolbar.planeModal.title')}</h3>
    <p>{t('toolbar.planeModal.description')}</p>
    <div class="plane-options">
      {#each [['xy', 'XY', t('toolbar.planeModal.xy')], ['xz', 'XZ', t('toolbar.planeModal.xz')], ['yz', 'YZ', t('toolbar.planeModal.yz')]] as [id, label, desc]}
        {@const n = planeCollapsed[id as DrawPlane]}
        <button class="plane-btn" class:plane-btn-warn={n > 0}
          onclick={() => selectPlane(id as DrawPlane)}>
          <span class="plane-label">{label}</span>
          <span class="plane-desc">{n > 0 ? `~${n} ${t('toolbar.planeModal.simplified')}` : desc}</span>
        </button>
      {/each}
    </div>
    <div class="plane-modal-footer">
      <button class="plane-btn plane-btn-secondary" onclick={() => show2DPlaneModal = false}>
        {t('toolbar.planeModal.stay3d')}
      </button>
      <button class="plane-btn plane-btn-destructive" onclick={() => { modelStore.clear(); uiStore.simplified2DMode = false; uiStore.simplified2DStats = null; uiStore.drawPlane2D = 'xy'; uiStore.analysisMode = '2d'; resultsStore.clear(); show2DPlaneModal = false; }}>
        {t('toolbar.planeModal.eraseAndSwitch')}
      </button>
    </div>
  </div>
</div>
{/if}

<style>
  .toolbar {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .toolbar-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .toolbar-section h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #888;
    letter-spacing: 0.05em;
  }

  .undo-redo-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
  }

  .undo-redo-btn {
    padding: 0.35rem 0.4rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #ccc;
    cursor: pointer;
    font-size: 0.75rem;
    text-align: center;
    transition: all 0.2s;
  }

  .undo-redo-btn:hover:not(:disabled) {
    background: #1a4a7a;
    color: white;
  }

  .undo-redo-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .dim-toggle-section {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }

  .dim-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid #1a4a7a;
  }

  .dim-toggle button {
    background: #0a1a30;
    border: none;
    color: #778;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.3rem 0;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    text-align: center;
  }

  .dim-toggle button:first-child {
    border-right: 1px solid #1a4a7a;
  }

  .dim-toggle button:hover {
    background: #1a3860;
    color: #ccc;
  }

  .dim-toggle button.active {
    background: #e94560;
    color: white;
  }

  .solve-btn {
    width: 100%;
    padding: 0.5rem 0.5rem;
    background: #e94560;
    border: 1px solid #ff6b6b;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
    transition: all 0.2s;
  }

  .solve-btn:hover:not(:disabled) {
    background: #ff6b6b;
  }

  .solve-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .solve-btn.ready {
    animation: gentle-pulse 3s ease-in-out infinite;
  }

  @keyframes gentle-pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(233, 69, 96, 0);
    }
    50% {
      box-shadow: 0 0 8px 2px rgba(233, 69, 96, 0.4);
    }
  }

  .solve-btn.solve-steps {
    background: #0f3460;
    border-color: #f0a500;
    color: #f0a500;
  }

  .solve-btn.solve-steps:hover {
    background: #1a4a7a;
    color: white;
  }

  .mode-3d-note {
    text-align: center;
    color: #667;
    font-size: 0.7rem;
    margin-top: 0.25rem;
    font-style: italic;
  }

  /* ─── 3D→2D plane modal ───────────────────────────────── */
  .plane-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .plane-modal {
    background: #0d1b2e;
    border: 1px solid #1a4a7a;
    border-radius: 8px;
    padding: 1.5rem;
    width: 320px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .plane-modal h3 {
    margin: 0;
    font-size: 0.95rem;
    color: #eee;
  }
  .plane-modal p {
    margin: 0;
    font-size: 0.78rem;
    color: #999;
    line-height: 1.4;
  }
  .plane-options {
    display: flex;
    gap: 0.5rem;
  }
  .plane-btn {
    flex: 1;
    padding: 0.6rem 0.4rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 5px;
    color: #ccc;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    transition: all 0.15s;
  }
  .plane-btn:hover {
    background: #1a4a7a;
    color: white;
    border-color: #4ecdc4;
  }
  .plane-label {
    font-size: 1rem;
    font-weight: 700;
    color: #4ecdc4;
  }
  .plane-desc {
    font-size: 0.6rem;
    color: #888;
  }
  .plane-btn:hover .plane-desc { color: #bbb; }
  .plane-btn-warn .plane-desc { color: #e9a045; font-weight: 500; font-size: 0.55rem; }
  .plane-btn-destructive {
    background: #2a1520;
    border-color: #e94560;
    color: #e94560;
    font-size: 0.68rem;
    flex: unset;
  }
  .plane-btn-destructive:hover {
    background: #e94560;
    color: white;
  }
  .plane-modal-footer {
    display: flex;
    justify-content: center;
    margin-top: 0.25rem;
  }
  .plane-btn-secondary {
    background: #12192e;
    border-color: #333;
    color: #888;
    font-size: 0.75rem;
  }
  .plane-btn-secondary:hover {
    background: #1a1a2e;
    color: #ccc;
    border-color: #555;
  }
</style>
