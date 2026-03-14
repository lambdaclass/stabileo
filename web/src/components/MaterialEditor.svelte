<script lang="ts">
  import { modelStore, uiStore } from '../lib/store';
  import { t } from '../lib/i18n';

  let inputName = $state<HTMLInputElement | null>(null);

  const matId = $derived(uiStore.editingMaterialId);
  const mat = $derived(matId !== null ? modelStore.materials.get(matId) ?? null : null);

  let localName = $state('');
  let localE = $state('');
  let localNu = $state('');
  let localRho = $state('');
  let localFy = $state('');

  $effect(() => {
    if (mat) {
      localName = mat.name;
      localE = String(mat.e);
      localNu = String(mat.nu);
      localRho = String(mat.rho);
      localFy = mat.fy != null ? String(mat.fy) : '';
      setTimeout(() => inputName?.select(), 0);
    }
  });

  function confirm() {
    if (!mat || matId === null) return;
    const e = parseFloat(localE);
    const nu = parseFloat(localNu);
    const rho = parseFloat(localRho);
    if (isNaN(e) || isNaN(nu) || isNaN(rho)) return;
    const fy = parseFloat(localFy);
    modelStore.updateMaterial(matId, { name: localName, e, nu, rho, fy: isNaN(fy) ? undefined : fy });
    close();
  }

  function close() {
    uiStore.editingMaterialId = null;
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

{#if mat}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={close}></div>
  <div class="editor">
    <div class="title">{t('matEdit.title').replace('{id}', String(matId))}</div>
    <div class="field">
      <span>{t('matEdit.name')}</span>
      <input
        bind:this={inputName}
        type="text"
        bind:value={localName}
        onkeydown={handleKeydown}
      />
    </div>
    <div class="field">
      <span>E (MPa):</span>
      <input
        type="number"
        step="1000"
        bind:value={localE}
        onkeydown={handleKeydown}
      />
    </div>
    <div class="field">
      <span>ν:</span>
      <input
        type="number"
        step="0.01"
        bind:value={localNu}
        onkeydown={handleKeydown}
      />
    </div>
    <div class="field">
      <span>ρ (kN/m³):</span>
      <input
        type="number"
        step="0.1"
        bind:value={localRho}
        onkeydown={handleKeydown}
      />
    </div>
    <div class="field">
      <span>fy (MPa):</span>
      <input
        type="number"
        step="10"
        bind:value={localFy}
        onkeydown={handleKeydown}
        placeholder={t('matEdit.optional')}
      />
    </div>
    <div class="buttons">
      <button class="btn-ok" onclick={confirm}>OK</button>
      <button class="btn-cancel" onclick={close}>{t('matEdit.cancel')}</button>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
    background: rgba(0, 0, 0, 0.3);
  }

  .editor {
    position: fixed;
    z-index: 100;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    min-width: 240px;
  }

  .title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #4ecdc4;
    margin-bottom: 0.25rem;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #ccc;
  }

  .field span {
    min-width: 80px;
  }

  .field input {
    flex: 1;
    padding: 0.3rem 0.4rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    font-size: 0.8rem;
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
