<script lang="ts">
  /** PRO's videos, beside the examples: what each shows and how long it is, opened on YouTube. */
  import Hint from './Hint.svelte';
  import { i18n, t, tp } from '../../lib/i18n';
  import { PRO_VIDEOS, videoUrl } from '../../lib/pro/videos';

  let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<button class="pp-btn pp-btn-wide pp-disclose" onclick={() => (open = !open)} aria-expanded={open} data-testid="pp-videos">
  <span>{t('videos.button')}</span>
  <span class="pp-caret">{open ? '▾' : '▸'}</span>
</button>
{#if open}
  <Hint text={t('videos.hint')} />
  <ul class="pv-list" data-testid="pp-video-list">
    {#each PRO_VIDEOS as v (v.id)}
      {@const url = videoUrl(v, i18n.locale)}
      <li data-testid="pp-video-{v.id}">
        <div class="pv-head"><strong>{t(v.titleKey)}</strong><span class="pv-len">{tp('videos.minutes', { n: v.minutes })}</span></div>
        <p class="pv-desc">{t(v.descKey)}</p>
        {#if url}
          <a class="pp-btn" href={url} target="_blank" rel="noopener noreferrer" data-testid="pp-video-open-{v.id}">{t('videos.watch')}</a>
        {:else}
          <span class="pv-soon" data-testid="pp-video-soon-{v.id}">{t('videos.soon')}</span>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .pv-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .pv-list li { border: 1px solid var(--st-hair); border-radius: var(--st-radius); padding: 6px 8px; background: var(--st-surface-2); }
  .pv-head { display: flex; justify-content: space-between; gap: 8px; font-size: 0.74rem; color: var(--st-text); }
  .pv-len { color: var(--st-text-3); font-size: 0.66rem; white-space: nowrap; }
  .pv-desc { margin: 4px 0 6px; font-size: 0.68rem; color: var(--st-text-2); line-height: 1.4; }
  .pv-soon { font-size: 0.66rem; color: var(--st-text-3); }
  .pv-list a { text-decoration: none; display: inline-block; }
</style>
