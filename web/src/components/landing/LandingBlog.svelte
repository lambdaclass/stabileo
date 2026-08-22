<script lang="ts">
  /**
   * The way into the blog, at the foot of the deck.
   *
   * It previews the latest post rather than describing the blog in the
   * abstract, and the paragraph above it is post-agnostic on purpose. An
   * earlier version described the first post in prose and then printed the
   * newest post's title underneath, so the moment a second post existed the
   * section argued with itself: a paragraph about determinism over a heading
   * about torsion.
   *
   * Two ways out, deliberately. The post itself, for someone the title caught;
   * the index, for someone it did not.
   */
  import { tPublic as t, tpPublic as tp, publicI18n } from '../../lib/i18n/store.svelte';
  import PublicLink from './PublicLink.svelte';
  import { POSTS, formatPostDate } from '../../lib/blog';
  import { readingMinutes } from '../../lib/blog/types';

  const latest = $derived(POSTS[0]);
  const body = $derived(latest?.i18n[publicI18n.locale]);
</script>

<section class="sec sec--ink blog-cta reveal" data-section="blog" id="blog" aria-labelledby="blog-cta-title">
  <div class="wrap">
    <div class="blog-cta-inner">
      <p class="eyebrow">
        <span class="eyebrow-rule" aria-hidden="true"></span>
        <span class="eyebrow-label">{t('landing.blogEyebrow')}</span>
      </p>
      <h2 id="blog-cta-title" class="display">{t('landing.blogTitle')}</h2>
      <p class="lead">{t('landing.blogBody')}</p>

      {#if latest && body}
        <article class="blog-latest">
          <p class="kicker">{t('landing.blogLatestKicker')}</p>
          <h3>
            <PublicLink to={`/blog/${latest.slug}`} class="blog-latest-title">{body.title}</PublicLink>
          </h3>
          <p class="blog-latest-meta">
            {formatPostDate(latest.date, publicI18n.locale)}
            <span aria-hidden="true">·</span>
            {tp('blog.readingTime', { n: readingMinutes(body) })}
          </p>
          <p class="blog-latest-excerpt">{body.excerpt}</p>
          <PublicLink to={`/blog/${latest.slug}`} class="link-arrow">{t('landing.blogReadLatest')}</PublicLink>
        </article>
      {/if}

      <div>
        <PublicLink to="/blog" class="btn btn-primary">{t('landing.blogLink')}</PublicLink>
      </div>
    </div>
  </div>
</section>
