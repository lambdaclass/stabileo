<script lang="ts">
  import { uiStore, modelStore, resultsStore } from '../lib/store';
  import { toDisplay, unitLabel } from '../lib/utils/units';

  const toolNames: Record<string, string> = {
    select: 'Seleccionar',
    node: 'Nodo',
    element: 'Elemento',
    support: 'Apoyo',
    load: 'Carga',
    pan: 'Mover vista',
    influenceLine: 'Influencia',
  };

  function getSelectionText(): string {
    const nNodes = uiStore.selectedNodes.size;
    const nElems = uiStore.selectedElements.size;
    if (nNodes === 0 && nElems === 0) return '—';
    const parts: string[] = [];
    if (nNodes > 0) parts.push(`${nNodes} nodo${nNodes > 1 ? 's' : ''}`);
    if (nElems > 0) parts.push(`${nElems} elem${nElems > 1 ? 's' : ''}`);
    return parts.join(', ');
  }

  function getModelSummary(): string {
    const n = modelStore.nodes.size;
    const e = modelStore.elements.size;
    const s = modelStore.supports.size;
    const parts: string[] = [];
    if (n > 0) parts.push(`${n} nodo${n > 1 ? 's' : ''}`);
    if (e > 0) parts.push(`${e} barra${e > 1 ? 's' : ''}`);
    if (s > 0) parts.push(`${s} apoyo${s > 1 ? 's' : ''}`);
    return parts.length > 0 ? parts.join(', ') : 'vacío';
  }

  const hint = $derived.by(() => {
    const n = modelStore.nodes.size;
    const e = modelStore.elements.size;
    const s = modelStore.supports.size;
    const l = modelStore.model.loads.length;
    if (resultsStore.results) return { text: 'Resuelto', color: '#4caf50' };
    if (n === 0) return { text: 'Empezá creando nodos (N)', color: '#888' };
    if (e === 0) return { text: 'Conectá los nodos con barras (E)', color: '#888' };
    if (s === 0) return { text: 'Agregá apoyos (S)', color: '#888' };
    if (l === 0) return { text: 'Aplicá cargas (L)', color: '#888' };
    return { text: 'Listo para calcular (F5)', color: '#f0a500' };
  });
</script>

<div class="status-bar">
  <div class="status-item">
    <span class="status-label">Herramienta:</span>
    <span class="status-value">{toolNames[uiStore.currentTool] ?? uiStore.currentTool}</span>
  </div>
  <div class="status-item">
    <span class="status-label">Pos:</span>
    <span class="status-value">
      ({toDisplay(uiStore.worldX, 'length', uiStore.unitSystem).toFixed(2)}, {toDisplay(uiStore.worldY, 'length', uiStore.unitSystem).toFixed(2)}) {unitLabel('length', uiStore.unitSystem)}
    </span>
  </div>
  {#if uiStore.analysisMode !== '3d'}
    <div class="status-item">
      <span class="status-label">Zoom:</span>
      <span class="status-value">{Math.round(uiStore.zoom)} px/m</span>
    </div>
  {/if}
  <div class="status-item">
    <span class="status-label">Modelo:</span>
    <span class="status-value">{getModelSummary()}</span>
  </div>
  <div class="status-item">
    <span class="status-label">Selección:</span>
    <span class="status-value">{getSelectionText()}</span>
  </div>
  {#if uiStore.snapToGrid}
    <div class="status-item">
      <span class="status-label">Grilla:</span>
      <span class="status-value">{toDisplay(uiStore.gridSize, 'length', uiStore.unitSystem).toFixed(2)} {unitLabel('length', uiStore.unitSystem)}</span>
    </div>
  {/if}
  <div class="status-item">
    <span class="status-hint" style="color: {hint.color}">{hint.text}</span>
  </div>
</div>

<style>
  .status-bar {
    display: flex;
    gap: 1.5rem;
    padding: 0.35rem 1rem;
    font-size: 0.75rem;
  }

  .status-item {
    display: flex;
    gap: 0.35rem;
    white-space: nowrap;
  }

  .status-label {
    color: #888;
  }

  .status-value {
    color: #4ecdc4;
    font-family: monospace;
  }

  .status-hint {
    font-weight: 600;
    font-style: italic;
  }
</style>
