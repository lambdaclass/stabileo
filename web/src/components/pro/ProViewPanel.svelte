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
  import { viewState, viewVisibility, MEMBER_LABELS, type MemberLabel } from '../../lib/store/view-state.svelte';
  import ViewCubeIcon, { type CubeFace } from './ViewCubeIcon.svelte';

  const PRESETS: CubeFace[] = ['top', 'front', 'right', 'iso', 'bottom', 'back', 'left'];
  const selection = () => ({ nodes: uiStore.selectedNodes, elements: uiStore.selectedElements, shells: uiStore.selectedShells });
  const selectionCount = $derived(uiStore.selectedNodes.size + uiStore.selectedElements.size + uiStore.selectedShells.size);
  const hiddenCount = $derived(viewVisibility.hidden ? viewVisibility.hidden.elements.size + viewVisibility.hidden.shells.size : 0);

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

<div class="pk vp" data-testid="view-panel">
  <section class="pk-card">
    <h4 class="pk-heading">{t('view.presets')}</h4>
    <div class="vp-cubes" data-testid="view-presets">
      {#each PRESETS as f (f)}
        <button class="pk-btn vp-cube" title={t(`view.preset.${f}`)} aria-label={t(`view.preset.${f}`)}
          onclick={() => window.dispatchEvent(new CustomEvent('stabileo-camera-view', { detail: f }))} data-testid="view-preset-{f}">
          <ViewCubeIcon face={f} />
          <span>{t(`view.preset.${f}`)}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('view.visibility')}</h4>
    <p class="pk-hint">{t('view.visibilityHint')}</p>
    <div class="pk-row">
      <button class="pk-btn" disabled={selectionCount === 0} onclick={() => viewVisibility.isolate(selection())} data-testid="view-isolate">{t('view.isolate')}</button>
      <button class="pk-btn" disabled={selectionCount === 0} onclick={() => viewVisibility.hide(selection())} data-testid="view-hide">{t('view.hide')}</button>
      <button class="pk-btn" disabled={!viewVisibility.active} onclick={() => viewVisibility.showAll()} data-testid="view-show-all">{t('view.showAll')}</button>
    </div>
    {#if viewVisibility.active}<p class="pk-warn" data-testid="view-hidden-note">{tp('view.hiddenNote', { n: hiddenCount })}</p>{/if}
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('view.saved')}</h4>
    <div class="pk-row">
      <input class="pk-grow" placeholder={t('view.namePlaceholder')} bind:value={name} onkeydown={(e) => { if (e.key === 'Enter') save(); }} data-testid="view-name" />
      <button class="pk-btn" onclick={save} data-testid="view-save">{t('view.saveCurrent')}</button>
    </div>
    {#if views.length === 0}
      <p class="pk-hint">{t('view.none')}</p>
    {:else}
      <ul class="vp-list" data-testid="view-list">
        {#each views as v (v.id)}
          <li>
            <input class="pk-grow" value={v.name} onchange={(e) => { const s = (e.target as HTMLInputElement).value.trim(); if (s && s !== v.name) modelStore.renameView(v.id, s); }} aria-label={t('view.rename')} />
            <button class="pk-btn" onclick={() => show(v.id)} data-testid="view-go">{t('view.go')}</button>
            <button class="pk-btn" class:on={viewState.insetViewId === v.id} onclick={() => toggleInset(v.id)} title={t('view.insetHint')} data-testid="view-inset-toggle">{t('view.inset')}</button>
            <button class="pk-btn pk-btn-icon" onclick={() => remove(v.id)} aria-label={t('view.remove')}>×</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('view.labels')}</h4>
    <label class="pk-check"><input type="checkbox" bind:checked={uiStore.showNodeLabels3D} /> {t('view.labelNodes')} <kbd>Alt+N</kbd></label>
    <label class="pk-check"><input type="checkbox" bind:checked={uiStore.showElementLabels3D} /> {t('view.labelMembers')} <kbd>Alt+B</kbd></label>
    <div class="pk-row vp-indent">
      <span class="pk-label">{t('view.memberLabelShows')}</span>
      <select value={viewState.memberLabel} onchange={(e) => (viewState.memberLabel = (e.target as HTMLSelectElement).value as MemberLabel)} data-testid="view-member-label">
        {#each MEMBER_LABELS as m (m)}<option value={m}>{t(`view.memberLabel.${m}`)}</option>{/each}
      </select>
      <kbd>Alt+M</kbd>
    </div>
    <label class="pk-check"><input type="checkbox" bind:checked={uiStore.showLengths3D} /> {t('view.labelLengths')} <kbd>Alt+L</kbd></label>
    <label class="pk-check"><input type="checkbox" bind:checked={uiStore.showShellLabels3D} /> {t('view.labelShells')} <kbd>Alt+P</kbd></label>
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('view.magnifier')}</h4>
    <div class="pk-row">
      <button class="pk-btn" onclick={() => window.dispatchEvent(new CustomEvent('stabileo-zoom-to-selection'))} disabled={!hasSelection} data-testid="view-zoom-selection">{t('view.zoomSelection')}</button>
      <kbd>Alt+Z</kbd>
      <button class="pk-btn" onclick={() => window.dispatchEvent(new CustomEvent('stabileo-zoom-to-fit'))}>{t('view.zoomAll')}</button>
      <kbd>F</kbd>
    </div>
    <p class="pk-hint">{t('view.magnifierHint')}</p>
  </section>
</div>

<style>
  .vp-cubes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .vp-cube { flex-direction: column; gap: 2px; min-height: 48px; padding: 4px 2px; font-size: 0.6rem; }
  .vp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .vp-list li { display: flex; gap: 4px; align-items: center; }
  .vp-indent { padding-left: 1.3rem; }
  kbd { font-size: 0.58rem; color: var(--st-text-3); border: 1px solid var(--st-hair); border-radius: 2px; padding: 0 3px; font-family: var(--st-mono); }
</style>
