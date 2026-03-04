<script lang="ts">
  import { uiStore, resultsStore, modelStore, historyStore, tabManager } from '../lib/store';
  import { saveProject, loadFile, saveSession } from '../lib/store/file';
  import type { ClipboardData } from '../lib/store/ui.svelte.ts';

  import ToolbarResults from './toolbar/ToolbarResults.svelte';
  import ToolbarAdvanced from './toolbar/ToolbarAdvanced.svelte';
  import ToolbarExamples from './toolbar/ToolbarExamples.svelte';
  import ToolbarConfig from './toolbar/ToolbarConfig.svelte';
  import ToolbarProject from './toolbar/ToolbarProject.svelte';

  let fileInput: HTMLInputElement;

  // ─── Educational Tooltips ─────────────────────────────────
  const HELP_TEXTS: Record<string, { title: string; desc: string }> = {
    'tool-select':    { title: 'Seleccionar (V)', desc: 'Tiene 5 sub-modos: Nodos, Elementos, Apoyos, Cargas y Tensiones. Cambiá en la barra flotante.' },
    'tool-node':      { title: 'Crear Nodo (N)', desc: 'Click en el lienzo para colocar un punto de unión. Los nodos son donde se conectan las barras y se aplican cargas.' },
    'tool-element':   { title: 'Crear Elemento (E)', desc: 'Click en un nodo de inicio, luego en uno de fin. Se crea una barra entre ambos. Frame = rígida, Truss = articulada.' },
    'tool-support':   { title: 'Crear Apoyo (S)', desc: 'Click en un nodo para colocar un apoyo. El tipo de apoyo determina qué movimientos están restringidos.' },
    'tool-load':      { title: 'Aplicar Carga (L)', desc: 'Click en un nodo (puntual) o barra (distribuida) para aplicar una fuerza. Valores negativos = hacia abajo.' },
    'tool-influenceLine': { title: 'Línea de Influencia (I)', desc: 'Muestra cómo varía una reacción o esfuerzo cuando una carga unitaria recorre la estructura.' },
    'tool-pan':       { title: 'Mover Vista (H)', desc: 'Arrastrá para desplazar la vista. También podés usar click medio o Ctrl+arrastrar.' },
    'solve':          { title: 'Calcular', desc: 'Resuelve la estructura por el Método de la Rigidez Directa (DSM). Necesitás nodos, barras, apoyos y cargas.' },
    'selfweight':     { title: 'Peso Propio', desc: 'Agrega automáticamente cargas distribuidas por gravedad usando la densidad del material y el área de la sección.' },
    'adv-pdelta':     { title: 'Pandeo — 2° Orden (P-Δ)', desc: 'Análisis no lineal geométrico iterativo. Amplifica desplazamientos y esfuerzos considerando el efecto de las fuerzas axiales sobre la rigidez lateral. Reporta factor de amplificación B₂.' },
    'adv-modal':      { title: 'Análisis Dinámico', desc: 'Calcula modos de vibración, frecuencias propias, masa modal efectiva, factores de participación y amortiguamiento de Rayleigh. Esencial para diseño sismorresistente. Requiere densidad del material.' },
    'adv-spectral':   { title: 'Análisis Espectral', desc: 'Combinación modal espectral (SRSS/CQC) con espectro de diseño CIRSOC 103. Calcula corte basal, desplazamientos y esfuerzos pico. Requiere análisis dinámico previo.' },
    'adv-buckling':   { title: 'Pandeo — Carga Crítica (Euler)', desc: 'Calcula la carga crítica de pandeo elástico por autovalores. λ_cr indica cuánto multiplicar las cargas para alcanzar la inestabilidad. Reporta longitud efectiva Keff por elemento.' },
    'adv-plastic':    { title: 'Colapso Plástico', desc: 'Análisis incremental hasta formación de mecanismo plástico. Muestra la secuencia de articulaciones plásticas y el factor de carga de colapso λ. Requiere fy del material.' },
    'adv-dsm':        { title: 'Paso a Paso — Método de las Rigideces', desc: 'Muestra cada paso del Método de la Rigidez Directa: matrices locales, ensamblaje, resolución y fuerzas internas. Ideal para estudiar cómo funciona el método.' },
    'diag-none':      { title: 'Sin Diagrama', desc: 'Oculta todos los diagramas de resultados. Solo se ve la estructura.' },
    'diag-deformed':  { title: 'Deformada', desc: 'Muestra la forma deformada amplificada. Útil para verificar que el comportamiento es razonable.' },
    'diag-moment':    { title: 'Momento Flector (M)', desc: 'Diagrama del momento que genera flexión en cada barra. Se dibuja del lado traccionado por convención.' },
    'diag-shear':     { title: 'Corte (V)', desc: 'Diagrama de la fuerza de corte a lo largo de cada barra. Cambios bruscos indican cargas puntuales.' },
    'diag-axial':     { title: 'Axil (N)', desc: 'Diagrama de la fuerza axial. Positivo = tracción (la barra se estira), negativo = compresión.' },
    'diag-axialColor':{ title: 'Color Axil (N±)', desc: 'Colorea las barras según axil: rojo = tracción, azul = compresión. Grosor proporcional a la magnitud.' },
    'diag-colorMap':  { title: 'Mapa de Color', desc: 'Colorea las barras según el esfuerzo elegido (momento, corte, axil o ratio σ/fy) usando una escala de colores.' },
    'sup-fixed':      { title: 'Empotrado', desc: 'Restringe desplazamiento horizontal (ux), vertical (uy) y giro (θ). No permite ningún movimiento.' },
    'sup-pinned':     { title: 'Articulado', desc: 'Restringe ux y uy, pero permite el giro. La barra puede rotar libremente en este punto.' },
    'sup-rollerX':    { title: 'Móvil en X', desc: 'Solo restringe uy (vertical). Permite movimiento horizontal y giro. Típico apoyo "sobre ruedas".' },
    'sup-rollerY':    { title: 'Móvil en Y', desc: 'Solo restringe ux (horizontal). Permite movimiento vertical y giro.' },
    'sup-spring':     { title: 'Resorte', desc: 'Apoyo elástico con rigidez configurable en cada dirección (kx, ky, kθ). Modela suelo o conexiones flexibles.' },
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
        el.innerHTML = `<strong>${info.title}</strong><br/><span>${info.desc}</span>`;
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
    { id: 'pan', icon: '✋', label: 'Mover (pan)', key: 'A' },
    { id: 'select', icon: '↖', label: 'Seleccionar', key: 'V' },
    { id: 'node', icon: '●', label: 'Nodo', key: 'N' },
    { id: 'element', icon: '—', label: 'Elemento', key: 'E' },
    { id: 'support', icon: '▽', label: 'Apoyo', key: 'S' },
    { id: 'load', icon: '↓', label: 'Carga', key: 'L' },
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
        uiStore.toast('Error numérico: la estructura puede ser inestable (mecanismo)', 'error');
        return;
      }
      resultsStore.setResults(results);
      // Show classification in success toast
      const kin = modelStore.kinematicResult;
      let classText = '';
      if (kin) {
        if (kin.classification === 'isostatic') classText = ' — Isostática';
        else if (kin.classification === 'hyperstatic') classText = ` — Hiperestática (grado ${kin.degree})`;
      }
      // Auto-solve combinations if they exist
      let comboText = '';
      if (modelStore.model.combinations.length > 0) {
        const comboResult = modelStore.solveCombinations(uiStore.includeSelfWeight);
        if (comboResult && typeof comboResult !== 'string') {
          resultsStore.setCombinationResults(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
          comboText = ` + ${comboResult.perCombo.size} combinaciones`;
        }
      }
      uiStore.toast(`Cálculo exitoso${classText} — ${results.elementForces.length} barras, ${results.reactions.length} reacciones${comboText}`, 'success');
    } else {
      uiStore.toast('Modelo vacío o error inesperado', 'error');
    }
    // Auto-close drawer on mobile after solve, show floating results panel
    if (uiStore.isMobile) {
      uiStore.leftDrawerOpen = false;
      uiStore.mobileResultsPanelOpen = true;
    }
  }

  function handleSolve3D() {
    const results = modelStore.solve3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
    if (typeof results === 'string') {
      uiStore.toast(results, 'error');
    } else if (results) {
      // Validate results aren't degenerate
      const hasNaN = results.displacements.some(
        (d: { ux: number; uy: number; uz: number }) => !isFinite(d.ux) || !isFinite(d.uy) || !isFinite(d.uz)
      );
      if (hasNaN) {
        uiStore.toast('Error numérico 3D: la estructura puede ser inestable (mecanismo)', 'error');
        return;
      }
      resultsStore.setResults3D(results);
      // Auto-solve 3D combinations if they exist
      let comboText = '';
      if (modelStore.model.combinations.length > 0) {
        const comboResult = modelStore.solveCombinations3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
        if (comboResult && typeof comboResult !== 'string') {
          resultsStore.setCombinationResults3D(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
          comboText = ` + ${comboResult.perCombo.size} combinaciones`;
        }
      }
      uiStore.toast(
        `Análisis 3D exitoso — ${results.elementForces.length} barras, ${results.reactions.length} reacciones${comboText}`,
        'success',
      );
    } else {
      uiStore.toast('Modelo vacío o error inesperado', 'error');
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
        uiStore.showToast(`Sesión restaurada: ${result.count} pestañas`, 'success');
      }
    } catch (err: any) {
      alert(err.message || 'Error al cargar el archivo');
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
    const tool = !e.ctrlKey && !e.metaKey ? tools.find(t => t.key === key) : undefined;
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
        title={uiStore.isMobile ? 'Deshacer' : 'Deshacer (Ctrl+Z)'}
      >↶ Deshacer</button>
      <button
        class="undo-redo-btn"
        onclick={() => historyStore.redo()}
        disabled={!historyStore.canRedo}
        title={uiStore.isMobile ? 'Rehacer' : 'Rehacer (Ctrl+Y)'}
      >↷ Rehacer</button>
    </div>
  </div>

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
