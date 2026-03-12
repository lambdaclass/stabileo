<script lang="ts">
  import { uiStore, modelStore, resultsStore, historyStore } from '../lib/store';
  import { t } from '../lib/i18n';

  let subdivCount = $state(2);

  function handleContextAction(action: string) {
    const ctx = uiStore.contextMenu;
    if (!ctx) return;
    uiStore.contextMenu = null;

    if (action === 'delete-support' && ctx.nodeId != null) {
      const sup = [...modelStore.supports.values()].find(s => s.nodeId === ctx.nodeId);
      if (sup) { modelStore.removeSupport(sup.id); resultsStore.clear(); }
    } else if (action === 'delete-node' && ctx.nodeId != null) {
      modelStore.removeNode(ctx.nodeId);
      resultsStore.clear();
    } else if (action === 'delete-element' && ctx.elementId != null) {
      modelStore.removeElement(ctx.elementId);
      resultsStore.clear();
    } else if (action === 'edit-node' && ctx.nodeId != null) {
      uiStore.editingNodeId = ctx.nodeId;
      uiStore.editScreenPos = { x: ctx.x, y: ctx.y };
    } else if (action === 'edit-element' && ctx.elementId != null) {
      uiStore.editingElementId = ctx.elementId;
      uiStore.editScreenPos = { x: ctx.x, y: ctx.y };
    } else if (action === 'add-support' && ctx.nodeId != null) {
      modelStore.addSupport(ctx.nodeId, uiStore.supportType);
    } else if (action === 'add-load' && ctx.nodeId != null) {
      modelStore.addNodalLoad(ctx.nodeId, 0, uiStore.loadValue);
    } else if (action === 'select-node' && ctx.nodeId != null) {
      uiStore.selectNode(ctx.nodeId);
    } else if (action === 'select-element' && ctx.elementId != null) {
      uiStore.selectElement(ctx.elementId);
    } else if (action === 'mirror-x') {
      modelStore.mirrorNodes(uiStore.selectedNodes, 'x');
      resultsStore.clear();
    } else if (action === 'mirror-y') {
      modelStore.mirrorNodes(uiStore.selectedNodes, 'y');
      resultsStore.clear();
    } else if (action === 'rotate-90') {
      modelStore.rotateNodes(uiStore.selectedNodes, 90);
      resultsStore.clear();
    } else if (action === 'rotate-neg90') {
      modelStore.rotateNodes(uiStore.selectedNodes, -90);
      resultsStore.clear();
    } else if (action === 'rotate-local-axes' && ctx.elementId != null) {
      modelStore.rotateElementLocalAxes(ctx.elementId, 90);
      resultsStore.clear();
    }
  }

  function doSubdivide() {
    const ctx = uiStore.contextMenu;
    if (!ctx?.elementId) return;
    const count = Math.max(2, Math.min(20, Math.round(subdivCount)));
    modelStore.subdivideElement(ctx.elementId, count);
    resultsStore.clear();
    uiStore.contextMenu = null;
  }

  function closeContextMenu() {
    uiStore.contextMenu = null;
  }
</script>

