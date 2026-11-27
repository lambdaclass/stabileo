<script lang="ts">
  import { t } from '../../lib/i18n';
  import { modelStore, uiStore, tabManager } from '../../lib/store';
  import { examplesUi } from '../../lib/store/examples-ui.svelte';
  import { tourStore } from '../../lib/store/tour.svelte';
  import { EXAMPLES_2D, EXAMPLES_3D, loadBasicExample } from '../../lib/examples/basic-examples';
  import { PRO_EXAMPLES } from '../../lib/pro/example-catalog';
  import { loadProExample } from '../../lib/pro/load-pro-example';
  import ExamplePreview from './ExamplePreview.svelte';

  let { mode }: { mode: 'basico' | 'pro' } = $props();

  const PICKS = {
    plane: ['portal-frame', 'howe-truss', 'three-hinge-arch'],
    space: ['3d-portal-frame', '3d-space-truss', '3d-nave-industrial'],
    pro: ['pro-plane-frame-seismic', '3d-building', 'pro-simple-shed'],
  } as const;

  const empty = $derived(modelStore.nodes.size === 0 && modelStore.elements.size === 0
    && modelStore.quads.size === 0 && modelStore.plates.size === 0);
  const visible = $derived(empty && !examplesUi.startOff && !examplesUi.view && !tourStore.isActive
    && !examplesUi.startDismissedFor(tabManager.activeTabId));

  const shelf = $derived(mode === 'pro' ? 'pro' : uiStore.is3DWorkspace ? 'space' : 'plane');
  const picks = $derived.by(() => {
    if (shelf === 'pro') return PICKS.pro.map((id) => PRO_EXAMPLES.find((e) => e.id === id)).filter((e) => !!e).map((e) => ({ id: e!.id, nameKey: e!.nameKey }));
    const list = shelf === 'space' ? EXAMPLES_3D : EXAMPLES_2D;
    return PICKS[shelf].map((id) => list.find((e) => e.id === id)).filter((e) => !!e).map((e) => ({ id: e!.id, nameKey: e!.nameKey }));
  });

  function pick(id: string) {
    if (shelf === 'pro') {
      const ex = PRO_EXAMPLES.find((e) => e.id === id);
      if (ex) void loadProExample(ex);
    } else {
      void loadBasicExample(id, shelf === 'space');
    }
  }
</script>

{#if visible}
  <div class="start" role="region" aria-label={t('appShell.startTitle')} data-testid="start-card">
    <div class="start-head">
      <strong>{t('appShell.startTitle')}</strong>
      <button class="start-x" onclick={() => examplesUi.dismissStart(tabManager.activeTabId)} aria-label={t('ribbon.close')} data-testid="start-close">×</button>
    </div>
    <div class="start-row">
      <button class="start-blank" onclick={() => examplesUi.dismissStart(tabManager.activeTabId)} data-testid="start-blank">
        <span class="start-plus" aria-hidden="true">+</span>
        <span>{t('appShell.startBlank')}</span>
        <small>{t('appShell.startBlankHint')}</small>
      </button>
      {#each picks as p (p.id)}
        <button class="start-ex" onclick={() => pick(p.id)} data-testid="start-example-{p.id}">
          <ExamplePreview id={p.id} />
          <span>{t(p.nameKey)}</span>
        </button>
      {/each}
    </div>
    <div class="start-links">
      <button class="start-link" onclick={() => examplesUi.open('examples', shelf === 'pro' ? null : shelf)} data-testid="start-all-examples">{t('appShell.startAllExamples')} →</button>
      <button class="start-link" onclick={() => examplesUi.open('tutorials')} data-testid="start-tutorials">{t('appShell.tutorials')} →</button>
      <span class="start-spacer"></span>
      <button class="start-off" onclick={() => (examplesUi.startOff = true)} data-testid="start-off">{t('appShell.startHide')}</button>
    </div>
  </div>
{/if}

<style>
  .start {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -55%);
    z-index: 12;
    width: min(620px, calc(100% - 32px));
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: 10px;
    box-shadow: 0 18px 44px -18px rgba(0, 0, 0, 0.75);
  }
  .start-head { display: flex; align-items: center; justify-content: space-between; }
  .start-head strong { font-family: var(--st-display); font-size: 1rem; color: var(--st-text); }
  .start-x { background: none; border: none; color: var(--st-text-2); font-size: 1.2rem; cursor: pointer; padding: 0 4px; }

  .start-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .start-blank, .start-ex {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--st-hair);
    border-radius: 6px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font: inherit;
    font-size: 0.74rem;
    cursor: pointer;
    overflow: hidden;
    padding: 0;
    text-align: left;
  }
  .start-ex span { padding: 5px 7px 6px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .start-blank {
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-style: dashed;
    border-color: var(--st-hair-strong);
    background: transparent;
    text-align: center;
    padding: 8px 6px;
  }
  .start-blank small { font-size: 0.64rem; color: var(--st-text-3); }
  .start-plus { font-size: 1.3rem; line-height: 1; color: var(--st-text-2); }
  .start-blank:hover, .start-ex:hover { border-color: var(--st-accent); background: var(--st-surface-3); }
  .start-blank:focus-visible, .start-ex:focus-visible, .start-link:focus-visible, .start-off:focus-visible { outline: 2px solid var(--st-accent); outline-offset: 1px; }

  .start-links { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .start-link { background: none; border: none; padding: 0; color: var(--st-accent); font: inherit; font-size: 0.76rem; cursor: pointer; }
  .start-link:hover { text-decoration: underline; }
  .start-spacer { flex: 1; }
  .start-off { background: none; border: none; padding: 0; color: var(--st-text-3); font: inherit; font-size: 0.7rem; cursor: pointer; }
  .start-off:hover { color: var(--st-text-2); text-decoration: underline; }

  @media (max-width: 767px) {
    .start { top: 96px; transform: translateX(-50%); padding: 10px 12px; gap: 8px; }
    .start-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
