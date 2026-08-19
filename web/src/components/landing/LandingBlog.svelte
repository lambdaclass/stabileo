<script lang="ts">
  /** The way into the blog, at the foot of the deck, just above the footer. */
  import { tPublic as t, publicI18n } from '../../lib/i18n/store.svelte';
  import { goPublic } from './landing-utils';
  import { POSTS } from '../../lib/blog';

  const latest = $derived(POSTS[0]?.i18n[publicI18n.locale]);
</script>

<section class="sec sec--ink blog-cta reveal" data-section="blog" aria-labelledby="blog-cta-title">
  <div class="wrap">
    <div class="blog-cta-inner">
      <p class="eyebrow">
        <span class="eyebrow-rule" aria-hidden="true"></span>
        <span class="eyebrow-label">{t('landing.blogEyebrow')}</span>
      </p>
      <h2 id="blog-cta-title" class="display">{t('landing.blogTitle')}</h2>
      <p class="lead">{t('landing.blogBody')}</p>
      {#if latest}
        <p class="blog-cta-latest">{latest.title}</p>
      {/if}
      <div>
        <button class="btn btn-primary" onclick={() => goPublic('/blog')}>{t('landing.blogLink')}</button>
      </div>
    </div>
  </div>
</section>
