<script lang="ts">
  import { uiStore, modelStore, resultsStore, historyStore } from '../lib/store';
  import { saveProject, saveSession, loadFile } from '../lib/store/file';
  import { resolveDeleteTargets } from '../lib/store/delete-selection';
  import type { ClipboardData } from '../lib/store/ui.svelte.ts';
  import { hasExplicitLocalY, pickElement3DMetadata } from '../lib/model/element-3d-metadata';
  import { runSolve } from '../lib/actions/solve';
  import { TOOL_KEYS } from '../lib/tool-keys';
  import { t } from '../lib/i18n';

  /**
   * Every keyboard shortcut in Basic, in the one place that is always mounted.
   *
   * These lived inside `Toolbar.svelte` — the left sidebar — which the ribbon
   * replaced on desktop. `Toolbar` is now mounted only on mobile, so the whole
   * keyboard layer went with it: on desktop, V/N/E/S/L armed no tool, Enter did
   * not solve, Ctrl+Z did not undo and `?` did not open the shortcuts dialog.
   * The dialog still listed all of them, so the one panel a user opens to learn
   * the keyboard was describing a keyboard that was not there.
   *
   * Shortcuts are not a property of a sidebar, so they no longer live in one.
   * This component renders nothing; it exists to own the window listener.
   *
   * Solving goes through the shared `runSolve()` rather than the copy that sat
   * beside this handler — two implementations of "press Enter to solve" is how
   * the two drift apart.
   */

  /**
   * Which letter arms which tool comes from `lib/tool-keys.ts` — the one
   * table every display (ribbon, floating tools, mobile toolbar) reads too,
   * because four copies of it had already drifted.
   */
  /*
   * Ctrl+O needs a file input to click, and the one it used to click belonged
   * to Toolbar's markup — so on desktop `fileInput?.click()` optional-chained
   * its way to doing nothing at all. This component brings its own.
   */
  let fileInput: HTMLInputElement | undefined = $state();

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

  const tools = TOOL_KEYS;

  /**
   * Keep the Data panel's TAB in step with a tool armed from the keyboard.
   *
   * The ribbon lights a drawing tool by `currentTool` and a properties command
   * (Materials, Sections) by the open data TAB — over the same panel. Arming a
   * tool here changed only the tool, so with Data open on Materials a press of
   * N lit BOTH Materials and Node. The ribbon's own tool commands carry the tab
   * and flip it; the table's tab strip is the other place tab and tool are set
   * together (`pickTab` in DataTable.svelte), so the keyboard routes through it
   * rather than duplicating the mapping. No table mounted means the panel is
   * closed or replaced by the wizard, and there is no lit tab to conflict with.
   *
   * The index into the tab strip is the order of the buttons in DataTable:
   * nodes, elements, supports, loads, materials, sections.
   */
  const TOOL_TAB_INDEX: Record<string, number> = { node: 0, element: 1, support: 2, load: 3 };
  function syncDataTabWithTool(toolId: string) {
    const idx = TOOL_TAB_INDEX[toolId];
    if (idx === undefined) return; // pan/select/influenceLine own no tab
    const btn = document.querySelector('.data-table .tabs')
      ?.children[idx] as HTMLButtonElement | undefined;
    btn?.click();
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
          releaseI: elem.releaseI,
          releaseJ: elem.releaseJ,
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
        if (el.releaseI?.mz === true) modelStore.toggleHinge(newElemId, 'start');
        if (el.releaseJ?.mz === true) modelStore.toggleHinge(newElemId, 'end');
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
    uiStore.setSelection(new Set(idMap.values()), new Set(pastedElements), true);
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
      uiStore.setSelection(new Set(modelStore.nodes.keys()), new Set(modelStore.elements.keys()), true);
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
      // Every edit-tool shortcut, not just N: E/S/L have the same gap.
      syncDataTabWithTool(tool.id);
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
        // selectedLoads holds load data ids (the 2D viewport selects by data.id)
        const ids = [...uiStore.selectedLoads];
        modelStore.batch(() => {
          for (const id of ids) modelStore.removeLoad(id);
        });
        uiStore.clearSelectedLoads();
        resultsStore.clear();
      } else if (uiStore.selectedNodes.size > 0 || uiStore.selectedElements.size > 0 || uiStore.selectedShells.size > 0) {
        // Delete strictly from the EXPLICIT selection channels — never infer an
        // entity kind from a numeric id. Frame elements, plates and quads have
        // INDEPENDENT id spaces (all count from 1), so a frame id can collide
        // with an unrelated quad/plate id. `selectedElements` only ever holds
        // FRAME ids (box-select, element-row clicks); shells are selected and
        // highlighted ONLY via `selectedShells` ("p<id>"/"q<id>"). The old code
        // re-derived shells from `selectedElements` numeric ids in shell mode,
        // which deleted unselected (any-floor) shells whose id happened to match
        // a selected frame id. Highlight == delete target now.
        const targets = resolveDeleteTargets(
          { nodes: uiStore.selectedNodes, elements: uiStore.selectedElements, shells: uiStore.selectedShells },
          (id) => modelStore.elements.has(id),
        );
        modelStore.deleteEntities(targets);
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
      runSolve();
      return;
    }

  }
</script>

<svelte:window onkeydown={handleKeydown} />

<input
  bind:this={fileInput}
  type="file"
  accept=".ded,.json"
  style="display:none"
  onchange={handleLoadFile}
/>
