<script lang="ts">
  import { uiStore, modelStore, resultsStore, historyStore, tabManager } from '../../lib/store';
  import { getTemplateCatalog3D } from '../../lib/templates/generators';
  import { t } from '../../lib/i18n';

  let showExamples = $state(false);
  let showExamples3D = $state(false);

  const examples = [
    // Vigas simples
    { id: 'simply-supported', nameKey: 'ex.simply-supported', descKey: 'ex.simply-supported.desc' },
    { id: 'cantilever', nameKey: 'ex.cantilever', descKey: 'ex.cantilever.desc' },
    { id: 'cantilever-point', nameKey: 'ex.cantilever-point', descKey: 'ex.cantilever-point.desc' },
    { id: 'point-loads', nameKey: 'ex.point-loads', descKey: 'ex.point-loads.desc' },
    // Vigas multi-tramo y condiciones especiales
    { id: 'gerber-beam', nameKey: 'ex.gerber-beam', descKey: 'ex.gerber-beam.desc' },
    { id: 'continuous-beam', nameKey: 'ex.continuous-beam', descKey: 'ex.continuous-beam.desc' },
    { id: 'spring-support', nameKey: 'ex.spring-support', descKey: 'ex.spring-support.desc' },
    { id: 'settlement', nameKey: 'ex.settlement', descKey: 'ex.settlement.desc' },
    { id: 'thermal', nameKey: 'ex.thermal', descKey: 'ex.thermal.desc' },
    // Reticulados
    { id: 'truss', nameKey: 'ex.truss', descKey: 'ex.truss.desc' },
    { id: 'warren-truss', nameKey: 'ex.warren-truss', descKey: 'ex.warren-truss.desc' },
    { id: 'howe-truss', nameKey: 'ex.howe-truss', descKey: 'ex.howe-truss.desc' },
    // Arcos y pórticos
    { id: 'three-hinge-arch', nameKey: 'ex.three-hinge-arch', descKey: 'ex.three-hinge-arch.desc' },
    { id: 'portal-frame', nameKey: 'ex.portal-frame', descKey: 'ex.portal-frame.desc' },
    { id: 'two-story-frame', nameKey: 'ex.two-story-frame', descKey: 'ex.two-story-frame.desc' },
    // Puentes y envolventes
    { id: 'bridge-moving-load', nameKey: 'ex.bridge-moving-load', descKey: 'ex.bridge-moving-load.desc' },
    // Edificios con combinaciones CIRSOC
    { id: 'frame-cirsoc-dl', nameKey: 'ex.frame-cirsoc-dl', descKey: 'ex.frame-cirsoc-dl.desc' },
    { id: 'building-3story-dlw', nameKey: 'ex.building-3story-dlw', descKey: 'ex.building-3story-dlw.desc' },
    { id: 'frame-seismic', nameKey: 'ex.frame-seismic', descKey: 'ex.frame-seismic.desc' },
  ] as const;

  // Unified 3D examples — built-in + templates, ordered by ascending complexity
  const examples3D: { id: string; nameKey: string; descKey: string; generate?: (s: typeof modelStore) => void }[] = [
    { id: '3d-cantilever-load', nameKey: 'ex.3d-cantilever-load', descKey: 'ex.3d-cantilever-load.desc' },
    { id: '3d-torsion-beam', nameKey: 'ex.3d-torsion-beam', descKey: 'ex.3d-torsion-beam.desc' },
    { id: '', nameKey: 'ex.hingedArch3D', descKey: 'ex.hingedArch3D.desc', generate: (s) => getTemplateCatalog3D().find(tmpl => tmpl.id === 'hingedArch3D')!.generate(s) },
    { id: '3d-portal-frame', nameKey: 'ex.3d-portal-frame', descKey: 'ex.3d-portal-frame.desc' },
    { id: '', nameKey: 'ex.gridBeams', descKey: 'ex.gridBeams.desc', generate: (s) => getTemplateCatalog3D().find(tmpl => tmpl.id === 'gridBeams')!.generate(s) },
    { id: '3d-space-truss', nameKey: 'ex.3d-space-truss', descKey: 'ex.3d-space-truss.desc' },
    { id: '', nameKey: 'ex.spaceFrame3D', descKey: 'ex.spaceFrame3D.desc', generate: (s) => getTemplateCatalog3D().find(tmpl => tmpl.id === 'spaceFrame3D')!.generate(s) },
    { id: '', nameKey: 'ex.tower3D_2', descKey: 'ex.tower3D_2.desc', generate: (s) => getTemplateCatalog3D().find(tmpl => tmpl.id === 'tower3D_2')!.generate(s) },
    { id: '', nameKey: 'ex.tower3D_4', descKey: 'ex.tower3D_4.desc', generate: (s) => getTemplateCatalog3D().find(tmpl => tmpl.id === 'tower3D_4')!.generate(s) },
    { id: '3d-nave-industrial', nameKey: 'ex.3d-nave-industrial', descKey: 'ex.3d-nave-industrial.desc' },
  ];

  // PRO-only examples — shown only in Pro mode
  const examplesPro: { id: string; nameKey: string; descKey: string }[] = [
    { id: '3d-building', nameKey: 'ex.3d-building', descKey: 'ex.3d-building.desc' },
    { id: 'pro-edificio-7p', nameKey: 'ex.pro-edificio-7p', descKey: 'ex.pro-edificio-7p.desc' },
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
      uiStore.toast(t('examples.selectFirst'), 'error');
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
    uiStore.toast(`${t('examples.duplicatedIn')} ${axis.toUpperCase()} +${dist}m`, 'success');
  }
