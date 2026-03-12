<script lang="ts">
  import { modelStore, uiStore, historyStore, resultsStore } from '../lib/store';
  import { t } from '../lib/i18n';

  let inputX = $state<HTMLInputElement | null>(null);
  let inputY = $state<HTMLInputElement | null>(null);

  const nodeId = $derived(uiStore.editingNodeId);
  const node = $derived(nodeId !== null ? modelStore.getNode(nodeId) : null);
  const pos = $derived(uiStore.editScreenPos);

  let localX = $state('');
  let localY = $state('');

  // Sync local values when node changes
  $effect(() => {
    if (node) {
      localX = node.x.toFixed(3);
      localY = node.y.toFixed(3);
      // Focus first input on next tick
      setTimeout(() => inputX?.select(), 0);
    }
  });

  function confirm() {
    if (!node || nodeId === null) return;
    const x = parseFloat(localX);
    const y = parseFloat(localY);
    if (isNaN(x) || isNaN(y)) return;
    if (x !== node.x || y !== node.y) {
      historyStore.pushState();
      modelStore.updateNode(nodeId, x, y);
      resultsStore.clear();
    }
    close();
  }

  function close() {
    uiStore.editingNodeId = null;
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

{#if node}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={close}></div>
  <div class="editor" style="left: {pos.x}px; top: {pos.y}px;">
    <div class="title">{t('editor.node')} {nodeId}</div>
    <div class="field">
      <span>X (m):</span>
      <input
        bind:this={inputX}
        type="number"
        step="0.001"
        bind:value={localX}
        onkeydown={handleKeydown}
      />
    </div>
    <div class="field">
      <span>Y (m):</span>
      <input
        bind:this={inputY}
        type="number"
        step="0.001"
        bind:value={localY}
        onkeydown={handleKeydown}
      />
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
    min-width: 180px;
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
    min-width: 45px;
  }

  .field input {
    flex: 1;
    padding: 0.3rem 0.4rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    font-size: 0.8rem;
    width: 80px;
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
