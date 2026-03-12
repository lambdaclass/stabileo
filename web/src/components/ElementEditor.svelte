<script lang="ts">
  import { modelStore, uiStore, historyStore } from '../lib/store';
  import { t } from '../lib/i18n';

  const elemId = $derived(uiStore.editingElementId);
  const elem = $derived(elemId !== null ? modelStore.elements.get(elemId) : undefined);
  const rawPos = $derived(uiStore.editScreenPos);

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

  // Sync local values when element changes
  $effect(() => {
    if (elem) {
      hingeStart = elem.hingeStart ?? false;
      hingeEnd = elem.hingeEnd ?? false;
      materialId = elem.materialId;
      sectionId = elem.sectionId;
    }
  });

  function confirm() {
    if (!elem || elemId === null) return;
    const changed =
      hingeStart !== (elem.hingeStart ?? false) ||
      hingeEnd !== (elem.hingeEnd ?? false) ||
      materialId !== elem.materialId ||
      sectionId !== elem.sectionId;

    if (changed) {
      historyStore.pushState();
      elem.hingeStart = hingeStart;
      elem.hingeEnd = hingeEnd;
      elem.materialId = materialId;
      elem.sectionId = sectionId;
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
      <label>
        <input type="checkbox" bind:checked={hingeStart} />
        {t('editor.hingeStart')}
      </label>
    </div>

    <div class="field">
      <label>
        <input type="checkbox" bind:checked={hingeEnd} />
        {t('editor.hingeEnd')}
      </label>
    </div>

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
