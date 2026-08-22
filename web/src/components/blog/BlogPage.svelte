<script lang="ts">
  /**
   * The blog: an index at /blog and one page per post at /blog/<slug>.
   *
   * There is no server. The site is a static bundle on GitHub Pages, so a
   * request for /blog/<slug> is a 404 that public/404.html turns into
   * `/?route=/blog/<slug>`; App.svelte restores the address and hands the path
   * here. Every internal link is a `PublicLink`: a real anchor a crawler can
   * follow, whose plain left click is handled in history so the reader never
   * pays for a reload.
   */
  import { tPublic as t, tpPublic as tp, publicI18n } from '../../lib/i18n/store.svelte';
  import { applyPageMeta, restorePageMeta } from '../../lib/page-meta';
  import { publicUrl } from '../../lib/i18n/public-routes';
  import { POSTS, findPost, formatPostDate } from '../../lib/blog';
  import { readingMinutes } from '../../lib/blog/types';
  import { enterApp } from '../landing/landing-utils';
  import BlogNav from './BlogNav.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import BlogBlocks from './BlogBlocks.svelte';
  import '../landing/landing.css';
  import './blog.css';

  let { path }: { path: string } = $props();

  /** `/blog/<slug>` → the slug; `/blog` and `/blog/` → null, the index. */
  const slug = $derived.by(() => {
    const m = path.match(/^\/blog\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  });

  const post = $derived(slug ? findPost(slug) : undefined);
  const body = $derived(post ? post.i18n[publicI18n.locale] : undefined);

  let pageEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    applyPageMeta({
      // The index used to be titled "Blog — Stabileo" in all three languages,
      // so the three pages were indistinguishable to a search engine by the
      // one line it shows above all others.
      title: body ? `${body.title} — Stabileo` : t('blog.indexTitle'),
      description: body ? body.excerpt : t('blog.lead'),
      locale: publicI18n.locale,
      path: post ? `/blog/${post.slug}` : '/blog',
      article:
        post && body
          ? {
              headline: body.title,
              description: body.excerpt,
              datePublished: post.date,
              authors: post.authors,
              url: publicUrl(`/blog/${post.slug}`, publicI18n.locale),
              locale: publicI18n.locale,
            }
          : undefined,
    });
    return restorePageMeta;
  });

  // A new post starts at its own beginning, not at the scroll position the
  // index was left at — the shell is one long scroller that never unmounts.
  $effect(() => {
    void path;
    pageEl?.scrollTo({ top: 0 });
  });
</script>

<div class="landing blog" bind:this={pageEl}>
  <BlogNav />

  {#if slug && !post}
    <section class="sec sec--ink blog-head">
      <div class="wrap">
        <h1 class="display">{t('blog.notFound')}</h1>
        <p class="lead">{t('blog.notFoundBody')}</p>
        <PublicLink to="/blog" class="link-arrow">{t('blog.allPosts')}</PublicLink>
      </div>
    </section>
  {:else if post && body}
    <article class="sec sec--ink post">
      <div class="wrap post-wrap">
        <PublicLink to="/blog" class="link-arrow post-back">{t('blog.allPosts')}</PublicLink>

        <h1 class="display post-title">{body.title}</h1>

        <div class="post-meta">
          <time datetime={post.date}>{formatPostDate(post.date, publicI18n.locale)}</time>
          <span aria-hidden="true">·</span>
          <span>{tp('blog.readingTime', { n: readingMinutes(body) })}</span>
          <span aria-hidden="true">·</span>
          <span>{t('blog.by')} {post.authors.join(', ')}</span>
        </div>

        <ul class="post-tags">
          {#each post.tagKeys as key}<li>{t(key)}</li>{/each}
        </ul>

        <p class="post-excerpt">{body.excerpt}</p>

        <div class="post-body">
          <BlogBlocks blocks={body.blocks} />
        </div>

        <div class="post-foot">
          <button class="btn btn-primary" onclick={() => enterApp()}>{t('blog.openEditor')}</button>
          <PublicLink to="/blog" class="link-arrow">{t('blog.allPosts')}</PublicLink>
        </div>
      </div>
    </article>
  {:else}
    <section class="sec sec--ink blog-head">
      <div class="wrap">
        <p class="eyebrow">
          <span class="eyebrow-rule" aria-hidden="true"></span>
          <span class="eyebrow-label">{t('blog.eyebrow')}</span>
        </p>
        <h1 class="display">{t('blog.title')}</h1>
        <p class="lead">{t('blog.lead')}</p>
      </div>
    </section>

    <section class="sec sec--paper blog-list">
      <div class="wrap">
        {#if POSTS.length === 0}
          <p class="lead">{t('blog.empty')}</p>
        {:else}
          <ul class="post-cards">
            {#each POSTS as p (p.slug)}
              {@const b = p.i18n[publicI18n.locale]}
              <li>
                <article class="post-card" data-slug={p.slug}>
                  <div class="post-card-meta">
                    <time datetime={p.date}>{formatPostDate(p.date, publicI18n.locale)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{tp('blog.readingTime', { n: readingMinutes(b) })}</span>
                  </div>
                  <h2>
                    <PublicLink to={`/blog/${p.slug}`} class="post-card-title">{b.title}</PublicLink>
                  </h2>
                  <p>{b.excerpt}</p>
                  <PublicLink to={`/blog/${p.slug}`} class="link-arrow">{t('blog.readMore')}</PublicLink>
                </article>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>
  {/if}

  <LandingFooter />
</div>
