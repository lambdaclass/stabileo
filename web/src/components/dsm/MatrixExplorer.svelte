<script lang="ts">
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import { t } from '../../lib/i18n';
  import { dsmStepsStore } from '../../lib/store';
  import MatrixDisplay from './MatrixDisplay.svelte';

  let { data, editable = false }: { data: DSMStepData; editable?: boolean } = $props();

  const elem = $derived(
    data.elements.find(e => e.elementId === dsmStepsStore.selectedElemForStep)
    ?? data.elements[0]
  );

  const is3D = $derived(data.dofNumbering.dofsPerNode > 3);

  // DOF indices of the selected element in the global system
  const elemDofSet = $derived(
    elem ? new Set(elem.dofIndices) : new Set<number>()
  );

  // Which matrix view to show for the global K
  let showGlobalK = $state(false);

  // Tab state for element matrices
  let activeTab = $state<'kLocal' | 'T' | 'kGlobal'>('kLocal');
</script>

<div class="explorer">
  <div class="explanation">
    <p>{@html t('dsm.explorer.explanation')}</p>
  </div>

  <!-- Element selector -->
  <div class="elem-selector">
    <label for="explorer-elem">{t('dsm.explorer.element')}</label>
    <select id="explorer-elem" onchange={(e) => dsmStepsStore.selectElement(Number((e.target as HTMLSelectElement).value))}>
      {#each data.elements as el}
        <option value={el.elementId} selected={el.elementId === dsmStepsStore.selectedElemForStep}>
          E{el.elementId} (N{el.nodeI}→N{el.nodeJ}) — {el.type}
        </option>
      {/each}
    </select>
  </div>

  {#if elem}
    <!-- Element properties summary -->
    <div class="props-row">
      <div class="prop"><span class="prop-label">L</span><span class="prop-val">{elem.length.toFixed(3)} m</span></div>
      <div class="prop"><span class="prop-label">E</span><span class="prop-val">{elem.E.toExponential(2)}</span></div>
      <div class="prop"><span class="prop-label">A</span><span class="prop-val">{elem.A.toExponential(2)}</span></div>
      {#if elem.type === 'frame'}
        <div class="prop"><span class="prop-label">Iz</span><span class="prop-val">{elem.Iz.toExponential(2)}</span></div>
        {#if is3D && elem.Iy !== undefined}
          <div class="prop"><span class="prop-label">Iy</span><span class="prop-val">{elem.Iy.toExponential(2)}</span></div>
        {/if}
        {#if is3D && elem.J !== undefined}
          <div class="prop"><span class="prop-label">J</span><span class="prop-val">{elem.J.toExponential(2)}</span></div>
        {/if}
      {/if}
      <div class="prop">
        <span class="prop-label">{t('dsm.explorer.dof')}</span>
        <span class="prop-val dof-list">{elem.dofIndices.map(d => d + 1).join(', ')}</span>
      </div>
    </div>

    <!-- Matrix tabs -->
    <div class="matrix-tabs">
      <button class:active={activeTab === 'kLocal'} onclick={() => { activeTab = 'kLocal'; }}>
        {t('dsm.explorer.tabLocal')}
      </button>
      <button class:active={activeTab === 'T'} onclick={() => { activeTab = 'T'; }}>
        {t('dsm.explorer.tabTransformation')}
      </button>
      <button class:active={activeTab === 'kGlobal'} onclick={() => { activeTab = 'kGlobal'; }}>
        {t('dsm.explorer.tabGlobal')}
      </button>
      <div class="tab-spacer"></div>
      <button
        class:active={showGlobalK}
        onclick={() => { showGlobalK = !showGlobalK; }}
        class="global-toggle"
      >
        {showGlobalK ? '▼' : '▶'} [K] Global
      </button>
    </div>

    <!-- Element matrix display -->
    <div class="matrix-panel">
      {#if activeTab === 'kLocal'}
        <MatrixDisplay
          title={t('dsm.explorer.localStiffness').replace('{rows}', String(elem.kLocal.length)).replace('{cols}', String(elem.kLocal[0]?.length))}
          matrix={elem.kLocal}
          rowLabels={elem.dofLabels}
          colLabels={elem.dofLabels}
          precision={is3D ? 1 : 2}
          compact
          {editable}
        />
        <div class="matrix-note">
          {#if elem.type === 'frame'}
            {t('dsm.explorer.frameLocalNote').replace('{biaxial}', is3D ? t('dsm.explorer.biaxialSuffix') : '')}
          {:else}
            {t('dsm.explorer.trussLocalNote')}
          {/if}
        </div>
      {:else if activeTab === 'T'}
        <MatrixDisplay
          title={t('dsm.explorer.transformationMatrix').replace('{rows}', String(elem.T.length)).replace('{cols}', String(elem.T[0]?.length))}
          matrix={elem.T}
          rowLabels={elem.dofLabels}
          colLabels={elem.dofLabels}
          precision={4}
          compact
          {editable}
        />
        <div class="matrix-note">
          {t('dsm.explorer.rotationNote').replace('{detail}', is3D ? t('dsm.explorer.cosineBlocks') : 'θ = ' + (elem.angle * 180 / Math.PI).toFixed(2) + '°')}
        </div>
      {:else if activeTab === 'kGlobal'}
        <MatrixDisplay
          title={t('dsm.explorer.globalStiffness').replace('{rows}', String(elem.kGlobal.length)).replace('{cols}', String(elem.kGlobal[0]?.length))}
          matrix={elem.kGlobal}
          rowLabels={elem.dofLabels}
          colLabels={elem.dofLabels}
          precision={is3D ? 1 : 2}
          compact
          {editable}
        />
        <div class="matrix-note">
          {t('dsm.explorer.assemblyNote').replace('{dofs}', elem.dofIndices.map(d => d + 1).join(', '))}
        </div>
      {/if}
    </div>

    <!-- Relationship diagram -->
    <div class="relationship">
      <span class="rel-item" class:active={activeTab === 'kLocal'}>[k]</span>
      <span class="rel-arrow">→ Tᵀ·k·T →</span>
      <span class="rel-item" class:active={activeTab === 'kGlobal'}>[K]ₑ</span>
      <span class="rel-arrow">→ {t('dsm.explorer.assembly')} →</span>
      <span class="rel-item" class:active={showGlobalK}>[K]</span>
    </div>

    <!-- Global K with highlighted DOFs -->
    {#if showGlobalK}
      <div class="global-k-section">
        <MatrixDisplay
          title={t('dsm.explorer.globalK').replace('{rows}', String(data.K.length)).replace('{cols}', String(data.K[0]?.length)).replace('{id}', String(elem.elementId))}
          matrix={data.K}
          rowLabels={data.dofLabels}
          colLabels={data.dofLabels}
          highlightRows={elemDofSet}
          highlightCols={elemDofSet}
          precision={is3D ? 0 : 1}
          compact
          {editable}
        />
      </div>
    {/if}
  {/if}
</div>

<style>
  .explorer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 0.82rem;
    color: #ddd;
  }

  .explanation {
    font-size: 0.72rem;
    color: #aaa;
    line-height: 1.4;
  }
  .explanation p {
    margin: 0;
  }

  .elem-selector {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .elem-selector label {
    font-size: 0.75rem;
    color: #888;
  }
  .elem-selector select {
    background: #16213e;
    color: #ddd;
    border: 1px solid #0f3460;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .elem-selector select:hover {
    border-color: #4ecdc4;
  }

  .props-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
  }
  .prop {
    display: flex;
    gap: 4px;
    align-items: baseline;
  }
  .prop-label {
    font-size: 0.7rem;
    color: #888;
    font-weight: 600;
  }
  .prop-val {
    font-family: 'Fira Code', 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    color: #4ecdc4;
  }
  .dof-list {
    font-size: 0.68rem;
    color: #bbb;
  }

  .matrix-tabs {
    display: flex;
    gap: 2px;
    align-items: center;
  }
  .matrix-tabs button {
    padding: 4px 10px;
    border: 1px solid #0f3460;
    border-radius: 4px 4px 0 0;
    background: #16213e;
    color: #888;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .matrix-tabs button:hover {
    color: #ccc;
    background: #1a2a4e;
  }
  .matrix-tabs button.active {
    background: #1a1a2e;
    color: #4ecdc4;
    border-bottom-color: transparent;
  }
  .tab-spacer {
    flex: 1;
  }
  .global-toggle {
    font-size: 0.7rem !important;
    border-radius: 4px !important;
  }

  .matrix-panel {
    border: 1px solid #0f3460;
    border-radius: 0 0 4px 4px;
    padding: 8px;
    background: rgba(22, 33, 62, 0.4);
    margin-top: -1px;
  }

  .matrix-note {
    font-size: 0.68rem;
    color: #777;
    margin-top: 6px;
    font-style: italic;
  }

  .relationship {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
    padding: 6px 0;
    font-size: 0.75rem;
  }
  .rel-item {
    padding: 3px 8px;
    border: 1px solid #0f3460;
    border-radius: 4px;
    background: #16213e;
    color: #888;
    font-family: 'Fira Code', 'JetBrains Mono', monospace;
    transition: all 0.15s;
  }
  .rel-item.active {
    color: #4ecdc4;
    border-color: #4ecdc4;
    background: rgba(78, 205, 196, 0.1);
  }
  .rel-arrow {
    color: #555;
    font-size: 0.7rem;
  }

  .global-k-section {
    border: 1px solid #0f3460;
    border-radius: 4px;
    padding: 8px;
    background: rgba(22, 33, 62, 0.3);
  }
</style>
