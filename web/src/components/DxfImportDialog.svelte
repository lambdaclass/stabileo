<script lang="ts">
  import { modelStore, uiStore, resultsStore, historyStore } from '../lib/store';
  import { parseDxf } from '../lib/dxf/parser';
  import { mapDxfToModel, parseSectionText, parseMaterialText } from '../lib/dxf/mapper';
  import { searchProfiles, profileToSection } from '../lib/data/steel-profiles';
  import type { DxfParseResult, DxfMappingResult, DxfUnit } from '../lib/dxf/types';
  import { t } from '../lib/i18n';

  let { open = false, file = null as File | null, onclose = () => {} } = $props();

  let parseResult = $state<DxfParseResult | null>(null);
  let mappingResult = $state<DxfMappingResult | null>(null);
  let unit = $state<DxfUnit>('m');
  let snapTolerance = $state(0.01);
  let error = $state<string | null>(null);
  let fileName = $state('');

  $effect(() => {
    if (!file) {
      parseResult = null;
      mappingResult = null;
      error = null;
      fileName = '';
      return;
    }
    fileName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        parseResult = parseDxf(text);
        remapModel();
      } catch (e: any) {
        error = e.message || t('dxf.parseError');
        parseResult = null;
        mappingResult = null;
      }
    };
    reader.onerror = () => {
      error = t('dxf.readError');
    };
    reader.readAsText(file);
  });

  function remapModel() {
    if (!parseResult) return;
    try {
      mappingResult = mapDxfToModel(parseResult, { unit, snapTolerance });
      error = null;
    } catch (e: any) {
      error = e.message || t('dxf.mapError');
      mappingResult = null;
    }
  }

  function handleUnitChange(e: Event) {
    unit = (e.currentTarget as HTMLSelectElement).value as DxfUnit;
    remapModel();
  }

  function handleToleranceChange(e: Event) {
    const val = parseFloat((e.currentTarget as HTMLInputElement).value);
    if (!isNaN(val) && val > 0) {
      snapTolerance = val;
      remapModel();
    }
  }

  function handleImport() {
    if (!mappingResult) return;
    const m = mappingResult;

    historyStore.pushState();
    modelStore.clear();
    resultsStore.clear();

    // Map temp IDs to real node IDs
    const idMap = new Map<number, number>();
    for (const n of m.nodes) {
      const realId = modelStore.addNode(n.x, n.y);
      idMap.set(n.id, realId);
    }

    // Material
    let matId = 1; // default
    if (m.materialName) {
      const mat = parseMaterialText(m.materialName);
      if (mat) {
        matId = modelStore.addMaterial(mat);
      }
    }

    // Section
    let secId = 1; // default
    if (m.sectionName) {
      const sec = parseSectionText(m.sectionName);
      if (sec) {
        secId = modelStore.addSection(sec);
      }
    }

    // Elements
    const elemIds: number[] = [];
    for (const e of m.elements) {
      const ni = idMap.get(e.nodeI)!;
      const nj = idMap.get(e.nodeJ)!;
      const eid = modelStore.addElement(ni, nj, e.type);
      if (matId !== 1) modelStore.updateElementMaterial(eid, matId);
      if (secId !== 1) modelStore.updateElementSection(eid, secId);
      elemIds.push(eid);
    }

    // Supports
    for (const s of m.supports) {
      const nodeId = idMap.get(s.nodeId);
      if (nodeId != null) modelStore.addSupport(nodeId, s.type);
    }

    // Nodal loads
    for (const l of m.nodalLoads) {
      const nodeId = idMap.get(l.nodeId);
      if (nodeId != null) modelStore.addNodalLoad(nodeId, l.fx, l.fy, l.mz);
    }

    // Distributed loads
    for (const l of m.distributedLoads) {
      const elemId = elemIds[l.elementIndex];
      if (elemId != null) modelStore.addDistributedLoad(elemId, l.q);
    }

    // Point loads on elements
    for (const l of m.pointLoads) {
      const elemId = elemIds[l.elementIndex];
      if (elemId != null) modelStore.addPointLoadOnElement(elemId, l.a, l.p);
    }

    // Hinges
    for (const h of m.hinges) {
      const elemId = elemIds[h.elementIndex];
      if (elemId != null) modelStore.toggleHinge(elemId, h.end);
    }

    uiStore.toast(t('dxf.imported').replace('{n}', String(m.nodes.length)).replace('{e}', String(m.elements.length)), 'success');

    // Zoom to fit after a tick
    setTimeout(() => {
      const canvas = document.querySelector('.viewport-container canvas') as HTMLCanvasElement | null;
      if (canvas && modelStore.nodes.size > 0) {
        uiStore.zoomToFit(modelStore.nodes.values(), canvas.width, canvas.height);
      }
    }, 50);

    onclose();
  }

  const KNOWN_LAYERS = new Set([
    'BARRAS', 'ELEMENTOS', 'ELEMENTS', 'BARS',
    'TRUSS', 'RETICULADO', 'RETICULADOS',
    'APOYOS', 'CARGAS', 'SECCIONES', 'MATERIALES', 'ARTICULACIONES',
  ]);
