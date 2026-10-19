<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../lib/store';
  import type { IfcMember, IfcMappingResult, IfcStorey, IfcSurface } from '../lib/ifc/ifc-mapper';
  import { t, tp } from '../lib/i18n';
  import { buildIfcFragment, classesIn, connectShells, storeyLevels, type ClassChoice, type IfcBuilding } from '../lib/ifc/ifc-physical';
  import { insertFragment } from '../lib/model/edit/transformed-copy';
  import { IDENTITY } from '../lib/model/edit/affine';
  import { placementStore } from '../lib/store/placement.svelte';
  import IfcPreview from './IfcPreview.svelte';

  let { open = false, file = null as File | null, onclose = (() => {}) as () => void } = $props();

  let members = $state<IfcMember[]>([]);
  let surfaces = $state<IfcSurface[]>([]);
  let storeys = $state<IfcStorey[]>([]);
  let building = $state<IfcBuilding | null>(null);
  const mappingResult = $derived<IfcMappingResult | null>(building?.mapping ?? null);
  /** What each IFC class becomes; the defaults follow the class. */
  let choices = $state<Record<string, ClassChoice>>({});
  const classes = $derived(classesIn(members, surfaces));
  let meshSize = $state(1);
  let declareElements = $state(true);
  let storeysAsLevels = $state(true);
  const BAR_CHOICES: ClassChoice[] = ['column', 'beam', 'brace', 'ignore'];
  const SURFACE_CHOICES: ClassChoice[] = ['slab', 'wall', 'ignore'];
  const canImport = $derived(!!building && building.bars + building.shells > 0);
  let snapTolerance = $state(0.01);
  /** IfcMember — braces, purlins, struts — as truss members, or as frames. */
  let membersAsTruss = $state(true);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let fileName = $state('');
  let parseWarnings = $state<string[]>([]);

  $effect(() => {
    if (!file) {
      members = [];
      surfaces = [];
      storeys = [];
      building = null;
      error = null;
      loading = false;
      fileName = '';
      parseWarnings = [];
      return;
    }
    fileName = file.name;
    loading = true;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = reader.result as ArrayBuffer;
        // Dynamic import to avoid bundling web-ifc WASM in main chunk
        const { parseIfc } = await import('../lib/ifc/ifc-parser');
        const result = await parseIfc(data);
        members = result.members;
        surfaces = result.surfaces;
        storeys = result.storeys;
        choices = {};
        parseWarnings = result.warnings;
        remapModel();
      } catch (e: any) {
        error = e.message || t('ifc.parseError');
        members = [];
        building = null;
      } finally {
        loading = false;
      }
    };
    reader.onerror = () => {
      error = t('ifc.readError');
      loading = false;
    };
    reader.readAsArrayBuffer(file);
  });

  /** The levels the elements are declared on: the storeys, when they become the model's levels. */
  const levelsFor = (replace: boolean) => (storeysAsLevels && (replace || !modelStore.grid?.levels.length) ? storeyLevels(storeys) : modelStore.grid?.levels ?? []);

  function remapModel(replace = true) {
    if (members.length === 0 && surfaces.length === 0) {
      building = null;
      return;
    }
    try {
      building = buildIfcFragment(members, surfaces, {
        snapTolerance, membersAsTruss, choices, meshSize, declare: declareElements, levels: levelsFor(replace),
      });
      error = null;
    } catch (e: any) {
      error = e.message || t('ifc.mapError');
      building = null;
    }
  }
  function choose(cls: string, c: ClassChoice) { choices = { ...choices, [cls]: c }; remapModel(); }

  function handleToleranceChange(e: Event) {
    const val = parseFloat((e.currentTarget as HTMLInputElement).value);
    if (!isNaN(val) && val > 0) {
      snapTolerance = val;
      remapModel();
    }
  }

  const hasModel = $derived(modelStore.nodes.size > 0 || modelStore.elements.size > 0);

  /** Replace the open model with the file, as one undo step. */
  function handleImport() {
    if (!building) return;
    // The import replaces the open model: it is asked, not done.
    if (hasModel && !confirm(t('ifc.replaceConfirm'))) return;
    remapModel(true);
    const b = building!;
    modelStore.batch(() => {
      modelStore.clear();
      modelStore.model.name = fileName.replace(/\.ifc$/i, '') || modelStore.model.name;
      if (storeysAsLevels && storeys.length > 0) modelStore.setGrid({ axes: [], levels: storeyLevels(storeys) });
      const r = insertFragment(b.fragment, [{ A: IDENTITY, t: [0, 0, 0] }]);
      connectShells(r.quads, r.plates);
    });
    resultsStore.clear();
    // IFC is imported in PRO and stays there. Setting the mode to '3d' here used to switch the
    // app to Basic — its ribbon, its panel and its URL — with the PRO button left unresponsive.
    uiStore.toast(tp('ifc.importedBuilding', { e: b.bars, s: b.shells, p: b.elements }), 'success');
    onclose();
  }

  /** Insert the file into the open model with the ghost: pick where it goes, welds included. */
  function handleInsert() {
    if (!building) return;
    remapModel(false);
    placementStore.start({
      fragment: building!.fragment, label: fileName || 'IFC',
      // The bars are cut where the shells meet them once the file lands.
      onCommit: (r) => { if (r) modelStore.batch(() => connectShells(r.quads, r.plates)); },
    });
    onclose();
  }
