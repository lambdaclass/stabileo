<script lang="ts">
  import { uiStore, modelStore, resultsStore, historyStore, tabManager } from '../../lib/store';
  import { TEMPLATE_CATALOG_3D } from '../../lib/templates/generators';

  let showExamples = $state(false);
  let showExamples3D = $state(false);

  const examples = [
    // Vigas simples
    { id: 'simply-supported', name: 'Biarticulada', desc: '6m, q=-10 kN/m' },
    { id: 'cantilever', name: 'Ménsula distribuida', desc: '5m, q=-10 kN/m' },
    { id: 'cantilever-point', name: 'Ménsula puntual', desc: '3m, P=-15 kN en extremo' },
    { id: 'point-loads', name: 'Cargas puntuales', desc: '8m, 2 cargas en barra + lateral' },
    // Vigas multi-tramo y condiciones especiales
    { id: 'gerber-beam', name: 'Viga Gerber', desc: '2 tramos, articulación interna' },
    { id: 'continuous-beam', name: 'Viga continua', desc: '3 tramos, 4 apoyos' },
    { id: 'spring-support', name: 'Apoyo elástico', desc: 'Resorte ky=5000 kN/m' },
    { id: 'settlement', name: 'Asentamiento', desc: 'Viga con asent. 10mm' },
    { id: 'thermal', name: 'Carga térmica', desc: 'Pórtico con ΔT=30°C' },
    // Reticulados
    { id: 'truss', name: 'Reticulado Pratt', desc: '12m, 3m altura' },
    { id: 'warren-truss', name: 'Reticulado Warren', desc: '12m, diagonales alternadas' },
    { id: 'howe-truss', name: 'Reticulado Howe', desc: '16m, diags hacia centro' },
    // Arcos y pórticos
    { id: 'three-hinge-arch', name: 'Arco triarticulado', desc: '10m luz, 4m flecha' },
    { id: 'portal-frame', name: 'Pórtico simple', desc: '6m×4m, carga lateral + distribuida' },
    { id: 'two-story-frame', name: 'Pórtico 2 pisos', desc: '6m×7m, viento + gravedad' },
    // Puentes y envolventes
    { id: 'bridge-moving-load', name: 'Puente — tren de carga', desc: 'Viga continua 14m, envolvente móvil' },
    // Edificios con combinaciones CIRSOC
    { id: 'frame-cirsoc-dl', name: 'Pórtico CIRSOC (D+L)', desc: 'Combinaciones 1.4D, 1.2D+1.6L' },
    { id: 'building-3story-dlw', name: 'Edificio 3 pisos (D+L+W)', desc: 'Combos CIRSOC con viento' },
    { id: 'frame-seismic', name: 'Pórtico sísmico (D+L+E)', desc: 'Combos CIRSOC con sismo' },
  ] as const;

  // Unified 3D examples — built-in + templates, ordered by ascending complexity
  const examples3D: { id: string; name: string; desc: string; generate?: (s: typeof modelStore) => void }[] = [
    { id: '3d-cantilever-load', name: 'Ménsula biaxial', desc: 'Fx + Fy + Fz en extremo' },
    { id: '3d-torsion-beam', name: 'Viga con torsión', desc: 'Carga excéntrica genera Mx' },
    { id: '', name: 'Arco Articulado 3D', desc: 'Arco parabólico con articulaciones en cuartos de luz', generate: (s) => TEMPLATE_CATALOG_3D.find(t => t.id === 'hingedArch3D')!.generate(s) },
    { id: '3d-portal-frame', name: 'Pórtico 3D', desc: '2 pórticos paralelos con vigas transversales' },
    { id: '', name: 'Emparrillado', desc: 'Grilla de vigas en plano XZ con apoyos en esquinas', generate: (s) => TEMPLATE_CATALOG_3D.find(t => t.id === 'gridBeams')!.generate(s) },
    { id: '3d-space-truss', name: 'Reticulado espacial', desc: 'Estructura triangulada en 3D' },
    { id: '', name: 'Pórtico Espacial', desc: '2×2 vanos, 2 pisos con vigas y columnas', generate: (s) => TEMPLATE_CATALOG_3D.find(t => t.id === 'spaceFrame3D')!.generate(s) },
    { id: '', name: 'Torre 2 pisos', desc: 'Torre arriostrada de 6m, 4 columnas', generate: (s) => TEMPLATE_CATALOG_3D.find(t => t.id === 'tower3D_2')!.generate(s) },
    { id: '', name: 'Torre 4 pisos', desc: 'Torre arriostrada de 12m con estrechamiento', generate: (s) => TEMPLATE_CATALOG_3D.find(t => t.id === 'tower3D_4')!.generate(s) },
    { id: '3d-nave-industrial', name: 'Nave Industrial', desc: 'Galpón reticulado con grúa puente y contravientos' },
    { id: '3d-building', name: 'Edificio 5 Pisos', desc: 'D+L+W+E con combinaciones CIRSOC 201' },
  ];

  function handleDuplicateAxis() {
    // Collect all selected nodes + nodes from selected elements
    const nodeIds = new Set<number>(uiStore.selectedNodes);
    for (const elemId of uiStore.selectedElements) {
      const elem = modelStore.elements.get(elemId);
      if (elem) {
        nodeIds.add(elem.nodeI);
        nodeIds.add(elem.nodeJ);
      }
    }
    if (nodeIds.size === 0) {
      uiStore.toast('Seleccioná nodos o elementos primero', 'error');
      return;
    }

    const axis = uiStore.duplicateAxis;
    const dist = uiStore.duplicateDistance;

    // Offset vector
    const ox = axis === 'x' ? dist : 0;
    const oy = axis === 'y' ? dist : 0;
    const oz = axis === 'z' ? dist : 0;

    const idMap = new Map<number, number>(); // origNodeId → newNodeId
    const newElements: number[] = [];

    historyStore.pushState();

    modelStore.batch(() => {
      // 1. Create duplicated nodes
      for (const nid of nodeIds) {
        const n = modelStore.getNode(nid);
        if (!n) continue;
        const newId = modelStore.addNode(n.x + ox, n.y + oy, (n.z ?? 0) + oz);
        idMap.set(nid, newId);
      }

      // 2. Duplicate elements between copied nodes
      for (const elem of modelStore.elements.values()) {
        if (nodeIds.has(elem.nodeI) && nodeIds.has(elem.nodeJ)) {
          const ni = idMap.get(elem.nodeI);
          const nj = idMap.get(elem.nodeJ);
          if (ni == null || nj == null) continue;
          const newElemId = modelStore.addElement(ni, nj, elem.type);
          const matId = modelStore.materials.has(elem.materialId) ? elem.materialId : 1;
          const secId = modelStore.sections.has(elem.sectionId) ? elem.sectionId : 1;
          modelStore.updateElementMaterial(newElemId, matId);
          modelStore.updateElementSection(newElemId, secId);
          if (elem.hingeStart) modelStore.toggleHinge(newElemId, 'start');
          if (elem.hingeEnd) modelStore.toggleHinge(newElemId, 'end');
          newElements.push(newElemId);
        }
      }

      // 3. Duplicate supports on copied nodes
      for (const sup of modelStore.supports.values()) {
        if (nodeIds.has(sup.nodeId)) {
          const newNodeId = idMap.get(sup.nodeId);
          if (newNodeId != null) {
            modelStore.addSupport(newNodeId, sup.type);
          }
        }
      }

      // 4. Duplicate loads on copied nodes/elements
      // Build element mapping: original elemId → new elemId
      const elemMap = new Map<number, number>();
      for (const elem of modelStore.elements.values()) {
        if (nodeIds.has(elem.nodeI) && nodeIds.has(elem.nodeJ)) {
          const ni = idMap.get(elem.nodeI);
          const nj = idMap.get(elem.nodeJ);
          if (ni != null && nj != null) {
            for (const newElemId of newElements) {
              const newElem = modelStore.elements.get(newElemId);
              if (newElem && newElem.nodeI === ni && newElem.nodeJ === nj) {
                elemMap.set(elem.id, newElemId);
                break;
              }
            }
          }
        }
      }

      for (const loadEntry of modelStore.loads) {
        const d = loadEntry.data as any;
        if (loadEntry.type === 'nodal3d' && nodeIds.has(d.nodeId)) {
          const newNodeId = idMap.get(d.nodeId);
          if (newNodeId != null) {
            modelStore.addNodalLoad3D(newNodeId, d.fx, d.fy, d.fz, d.mx, d.my, d.mz, d.caseId);
          }
        } else if (loadEntry.type === 'nodal' && nodeIds.has(d.nodeId)) {
          const newNodeId = idMap.get(d.nodeId);
          if (newNodeId != null) {
            modelStore.addNodalLoad(newNodeId, d.fx, d.fy, d.mz, d.caseId);
          }
        } else if (loadEntry.type === 'distributed3d' && elemMap.has(d.elementId)) {
          const newElemId = elemMap.get(d.elementId)!;
          modelStore.addDistributedLoad3D(newElemId, d.qYI, d.qYJ, d.qZI, d.qZJ, d.a, d.b, d.caseId);
        } else if (loadEntry.type === 'distributed' && elemMap.has(d.elementId)) {
          const newElemId = elemMap.get(d.elementId)!;
          modelStore.addDistributedLoad(newElemId, d.qI, d.qJ, d.angle, d.isGlobal, d.caseId, d.a, d.b);
        } else if (loadEntry.type === 'pointOnElement' && elemMap.has(d.elementId)) {
          const newElemId = elemMap.get(d.elementId)!;
          modelStore.addPointLoadOnElement(newElemId, d.a, d.p, { px: d.px, mz: d.mz, angle: d.angle, isGlobal: d.isGlobal, caseId: d.caseId });
        } else if (loadEntry.type === 'thermal' && elemMap.has(d.elementId)) {
          const newElemId = elemMap.get(d.elementId)!;
          modelStore.addThermalLoad(newElemId, d.dtUniform, d.dtGradient, d.caseId);
        }
      }
    });

    // Select new items
    uiStore.setSelection(new Set(idMap.values()), new Set(newElements));

    resultsStore.clear();
    uiStore.toast(`Duplicado en ${axis.toUpperCase()} +${dist}m`, 'success');
  }
