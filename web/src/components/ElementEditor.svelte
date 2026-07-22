<script lang="ts">
  import { modelStore, uiStore, historyStore } from '../lib/store';
  import { NO_RELEASE } from '../lib/store/model.svelte';
  import { t } from '../lib/i18n';

  const elemId = $derived(uiStore.editingElementId);
  const elem = $derived(elemId !== null ? modelStore.elements.get(elemId) : undefined);
  const rawPos = $derived(uiStore.editScreenPos);
  const is3DMode = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');

  let editorEl: HTMLDivElement | undefined = $state();
  // Clamp position so panel never extends beyond viewport
  const pos = $derived.by(() => {
    let x = rawPos.x;
    let y = rawPos.y;
    if (editorEl) {
      const rect = editorEl.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      // If bottom edge exceeds viewport, move panel up
      if (y + rect.height + 10 > vh) {
        y = Math.max(10, vh - rect.height - 10);
      }
      // Horizontal clamping
      const halfW = rect.width / 2;
      if (x - halfW < 10) x = halfW + 10;
      if (x + halfW > vw - 10) x = vw - halfW - 10;
    }
    return { x, y };
  });

  let hingeStart = $state(false);
  let hingeEnd = $state(false);
  let materialId = $state(1);
  let sectionId = $state(1);
  // Sliding joints (Basic 2D only) — '' = none.
  let slideStart = $state<'' | 'x' | 'z'>('');
  let slideEnd = $state<'' | 'x' | 'z'>('');
  let slideStartAxis = $state<'global' | 'local'>('global');
  let slideEndAxis = $state<'global' | 'local'>('global');
  // Basic 3D internal joint — six released relative-DOF masks per end.
  const DOF3D_LABELS = ['dx', 'dy', 'dz', 'θx', 'θy', 'θz'];
  let jointStart = $state<boolean[]>([false, false, false, false, false, false]);
  let jointEnd = $state<boolean[]>([false, false, false, false, false, false]);

  // Sync local values when element changes
  $effect(() => {
    if (elem) {
      hingeStart = elem.releaseI?.mz === true;
      hingeEnd = elem.releaseJ?.mz === true;
      slideStart = elem.releaseI?.slide ?? '';
      slideEnd = elem.releaseJ?.slide ?? '';
      slideStartAxis = elem.releaseI?.slideAxis ?? 'global';
      slideEndAxis = elem.releaseJ?.slideAxis ?? 'global';
      jointStart = elem.jointI ? [...elem.jointI.dof] : [false, false, false, false, false, false];
      jointEnd = elem.jointJ ? [...elem.jointJ.dof] : [false, false, false, false, false, false];
      materialId = elem.materialId;
      sectionId = elem.sectionId;
    }
  });

  function confirm() {
    if (!elem || elemId === null) return;
    const changed =
      hingeStart !== (elem.releaseI?.mz === true) ||
      hingeEnd !== (elem.releaseJ?.mz === true) ||
      slideStart !== (elem.releaseI?.slide ?? '') ||
      slideEnd !== (elem.releaseJ?.slide ?? '') ||
      slideStartAxis !== (elem.releaseI?.slideAxis ?? 'global') ||
      slideEndAxis !== (elem.releaseJ?.slideAxis ?? 'global') ||
      (is3DMode && jointStart.some((v, i) => v !== (elem.jointI?.dof[i] ?? false))) ||
      (is3DMode && jointEnd.some((v, i) => v !== (elem.jointJ?.dof[i] ?? false))) ||
      materialId !== elem.materialId ||
      sectionId !== elem.sectionId;

    if (changed) {
      historyStore.pushState();
      const relI = { ...(elem.releaseI ?? NO_RELEASE), mz: hingeStart } as typeof elem.releaseI;
      const relJ = { ...(elem.releaseJ ?? NO_RELEASE), mz: hingeEnd } as typeof elem.releaseJ;
      if (slideStart === '') { delete relI.slide; delete relI.slideAxis; }
      else { relI.slide = slideStart; relI.slideAxis = slideStartAxis; }
      if (slideEnd === '') { delete relJ.slide; delete relJ.slideAxis; }
      else { relJ.slide = slideEnd; relJ.slideAxis = slideEndAxis; }
      elem.releaseI = relI;
      elem.releaseJ = relJ;
      elem.materialId = materialId;
      elem.sectionId = sectionId;
      if (is3DMode) {
        if (jointStart.some(Boolean)) elem.jointI = { dof: [...jointStart] as any };
        else delete elem.jointI;
        if (jointEnd.some(Boolean)) elem.jointJ = { dof: [...jointEnd] as any };
        else delete elem.jointJ;
      }
    }
    close();
  }

  function close() {
    uiStore.editingElementId = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
    e.stopPropagation();
  }
</script>

