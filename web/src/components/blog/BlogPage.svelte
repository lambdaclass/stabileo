<script lang="ts">
  /**
   * The blog: an index at /blog and one page per post at /blog/<slug>.
   *
   * There is no server. The site is a static bundle on GitHub Pages, so a
   * request for /blog/<slug> is a 404 that public/404.html turns into
   * `/?route=/blog/<slug>`; App.svelte restores the address and hands the path
   * here. That means every internal link has to move through `onNavigate`
   * rather than reloading the document — a reload would leave through the 404
   * again and flash the redirect.
   */
  import { tPublic as t, tpPublic as tp, publicI18n } from '../../lib/i18n/store.svelte';
  import { applyPageMeta, restorePageMeta } from '../../lib/page-meta';
  import { POSTS, findPost, formatPostDate } from '../../lib/blog';
  import { readingMinutes } from '../../lib/blog/types';
  import { enterApp } from '../landing/landing-utils';
  import BlogNav from './BlogNav.svelte';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import BlogBlocks from './BlogBlocks.svelte';
  import '../landing/landing.css';
  import './blog.css';

  let { path, onNavigate }: { path: string; onNavigate: (path: string) => void } = $props();

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
      title: body ? `${body.title} — Stabileo` : `${t('blog.title')} — Stabileo`,
      description: body ? body.excerpt : t('blog.lead'),
      locale: publicI18n.locale,
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
  <BlogNav {onNavigate} />

  {#if slug && !post}
    <section class="sec sec--ink blog-head">
      <div class="wrap">
        <h1 class="display">{t('blog.notFound')}</h1>
        <p class="lead">{t('blog.notFoundBody')}</p>
        <button class="link-arrow" onclick={() => onNavigate('/blog')}>{t('blog.allPosts')}</button>
      </div>
    </section>
  {:else if post && body}
    <article class="sec sec--ink post">
      <div class="wrap post-wrap">
        <button class="link-arrow post-back" onclick={() => onNavigate('/blog')}>{t('blog.allPosts')}</button>

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
          <button class="link-arrow" onclick={() => onNavigate('/blog')}>{t('blog.allPosts')}</button>
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
                <article class="post-card">
                  <div class="post-card-meta">
                    <time datetime={p.date}>{formatPostDate(p.date, publicI18n.locale)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{tp('blog.readingTime', { n: readingMinutes(b) })}</span>
                  </div>
                  <h2>
                    <button class="post-card-title" onclick={() => onNavigate(`/blog/${p.slug}`)}>{b.title}</button>
                  </h2>
                  <p>{b.excerpt}</p>
                  <button class="link-arrow" onclick={() => onNavigate(`/blog/${p.slug}`)}>{t('blog.readMore')}</button>
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
