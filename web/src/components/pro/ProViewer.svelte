<script lang="ts">
  /**
   * The public viewer (`/app/pro?view`, with a link's model or `&example=`): the model's name and
   * who signs it, the 3D view, the plan of each level or both side by side, and the examples to
   * look at, without the editor. Nothing is saved. "Duplicate and edit" turns it into an ordinary
   * PRO tab, a copy that is then saved as any other.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { viewState } from '../../lib/store/view-state.svelte';
  import { requestAutosave } from '../../lib/store/autosave-service';
  import { sortedLevels } from '../../lib/model/grid';
  import { proExampleGroups, type ProExample } from '../../lib/data/pro-examples';

  const name = $derived(modelStore.model.name || t('viewer.untitled'));
  const info = $derived(modelStore.model.projectInfo);
  const author = $derived(info?.designer?.name ?? '');
  const levels = $derived(sortedLevels(modelStore.grid));
  const counts = $derived(tp('viewer.counts', { nodes: modelStore.nodes.size, members: modelStore.elements.size, shells: modelStore.quads.size + modelStore.plates.size }));
  let gallery = $state(false);
  const groups = $derived(gallery ? proExampleGroups(t) : []);

  type Mode = '3d' | 'plan' | 'split';
  const shown = $derived<Mode>(viewState.split ? 'split' : uiStore.planView3D ? 'plan' : '3d');
  function setMode(m: Mode) {
    viewState.split = m === 'split';
    uiStore.planView3D = m === 'plan';
  }

  async function open(ex: ProExample) {
    gallery = false;
    await ex.load();
    window.dispatchEvent(new Event('stabileo-zoom-to-fit'));
  }

  function duplicate() {
    uiStore.viewerMode = false;
    history.replaceState(null, '', '/app/pro');
    void requestAutosave('manual');
    uiStore.toast(t('viewer.duplicated'), 'success');
  }
</script>

<header class="vw" data-testid="pro-viewer">
  <div class="vw-id">
    <strong class="vw-name" data-testid="viewer-name">{name}</strong>
    <span class="vw-meta">{#if author}{tp('viewer.by', { name: author })} · {/if}{#if info?.job}{info.job} · {/if}{counts}</span>
  </div>
  <div class="vw-seg" role="radiogroup" aria-label={t('viewer.view')}>
    {#each [['3d', 'viewer.mode.3d'], ['plan', 'viewer.mode.plan'], ['split', 'viewer.mode.split']] as [m, k] (m)}
      <button type="button" role="radio" aria-checked={shown === m} class:on={shown === m} onclick={() => setMode(m as Mode)} data-testid="viewer-mode-{m}">{t(k)}</button>
    {/each}
  </div>
  {#if levels.length > 1 && (shown === 'plan' || shown === 'split')}
    <select value={levels.find((l) => Math.abs(l.z - uiStore.nodeCreateZ) < 1e-6)?.id ?? ''} onchange={(e) => { const l = levels.find((x) => x.id === e.currentTarget.value); if (l) uiStore.setActiveLevel(l.z); }}
      aria-label={t('viewport.split.levels')} data-testid="viewer-level">
      {#each [...levels].reverse() as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
    </select>
  {/if}
  <span class="vw-spacer"></span>
  <button class="vw-btn" onclick={() => (gallery = !gallery)} aria-expanded={gallery} data-testid="viewer-gallery">{t('viewer.gallery')}</button>
  <button class="vw-btn vw-primary" onclick={duplicate} data-testid="viewer-duplicate">{t('viewer.duplicate')}</button>
</header>

{#if gallery}
  <div class="vw-gallery" data-testid="viewer-gallery-list">
    {#each groups as g (g.group)}
      <h5>{g.title}</h5>
      <ul>
        {#each g.examples as ex (ex.id)}
          <li><button onclick={() => open(ex)} data-testid="viewer-example-{ex.id}"><strong>{t(ex.nameKey)}</strong><span>{t('viewer.byStabileo')}</span></button></li>
        {/each}
      </ul>
    {/each}
  </div>
{/if}

<style>
  .vw { position: fixed; top: 0; left: 0; right: 0; z-index: 900; display: flex; align-items: center; gap: 10px; padding: 6px 12px;
    background: var(--st-surface); border-bottom: 1px solid var(--st-hair-strong); font-size: 0.74rem; color: var(--st-text-2); flex-wrap: wrap; }
  .vw-id { display: flex; flex-direction: column; min-width: 0; }
  .vw-name { color: var(--st-text); font-size: 0.86rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vw-meta { font-size: 0.66rem; color: var(--st-text-3); }
  .vw-seg { display: inline-flex; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); overflow: hidden; }
  .vw-seg button { border: 0; background: none; padding: 3px 10px; color: var(--st-text-3); cursor: pointer; font-size: 0.7rem; }
  .vw-seg button + button { border-left: 1px solid var(--st-hair-strong); }
  .vw-seg button.on { background: var(--st-selected-bg); color: var(--st-text); }
  .vw-spacer { flex: 1; }
  .vw-btn { border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text); border-radius: var(--st-radius); padding: 4px 10px; cursor: pointer; font-size: 0.72rem; }
  .vw-primary { background: var(--st-accent); border-color: var(--st-accent); color: var(--st-text-on-accent); }
  .vw-gallery { position: fixed; top: 52px; right: 12px; z-index: 900; width: min(360px, calc(100vw - 24px)); max-height: calc(100vh - 70px); overflow-y: auto;
    background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 8px; padding: 8px 10px; font-size: 0.72rem; }
  .vw-gallery h5 { margin: 8px 0 4px; color: var(--st-text-3); font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .vw-gallery ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .vw-gallery button { width: 100%; text-align: left; display: flex; justify-content: space-between; gap: 8px; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 4px 6px; cursor: pointer; }
  .vw-gallery span { color: var(--st-text-3); font-size: 0.64rem; }
</style>
