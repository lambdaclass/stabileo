<script lang="ts">
  import { uiStore, resultsStore, modelStore, historyStore, tabManager } from '../lib/store';
  import { saveProject, loadFile, saveSession } from '../lib/store/file';
  import type { ClipboardData } from '../lib/store/ui.svelte.ts';
  import { t } from '../lib/i18n';

  import ToolbarResults from './toolbar/ToolbarResults.svelte';
  import ToolbarAdvanced from './toolbar/ToolbarAdvanced.svelte';
  import ToolbarExamples from './toolbar/ToolbarExamples.svelte';
  import ToolbarConfig from './toolbar/ToolbarConfig.svelte';
  import ToolbarProject from './toolbar/ToolbarProject.svelte';

  let fileInput: HTMLInputElement;

  // ─── Educational Tooltips ─────────────────────────────────
  const HELP_TEXTS: Record<string, { titleKey: string; descKey: string }> = {
    select: { titleKey: 'tooltip.toolSelect.title', descKey: 'tooltip.toolSelect.desc' },
    node: { titleKey: 'tooltip.toolNode.title', descKey: 'tooltip.toolNode.desc' },
    element: { titleKey: 'tooltip.toolElement.title', descKey: 'tooltip.toolElement.desc' },
    support: { titleKey: 'tooltip.toolSupport.title', descKey: 'tooltip.toolSupport.desc' },
    load: { titleKey: 'tooltip.toolLoad.title', descKey: 'tooltip.toolLoad.desc' },
    influence: { titleKey: 'tooltip.toolInfluence.title', descKey: 'tooltip.toolInfluence.desc' },
    pan: { titleKey: 'tooltip.toolPan.title', descKey: 'tooltip.toolPan.desc' },
    solve: { titleKey: 'tooltip.solve.title', descKey: 'tooltip.solve.desc' },
    selfweight: { titleKey: 'tooltip.selfweight.title', descKey: 'tooltip.selfweight.desc' },
    diagNone: { titleKey: 'tooltip.diagNone.title', descKey: 'tooltip.diagNone.desc' },
    diagDeformed: { titleKey: 'tooltip.diagDeformed.title', descKey: 'tooltip.diagDeformed.desc' },
    diagMoment: { titleKey: 'tooltip.diagMoment.title', descKey: 'tooltip.diagMoment.desc' },
    diagShear: { titleKey: 'tooltip.diagShear.title', descKey: 'tooltip.diagShear.desc' },
    diagAxial: { titleKey: 'tooltip.diagAxial.title', descKey: 'tooltip.diagAxial.desc' },
    diagAxialColor: { titleKey: 'tooltip.diagAxialColor.title', descKey: 'tooltip.diagAxialColor.desc' },
    diagColorMap: { titleKey: 'tooltip.diagColorMap.title', descKey: 'tooltip.diagColorMap.desc' },
    supFixed: { titleKey: 'tooltip.supFixed.title', descKey: 'tooltip.supFixed.desc' },
    supPinned: { titleKey: 'tooltip.supPinned.title', descKey: 'tooltip.supPinned.desc' },
    supRollerX: { titleKey: 'tooltip.supRollerX.title', descKey: 'tooltip.supRollerX.desc' },
    supRollerY: { titleKey: 'tooltip.supRollerY.title', descKey: 'tooltip.supRollerY.desc' },
    supSpring: { titleKey: 'tooltip.supSpring.title', descKey: 'tooltip.supSpring.desc' },
  };

  function tooltip(node: HTMLElement, key: string) {
    let el: HTMLDivElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function show() {
      if (!uiStore.showTooltips) return;
      const info = HELP_TEXTS[key];
      if (!info) return;
      timer = setTimeout(() => {
        el = document.createElement('div');
        el.className = 'edu-tooltip';
        el.innerHTML = `<strong>${t(info.titleKey)}</strong><br/><span>${t(info.descKey)}</span>`;
        document.body.appendChild(el);
        // Position to the right of the element
        const rect = node.getBoundingClientRect();
        el.style.top = `${rect.top + window.scrollY}px`;
        el.style.left = `${rect.right + 8}px`;
        // If going off screen right, put on left
        requestAnimationFrame(() => {
          if (!el) return;
          const tr = el.getBoundingClientRect();
          if (tr.right > window.innerWidth - 10) {
            el.style.left = `${rect.left - tr.width - 8}px`;
          }
          if (tr.bottom > window.innerHeight - 10) {
            el.style.top = `${window.innerHeight - tr.height - 10}px`;
          }
        });
      }, 600);
    }

    function hide() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (el) { el.remove(); el = null; }
    }

    node.addEventListener('mouseenter', show);
    node.addEventListener('mouseleave', hide);

    return {
      destroy() {
        hide();
        node.removeEventListener('mouseenter', show);
        node.removeEventListener('mouseleave', hide);
      }
    };
  }

  const tools = [
    { id: 'pan', icon: '✋', labelKey: 'toolbar.pan', key: 'A' },
    { id: 'select', icon: '↖', labelKey: 'toolbar.select', key: 'V' },
    { id: 'node', icon: '●', labelKey: 'toolbar.node', key: 'N' },
    { id: 'element', icon: '—', labelKey: 'toolbar.element', key: 'E' },
    { id: 'support', icon: '▽', labelKey: 'toolbar.support', key: 'S' },
    { id: 'load', icon: '↓', labelKey: 'toolbar.load', key: 'L' },
  ] as const;

  // Pulse the Solve button when model is ready but not yet solved
  const modelReady = $derived(
    modelStore.nodes.size > 0 &&
    modelStore.elements.size > 0 &&
    modelStore.supports.size > 0 &&
    modelStore.model.loads.length > 0 &&
    !resultsStore.results
  );

  function handleSolve() {
    if (uiStore.analysisMode === '3d') {
      handleSolve3D();
      return;
    }
    const results = modelStore.solve(uiStore.includeSelfWeight);
    if (typeof results === 'string') {
      uiStore.toast(results, 'error');
    } else if (results) {
      // Validate results aren't degenerate
      const hasNaN = results.displacements.some(d => !isFinite(d.ux) || !isFinite(d.uy) || !isFinite(d.rz));
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
        const comboResult = modelStore.solveCombinations(uiStore.includeSelfWeight);
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
    uiStore.toast(msg, errors > 0 ? 'error' : 'warning');
  }

  function handleSolve3D() {
    const isPro = uiStore.analysisMode === 'pro';
    const results = modelStore.solve3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', isPro);
    if (typeof results === 'string') {
      uiStore.toast(results, 'error');
    } else if (results) {
      // Validate results aren't degenerate
      const hasNaN = results.displacements.some(
        (d: { ux: number; uy: number; uz: number }) => !isFinite(d.ux) || !isFinite(d.uy) || !isFinite(d.uz)
      );
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
        });
      }
    }

    // Collect supports on copied nodes
    const supports: ClipboardData['supports'] = [];
    for (const sup of modelStore.supports.values()) {
      if (nodeIds.has(sup.nodeId)) {
        supports.push({ origNodeId: sup.nodeId, type: sup.type });
      }
    }

    uiStore.clipboard = { nodes, elements, supports };
  }

  function handlePaste() {
    const clip = uiStore.clipboard;
    if (!clip || clip.nodes.length === 0) return;

    // Offset: in 3D mode offset in Z, in 2D offset in XY
    const is3D = uiStore.analysisMode === '3d';
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
        uiStore.showToast(t('toast.sessionRestored').replace('{n}', String(result.count)), 'success');
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
        window.dispatchEvent(new Event('dedaliano-zoom-to-fit'));
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
        <button class:active={uiStore.analysisMode === '2d'} onclick={() => uiStore.analysisMode = '2d'}>2D</button>
        <button class:active={uiStore.analysisMode === '3d'} onclick={() => uiStore.analysisMode = '3d'}>3D</button>
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
</style>
