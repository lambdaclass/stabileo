<script lang="ts">
  /**
   * The first time PRO opens in a browser, and only once a video is published: a card that offers
   * the short one. Dismissed or followed, it does not come back; the videos stay in Project.
   */
  import { uiStore } from '../../lib/store';
  import { i18n, t, tp } from '../../lib/i18n';
  import { markVideosOffered, publishedVideos, videoUrl, videosOffered } from '../../lib/pro/videos';

  const first = publishedVideos(i18n.locale)[0];
  let show = $state(!!first && !videosOffered());
  const url = first ? videoUrl(first, i18n.locale) : null;
  const visible = $derived(show && uiStore.appMode === 'pro' && !uiStore.embedMode && !uiStore.viewerMode);

  function close() { show = false; markVideosOffered(); }
</script>

{#if visible && first && url}
  <aside class="vo" role="dialog" aria-label={t('videos.offerTitle')} data-testid="pro-videos-offer">
    <strong>{t('videos.offerTitle')}</strong>
    <p>{tp('videos.offerText', { title: t(first.titleKey), n: first.minutes })}</p>
    <div class="vo-actions">
      <a class="pk-btn pk-btn-primary" href={url} target="_blank" rel="noopener noreferrer" onclick={close} data-testid="pro-videos-offer-watch">{t('videos.watch')}</a>
      <button class="pk-btn" onclick={close} data-testid="pro-videos-offer-later">{t('videos.later')}</button>
    </div>
    <p class="vo-note">{t('videos.offerNote')}</p>
  </aside>
{/if}

<style>
  .vo { position: fixed; right: 16px; bottom: 16px; z-index: 950; width: min(320px, calc(100vw - 32px)); padding: 10px 12px;
    background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 8px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    font-size: 0.74rem; color: var(--st-text); }
  .vo p { margin: 6px 0; color: var(--st-text-2); line-height: 1.4; }
  .vo-actions { display: flex; gap: 6px; }
  .vo-actions a { text-decoration: none; }
  .vo-note { font-size: 0.64rem; color: var(--st-text-3) !important; }
</style>
