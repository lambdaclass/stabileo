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
  import { applyPageMeta, restorePageMeta, postImageUrl, ERGODIC_GROUP, LAMBDA_CLASS } from '../../lib/page-meta';
  import { publicUrl } from '../../lib/i18n/public-routes';
  import { POSTS, POSTS_NEWEST_FIRST, findPost, formatPostDate, postReadingMinutes, inLocale, writtenIn } from '../../lib/blog';
  import { enterApp } from '../landing/landing-utils';
  import SiteHeader from '../site/SiteHeader.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import BlogBlocks from './BlogBlocks.svelte';
  import { findStandingPage } from '../../lib/blog/pages';
  import '../landing/landing.css';
  import './blog.css';

  let { path }: { path: string } = $props();

  /**
   * `/blog/<slug>` → the slug; `/blog` and `/blog/` → null, the index.
   *
   * Everything after `/blog/` is taken, slashes included, so that a nested
   * address is an unknown POST rather than an unrecognised route. `[^/]+`
   * refused to match `/blog/a/b` at all, which fell through to `slug === null`
   * and rendered the index under an address that promised a post — a page that
   * looks like it worked. It is a missing post, and it should say so.
   */
  /** A standing page (not a post) at this path, if any. */
  const standing = $derived(findStandingPage(path));
  const standingBody = $derived(standing ? inLocale(standing.i18n, publicI18n.locale) : undefined);

  const slug = $derived.by(() => {
    const m = path.match(/^\/blog\/(.+?)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  });

  const post = $derived(slug ? findPost(slug) : undefined);

  /*
   * What to read next: the posts that share the most topics with this one (newest first among
   * equals), and the newer and older neighbours by date. A reader at the end of a post had only
   * "All posts" to go to.
   */
  const related = $derived.by(() => {
    if (!post) return [];
    return POSTS_NEWEST_FIRST.filter((p) => p.slug !== post.slug)
      .map((p) => ({ p, shared: p.tagKeys.filter((k) => post.tagKeys.includes(k)).length }))
      .filter((r) => r.shared > 0)
      .sort((a, b) => b.shared - a.shared)
      .slice(0, 3)
      .map((r) => r.p);
  });
  const position = $derived(post ? POSTS_NEWEST_FIRST.findIndex((p) => p.slug === post.slug) : -1);
  const newer = $derived(position > 0 ? POSTS_NEWEST_FIRST[position - 1] : undefined);
  const older = $derived(position >= 0 && position < POSTS_NEWEST_FIRST.length - 1 ? POSTS_NEWEST_FIRST[position + 1] : undefined);
  const body = $derived(post ? inLocale(post.i18n, publicI18n.locale) : undefined);

  let pageEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (standing && standingBody) {
      const url = publicUrl(standing.path, publicI18n.locale);
      applyPageMeta({
        title: `${standingBody.title} — Stabileo`,
        description: standingBody.description,
        locale: publicI18n.locale,
        path: standing.path,
        written: writtenIn(standing.i18n),
        // The page states what it is (a page about the app's CIRSOC checks), the app it is about,
        // and its questions and answers with the same text the reader sees.
        graph: [
          {
            '@type': 'WebPage',
            '@id': url,
            url,
            name: standingBody.title,
            description: standingBody.description,
            inLanguage: publicI18n.locale,
            dateModified: standing.updated,
            about: { '@id': 'https://stabileo.com/#software' },
            isPartOf: { '@id': 'https://stabileo.com/#website' },
          },
          {
            '@type': 'SoftwareApplication',
            '@id': 'https://stabileo.com/#software',
            name: 'Stabileo',
            url: publicUrl('/', publicI18n.locale),
            applicationCategory: 'EngineeringApplication',
            operatingSystem: 'Web browser',
            isAccessibleForFree: true,
            license: 'https://www.gnu.org/licenses/agpl-3.0.html',
            publisher: ERGODIC_GROUP,
            author: LAMBDA_CLASS,
            ...(standingBody.blocks.some((b) => b.k === 'table')
              ? {
                  featureList: standingBody.blocks.flatMap((b) =>
                    b.k === 'table' ? b.rows.map((r) => `${r[0]}: ${r[1]}`) : [],
                  ),
                }
              : {}),
          },
          {
            '@type': 'FAQPage',
            mainEntity: standingBody.faq.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          },
        ],
      });
      return restorePageMeta;
    }
    applyPageMeta({
      // The index used to be titled "Blog — Stabileo" in all three languages,
      // so the three pages were indistinguishable to a search engine by the
      // one line it shows above all others.
      title: body ? `${body.title} — Stabileo` : t('blog.indexTitle'),
      description: body ? body.excerpt : t('blog.lead'),
      locale: publicI18n.locale,
      path: post ? `/blog/${post.slug}` : '/blog',
      written: post ? writtenIn(post.i18n) : undefined,
      article:
        post && body
          ? {
              headline: body.title,
              description: body.excerpt,
              datePublished: post.date,
              dateModified: post.updated,
              authors: post.authors,
              keywords: post.tagKeys.map((k) => t(k)),
              url: publicUrl(`/blog/${post.slug}`, publicI18n.locale),
              locale: publicI18n.locale,
              crumbs: { home: 'Stabileo', blog: 'Blog' },
              image: postImageUrl(post.slug, publicI18n.locale),
            }
          : undefined,
      // The index states itself as the blog and lists its posts, so a search engine reads the
      // series as one publication rather than eight unrelated pages.
      graph: post
        ? undefined
        : [
            {
              '@type': 'Blog',
              '@id': publicUrl('/blog', publicI18n.locale),
              name: t('blog.indexTitle'),
              description: t('blog.lead'),
              url: publicUrl('/blog', publicI18n.locale),
              inLanguage: publicI18n.locale,
              publisher: { '@id': 'https://stabileo.com/#organization' },
              blogPost: POSTS.map((p) => ({
                '@type': 'BlogPosting',
                headline: inLocale(p.i18n, publicI18n.locale).title,
                url: publicUrl(`/blog/${p.slug}`, publicI18n.locale),
                datePublished: p.date,
                dateModified: p.updated ?? p.date,
              })),
            },
          ],
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
  <!-- `slug`, not `post`: an unknown slug is still inside a post's address,
       and that reader needs the way back to the index more than anyone. -->
  <SiteHeader current={standing ? null : 'blog'} />

  {#if standing && standingBody}
    <article class="sec sec--ink post standing">
      <div class="wrap post-wrap">
        <p class="eyebrow">
          <span class="eyebrow-rule" aria-hidden="true"></span>
          <span class="eyebrow-label">{standingBody.eyebrow}</span>
        </p>
        <h1 class="display post-title">{standingBody.title}</h1>
        <p class="post-excerpt">{standingBody.lead}</p>

        <div class="standing-cta">
          <button class="btn btn-primary" onclick={() => enterApp()}>{t('blog.openEditor')}</button>
        </div>

        <div class="post-body">
          <BlogBlocks blocks={standingBody.blocks} />
          <h2>{standingBody.faqTitle}</h2>
          {#each standingBody.faq as f}
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          {/each}
        </div>

        <div class="post-foot">
          <button class="btn btn-primary" onclick={() => enterApp()}>{t('blog.openEditor')}</button>
          <PublicLink to="/blog" class="link-arrow">{t('blog.allPosts')}</PublicLink>
        </div>
      </div>
    </article>
  {:else if slug && !post}
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
          <span>{tp('blog.readingTime', { n: postReadingMinutes(post, publicI18n.locale) })}</span>
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

        {#if related.length > 0}
          <section class="post-related" aria-labelledby="post-related-title">
            <h2 id="post-related-title" class="post-related-title">{t('blog.keepReading')}</h2>
            <ul class="post-related-list">
              {#each related as r (r.slug)}
                {@const rb = inLocale(r.i18n, publicI18n.locale)}
                <li>
                  <article class="post-card post-card--compact" data-slug={r.slug}>
                    <div class="post-card-meta">
                      <time datetime={r.date}>{formatPostDate(r.date, publicI18n.locale)}</time>
                    </div>
                    <h3><PublicLink to={`/blog/${r.slug}`} class="post-card-title">{rb.title}</PublicLink></h3>
                  </article>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if newer || older}
          <nav class="post-pager" aria-label={t('blog.morePosts')}>
            {#if newer}
              <PublicLink to={`/blog/${newer.slug}`} class="post-pager-link post-pager-newer">
                <span class="post-pager-dir">← {t('blog.newer')}</span>
                <span class="post-pager-title">{inLocale(newer.i18n, publicI18n.locale).title}</span>
              </PublicLink>
            {/if}
            {#if older}
              <PublicLink to={`/blog/${older.slug}`} class="post-pager-link post-pager-older">
                <span class="post-pager-dir">{t('blog.older')} →</span>
                <span class="post-pager-title">{inLocale(older.i18n, publicI18n.locale).title}</span>
              </PublicLink>
            {/if}
          </nav>
        {/if}
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
            {#each POSTS_NEWEST_FIRST as p, i (p.slug)}
              {@const b = inLocale(p.i18n, publicI18n.locale)}
              <li class:featured={i === 0}>
                <article class="post-card" class:post-card--featured={i === 0} data-slug={p.slug}>
                  {#if i === 0}<p class="post-card-kicker">{t('landing.blogLatestKicker')}</p>{/if}
                  <div class="post-card-meta">
                    <time datetime={p.date}>{formatPostDate(p.date, publicI18n.locale)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{tp('blog.readingTime', { n: postReadingMinutes(p, publicI18n.locale) })}</span>
                  </div>
                  <h2>
                    <PublicLink to={`/blog/${p.slug}`} class="post-card-title">{b.title}</PublicLink>
                  </h2>
                  <p class="post-card-excerpt">{b.excerpt}</p>
                  <ul class="post-tags post-card-tags">
                    {#each p.tagKeys as key}<li>{t(key)}</li>{/each}
                  </ul>
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
