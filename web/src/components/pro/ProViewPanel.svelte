<script lang="ts">
  /**
   * The view: named cameras, a second window on one of them, what the labels say, and the
   * magnifier.
   *
   * A named view is part of the project (`modelStore.views`): it is saved with it and carried by
   * the model code, so "the north frame" means the same camera to everyone who opens the file.
   * Which view sits in the corner window, and what member labels read, are this reader's.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { viewState, MEMBER_LABELS, type MemberLabel } from '../../lib/store/view-state.svelte';

  let name = $state('');
  const views = $derived(modelStore.views);
  const hasSelection = $derived(uiStore.selectedNodes.size + uiStore.selectedElements.size > 0);

  function save() {
    const n = name.trim() || tp('view.defaultName', { n: views.length + 1 });
    modelStore.saveView(n, uiStore.cameraPosition3D, uiStore.cameraTarget3D);
    name = '';
  }

  function show(id: number) {
    const v = views.find((x) => x.id === id);
    if (v) window.dispatchEvent(new CustomEvent('stabileo-camera-set', { detail: { position: v.position, target: v.target } }));
  }

  function toggleInset(id: number) {
    viewState.insetViewId = viewState.insetViewId === id ? null : id;
  }

  function remove(id: number) {
    if (viewState.insetViewId === id) viewState.insetViewId = null;
    modelStore.removeView(id);
  }
</script>

<div class="vp" data-testid="view-panel">
  <h4>{t('view.saved')}</h4>
  <div class="vp-row">
    <input placeholder={t('view.namePlaceholder')} bind:value={name} onkeydown={(e) => { if (e.key === 'Enter') save(); }} data-testid="view-name" />
    <button onclick={save} data-testid="view-save">{t('view.saveCurrent')}</button>
  </div>
  {#if views.length === 0}
    <p class="vp-dim">{t('view.none')}</p>
  {:else}
    <ul class="vp-list" data-testid="view-list">
      {#each views as v (v.id)}
        <li>
          <input class="vp-name" value={v.name} onchange={(e) => { const s = (e.target as HTMLInputElement).value.trim(); if (s && s !== v.name) modelStore.renameView(v.id, s); }} aria-label={t('view.rename')} />
          <button onclick={() => show(v.id)} data-testid="view-go">{t('view.go')}</button>
          <button class:on={viewState.insetViewId === v.id} onclick={() => toggleInset(v.id)} title={t('view.insetHint')} data-testid="view-inset-toggle">{t('view.inset')}</button>
          <button class="vp-x" onclick={() => remove(v.id)} aria-label={t('view.remove')}>×</button>
        </li>
      {/each}
    </ul>
  {/if}

  <h4>{t('view.labels')}</h4>
  <label class="vp-check"><input type="checkbox" bind:checked={uiStore.showNodeLabels3D} /> {t('view.labelNodes')} <kbd>Alt+N</kbd></label>
  <label class="vp-check"><input type="checkbox" bind:checked={uiStore.showElementLabels3D} /> {t('view.labelMembers')} <kbd>Alt+B</kbd></label>
  <div class="vp-row vp-indent">
    <span class="vp-dim">{t('view.memberLabelShows')}</span>
    <select value={viewState.memberLabel} onchange={(e) => (viewState.memberLabel = (e.target as HTMLSelectElement).value as MemberLabel)} data-testid="view-member-label">
      {#each MEMBER_LABELS as m (m)}<option value={m}>{t(`view.memberLabel.${m}`)}</option>{/each}
    </select>
    <kbd>Alt+M</kbd>
  </div>
  <label class="vp-check"><input type="checkbox" bind:checked={uiStore.showLengths3D} /> {t('view.labelLengths')} <kbd>Alt+L</kbd></label>
  <label class="vp-check"><input type="checkbox" bind:checked={uiStore.showShellLabels3D} /> {t('view.labelShells')} <kbd>Alt+P</kbd></label>

  <h4>{t('view.magnifier')}</h4>
  <div class="vp-row">
    <button onclick={() => window.dispatchEvent(new CustomEvent('stabileo-zoom-to-selection'))} disabled={!hasSelection} data-testid="view-zoom-selection">{t('view.zoomSelection')}</button>
    <kbd>Alt+Z</kbd>
    <button onclick={() => window.dispatchEvent(new CustomEvent('stabileo-zoom-to-fit'))}>{t('view.zoomAll')}</button>
    <kbd>F</kbd>
  </div>
  <p class="vp-dim">{t('view.magnifierHint')}</p>
</div>

<style>
  .vp { display: flex; flex-direction: column; gap: 4px; font-size: 0.7rem; color: var(--st-text-2); }
  h4 { margin: 8px 0 2px; font-size: 0.68rem; font-weight: 600; color: var(--st-text); }
  .vp-row { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
  .vp-indent { padding-left: 18px; }
  .vp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .vp-list li { display: flex; gap: 4px; align-items: center; }
  .vp-name { flex: 1; min-width: 0; }
  input, select { font-size: 0.66rem; padding: 1px 4px; color: var(--st-text); background: var(--st-surface-2); border: 1px solid var(--st-hair-strong); border-radius: 3px; }
  button { padding: 1px 7px; font-size: 0.64rem; color: var(--st-text); background: var(--st-surface-3); border: 1px solid var(--st-hair-strong); border-radius: 3px; cursor: pointer; }
  button.on { border-color: var(--st-accent); }
  button:disabled { opacity: 0.35; cursor: not-allowed; }
  .vp-x { padding: 0 5px; }
  .vp-check { display: flex; gap: 6px; align-items: center; }
  .vp-dim { margin: 0; color: var(--st-text-3); font-size: 0.64rem; }
  kbd { font-size: 0.58rem; color: var(--st-text-3); border: 1px solid var(--st-hair); border-radius: 2px; padding: 0 3px; }
</style>
