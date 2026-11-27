<script lang="ts">
  import { t } from '../../lib/i18n';
  import { modelStore, uiStore } from '../../lib/store';
  import { examplesUi } from '../../lib/store/examples-ui.svelte';
  import { EXAMPLES_2D, EXAMPLES_3D, clearPhoneSheet, loadBasicExample, type BasicExample } from '../../lib/examples/basic-examples';
  import { proExampleGroups } from '../../lib/pro/example-catalog';
  import { loadProExample } from '../../lib/pro/load-pro-example';
  import ProExampleGallery from '../pro/ProExampleGallery.svelte';
  import ExamplePreview from './ExamplePreview.svelte';

  let { mode }: { mode: 'basico' | 'pro' } = $props();

  const shelf = $derived(examplesUi.shelf ?? (uiStore.is3DWorkspace ? 'space' : 'plane'));
  const items = $derived<readonly BasicExample[]>(shelf === 'space' ? EXAMPLES_3D : EXAMPLES_2D);
  const groups = $derived(proExampleGroups(t));

  let asking = $state<string | null>(null);
  const hasModel = () => modelStore.nodes.size > 0 || modelStore.elements.size > 0;

  function chooseBasic(ex: BasicExample) {
    if (hasModel() && asking !== ex.id) { asking = ex.id; return; }
    asking = null;
    examplesUi.close();
    clearPhoneSheet();
    void loadBasicExample(ex.id, shelf === 'space');
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') examplesUi.close();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="lib-overlay" role="dialog" aria-modal="true" aria-label={t('pro.exampleBtn')} data-testid="examples-dialog">
  <button class="lib-backdrop" aria-label={t('ribbon.close')} onclick={() => examplesUi.close()}></button>
  <div class="lib-sheet">
    <div class="lib-head">
      <h3>{t('pro.exampleBtn')}</h3>
      {#if mode === 'basico'}
        <div class="lib-shelves" role="tablist">
          <button role="tab" class:on={shelf === 'plane'} aria-selected={shelf === 'plane'} onclick={() => { examplesUi.shelf = 'plane'; asking = null; }} data-testid="ex-group-2d">
            {t('examples.title2d')} <span>{EXAMPLES_2D.length}</span>
          </button>
          <button role="tab" class:on={shelf === 'space'} aria-selected={shelf === 'space'} onclick={() => { examplesUi.shelf = 'space'; asking = null; }} data-testid="ex-group-3d">
            {t('examples.title3d')} <span>{EXAMPLES_3D.length}</span>
          </button>
        </div>
      {/if}
      <span class="lib-spacer"></span>
      <button class="lib-close" onclick={() => examplesUi.close()} aria-label={t('ribbon.close')} data-testid="pp-gallery-close">×</button>
    </div>

    {#if mode === 'pro'}
      <ProExampleGallery {groups} onLoad={(ex) => { examplesUi.close(); clearPhoneSheet(); void loadProExample(ex); }} />
    {:else}
      <div class="lib-grid" data-tour="examples-section">
        {#each items as ex (ex.id)}
          <div class="lib-card" class:asking={asking === ex.id}>
            <button class="lib-pick" onclick={() => chooseBasic(ex)} data-testid="example-{ex.id}" aria-expanded={asking === ex.id}>
              <ExamplePreview id={ex.id} />
              <span class="lib-name">{t(ex.nameKey)}</span>
              <span class="lib-desc">{t(ex.descKey)}</span>
            </button>
            {#if asking === ex.id}
              <div class="lib-ask" data-testid="example-confirm">
                <span>{t('pro.examples.replaceAsk')}</span>
                <button class="lib-go" onclick={() => chooseBasic(ex)}>{t('pro.examples.load')}</button>
                <button class="lib-no" onclick={() => (asking = null)}>{t('pro.examples.cancel')}</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .lib-overlay { position: fixed; inset: 0; z-index: 900; display: flex; align-items: center; justify-content: center; }
  .lib-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.45); border: none; cursor: default; }
  .lib-sheet {
    position: relative;
    width: min(1080px, calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    overflow-y: auto;
    background: var(--st-surface);
    border: 1px solid var(--st-hair);
    border-radius: 8px;
    padding: 12px 14px 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  }
  .lib-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
  .lib-head h3 { margin: 0; font-family: var(--st-display); font-size: 1rem; color: var(--st-text); }
  .lib-spacer { flex: 1; }
  .lib-close { background: none; border: none; color: var(--st-text-2); font-size: 1.2rem; cursor: pointer; padding: 0 4px; }

  .lib-shelves { display: flex; gap: 4px; }
  .lib-shelves button {
    padding: 3px 10px;
    border: 1px solid var(--st-hair-strong);
    border-radius: 999px;
    background: none;
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.76rem;
    cursor: pointer;
  }
  .lib-shelves button span { font-family: var(--st-mono); font-size: 0.66rem; color: var(--st-text-3); margin-left: 2px; }
  .lib-shelves button.on { border-color: var(--st-accent); color: var(--st-accent); background: var(--st-selected-bg); }

  .lib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
  .lib-card { border: 1px solid var(--st-hair); border-radius: 6px; overflow: hidden; background: var(--st-surface-2); }
  .lib-card.asking { border-color: var(--st-accent); }
  .lib-pick {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 0 0 8px;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .lib-pick:hover { background: var(--st-surface-3); }
  .lib-pick:focus-visible { outline: 2px solid var(--st-accent); outline-offset: -2px; }
  .lib-name { padding: 6px 8px 0; font-size: 0.8rem; font-weight: 600; color: var(--st-text); }
  .lib-desc { padding: 0 8px; font-size: 0.7rem; line-height: 1.35; color: var(--st-text-2); }
  .lib-ask { display: flex; align-items: center; gap: 6px; padding: 0 8px 8px; font-size: 0.7rem; color: var(--st-text-2); }
  .lib-ask span { flex: 1; }
  .lib-go, .lib-no { font: inherit; font-size: 0.7rem; padding: 2px 8px; border-radius: var(--st-radius); cursor: pointer; }
  .lib-go { background: var(--st-accent); color: var(--st-text-on-accent); border: none; }
  .lib-no { background: none; color: var(--st-text-2); border: 1px solid var(--st-hair); }

  @media (max-width: 767px) {
    .lib-sheet { width: 100vw; max-height: 100vh; border-radius: 0; }
    .lib-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
