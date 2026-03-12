<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import type { NodalLoad } from '../../lib/store/model.svelte.ts';
  import { toDisplay, unitLabel } from '../../lib/utils/units';
  import SupportDetails from './SupportDetails.svelte';

  const us = $derived(uiStore.unitSystem);
  const ul = (q: import('../../lib/utils/units').Quantity) => unitLabel(q, us);
  const dv = (v: number, q: import('../../lib/utils/units').Quantity) => toDisplay(v, q, us);

  let { showResults = false } = $props();

  function getSupportForNode(nodeId: number) {
    for (const sup of modelStore.supports.values()) {
      if (sup.nodeId === nodeId) return sup;
    }
    return null;
  }

  function getNodalLoadsForNode(nodeId: number) {
    return modelStore.loads
      .filter(l => l.type === 'nodal' && (l.data as NodalLoad).nodeId === nodeId)
      .map(l => l.data as NodalLoad);
  }

  function updateLoadField(loadId: number, field: string, val: string) {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    modelStore.updateLoad(loadId, { [field]: num });
  }
</script>

<div class="panel-section">
  <h3>{t('prop.selectedNode')}</h3>
  {#each uiStore.selectedNodes as nodeId}
    {#if modelStore.getNode(nodeId)}
      {@const node = modelStore.getNode(nodeId)!}
      <div class="property-row">
        <span>ID:</span>
        <span>{node.id}</span>
      </div>
      <div class="property-row">
        <span>X:</span>
        <span>{dv(node.x, 'length').toFixed(3)} {ul('length')}</span>
      </div>
      <div class="property-row">
        <span>Y:</span>
        <span>{dv(node.y, 'length').toFixed(3)} {ul('length')}</span>
      </div>
      {#if uiStore.analysisMode === '3d'}
        <div class="property-row">
          <span>Z:</span>
          <span>{dv(node.z ?? 0, 'length').toFixed(3)} {ul('length')}</span>
        </div>
      {/if}

      {#if showResults}
        {#if uiStore.analysisMode === '3d' && resultsStore.results3D}
          {@const disp3D = resultsStore.getDisplacement3D(nodeId)}
          {#if disp3D}
            <h4>{t('prop.displacements3d')}</h4>
            <div class="property-row">
              <span>ux:</span>
              <span>{dv(disp3D.ux, 'displacement').toFixed(us === 'SI' ? 4 : 3)} {ul('displacement')}</span>
            </div>
            <div class="property-row">
              <span>uy:</span>
              <span>{dv(disp3D.uy, 'displacement').toFixed(us === 'SI' ? 4 : 3)} {ul('displacement')}</span>
            </div>
            <div class="property-row">
              <span>uz:</span>
              <span>{dv(disp3D.uz, 'displacement').toFixed(us === 'SI' ? 4 : 3)} {ul('displacement')}</span>
            </div>
            <div class="property-row">
              <span>θx:</span>
              <span>{disp3D.rx.toFixed(6)} rad</span>
            </div>
            <div class="property-row">
              <span>θy:</span>
              <span>{disp3D.ry.toFixed(6)} rad</span>
            </div>
            <div class="property-row">
              <span>θz:</span>
              <span>{disp3D.rz.toFixed(6)} rad</span>
            </div>
          {/if}

          {@const reaction3D = resultsStore.getReaction3D(nodeId)}
          {#if reaction3D}
            <h4>{t('prop.reactions3d')}</h4>
            <div class="property-row">
              <span>Rx:</span>
              <span>{dv(reaction3D.fx, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>Ry:</span>
              <span>{dv(reaction3D.fy, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>Rz:</span>
              <span>{dv(reaction3D.fz, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>Mx:</span>
              <span>{dv(-reaction3D.mx, 'moment').toFixed(2)} {ul('moment')}</span>
            </div>
            <div class="property-row">
              <span>My:</span>
              <span>{dv(-reaction3D.my, 'moment').toFixed(2)} {ul('moment')}</span>
            </div>
            <div class="property-row">
              <span>Mz:</span>
              <span>{dv(-reaction3D.mz, 'moment').toFixed(2)} {ul('moment')}</span>
            </div>
          {/if}
        {:else}
          {@const disp = resultsStore.getDisplacement(nodeId)}
          {#if disp}
            <h4>{t('prop.displacements')}</h4>
            <div class="property-row">
              <span>ux:</span>
              <span>{dv(disp.ux, 'displacement').toFixed(us === 'SI' ? 4 : 3)} {ul('displacement')}</span>
            </div>
            <div class="property-row">
              <span>uy:</span>
              <span>{dv(disp.uy, 'displacement').toFixed(us === 'SI' ? 4 : 3)} {ul('displacement')}</span>
            </div>
            <div class="property-row">
              <span>θz:</span>
              <span>{disp.rz.toFixed(6)} rad</span>
            </div>
          {/if}

          {@const reaction = resultsStore.getReaction(nodeId)}
          {#if reaction}
            <h4>{t('prop.reactions')}</h4>
            <div class="property-row">
              <span>Rx:</span>
              <span>{dv(reaction.rx, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>Ry:</span>
              <span>{dv(reaction.ry, 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>Mz:</span>
              <span>{dv(-reaction.mz, 'moment').toFixed(2)} {ul('moment')}</span>
            </div>
          {/if}
        {/if}
      {/if}

      {@const sup = getSupportForNode(nodeId)}
      {#if sup}
        <SupportDetails supId={sup.id} {sup} />
      {/if}

      {@const nodalLoads = getNodalLoadsForNode(nodeId)}
      {#if nodalLoads.length > 0}
        <h4>{t('prop.nodalLoads')}</h4>
        {#each nodalLoads as nl}
          <div class="property-row">
            <span>Fx:</span>
            <input type="number" step="1" value={nl.fx} class="prop-input" onchange={(e) => updateLoadField(nl.id, 'fx', e.currentTarget.value)} />
            <span>kN</span>
          </div>
          <div class="property-row">
            <span>Fy:</span>
            <input type="number" step="1" value={nl.fy} class="prop-input" onchange={(e) => updateLoadField(nl.id, 'fy', e.currentTarget.value)} />
            <span>kN</span>
          </div>
          <div class="property-row">
            <span>Mz:</span>
            <input type="number" step="1" value={nl.mz} class="prop-input" onchange={(e) => updateLoadField(nl.id, 'mz', e.currentTarget.value)} />
            <span>kN·m</span>
          </div>
        {/each}
      {/if}

      {@const hinges = modelStore.getHingesAtNode(nodeId)}
      {#if hinges.length > 0}
        <h4>{t('prop.hinges')}</h4>
        {#each hinges as h}
          {@const elem = modelStore.elements.get(h.elementId)}
          {#if elem}
            <div class="property-row">
              <button class="btn-small" class:active={h.hasHinge}
                onclick={() => { modelStore.toggleHinge(h.elementId, h.end); resultsStore.clear(); }}
                title="{t('table.elemLabel')} {h.elementId} — {t('table.nodeLabel')} {h.end === 'start' ? 'I' : 'J'}">
                {h.hasHinge ? '○' : '●'} E{h.elementId}
              </button>
            </div>
          {/if}
        {/each}
        <div style="display:flex;gap:4px;margin-top:4px">
          <button class="btn-small" onclick={() => {
            modelStore.batch(() => { for (const h of hinges) if (!h.hasHinge) modelStore.toggleHinge(h.elementId, h.end); });
            resultsStore.clear();
          }}>{t('prop.hingeAll')}</button>
          <button class="btn-small" onclick={() => {
            modelStore.batch(() => { for (const h of hinges) if (h.hasHinge) modelStore.toggleHinge(h.elementId, h.end); });
            resultsStore.clear();
          }}>{t('prop.removeAll')}</button>
        </div>
      {/if}

      <button class="btn-small btn-danger" onclick={() => { modelStore.removeNode(nodeId); resultsStore.clear(); }}>
        {t('prop.deleteNode')}
      </button>
    {/if}
  {/each}
</div>

<style>
  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .panel-section h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #888;
    letter-spacing: 0.05em;
  }

  h4 {
    font-size: 0.7rem;
    color: #aaa;
    margin-top: 0.5rem;
  }

  .property-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
    padding: 0.25rem 0;
  }

  .prop-input {
    width: 65px;
    padding: 0.2rem 0.3rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #eee;
    font-size: 0.8rem;
  }

  .btn-small {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 0.5rem;
  }

  .btn-danger {
    background: #e94560;
    color: white;
  }

  .btn-danger:hover {
    background: #ff6b6b;
  }
</style>
