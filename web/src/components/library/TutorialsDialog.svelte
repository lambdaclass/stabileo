<script lang="ts">
  import { i18n, t, tp } from '../../lib/i18n';
  import { examplesUi } from '../../lib/store/examples-ui.svelte';
  import { DEMOS, type DemoGroup } from '../../lib/tour/demos';
  import { PRO_VIDEOS, videoUrl } from '../../lib/pro/videos';

  const YOUTUBE_CHANNEL = 'https://www.youtube.com/@stabileoapp';
  const YOUTUBE_HANDLE = '@stabileoapp ↗';

  let { onStart }: { onStart: (id: string) => void } = $props();

  const GROUPS: Array<{ id: DemoGroup; titleKey: string }> = [
    { id: 'basics', titleKey: 'demo.menu.basics' },
    { id: 'advanced', titleKey: 'demo.menu.advanced' },
  ];

  function start(id: string) {
    examplesUi.close();
    setTimeout(() => onStart(id), 60);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') examplesUi.close();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="tut-overlay" role="dialog" aria-modal="true" aria-label={t('demo.menu.title')} data-testid="tutorials-dialog">
  <button class="tut-backdrop" aria-label={t('ribbon.close')} onclick={() => examplesUi.close()}></button>
  <div class="tut-sheet">
    <div class="tut-head">
      <h3>{t('demo.menu.title')}</h3>
      <button class="tut-close" onclick={() => examplesUi.close()} aria-label={t('ribbon.close')} data-testid="tutorials-close">×</button>
    </div>
    <p class="tut-sub">{t('demo.menu.subtitle')}</p>

    {#each GROUPS as group (group.id)}
      {@const items = DEMOS.filter((d) => d.group === group.id)}
      {#if items.length}
        <p class="tut-group">{t(group.titleKey)}</p>
        <div class="tut-list">
          {#each items as demo (demo.id)}
            <button class="tut-item" onclick={() => start(demo.id)} data-testid="demo-{demo.id}">
              <span class="tut-top">
                <span class="tut-name">{t(demo.titleKey)}</span>
                <span class="tut-secs">{demo.seconds}{t('demo.menu.seconds')}</span>
              </span>
              <span class="tut-desc">{t(demo.descKey)}</span>
            </button>
          {/each}
        </div>
      {/if}
    {/each}

    <p class="tut-group">{t('videos.button')}</p>
    <div class="tut-list" data-testid="pp-video-list">
      {#each PRO_VIDEOS as v (v.id)}
        {@const url = videoUrl(v, i18n.locale)}
        {#if url}
          <a class="tut-item" href={url} target="_blank" rel="noopener noreferrer" data-testid="pp-video-{v.id}">
            <span class="tut-top"><span class="tut-name">{t(v.titleKey)}</span><span class="tut-secs">{tp('videos.minutes', { n: v.minutes })}</span></span>
            <span class="tut-desc">{t(v.descKey)}</span>
          </a>
        {:else}
          <div class="tut-item tut-soon" data-testid="pp-video-{v.id}">
            <span class="tut-top"><span class="tut-name">{t(v.titleKey)}</span><span class="tut-secs">{t('videos.soon')}</span></span>
            <span class="tut-desc">{t(v.descKey)}</span>
          </div>
        {/if}
      {/each}
    </div>

    <a class="tut-youtube" href={YOUTUBE_CHANNEL} target="_blank" rel="noopener noreferrer" data-testid="tutorials-youtube">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z" /></svg>
      <span>{t('appShell.youtubeChannel')}</span>
      <span class="tut-handle">{YOUTUBE_HANDLE}</span>
    </a>
  </div>
</div>

<style>
  .tut-overlay { position: fixed; inset: 0; z-index: 900; display: flex; align-items: center; justify-content: center; }
  .tut-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.45); border: none; cursor: default; }
  .tut-sheet {
    position: relative;
    width: min(640px, calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    overflow-y: auto;
    background: var(--st-surface);
    border: 1px solid var(--st-hair);
    border-radius: 8px;
    padding: 12px 16px 16px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tut-head { display: flex; align-items: center; justify-content: space-between; }
  .tut-head h3 { margin: 0; font-family: var(--st-display); font-size: 1rem; color: var(--st-text); }
  .tut-close { background: none; border: none; color: var(--st-text-2); font-size: 1.2rem; cursor: pointer; padding: 0 4px; }
  .tut-sub { margin: 0 0 4px; font-size: 0.78rem; color: var(--st-text-2); }
  .tut-group {
    margin: 8px 0 2px;
    font-family: var(--st-mono);
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }
  .tut-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .tut-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border: 1px solid var(--st-hair);
    border-radius: 6px;
    background: var(--st-surface-2);
    color: inherit;
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .tut-item:hover { background: var(--st-surface-3); }
  .tut-soon { cursor: default; opacity: 0.7; }
  .tut-soon:hover { background: var(--st-surface-2); }
  .tut-top { display: flex; justify-content: space-between; gap: 8px; }
  .tut-name { font-size: 0.8rem; font-weight: 600; color: var(--st-text); }
  .tut-secs { font-family: var(--st-mono); font-size: 0.66rem; color: var(--st-text-3); white-space: nowrap; }
  .tut-desc { font-size: 0.7rem; line-height: 1.35; color: var(--st-text-2); }

  .tut-youtube {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-top: 1px solid var(--st-hair);
    color: var(--st-text);
    text-decoration: none;
    font-size: 0.82rem;
  }
  .tut-youtube svg { color: #ff3d3d; flex: none; }
  .tut-youtube:hover span:first-of-type { text-decoration: underline; }
  .tut-handle { margin-left: auto; font-family: var(--st-mono); font-size: 0.7rem; color: var(--st-text-3); }

  @media (max-width: 767px) {
    .tut-sheet { width: 100vw; max-height: 100vh; border-radius: 0; }
    .tut-list { grid-template-columns: minmax(0, 1fr); }
  }
</style>
