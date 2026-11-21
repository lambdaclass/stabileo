<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import type { NodalLoad } from '../../lib/store/model.svelte.ts';
  import { toDisplay, unitLabel } from '../../lib/utils/units';
  import SupportDetails from './SupportDetails.svelte';
  import { shownCoords, coordLabels, twoD, userRot, userVec } from '../../lib/axes/display';
  import { nodeShown3D } from '../../lib/axes/node-coords';
  import {
    TWO_D_DISPLACEMENT_LABELS,
    TWO_D_NODAL_LOAD_LABELS,
    TWO_D_REACTION_LABELS,
    get2DDisplayDisplacementVertical,
    get2DDisplayNodalLoadMoment,
    get2DDisplayNodalLoadVertical,
    get2DDisplayMoment,
    get2DDisplayReactionVertical,
    get2DDisplayRotation,
    get2DDisplayedVertical,
  } from '../../lib/geometry/coordinate-system';

  const us = $derived(uiStore.unitSystem);
  const ul = (q: import('../../lib/utils/units').Quantity) => unitLabel(q, us);
  const dv = (v: number, q: import('../../lib/utils/units').Quantity) => toDisplay(v, q, us);
  const is3DMode = $derived(uiStore.is3DWorkspace);

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
      {#each is3DMode ? nodeShown3D(node) : shownCoords({ x: node.x, y: get2DDisplayedVertical(node) }, false) as c, i}
        <div class="property-row">
          <span>{coordLabels(is3DMode)[i]}:</span>
          <span>{dv(c, 'length').toFixed(3)} {ul('length')}</span>
        </div>
      {/each}

      {#if showResults}
        {#if is3DMode && resultsStore.results3D}
          {@const disp3D = resultsStore.getDisplacement3D(nodeId)}
          {#if disp3D}
            {@const du = userVec(disp3D.ux, disp3D.uy, disp3D.uz)}
            {@const ru = userRot(disp3D.rx, disp3D.ry, disp3D.rz)}
            <h4>{t('prop.displacements3d')}</h4>
            {#each ['x', 'y', 'z'] as a, i}
              <div class="property-row">
                <span>u{a}:</span>
                <span>{dv(du[i], 'displacement').toFixed(us === 'SI' ? 4 : 3)} {ul('displacement')}</span>
              </div>
            {/each}
            {#each ['x', 'y', 'z'] as a, i}
              <div class="property-row">
                <span>θ{a}:</span>
                <span>{ru[i].toFixed(6)} rad</span>
              </div>
            {/each}
          {/if}

          {@const reaction3D = resultsStore.getReaction3D(nodeId)}
          {#if reaction3D}
            {@const fu = userVec(reaction3D.fx, reaction3D.fy, reaction3D.fz)}
            {@const mu = userRot(-reaction3D.mx, -reaction3D.my, -reaction3D.mz)}
            <h4>{t('prop.reactions3d')}</h4>
            {#each ['x', 'y', 'z'] as a, i}
              <div class="property-row">
                <span>R{a}:</span>
                <span>{dv(fu[i], 'force').toFixed(2)} {ul('force')}</span>
              </div>
            {/each}
            {#each ['x', 'y', 'z'] as a, i}
              <div class="property-row">
                <span>M{a}:</span>
                <span>{dv(mu[i], 'moment').toFixed(2)} {ul('moment')}</span>
              </div>
            {/each}
          {/if}
        {:else}
          {@const disp = resultsStore.getDisplacement(nodeId)}
          {#if disp}
            <h4>{t('prop.displacements')}</h4>
            <div class="property-row">
              <span>{TWO_D_DISPLACEMENT_LABELS.horizontal}:</span>
              <span>{dv(twoD.x(disp.ux), 'displacement').toFixed(us === 'SI' ? 4 : 3)} {ul('displacement')}</span>
            </div>
            <div class="property-row">
              <span>{TWO_D_DISPLACEMENT_LABELS.vertical}:</span>
              <span>{dv(twoD.z(get2DDisplayDisplacementVertical(disp)), 'displacement').toFixed(us === 'SI' ? 4 : 3)} {ul('displacement')}</span>
            </div>
            <div class="property-row">
              <span>{TWO_D_DISPLACEMENT_LABELS.rotation}:</span>
              <span>{twoD.rot(get2DDisplayRotation(disp)).toFixed(6)} rad</span>
            </div>
          {/if}

          {@const reaction = resultsStore.getReaction(nodeId)}
          {#if reaction}
            <h4>{t('prop.reactions')}</h4>
            <div class="property-row">
              <span>{TWO_D_REACTION_LABELS.horizontal}:</span>
              <span>{dv(twoD.x(reaction.rx), 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>{TWO_D_REACTION_LABELS.vertical}:</span>
              <span>{dv(twoD.z(get2DDisplayReactionVertical(reaction)), 'force').toFixed(2)} {ul('force')}</span>
            </div>
            <div class="property-row">
              <span>{TWO_D_REACTION_LABELS.moment}:</span>
              <span>{dv(twoD.rot(-get2DDisplayMoment(reaction)), 'moment').toFixed(2)} {ul('moment')}</span>
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
            <span>{TWO_D_NODAL_LOAD_LABELS.horizontal}:</span>
            <input type="number" step="1" value={twoD.x(nl.fx)} class="prop-input" onchange={(e) => updateLoadField(nl.id, 'fx', String(twoD.fromX(parseFloat(e.currentTarget.value))))} />
            <span>kN</span>
          </div>
          <div class="property-row">
            <span>{TWO_D_NODAL_LOAD_LABELS.vertical}:</span>
            <input type="number" step="1" value={twoD.z(get2DDisplayNodalLoadVertical(nl))} class="prop-input" onchange={(e) => updateLoadField(nl.id, 'fz', String(twoD.fromZ(parseFloat(e.currentTarget.value))))} />
            <span>kN</span>
          </div>
          <div class="property-row">
            <span>{TWO_D_NODAL_LOAD_LABELS.moment}:</span>
            <input type="number" step="1" value={twoD.rot(get2DDisplayNodalLoadMoment(nl))} class="prop-input" onchange={(e) => updateLoadField(nl.id, 'my', String(twoD.fromRot(parseFloat(e.currentTarget.value))))} />
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
