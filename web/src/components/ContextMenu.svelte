<script lang="ts">
  import { uiStore, modelStore, resultsStore } from '../lib/store';
  import { t } from '../lib/i18n';
  import { variableCutRefused } from '../lib/section/variable';
  import { mirrorSelectionInPlace, rotateSelectionInPlace } from '../lib/model/edit/transform-in-place';
  import { addSupportFromTool3D } from '../lib/store/support-tool-3d';
  import { viewVisibility } from '../lib/store/view-state.svelte';

  let subdivCount = $state(2);
  const is3D = () => uiStore.is3DWorkspace;

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
      /* In 3D the 2D tool's 'pinned' meant restraining ux, uy, uz, rx and ry — nearly fixed. */
      if (is3D()) addSupportFromTool3D(ctx.nodeId);
      else modelStore.addSupport(ctx.nodeId, uiStore.supportType as any);
      resultsStore.clear();
    } else if (action === 'add-load' && ctx.nodeId != null) {
      if (is3D()) {
        /* As the load tool would place it; a 2D nodal load became a horizontal fy in 3D. */
        const d = uiStore.nodalLoadDir3D, v = uiStore.loadValue;
        modelStore.addNodalLoad3D(ctx.nodeId, d === 'fx' ? v : 0, d === 'fy' ? v : 0, d === 'fz' ? v : 0,
          d === 'mx' ? v : 0, d === 'my' ? v : 0, d === 'mz' ? v : 0, uiStore.activeLoadCaseId);
      } else {
        modelStore.addNodalLoad(ctx.nodeId, 0, uiStore.loadValue, 0, uiStore.activeLoadCaseId);
      }
      resultsStore.clear();
    } else if (action === 'select-node' && ctx.nodeId != null) {
      uiStore.selectNode(ctx.nodeId);
    } else if (action === 'select-element' && ctx.elementId != null) {
      uiStore.selectElement(ctx.elementId);
    } else if (action === 'mirror-x' || action === 'mirror-y') {
      // The edit layer's in-place mirror: member frames, offsets and local loads follow.
      mirrorSelectionInPlace(uiStore.selectedNodes, action === 'mirror-x' ? 'x' : 'y', { leftHand: uiStore.axisConvention3D === 'leftHand' });
      resultsStore.clear();
    } else if (action === 'rotate-90' || action === 'rotate-neg90') {
      rotateSelectionInPlace(uiStore.selectedNodes, action === 'rotate-90' ? 90 : -90, { leftHand: uiStore.axisConvention3D === 'leftHand' });
      resultsStore.clear();
    } else if (action === 'spec-element' && ctx.elementId != null) {
      // Everything the member is told beyond geometry, section and material, in its one editor.
      uiStore.specSection = 'members';
      uiStore.proActiveTab = 'specifications';
      uiStore.setSelection(new Set(), new Set([ctx.elementId]));
    } else if (action === 'spec-support' && ctx.nodeId != null) {
      const sup = [...modelStore.supports.values()].find(s => s.nodeId === ctx.nodeId);
      if (sup) {
        uiStore.specSection = 'supports';
        uiStore.proActiveTab = 'specifications';
        uiStore.clearSelection();
        uiStore.selectSupport(sup.id, true);
      }
    } else if (action === 'rotate-local-axes' && ctx.elementId != null) {
      modelStore.rotateElementLocalAxes(ctx.elementId, 90);
      resultsStore.clear();
    }
  }

  /*
   * Hide or isolate: what was right-clicked, or the selection when the click
   * was on part of it or on empty space. PRO has these in its View panel.
   */
  const offersView = $derived(uiStore.analysisMode !== 'pro');
  function viewTarget() {
    const ctx = uiStore.contextMenu;
    const sel = { nodes: [...uiStore.selectedNodes], elements: [...uiStore.selectedElements], shells: [...uiStore.selectedShells] };
    if (ctx?.nodeId != null && !uiStore.selectedNodes.has(ctx.nodeId)) return { nodes: [ctx.nodeId], elements: [], shells: [] };
    if (ctx?.elementId != null && !uiStore.selectedElements.has(ctx.elementId)) return { nodes: [], elements: [ctx.elementId], shells: [] };
    return sel;
  }
  const viewTargetCount = $derived.by(() => {
    if (!uiStore.contextMenu) return 0;
    const v = viewTarget();
    return v.nodes.length + v.elements.length + v.shells.length;
  });
  function viewAction(kind: 'hide' | 'isolate' | 'show-all') {
    const target = viewTarget();
    uiStore.contextMenu = null;
    if (kind === 'show-all') viewVisibility.showAll();
    else if (kind === 'hide') { viewVisibility.hide(target); uiStore.clearSelection(); }
    else viewVisibility.isolate(target);
  }

  function doSubdivide() {
    const ctx = uiStore.contextMenu;
    if (!ctx?.elementId) return;
    const count = Math.max(2, Math.min(20, Math.round(subdivCount)));
    // A member of variable section whose cuts no section can name is not cut, and says so.
    if (!modelStore.subdivideElement(ctx.elementId, count) && variableCutRefused(modelStore.sections, modelStore.elements.get(ctx.elementId) ?? { sectionId: 0 })) {
      uiStore.toast(t('edit.refused.variableCut'), 'error');
    }
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
      {#if ctxNodeSup && uiStore.analysisMode === 'pro'}
        <button class="ctx-item" onclick={() => handleContextAction('spec-support')} data-testid="ctx-spec-support">{t('ctx.specifications')}</button>
      {/if}
      {#if ctxNodeSup}
        <button class="ctx-item ctx-danger" onclick={() => handleContextAction('delete-support')}>{t('ctx.deleteSupport')}</button>
      {/if}
      <div class="ctx-divider"></div>
      <button class="ctx-item ctx-danger" onclick={() => handleContextAction('delete-node')}>{t('ctx.deleteNode')}</button>
    {:else if uiStore.contextMenu.elementId != null}
      <button class="ctx-item" onclick={() => handleContextAction('select-element')}>{t('ctx.selectElement')}</button>
      <button class="ctx-item" onclick={() => handleContextAction('edit-element')}>{t('ctx.editElement')}</button>
      {#if uiStore.analysisMode === 'pro'}
        <button class="ctx-item" onclick={() => handleContextAction('spec-element')} data-testid="ctx-spec-element">{t('ctx.specifications')}</button>
      {/if}
      <div class="ctx-divider"></div>
      <div class="ctx-subdivide-row">
        <span class="ctx-label">{t('ctx.subdivide')}</span>
        <input type="number" min="2" max="20" bind:value={subdivCount}
          class="ctx-subdiv-input"
          onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') doSubdivide(); }} />
        <button class="ctx-subdiv-btn" onclick={doSubdivide}>OK</button>
      </div>
      {#if uiStore.is3DWorkspace}
        <div class="ctx-divider"></div>
        <button class="ctx-item" onclick={() => handleContextAction('rotate-local-axes')} data-testid="ctx-rotate-local-axes">{t('ctx.rotateBar90')}</button>
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
    {#if offersView && (viewTargetCount > 0 || viewVisibility.active)}
      <div class="ctx-divider"></div>
      {#if viewTargetCount > 0}
        <button class="ctx-item" onclick={() => viewAction('hide')} data-testid="ctx-view-hide">{t('view.hide')}</button>
        <button class="ctx-item" onclick={() => viewAction('isolate')} data-testid="ctx-view-isolate">{t('view.isolate')}</button>
      {/if}
      {#if viewVisibility.active}
        <button class="ctx-item" onclick={() => viewAction('show-all')} data-testid="ctx-view-show-all">{t('view.showAll')}</button>
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