</script>

{#if uiStore.analysisMode === 'pro'}
<!-- PRO mode: only PRO examples -->
<div class="toolbar-section" data-tour="examples-section">
  <button class="section-toggle" onclick={() => showExamples = !showExamples}>
    {showExamples ? '▾' : '▸'} {t('examples.titlePro')}
  </button>
  {#if showExamples}
    <div class="examples-list">
      {#each examplesPro as ex}
        <button class="example-item" onclick={() => { modelStore.loadExample(ex.id); resultsStore.clear(); resultsStore.clear3D(); if (uiStore.isMobile) uiStore.leftDrawerOpen = false; setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 50); }}>
          <span class="example-name">{t(ex.nameKey)}</span>
          <span class="example-desc">{t(ex.descKey)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

{:else if uiStore.analysisMode === '3d'}
<!-- 3D mode: 2D + 3D example sections -->
<div data-tour="examples-section" style="display:flex;flex-direction:column;gap:1rem">
<div class="toolbar-section">
  <button class="section-toggle" onclick={() => showExamples = !showExamples}>
    {showExamples ? '▾' : '▸'} {t('examples.title2d')}
  </button>
  {#if showExamples}
    <div class="examples-list">
      {#each examples.filter(ex => !['truss','warren-truss','howe-truss'].includes(ex.id)) as ex}
        <button class="example-item" onclick={() => { modelStore.loadExample(ex.id); resultsStore.clear(); resultsStore.clear3D(); if (uiStore.isMobile) uiStore.leftDrawerOpen = false; setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 50); }}>
          <span class="example-name">{t(ex.nameKey)}</span>
          <span class="example-desc">{t(ex.descKey)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<div class="toolbar-section">
  <button class="section-toggle" onclick={() => showExamples3D = !showExamples3D}>
    {showExamples3D ? '▾' : '▸'} {t('examples.title3d')}
  </button>
  {#if showExamples3D}
    <div class="examples-list">
      {#each examples3D as ex}
        <button class="example-item" onclick={() => { if (ex.generate) { ex.generate(modelStore); } else { modelStore.loadExample(ex.id); } resultsStore.clear(); resultsStore.clear3D(); if (uiStore.isMobile) uiStore.leftDrawerOpen = false; setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 50); }}>
          <span class="example-name">{t(ex.nameKey)}</span>
          <span class="example-desc">{t(ex.descKey)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
</div>

{:else if uiStore.analysisMode === 'edu'}
<!-- EDU mode: same 2D examples as basic -->
<div class="toolbar-section" data-tour="examples-section">
  <button class="section-toggle" onclick={() => showExamples = !showExamples}>
    {showExamples ? '▾' : '▸'} {t('examples.title')}
  </button>
  {#if showExamples}
    <div class="examples-list">
      {#each examples as ex}
        <button class="example-item" onclick={() => { modelStore.loadExample(ex.id); resultsStore.clear(); resultsStore.clear3D(); if (uiStore.isMobile) uiStore.leftDrawerOpen = false; setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 50); }}>
          <span class="example-name">{t(ex.nameKey)}</span>
          <span class="example-desc">{t(ex.descKey)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

{:else}
<!-- 2D mode: single examples section -->
<div class="toolbar-section" data-tour="examples-section">
  <button class="section-toggle" onclick={() => showExamples = !showExamples}>
    {showExamples ? '▾' : '▸'} {t('examples.title')}
  </button>
  {#if showExamples}
    <div class="examples-list">
      {#each examples as ex}
        <button class="example-item" onclick={() => { modelStore.loadExample(ex.id); resultsStore.clear(); resultsStore.clear3D(); if (uiStore.isMobile) uiStore.leftDrawerOpen = false; setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 50); }}>
          <span class="example-name">{t(ex.nameKey)}</span>
          <span class="example-desc">{t(ex.descKey)}</span>
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
