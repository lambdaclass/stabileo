<script lang="ts">
  import { modelStore, uiStore } from '../lib/store';
  import { t } from '../lib/i18n';
  import ProfileSelector from './ProfileSelector.svelte';
  import type { SteelProfile } from '../lib/data/steel-profiles';
  import { profileToSectionFull } from '../lib/data/steel-profiles';

  let inputName = $state<HTMLInputElement | null>(null);
  let showProfileSelector = $state(false);

  const secId = $derived(uiStore.editingSectionId);
  const sec = $derived(secId !== null ? modelStore.sections.get(secId) ?? null : null);

  let localName = $state('');
  let localA = $state('');
  let localIz = $state('');
  let localB = $state('');
  let localH = $state('');
  let localRotation = $state('0');
  // Extended profile properties (set when selecting from catalog)
  let pendingShape = $state<string | undefined>(undefined);
  let pendingTw = $state<number | undefined>(undefined);
  let pendingTf = $state<number | undefined>(undefined);
  let pendingT = $state<number | undefined>(undefined);

  $effect(() => {
    if (sec) {
      localName = sec.name;
      localA = String(sec.a);
      localIz = String(sec.iz);
      localB = sec.b != null ? String(sec.b) : '';
      localH = sec.h != null ? String(sec.h) : '';
      localRotation = String(sec.rotation ?? 0);
      pendingShape = sec.shape;
      pendingTw = sec.tw;
      pendingTf = sec.tf;
      pendingT = sec.t;
      setTimeout(() => inputName?.select(), 0);
    }
  });

  let autoCalc = $derived(() => {
    const b = parseFloat(localB);
    const h = parseFloat(localH);
    if (!isNaN(b) && !isNaN(h) && b > 0 && h > 0) {
      return { a: b * h, iz: (b * h * h * h) / 12 };
    }
    return null;
  });

  function recalcFromBH() {
    const calc = autoCalc();
    if (calc) {
      localA = calc.a.toPrecision(6);
      localIz = calc.iz.toPrecision(6);
    }
  }

  function confirm() {
    if (!sec || secId === null) return;
    const a = parseFloat(localA);
    const iz = parseFloat(localIz);
    if (isNaN(a) || isNaN(iz)) return;
    const updates: Record<string, any> = { name: localName, a, iz };
    const b = parseFloat(localB);
    const h = parseFloat(localH);
    if (!isNaN(b)) updates.b = b;
    if (!isNaN(h)) updates.h = h;
    if (pendingShape) updates.shape = pendingShape;
    if (pendingTw != null) updates.tw = pendingTw;
    if (pendingTf != null) updates.tf = pendingTf;
    if (pendingT != null) updates.t = pendingT;
    const rot = parseFloat(localRotation);
    if (!isNaN(rot) && rot !== 0) updates.rotation = rot;
    else updates.rotation = undefined;
    modelStore.updateSection(secId, updates);
    close();
  }

  function close() {
    uiStore.editingSectionId = null;
    showProfileSelector = false;
  }

  function handleProfileSelect(profile: SteelProfile, section: { a: number; iz: number; b: number; h: number }) {
    const full = profileToSectionFull(profile);
    localName = profile.name;
    localA = full.a.toPrecision(6);
    localIz = full.iz.toPrecision(6);
    localB = full.b.toPrecision(4);
    localH = full.h.toPrecision(4);
    // Store extended section properties when confirming
    pendingShape = full.shape;
    pendingTw = full.tw;
    pendingTf = full.tf;
    pendingT = full.t;
    showProfileSelector = false;
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

{#if sec}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={close}></div>
  <div class="editor">
    <div class="title">{t('secEdit.title').replace('{id}', String(secId))}</div>
    <button class="btn-profile" onclick={() => showProfileSelector = true}>
      {t('secEdit.chooseProfile')}
    </button>
    <div class="field">
      <span>{t('secEdit.name')}</span>
      <input
        bind:this={inputName}
        type="text"
        bind:value={localName}
        onkeydown={handleKeydown}
      />
    </div>
    <div class="field">
      <span>A (m²):</span>
      <input
        type="number"
        step="0.0001"
        bind:value={localA}
        onkeydown={handleKeydown}
      />
    </div>
    <div class="field">
      <span>{t('secEdit.iz')}</span>
      <input
        type="number"
        step="0.000001"
        bind:value={localIz}
        onkeydown={handleKeydown}
      />
    </div>
    <div class="separator">{t('secEdit.rectangular')}</div>
    <div class="field">
      <span>b (m):</span>
      <input
        type="number"
        step="0.001"
        bind:value={localB}
        onkeydown={handleKeydown}
        oninput={recalcFromBH}
      />
    </div>
    <div class="field">
      <span>h (m):</span>
      <input
        type="number"
        step="0.001"
        bind:value={localH}
        onkeydown={handleKeydown}
        oninput={recalcFromBH}
      />
    </div>
    <div class="separator">{t('secEdit.profileRotation')}</div>
    <div class="field">
      <span>{t('secEdit.rotation')}</span>
      <input
        type="number"
        step="1"
        min="0"
        max="359"
        bind:value={localRotation}
        onkeydown={handleKeydown}
      />
    </div>
    <div class="buttons">
      <button class="btn-ok" onclick={confirm}>OK</button>
      <button class="btn-cancel" onclick={close}>{t('secEdit.cancel')}</button>
    </div>
  </div>

  <ProfileSelector
    open={showProfileSelector}
    onselect={handleProfileSelect}
    onclose={() => showProfileSelector = false}
  />
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

  .separator {
    font-size: 0.7rem;
    color: #4ecdc4;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-top: 1px solid #0f3460;
    padding-top: 0.4rem;
    margin-top: 0.1rem;
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

  .btn-profile {
    width: 100%;
    padding: 0.35rem;
    background: #0f3460;
    border: 1px dashed #1a4a7a;
    border-radius: 4px;
    color: #4ecdc4;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-profile:hover {
    background: #1a4a7a;
    border-style: solid;
  }
</style>