</script>

{#if uiStore.analysisMode === '3d'}
<!-- 3D mode: wrapper covers both example sections for tour spotlight -->
<div data-tour="examples-section" style="display:flex;flex-direction:column;gap:1rem">
<div class="toolbar-section">
  <button class="section-toggle" onclick={() => showExamples = !showExamples}>
    {showExamples ? '▾' : '▸'} Ejemplos 2D
  </button>
  {#if showExamples}
    <div class="examples-list">
      {#each examples.filter(ex => !['truss','warren-truss','howe-truss'].includes(ex.id)) as ex}
        <button class="example-item" onclick={() => { modelStore.loadExample(ex.id); resultsStore.clear(); resultsStore.clear3D(); if (uiStore.isMobile) uiStore.leftDrawerOpen = false; setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 50); }}>
          <span class="example-name">{ex.name}</span>
          <span class="example-desc">{ex.desc}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<div class="toolbar-section">
  <button class="section-toggle" onclick={() => showExamples3D = !showExamples3D}>
    {showExamples3D ? '▾' : '▸'} Ejemplos 3D
  </button>
  {#if showExamples3D}
    <div class="examples-list">
      {#each examples3D as ex}
        <button class="example-item" onclick={() => { if (ex.generate) { ex.generate(modelStore); } else { modelStore.loadExample(ex.id); } resultsStore.clear(); resultsStore.clear3D(); if (uiStore.isMobile) uiStore.leftDrawerOpen = false; setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 50); }}>
          <span class="example-name">{ex.name}</span>
          <span class="example-desc">{ex.desc}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<!-- Duplicate-on-axis tool: hidden for now, pending proper UX design.
     Function handleDuplicateAxis() and uiStore.duplicateAxis/duplicateDistance kept for future use. -->
</div>

{:else}
<!-- 2D mode: single examples section -->
<div class="toolbar-section" data-tour="examples-section">
  <button class="section-toggle" onclick={() => showExamples = !showExamples}>
    {showExamples ? '▾' : '▸'} Ejemplos
  </button>
  {#if showExamples}
    <div class="examples-list">
      {#each examples as ex}
        <button class="example-item" onclick={() => { modelStore.loadExample(ex.id); resultsStore.clear(); resultsStore.clear3D(); if (uiStore.isMobile) uiStore.leftDrawerOpen = false; setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 50); }}>
          <span class="example-name">{ex.name}</span>
          <span class="example-desc">{ex.desc}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
{/if}

<style>
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

  .section-toggle {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: none;
    border: 1px solid #333;
    border-radius: 4px;
    color: #aaa;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.2s;
  }

  .section-toggle:hover {
    background: #1a1a2e;
    color: #ccc;
    border-color: #555;
  }

  .examples-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    padding: 2px;
  }

  .example-item {
    display: flex;
    flex-direction: column;
    padding: 0.35rem 0.5rem;
    background: none;
    border: none;
    border-radius: 3px;
    color: #ccc;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .example-item:hover {
    background: #1a4a7a;
    color: white;
  }

  .example-name {
    font-size: 0.8rem;
    font-weight: 500;
  }

  .example-desc {
    font-size: 0.65rem;
    color: #777;
  }

  .example-item:hover .example-desc {
    color: #aaa;
  }

  .input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .input-group input {
    width: 70px;
    padding: 0.25rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    cursor: pointer;
  }

  .input-group select {
    flex: 1;
    min-width: 100px;
    padding: 0.25rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    cursor: pointer;
  }

  input[type="checkbox"] {
    accent-color: #e94560;
  }

  .file-btn {
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

  .file-btn:hover:not(:disabled) {
    background: #1a4a7a;
    color: white;
  }

  .file-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
