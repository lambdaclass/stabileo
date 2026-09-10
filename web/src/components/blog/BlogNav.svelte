<script lang="ts">
  /**
   * The blog's header.
   *
   * Deliberately not LandingNav: that one navigates by scrolling to sections
   * that only exist on the landing, so reusing it here would give the reader a
   * row of links that do nothing. What carries over is the visual system —
   * every class below is a landing class.
   */
  import { tPublic as t, publicI18n, PUBLIC_LOCALES } from '../../lib/i18n/store.svelte';
  import { REPO_URL, enterApp, switchPublicLocale, fetchGithubStars } from '../landing/landing-utils';
  import PublicLink from '../landing/PublicLink.svelte';

  const LOCALE_NAMES: Record<string, string> = { en: 'English', es: 'Español', pt: 'Português' };

  /**
   * Whether to offer a way back to the index.
   *
   * Only inside a post. On the index itself the link would point at the page
   * the reader is already on, which is what made the landing's "Blog" item
   * useless here and got it removed. Inside a post it is the opposite: there
   * was NO way back to the index at all — the logo goes to the landing, so
   * returning meant landing → scroll to the blog section → enter again.
   */
  let { inPost = false }: { inPost?: boolean } = $props();

  /*
   * The star count, same as the landing's header.
   *
   * Not decoration: without it the two headers were identical except that one
   * showed a number, which reads as something broken rather than as two
   * pages. The count is cached for six hours, so this is not a request per
   * page view.
   */
  let stars = $state<number | null>(null);
  $effect(() => {
    fetchGithubStars().then((n) => { stars = n; });
  });

  function fmtStars(n: number) {
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
  }
</script>

<nav class="nav" aria-label={t('landing.navPrimary')}>
  <div class="nav-inner">
    <PublicLink to="/" class="nav-brand" title={t('blog.backHome')}>
      <span class="nav-logo" aria-hidden="true">S</span>
      <span class="nav-name">Stabileo</span>
    </PublicLink>

    <!--
      No section links here: the landing's nav scrolls to sections of the
      landing, and none of them exist on this page. The one exception is
      "Blog", and only from inside a post — see `inPost`. It sits at the head
      of the actions rather than in a `.nav-links` row of its own, because
      that class carries `margin-left: auto` and a second one would split the
      free space and float the actions into the middle of the bar.
    -->
    <div class="nav-actions">
      {#if inPost}
        <PublicLink to="/blog" class="nav-blog-link">{t('landing.navBlog')}</PublicLink>
      {/if}

      <a class="nav-gh" href={REPO_URL} target="_blank" rel="noreferrer" aria-label={t('landing.navGithubRepo')}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" aria-hidden="true" focusable="false">
          <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7 0-.7 0-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z"/>
        </svg>
        <span>{stars != null ? fmtStars(stars) : 'GitHub'}</span>
      </a>

      <label class="nav-lang-wrap">
        <span class="sr-only">{t('landing.navLanguage')}</span>
        <select
          class="nav-lang"
          value={publicI18n.locale}
          onchange={(e) => switchPublicLocale((e.currentTarget as HTMLSelectElement).value as (typeof PUBLIC_LOCALES)[number])}
        >
          {#each PUBLIC_LOCALES as code}
            <option value={code}>{LOCALE_NAMES[code]}</option>
          {/each}
        </select>
      </label>

      <button class="btn btn-primary btn-sm" onclick={() => enterApp()}>{t('blog.openEditor')}</button>
    </div>
  </div>
</nav>