{#if elem}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={close}></div>
  <div class="editor" bind:this={editorEl} style="left: {pos.x}px; top: {pos.y}px;" onkeydown={handleKeydown}>
    <div class="title">{t('editor.element')} {elemId}</div>

    <div class="field">
      <span>{t('editor.material')}:</span>
      <select bind:value={materialId}>
        {#each Array.from(modelStore.materials.values()) as mat}
          <option value={mat.id}>{mat.name}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <span>{t('editor.section')}:</span>
      <select bind:value={sectionId}>
        {#each Array.from(modelStore.sections.values()) as sec}
          <option value={sec.id}>{sec.name}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label title={is3DMode ? t('prop.hinge3DDisclosure') : ''}>
        <input type="checkbox" bind:checked={hingeStart} />
        {t('editor.hingeStart')}{is3DMode ? ` ${t('prop.hinges3DSuffix')}` : ''}
      </label>
    </div>

    <div class="field">
      <label title={is3DMode ? t('prop.hinge3DDisclosure') : ''}>
        <input type="checkbox" bind:checked={hingeEnd} />
        {t('editor.hingeEnd')}{is3DMode ? ` ${t('prop.hinges3DSuffix')}` : ''}
      </label>
    </div>

    {#if !is3DMode && elem.type === 'frame'}
      <div class="field">
        <span>{t('editor.slideStart')}:</span>
        <select bind:value={slideStart}>
          <option value="">{t('editor.slideNone')}</option>
          <option value="x">{t('editor.slideX')}</option>
          <option value="z">{t('editor.slideZ')}</option>
        </select>
        {#if slideStart !== ''}
          <select bind:value={slideStartAxis} title={t('float.jointAxis')}>
            <option value="global">{t('float.jointAxisGlobal')}</option>
            <option value="local">{t('float.jointAxisLocal')}</option>
          </select>
        {/if}
      </div>
      <div class="field">
        <span>{t('editor.slideEnd')}:</span>
        <select bind:value={slideEnd}>
          <option value="">{t('editor.slideNone')}</option>
          <option value="x">{t('editor.slideX')}</option>
          <option value="z">{t('editor.slideZ')}</option>
        </select>
        {#if slideEnd !== ''}
          <select bind:value={slideEndAxis} title={t('float.jointAxis')}>
            <option value="global">{t('float.jointAxisGlobal')}</option>
            <option value="local">{t('float.jointAxisLocal')}</option>
          </select>
        {/if}
      </div>
    {/if}

    {#if is3DMode && elem.type === 'frame'}
      <div class="joint3d" title={t('editor.joint3dHint')}>
        <div class="joint3d-title">{t('editor.joint3dTitle')}</div>
        <div class="joint3d-row">
          <span class="joint3d-end">I</span>
          {#each DOF3D_LABELS as label, i}
            <label class="joint3d-dof"><input type="checkbox" bind:checked={jointStart[i]} />{label}</label>
          {/each}
        </div>
        <div class="joint3d-row">
          <span class="joint3d-end">J</span>
          {#each DOF3D_LABELS as label, i}
            <label class="joint3d-dof"><input type="checkbox" bind:checked={jointEnd[i]} />{label}</label>
          {/each}
        </div>
      </div>
    {/if}

    <div class="info">
      {t('editor.nodesLabel')}: {elem.nodeI} → {elem.nodeJ}
      | L = {modelStore.getElementLength(elemId!).toFixed(3)} m
    </div>

    <div class="buttons">
      <button class="btn-ok" onclick={confirm}>OK</button>
      <button class="btn-cancel" onclick={close}>{t('editor.cancel')}</button>
    </div>
  </div>
{/if}

<style>
  .joint3d {
    border-top: 1px solid #0f3460;
    padding-top: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .joint3d-title {
    font-size: 0.72rem;
    color: #4ecdc4;
    font-weight: 600;
  }
  .joint3d-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
  .joint3d-end {
    font-size: 0.72rem;
    color: #888;
    width: 12px;
    font-weight: 600;
  }
  .joint3d-dof {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 0.72rem;
    color: #ccc;
    cursor: pointer;
  }
  .joint3d-dof input[type="checkbox"] { accent-color: #e94560; }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .editor {
    position: fixed;
    z-index: 100;
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 6px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    transform: translate(-50%, 10px);
    min-width: 220px;
  }

  .title {
    font-size: 0.8rem;
    font-weight: 600;
    color: #4ecdc4;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #ccc;
  }

  .field span {
    min-width: 60px;
  }

  .field select {
    flex: 1;
    padding: 0.3rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    font-size: 0.8rem;
  }

  .field label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
  }

  .field input[type="checkbox"] {
    accent-color: #e94560;
  }

  .info {
    font-size: 0.7rem;
    color: #888;
    padding-top: 0.25rem;
    border-top: 1px solid #0f3460;
  }

  .buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  .btn-ok, .btn-cancel {
    padding: 0.25rem 0.6rem;
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .btn-ok {
    background: #e94560;
    color: white;
  }
  .btn-ok:hover { background: #ff6b6b; }

  .btn-cancel {
    background: #2a2a4e;
    color: #aaa;
  }
  .btn-cancel:hover { background: #3a3a5e; }
</style>
