<script lang="ts">
  import { t } from '../../lib/i18n';
  import { modelStore, uiStore } from '../../lib/store';
  import { untrack } from 'svelte';
  import { projectSettings, type ProjectSettingsPage } from '../../lib/store/project-settings.svelte';
  import ProProjectInfo from '../pro/ProProjectInfo.svelte';
  import ProOfficeTemplates from '../pro/ProOfficeTemplates.svelte';
  import ProjectRegulationsPanel from '../pro/design/ProjectRegulationsPanel.svelte';
  import Icon from '../ribbon/Icon.svelte';

  const PAGES: Array<{ id: ProjectSettingsPage; key: string; icon: string }> = [
    { id: 'data', key: 'projectInfo.title', icon: 'project' },
    { id: 'regulations', key: 'regulations.title', icon: 'book' },
    { id: 'templates', key: 'templates.title', icon: 'template' },
  ];
  const page = $derived(projectSettings.page ?? 'data');
  const current = $derived(PAGES.find((p) => p.id === page)!);
  const name = $derived(modelStore.model.name || t('viewer.untitled'));

  const openedOn = untrack(() => uiStore.proActiveTab);
  $effect(() => {
    if (uiStore.proActiveTab === openedOn) return;
    uiStore.proPanelVisible = true;
    projectSettings.close();
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') projectSettings.close(); }} />

<div class="ps-overlay" role="dialog" aria-modal="true" aria-labelledby="ps-title" data-testid="project-settings">
  <button class="ps-backdrop" aria-label={t('ribbon.close')} onclick={() => projectSettings.close()}></button>
  <div class="ps-sheet st-pro-surface">
    <header class="ps-head">
      <div class="ps-title">
        <h3 id="ps-title">{t('appShell.projectSettings')}</h3>
        <span class="ps-name">{name}</span>
      </div>
      <button class="ps-close" onclick={() => projectSettings.close()} aria-label={t('ribbon.close')} data-testid="project-settings-close">
        <Icon name="close" size={16} />
      </button>
    </header>
    <div class="ps-main">
      <nav class="ps-nav" aria-label={t('appShell.projectSettings')}>
        {#each PAGES as p (p.id)}
          <button
            class="ps-tab"
            class:on={page === p.id}
            aria-current={page === p.id ? 'page' : undefined}
            onclick={() => projectSettings.show(p.id)}
            data-testid="ps-page-{p.id}"
          ><Icon name={p.icon} size={15} /><span>{t(p.key)}</span></button>
        {/each}
      </nav>
      <section class="ps-body" data-testid="ps-body-{page}">
        <h4 class="ps-page-title">{t(current.key)}</h4>
        {#if page === 'data'}
          <ProProjectInfo />
        {:else if page === 'regulations'}
          <ProjectRegulationsPanel />
        {:else}
          <ProOfficeTemplates />
        {/if}
      </section>
    </div>
  </div>
</div>

<style>
  .ps-overlay { position: fixed; inset: 0; z-index: 880; display: flex; align-items: center; justify-content: center; }
  .ps-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); border: none; cursor: default; }
  .ps-sheet {
    position: relative;
    width: min(920px, calc(100vw - 48px));
    height: min(680px, calc(100vh - 64px));
    display: flex;
    flex-direction: column;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    overflow: hidden;
  }
  .ps-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--st-hair);
  }
  .ps-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  h3 { margin: 0; font-family: var(--st-display); font-size: 1rem; color: var(--st-text); white-space: nowrap; }
  .ps-name { font-size: 0.76rem; color: var(--st-text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ps-close {
    flex: none;
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    cursor: pointer;
  }
  .ps-close:hover { background: var(--st-surface-2); color: var(--st-text); }
  .ps-main { flex: 1; min-height: 0; display: flex; }
  .ps-nav {
    flex: 0 0 210px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 8px;
    background: var(--st-surface-2);
    border-right: 1px solid var(--st-hair);
  }
  .ps-tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.8rem;
    text-align: left;
    cursor: pointer;
  }
  .ps-tab:hover { background: var(--st-surface-3); color: var(--st-text); }
  .ps-tab.on {
    background: var(--st-selected-bg);
    border-color: color-mix(in srgb, var(--st-accent) 45%, transparent);
    color: var(--st-accent);
    box-shadow: inset 2px 0 0 var(--st-accent);
  }
  .ps-body { flex: 1; min-width: 0; overflow-y: auto; padding: 14px 18px 20px; }
  .ps-page-title {
    margin: 0 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--st-hair);
    font-family: var(--st-mono);
    font-size: 0.66rem;
    font-weight: 400;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  @media (max-width: 700px) {
    .ps-sheet { width: 100vw; height: 100dvh; border-radius: 0; border: none; }
    .ps-main { flex-direction: column; }
    .ps-nav { flex: none; flex-direction: row; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--st-hair); padding: 6px; }
    .ps-tab { flex: none; white-space: nowrap; }
    .ps-tab.on { box-shadow: inset 0 -2px 0 var(--st-accent); }
    .ps-body { padding: 12px; }
  }
</style>
