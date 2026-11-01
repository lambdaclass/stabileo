<script lang="ts">
  /**
   * A real link between public pages, that still navigates without a reload.
   *
   * ── Why this exists ──
   *
   * Every navigation on the public site used to be a `<button>`, because the
   * site is static and a plain `<a href="/blog">` would fetch a path GitHub
   * Pages does not have, get the 404 page, and bounce through `/?route=`.
   *
   * That solved the reload and created something worse. An audit of the built
   * HTML found ONE crawlable internal link across the whole site — `/demo`,
   * which robots.txt disallows. A crawler cannot press a button, so it could
   * not walk from the landing to the blog, nor from the blog index to a post.
   * Every page was an orphan: reachable only through the sitemap, with no
   * internal links, which is both a discovery problem and a ranking one.
   *
   * People lost something too, quietly: you cannot middle-click a button, or
   * open it in a new tab, or copy its address.
   *
   * ── How it works ──
   *
   * It renders the real `href`, so a crawler follows it and the browser's own
   * affordances work. A plain left click is intercepted and handled in
   * history, so navigation stays instant. Modified clicks — ctrl, cmd, shift,
   * alt, middle button — are left alone, which is what makes "open in new tab"
   * behave.
   */
  import type { Snippet } from 'svelte';
  import { publicI18n, type PublicLocale } from '../../lib/i18n/store.svelte';
  import { publicHref } from '../../lib/i18n/public-routes';
  import { publishedLocale } from '../../lib/i18n/published';
  import { goPublic } from './landing-utils';

  type Props = {
    /** Unprefixed: '/', '/blog', '/blog/<slug>'. The language is added here. */
    to: string;
    /** Overrides the language the page is published in for this reader (`publishedLocale`). */
    locale?: PublicLocale;
    class?: string;
    title?: string;
    'aria-label'?: string;
    'aria-current'?: 'page' | undefined;
    'data-nav'?: string;
    children: Snippet;
  };
  let { to, locale, class: cls = '', children, ...rest }: Props = $props();

  const target = $derived(locale ?? publishedLocale(to, publicI18n.locale));
  const href = $derived(publicHref(to, target));

  function onclick(e: MouseEvent) {
    // Anything but a plain left click belongs to the browser.
    if (target !== publicI18n.locale || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    goPublic(to);
  }
</script>

<a {href} class={cls} {onclick} {...rest}>{@render children()}</a>