</script>

{#if open}
  <div class="dxf-overlay">
    <div class="dxf-backdrop" onclick={onclose}></div>
    <div class="dxf-dialog">
      <div class="dxf-header">
        <h2>{t('dxf.title')}</h2>
        <button class="dxf-close" onclick={onclose}>&#10005;</button>
      </div>

      {#if error}
        <div class="dxf-error">{error}</div>
      {/if}

      {#if fileName}
        <div class="dxf-filename">{fileName}</div>
      {/if}

      <div class="dxf-body">
        <div class="dxf-options">
          <div class="dxf-field">
            <label>{t('dxf.units')}</label>
            <select value={unit} onchange={handleUnitChange}>
              <option value="m">{t('dxf.meters')}</option>
              <option value="cm">{t('dxf.centimeters')}</option>
              <option value="mm">{t('dxf.millimeters')}</option>
            </select>
          </div>
          <div class="dxf-field">
            <label>{t('dxf.snapTolerance')}</label>
            <input type="number" step="0.001" min="0.001" value={snapTolerance} onchange={handleToleranceChange} />
          </div>
        </div>

        {#if parseResult}
          <div class="dxf-preview">
            <h3>{t('dxf.layersDetected')}</h3>
            <div class="dxf-layers">
              {#each parseResult.layers as layer}
                <span class="dxf-layer" class:known={KNOWN_LAYERS.has(layer.toUpperCase())}>
                  {KNOWN_LAYERS.has(layer.toUpperCase()) ? '&#10003;' : '&#8226;'} {layer}
                </span>
              {/each}
              {#if parseResult.layers.length === 0}
                <span class="dxf-muted">{t('dxf.noLayers')}</span>
              {/if}
            </div>

            <h3>{t('dxf.parsedEntities')}</h3>
            <div class="dxf-stats">
              <span>{parseResult.lines.length} {t('dxf.lines')}</span>
              <span>{parseResult.texts.length} {t('dxf.texts')}</span>
              <span>{parseResult.points.length} {t('dxf.points')}</span>
              <span>{parseResult.inserts.length} {t('dxf.blocks')}</span>
              <span>{parseResult.circles.length} {t('dxf.circles')}</span>
            </div>
          </div>
        {/if}

        {#if mappingResult}
          <div class="dxf-preview">
            <h3>{t('dxf.resultModel')}</h3>
            <div class="dxf-stats dxf-stats-main">
              <span><strong>{mappingResult.nodes.length}</strong> {t('dxf.nodes')}</span>
              <span><strong>{mappingResult.elements.length}</strong> {t('dxf.elements')}</span>
              <span><strong>{mappingResult.supports.length}</strong> {t('dxf.supports')}</span>
              <span><strong>{mappingResult.nodalLoads.length + mappingResult.distributedLoads.length + mappingResult.pointLoads.length}</strong> {t('dxf.loads')}</span>
              <span><strong>{mappingResult.hinges.length}</strong> {t('dxf.hinges')}</span>
            </div>
            {#if mappingResult.sectionName}
              <div class="dxf-info">{t('dxf.section')}: {mappingResult.sectionName}</div>
            {/if}
            {#if mappingResult.materialName}
              <div class="dxf-info">{t('dxf.material')}: {mappingResult.materialName}</div>
            {/if}

            {#if mappingResult.warnings.length > 0}
              <h3>{t('dxf.warnings')}</h3>
              <div class="dxf-warnings">
                {#each mappingResult.warnings as w}
                  <div class="dxf-warning">{w}</div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="dxf-footer">
        <button
          class="btn btn-primary"
          onclick={handleImport}
          disabled={!mappingResult || mappingResult.elements.length === 0}
        >
          {t('dxf.import')}
        </button>
        <button class="btn btn-secondary" onclick={onclose}>{t('dxf.cancel')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dxf-overlay {
    position: fixed;
    inset: 0;
    z-index: 900;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dxf-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
  }

  .dxf-dialog {
    position: relative;
    background: #16213e;
    border: 1px solid #1a4a7a;
    border-radius: 8px;
    width: 480px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .dxf-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #1a4a7a;
  }

  .dxf-header h2 {
    font-size: 1rem;
    font-weight: 600;
    color: #eee;
    margin: 0;
  }

  .dxf-close {
    background: none;
    border: none;
    color: #888;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem;
  }

  .dxf-close:hover { color: #fff; }

  .dxf-error {
    background: rgba(233, 69, 96, 0.15);
    border: 1px solid #e94560;
    color: #ff8a9e;
    padding: 0.5rem 1.25rem;
    font-size: 0.8rem;
  }

  .dxf-filename {
    padding: 0.5rem 1.25rem;
    font-size: 0.8rem;
    color: #4ecdc4;
    font-family: monospace;
  }

  .dxf-body {
    padding: 0.75rem 1.25rem;
    overflow-y: auto;
    flex: 1;
  }

  .dxf-options {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .dxf-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .dxf-field label {
    font-size: 0.75rem;
    color: #888;
  }

  .dxf-field select,
  .dxf-field input {
    padding: 0.35rem 0.5rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    font-size: 0.85rem;
  }

  .dxf-preview {
    margin-bottom: 0.5rem;
  }

  .dxf-preview h3 {
    font-size: 0.7rem;
    text-transform: uppercase;
    color: #888;
    letter-spacing: 0.05em;
    margin: 0.75rem 0 0.35rem 0;
  }

  .dxf-layers {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .dxf-layer {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    background: #0f3460;
    border-radius: 3px;
    color: #888;
  }

  .dxf-layer.known {
    color: #4ecdc4;
    background: rgba(78, 205, 196, 0.1);
  }

  .dxf-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #aaa;
  }

  .dxf-stats-main {
    font-size: 0.85rem;
  }

  .dxf-stats-main strong {
    color: #4ecdc4;
  }

  .dxf-info {
    font-size: 0.8rem;
    color: #aaa;
    margin-top: 0.25rem;
  }

  .dxf-warnings {
    max-height: 100px;
    overflow-y: auto;
    border: 1px solid #554400;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    background: rgba(240, 165, 0, 0.05);
  }

  .dxf-warning {
    font-size: 0.75rem;
    color: #f0a500;
    padding: 0.1rem 0;
  }

  .dxf-muted {
    font-size: 0.75rem;
    color: #666;
    font-style: italic;
  }

  .dxf-footer {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid #1a4a7a;
    justify-content: flex-end;
  }

  .btn {
    padding: 0.4rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .btn-primary {
    background: #e94560;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #ff6b6b;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #0f3460;
    color: #aaa;
    border: 1px solid #1a4a7a;
  }

  .btn-secondary:hover {
    background: #1a4a7a;
    color: white;
  }
</style>