{#if uiStore.contextMenu}
  <div class="ctx-backdrop" onclick={closeContextMenu} oncontextmenu={(e) => { e.preventDefault(); closeContextMenu(); }}></div>
  <div class="ctx-menu" style="left: {uiStore.contextMenu.x}px; top: {uiStore.contextMenu.y}px">
    {#if uiStore.contextMenu.nodeId != null}
      {@const ctxNodeSup = [...modelStore.supports.values()].find(s => s.nodeId === uiStore.contextMenu!.nodeId)}
      <button class="ctx-item" onclick={() => handleContextAction('select-node')}>{t('ctx.selectNode')}</button>
      <button class="ctx-item" onclick={() => handleContextAction('edit-node')}>{t('ctx.editNode')}</button>
      <button class="ctx-item" onclick={() => handleContextAction('add-support')}>{t('ctx.addSupport')}</button>
      <button class="ctx-item" onclick={() => handleContextAction('add-load')}>{t('ctx.addLoad')}</button>
      {#if ctxNodeSup}
        <button class="ctx-item ctx-danger" onclick={() => handleContextAction('delete-support')}>{t('ctx.deleteSupport')}</button>
      {/if}
      <div class="ctx-divider"></div>
      <button class="ctx-item ctx-danger" onclick={() => handleContextAction('delete-node')}>{t('ctx.deleteNode')}</button>
    {:else if uiStore.contextMenu.elementId != null}
      <button class="ctx-item" onclick={() => handleContextAction('select-element')}>{t('ctx.selectElement')}</button>
      <button class="ctx-item" onclick={() => handleContextAction('edit-element')}>{t('ctx.editElement')}</button>
      <div class="ctx-divider"></div>
      <div class="ctx-subdivide-row">
        <span class="ctx-label">{t('ctx.subdivide')}</span>
        <input type="number" min="2" max="20" bind:value={subdivCount}
          class="ctx-subdiv-input"
          onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') doSubdivide(); }} />
        <button class="ctx-subdiv-btn" onclick={doSubdivide}>OK</button>
      </div>
      {#if uiStore.analysisMode === '3d'}
        <div class="ctx-divider"></div>
        <button class="ctx-item" onclick={() => handleContextAction('rotate-local-axes')}>{t('ctx.rotateBar90')}</button>
      {/if}
      <div class="ctx-divider"></div>
      <button class="ctx-item ctx-danger" onclick={() => handleContextAction('delete-element')}>{t('ctx.deleteElement')}</button>
    {:else}
      {#if uiStore.selectedNodes.size > 0}
        <span class="ctx-label">{t('ctx.transformSelection')} ({uiStore.selectedNodes.size})</span>
        <button class="ctx-item" onclick={() => handleContextAction('mirror-x')}>{t('ctx.mirrorX')}</button>
        <button class="ctx-item" onclick={() => handleContextAction('mirror-y')}>{t('ctx.mirrorY')}</button>
        <button class="ctx-item" onclick={() => handleContextAction('rotate-90')}>{t('ctx.rotate90cw')}</button>
        <button class="ctx-item" onclick={() => handleContextAction('rotate-neg90')}>{t('ctx.rotate90ccw')}</button>
      {:else}
        <button class="ctx-item" disabled>{t('ctx.noElements')}</button>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 900;
  }

  .ctx-menu {
    position: fixed;
    z-index: 901;
    background: #1a1a2e;
    border: 1px solid #0f3460;
    border-radius: 6px;
    padding: 0.25rem 0;
    min-width: 160px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }

  .ctx-item {
    display: block;
    width: 100%;
    padding: 0.4rem 0.75rem;
    background: none;
    border: none;
    color: #ccc;
    font-size: 0.8rem;
    text-align: left;
    cursor: pointer;
  }

  .ctx-item:hover:not(:disabled) {
    background: #0f3460;
    color: white;
  }

  .ctx-item:disabled {
    color: #555;
    cursor: default;
  }

  .ctx-item.ctx-danger {
    color: #e94560;
  }

  .ctx-item.ctx-danger:hover {
    background: #3a1020;
    color: #ff6b6b;
  }

  .ctx-divider {
    height: 1px;
    background: #0f3460;
    margin: 0.2rem 0;
  }

  .ctx-label {
    display: block;
    padding: 0.2rem 0.75rem;
    font-size: 0.7rem;
    color: #666;
  }

  .ctx-subdivide-row {
    display: flex;
    align-items: center;
    padding: 0.2rem 0.5rem;
    gap: 0.3rem;
  }

  .ctx-subdivide-row .ctx-label {
    padding: 0;
    white-space: nowrap;
  }

  .ctx-subdiv-input {
    width: 44px;
    padding: 0.2rem 0.3rem;
    background: #0d1b2a;
    border: 1px solid #0f3460;
    border-radius: 3px;
    color: #ccc;
    font-size: 0.8rem;
    text-align: center;
    -moz-appearance: textfield;
  }

  .ctx-subdiv-input:focus {
    outline: none;
    border-color: #e94560;
  }

  .ctx-subdiv-btn {
    padding: 0.2rem 0.5rem;
    background: #0f3460;
    border: none;
    border-radius: 3px;
    color: #ccc;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .ctx-subdiv-btn:hover {
    background: #1a4a8a;
    color: white;
  }

  @media (max-width: 767px) {
    .ctx-menu {
      max-width: calc(100vw - 20px);
    }
  }
</style>