</script>

{#if open}
  <div class="ifc-overlay">
    <div class="ifc-backdrop" onclick={onclose}></div>
    <div class="ifc-dialog">
      <div class="ifc-header">
        <h2>{t('ifc.title')}</h2>
        <button class="ifc-close" onclick={onclose}>&#10005;</button>
      </div>

      {#if error}
        <div class="ifc-error">{error}</div>
      {/if}

      {#if fileName}
        <div class="ifc-filename">{fileName}</div>
      {/if}

      <div class="ifc-body">
        {#if loading}
          <div class="ifc-loading">
            <span class="ifc-spinner"></span>
            {t('ifc.loading')}
          </div>
        {:else}
          <div class="ifc-options">
            <div class="ifc-field">
              <label>{t('ifc.snapTolerance')}</label>
              <input type="number" step="0.001" min="0.001" value={snapTolerance} onchange={handleToleranceChange} />
            </div>
            <label class="ifc-field">
              <input type="checkbox" bind:checked={membersAsTruss} onchange={() => remapModel()} />
              {t('ifc.membersAsTruss')}
            </label>
          </div>

          {#if classes.length > 0}
            <div class="ifc-preview" data-testid="ifc-classes">
              <h3>{t('ifc.classesTitle')}</h3>
              <p class="ifc-hint">{t('ifc.classesHint')}</p>
              <table class="ifc-classes">
                <thead><tr><th>{t('ifc.class')}</th><th>{t('ifc.count')}</th><th>{t('ifc.becomes')}</th></tr></thead>
                <tbody>
                  {#each classes as c (c.ifcClass)}
                    <tr>
                      <td class="mono">{c.ifcClass}</td><td>{c.count}</td>
                      <td>
                        <select value={choices[c.ifcClass] ?? c.choice} onchange={(e) => choose(c.ifcClass, e.currentTarget.value as ClassChoice)} data-testid="ifc-class-{c.ifcClass}">
                          {#each c.surface ? SURFACE_CHOICES : BAR_CHOICES as k}<option value={k}>{k === 'ignore' ? t('ifc.leaveOut') : t(`physical.kind.${k}`)}</option>{/each}
                        </select>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              <IfcPreview {members} {surfaces} {choices} />
              <div class="ifc-options">
                {#if surfaces.length > 0}
                  <div class="ifc-field">
                    <label for="ifc-mesh">{t('ifc.meshSize')}</label>
                    <input id="ifc-mesh" type="number" step="0.1" min="0.1" bind:value={meshSize} onchange={() => remapModel()} />
                  </div>
                {/if}
                <label class="ifc-field"><input type="checkbox" bind:checked={declareElements} onchange={() => remapModel()} /> {t('ifc.declare')}</label>
                {#if storeys.length > 0}
                  <label class="ifc-field"><input type="checkbox" bind:checked={storeysAsLevels} onchange={() => remapModel()} /> {tp('ifc.storeysAsLevels', { n: storeys.length })}</label>
                {/if}
              </div>
            </div>
          {/if}

          {#if mappingResult}
            <div class="ifc-preview">
              <h3>{t('ifc.modelToImport')}</h3>
              <div class="ifc-stats">
                <span>{t('ifc.nodes')}: {mappingResult.nodes.length}</span>
                <span>{t('ifc.elements')}: {mappingResult.elements.length}</span>
                <span>{t('ifc.shells')}: {building?.shells ?? 0}</span>
                <span>{t('ifc.physical')}: {building?.elements ?? 0}</span>
                <span>{t('ifc.materials')}: {mappingResult.materials.length}</span>
                <span>{t('ifc.sections')}: {mappingResult.sections.length}</span>
              </div>
              {#if mappingResult.sections.length > 0}
                <div class="ifc-sections">
                  <h4>{t('ifc.sectionsLabel')}</h4>
                  {#each mappingResult.sections as sec}
                    <span class="ifc-tag">{sec.name}</span>
                  {/each}
                </div>
              {/if}
              {#if mappingResult.materials.length > 0}
                <div class="ifc-sections">
                  <h4>{t('ifc.materialsLabel')}</h4>
                  {#each mappingResult.materials as mat}
                    <span class="ifc-tag">{mat.name} (E={mat.e} MPa)</span>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          {#if parseWarnings.length > 0 || (mappingResult?.warnings.length ?? 0) > 0}
            <div class="ifc-warnings">
              <h4>{t('ifc.warnings')}</h4>
              <ul>
                {#each parseWarnings as w}
                  <li>{w}</li>
                {/each}
                {#each mappingResult?.warnings ?? [] as w}
                  <li>{w}</li>
                {/each}
              </ul>
            </div>
          {/if}
        {/if}
      </div>

      <div class="ifc-footer">
        <button class="ifc-btn-cancel" onclick={onclose}>{t('ifc.cancel')}</button>
        {#if hasModel}
          <button
            class="ifc-btn-import"
            disabled={!canImport}
            onclick={handleInsert}
            data-testid="ifc-insert"
          >
            {t('import.insertIntoModel')}
          </button>
        {/if}
        <button
          class={hasModel ? 'ifc-btn-cancel' : 'ifc-btn-import'}
          disabled={!canImport}
          onclick={handleImport}
          data-testid="ifc-replace"
        >
          {hasModel ? t('import.replaceModel') : t('ifc.importModel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .ifc-classes { width: 100%; border-collapse: collapse; font-size: 0.78rem; margin: 4px 0; }
  .ifc-classes th { text-align: left; font-weight: 500; opacity: 0.75; padding: 2px 4px; }
  .ifc-classes td { padding: 2px 4px; }
  .ifc-classes .mono { font-family: monospace; }
  .ifc-hint { font-size: 0.75rem; opacity: 0.75; margin: 2px 0; }
  .ifc-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ifc-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
  }

  .ifc-dialog {
    position: relative;
    background: #0a1628;
    border: 1px solid #1a4a7a;
    border-radius: 12px;
    width: min(500px, 90vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .ifc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #1a4a7a;
  }

  .ifc-header h2 {
    margin: 0;
    font-size: 1.1rem;
    color: #eee;
  }

  .ifc-close {
    background: none;
    border: none;
    color: #888;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 4px;
  }

  .ifc-close:hover { color: #e94560; }

  .ifc-error {
    padding: 8px 20px;
    background: rgba(233, 69, 96, 0.15);
    color: #ff6b6b;
    font-size: 0.8rem;
  }

  .ifc-filename {
    padding: 8px 20px;
    font-size: 0.75rem;
    color: #4ecdc4;
    font-family: monospace;
  }

  .ifc-body {
    padding: 16px 20px;
    overflow-y: auto;
    flex: 1;
  }

  .ifc-loading {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px;
    color: #aaa;
    font-size: 0.85rem;
  }

  .ifc-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #1a4a7a;
    border-top-color: #4ecdc4;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .ifc-options {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
  }

  .ifc-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ifc-field label {
    font-size: 0.7rem;
    color: #888;
  }

  .ifc-field input, .ifc-field select {
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    padding: 4px 8px;
    font-size: 0.8rem;
    width: 100px;
  }

  .ifc-preview {
    margin-top: 12px;
    padding: 10px;
    background: rgba(15, 52, 96, 0.5);
    border-radius: 6px;
  }

  .ifc-preview h3 {
    margin: 0 0 8px;
    font-size: 0.85rem;
    color: #4ecdc4;
  }

  .ifc-stats {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 0.75rem;
    color: #bbb;
  }

  .ifc-sections {
    margin-top: 8px;
  }

  .ifc-sections h4 {
    margin: 0 0 4px;
    font-size: 0.7rem;
    color: #888;
  }

  .ifc-tag {
    display: inline-block;
    padding: 2px 6px;
    margin: 2px;
    background: #1a4a7a;
    border-radius: 3px;
    font-size: 0.7rem;
    color: #ddd;
  }

  .ifc-warnings {
    margin-top: 12px;
    padding: 8px;
    background: rgba(233, 69, 96, 0.1);
    border-radius: 4px;
  }

  .ifc-warnings h4 {
    margin: 0 0 4px;
    font-size: 0.75rem;
    color: #ff9800;
  }

  .ifc-warnings ul {
    margin: 0;
    padding-left: 16px;
    font-size: 0.7rem;
    color: #ddd;
  }

  .ifc-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid #1a4a7a;
  }

  .ifc-btn-cancel {
    padding: 6px 16px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 6px;
    color: #aaa;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .ifc-btn-cancel:hover { background: #1a4a7a; color: #eee; }

  .ifc-btn-import {
    padding: 6px 16px;
    background: #4ecdc4;
    border: none;
    border-radius: 6px;
    color: #0a1628;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .ifc-btn-import:hover { background: #6ee5dd; }
  .ifc-btn-import:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
