<script lang="ts">
  import { modelStore, uiStore, resultsStore, historyStore } from '../lib/store';
  import { mapIfcToModel, type IfcMember, type IfcMappingResult } from '../lib/ifc/ifc-mapper';
  import { t } from '../lib/i18n';

  let { open = false, file = null as File | null, onclose = () => {} } = $props();

  let members = $state<IfcMember[]>([]);
  let mappingResult = $state<IfcMappingResult | null>(null);
  let snapTolerance = $state(0.01);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let fileName = $state('');
  let parseWarnings = $state<string[]>([]);

  $effect(() => {
    if (!file) {
      members = [];
      mappingResult = null;
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
        parseWarnings = result.warnings;
        remapModel();
      } catch (e: any) {
        error = e.message || t('ifc.parseError');
        members = [];
        mappingResult = null;
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

  function remapModel() {
    if (members.length === 0) {
      mappingResult = null;
      return;
    }
    try {
      mappingResult = mapIfcToModel(members, { snapTolerance });
      error = null;
    } catch (e: any) {
      error = e.message || t('ifc.mapError');
      mappingResult = null;
    }
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
      const realId = modelStore.addNode(n.x, n.y, n.z);
      idMap.set(n.id, realId);
    }

    // Add materials
    const matIds: number[] = [];
    for (const mat of m.materials) {
      const id = modelStore.addMaterial({
        name: mat.name,
        e: mat.e,
        nu: mat.nu,
        rho: mat.rho,
      });
      matIds.push(id);
    }
    const matId = matIds[0] ?? 1;

    // Add sections
    const secIds: number[] = [];
    for (const sec of m.sections) {
      const id = modelStore.addSection({
        name: sec.name,
        a: sec.a,
        iz: sec.iz,
        iy: sec.iy,
        j: sec.j,
        h: sec.h,
        b: sec.b,
        tw: sec.tw,
        tf: sec.tf,
        t: sec.t,
        shape: sec.shape as any,
      });
      secIds.push(id);
    }
    const secId = secIds[0] ?? 1;

    // Add elements
    for (const e of m.elements) {
      const ni = idMap.get(e.nodeI)!;
      const nj = idMap.get(e.nodeJ)!;
      const eid = modelStore.addElement(ni, nj, e.type);
      if (matId !== 1) modelStore.updateElementMaterial(eid, matId);
      if (secId !== 1) modelStore.updateElementSection(eid, secId);
    }

    // Switch to 3D mode
    uiStore.analysisMode = '3d';

    uiStore.toast(t('ifc.imported').replace('{n}', String(m.nodes.length)).replace('{e}', String(m.elements.length)), 'success');

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
          </div>

          {#if members.length > 0}
            <div class="ifc-preview">
              <h3>{t('ifc.membersFound')}</h3>
              <div class="ifc-stats">
                <span>{t('ifc.beams')}: {members.filter(m => m.type === 'beam').length}</span>
                <span>{t('ifc.columns')}: {members.filter(m => m.type === 'column').length}</span>
                <span>{t('ifc.braces')}: {members.filter(m => m.type === 'brace').length}</span>
              </div>
            </div>
          {/if}

          {#if mappingResult}
            <div class="ifc-preview">
              <h3>{t('ifc.modelToImport')}</h3>
              <div class="ifc-stats">
                <span>{t('ifc.nodes')}: {mappingResult.nodes.length}</span>
                <span>{t('ifc.elements')}: {mappingResult.elements.length}</span>
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
        <button
          class="ifc-btn-import"
          disabled={!mappingResult || mappingResult.elements.length === 0}
          onclick={handleImport}
        >
          {t('ifc.importModel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
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
